from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, Iterable, Iterator, List, Optional, Set
from urllib.parse import urlparse

from research_metrics import content_hash, record_research_event


def _safe_text(value: Any, limit: int = 120) -> str:
    if value is None:
        return ""
    text = str(value).strip()
    if len(text) <= limit:
        return text
    return text[:limit]


def _normalize_tool_names(names: Iterable[Any]) -> Set[str]:
    return {name for item in names if (name := _safe_text(item))}


def _iter_message_candidates(value: Any, depth: int = 0) -> Iterator[Any]:
    if depth > 8 or value is None or isinstance(value, (str, bytes, int, float, bool)):
        return

    if _looks_like_message(value):
        yield value

    if isinstance(value, dict):
        for item in value.values():
            yield from _iter_message_candidates(item, depth + 1)
        return

    if isinstance(value, (list, tuple, set)):
        for item in value:
            yield from _iter_message_candidates(item, depth + 1)


def _looks_like_message(value: Any) -> bool:
    if isinstance(value, dict):
        return any(key in value for key in ("tool_calls", "tool_call_id", "additional_kwargs", "type"))
    class_name = value.__class__.__name__.lower()
    return (
        "message" in class_name
        or hasattr(value, "tool_calls")
        or hasattr(value, "tool_call_id")
        or hasattr(value, "additional_kwargs")
    )


def _dict_from_object(value: Any) -> Dict[str, Any]:
    if isinstance(value, dict):
        return value
    result: Dict[str, Any] = {}
    for key in ("name", "id", "tool_call_id", "args", "status", "content"):
        if hasattr(value, key):
            result[key] = getattr(value, key)
    return result


def _extract_tool_calls(message: Any) -> List[Dict[str, str]]:
    calls: List[Dict[str, str]] = []

    raw_calls: List[Any] = []
    if isinstance(message, dict):
        raw_calls.extend(message.get("tool_calls") or [])
        additional_kwargs = message.get("additional_kwargs") or {}
    else:
        raw_calls.extend(getattr(message, "tool_calls", None) or [])
        raw_calls.extend(getattr(message, "tool_call_chunks", None) or [])
        additional_kwargs = getattr(message, "additional_kwargs", {}) or {}

    if isinstance(additional_kwargs, dict):
        raw_calls.extend(additional_kwargs.get("tool_calls") or [])

    for raw_call in raw_calls:
        data = _dict_from_object(raw_call)
        function = data.get("function") if isinstance(data.get("function"), dict) else {}
        name = _safe_text(data.get("name") or function.get("name"))
        if not name:
            continue
        calls.append({
            "name": name,
            "id": _safe_text(data.get("id") or data.get("tool_call_id")),
        })

    return calls


def _is_tool_message(message: Any) -> bool:
    if isinstance(message, dict):
        msg_type = _safe_text(message.get("type")).lower()
        return msg_type in {"tool", "tool_message", "tool_result"} or bool(message.get("tool_call_id"))
    return message.__class__.__name__.lower() == "toolmessage" or hasattr(message, "tool_call_id")


def _tool_message_data(message: Any) -> Dict[str, str]:
    data = _dict_from_object(message)
    return {
        "name": _safe_text(data.get("name")),
        "tool_call_id": _safe_text(data.get("tool_call_id") or data.get("id")),
        "status": _safe_text(data.get("status")).lower(),
    }


def _matches_known_tool(name: str, known_tool_names: Set[str]) -> bool:
    return bool(name) and (not known_tool_names or name in known_tool_names)


@dataclass
class McpToolInvocationTracker:
    available_tool_names: Set[str] = field(default_factory=set)
    invocation_count: int = 0
    result_count: int = 0
    error_result_count: int = 0
    invoked_tool_names: Set[str] = field(default_factory=set)
    result_tool_names: Set[str] = field(default_factory=set)
    _pending_call_ids: Dict[str, str] = field(default_factory=dict)
    _seen_call_keys: Set[str] = field(default_factory=set)
    _seen_result_keys: Set[str] = field(default_factory=set)

    def __init__(self, available_tool_names: Optional[Iterable[Any]] = None):
        self.available_tool_names = _normalize_tool_names(available_tool_names or [])
        self.invocation_count = 0
        self.result_count = 0
        self.error_result_count = 0
        self.invoked_tool_names = set()
        self.result_tool_names = set()
        self._pending_call_ids = {}
        self._seen_call_keys = set()
        self._seen_result_keys = set()

    @property
    def success(self) -> bool:
        return self.result_count > 0 and self.error_result_count == 0

    @property
    def error_code(self) -> Optional[str]:
        if self.success:
            return None
        if self.invocation_count == 0:
            return "mcp_tool_not_invoked"
        if self.result_count == 0:
            return "mcp_tool_result_missing"
        return "mcp_tool_result_error"

    def observe(self, chunk: Any) -> None:
        for message in _iter_message_candidates(chunk):
            self._observe_tool_calls(message)
            self._observe_tool_result(message)

    def _observe_tool_calls(self, message: Any) -> None:
        for call in _extract_tool_calls(message):
            name = call["name"]
            if not _matches_known_tool(name, self.available_tool_names):
                continue
            call_id = call["id"]
            call_key = call_id or f"name:{name}"
            if call_key in self._seen_call_keys:
                continue
            self._seen_call_keys.add(call_key)
            if call_id:
                self._pending_call_ids[call_id] = name
            self.invocation_count += 1
            self.invoked_tool_names.add(name)

    def _observe_tool_result(self, message: Any) -> None:
        if not _is_tool_message(message):
            return
        data = _tool_message_data(message)
        pending_name = self._pending_call_ids.get(data["tool_call_id"], "")
        name = data["name"] or pending_name
        if not name or not _matches_known_tool(name, self.available_tool_names):
            return
        result_key = data["tool_call_id"] or f"name:{name}"
        if result_key in self._seen_result_keys:
            return
        self._seen_result_keys.add(result_key)
        self.result_count += 1
        self.result_tool_names.add(name)
        if data["status"] == "error":
            self.error_result_count += 1

    def metrics(
        self,
        *,
        mcp_url_count: int,
        available_tool_count: int,
        response_text: str = "",
    ) -> Dict[str, Any]:
        return {
            "mcp_tool_invocation_count": self.invocation_count,
            "mcp_tool_result_count": self.result_count,
            "mcp_tool_success": self.success,
            "mcp_tool_error_count": self.error_result_count,
            "mcp_url_count": mcp_url_count,
            "mcp_tool_count": available_tool_count,
            "available_tool_name_count": len(self.available_tool_names),
            "invoked_tool_names": sorted(self.invoked_tool_names)[:10],
            "result_tool_names": sorted(self.result_tool_names)[:10],
            "response_length": len(response_text),
            "response_hash": content_hash(response_text) if response_text else "",
        }


def extract_server_id_from_mcp_urls(mcp_urls: Iterable[str]) -> str:
    for raw_url in mcp_urls:
        try:
            path_parts = [part for part in urlparse(str(raw_url)).path.split("/") if part]
        except Exception:
            path_parts = []
        for index, part in enumerate(path_parts):
            if part == "mcp" and index + 1 < len(path_parts):
                return _safe_text(path_parts[index + 1], 200)
    return ""


async def record_mcp_tool_invocation_event(
    tracker: McpToolInvocationTracker,
    *,
    request_context: Optional[Dict[str, Any]],
    mcp_urls: Iterable[str],
    available_tool_count: int,
    provider: Optional[str],
    model: Optional[str],
    duration_ms: int,
    response_text: str = "",
) -> Optional[Dict[str, Any]]:
    urls = [str(url) for url in mcp_urls if url]
    if not urls and available_tool_count <= 0:
        return None

    context = dict(request_context or {})
    context.setdefault("serverId", extract_server_id_from_mcp_urls(urls))

    return await record_research_event(
        service="chatbot-backend",
        stage="runtime",
        event_name="mcp_tool_invocation_completed",
        status="success" if tracker.success else "failure",
        duration_ms=duration_ms,
        error_code=tracker.error_code,
        provider=provider,
        model=model,
        context=context,
        metrics=tracker.metrics(
            mcp_url_count=len(urls),
            available_tool_count=available_tool_count,
            response_text=response_text,
        ),
        tags={
            "mcp_url_hashes": [content_hash(url) for url in urls],
        },
    )
