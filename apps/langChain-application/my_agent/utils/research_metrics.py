import hashlib
import json
import math
import os
import time
import uuid
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Optional

try:
    from pymongo import MongoClient
except Exception:  # pragma: no cover
    MongoClient = None  # type: ignore


SENSITIVE_KEY_PARTS = (
    "api_key",
    "apikey",
    "authorization",
    "cookie",
    "jwt",
    "password",
    "secret",
    "token",
)

SENSITIVE_KEY_NAMES = (
    "input_content",
    "prompt_text",
    "raw_api_doc",
    "raw_input",
    "raw_user_content",
    "request_body",
    "user_content",
)

SAFE_NUMERIC_USAGE_KEY_NAMES = (
    "completion_token_estimate",
    "completion_tokens",
    "estimated_completion_tokens",
    "estimated_prompt_tokens",
    "estimated_total_tokens",
    "input_tokens",
    "output_tokens",
    "prompt_token_estimate",
    "prompt_tokens",
    "rag_context_tokens",
    "selected_skill_tokens",
    "skill_total_tokens",
    "token_count",
    "total_token_estimate",
    "total_tokens",
)

_mongo_client = None


def research_metrics_enabled() -> bool:
    return os.getenv("RESEARCH_METRICS_ENABLED", "false").lower() == "true"


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds")


def new_trace_id() -> str:
    return str(uuid.uuid4())


def default_experiment_id() -> str:
    return os.getenv("RESEARCH_EXPERIMENT_ID", "local-dev")


def monotonic_ms() -> int:
    return int(time.perf_counter() * 1000)


def duration_since_ms(start_ms: int) -> int:
    return max(0, monotonic_ms() - start_ms)


def content_hash(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()[:16]


def _is_sensitive_key(key: str) -> bool:
    lowered = key.lower().replace("-", "_")
    compact = lowered.replace("_", "")
    exact_sensitive_names = set(SENSITIVE_KEY_NAMES)
    compact_sensitive_names = {name.replace("_", "") for name in SENSITIVE_KEY_NAMES}
    return (
        lowered in exact_sensitive_names
        or compact in compact_sensitive_names
        or any(part in lowered for part in SENSITIVE_KEY_PARTS)
        or any(part.replace("_", "") in compact for part in SENSITIVE_KEY_PARTS)
    )


def _is_numeric_usage_value(value: Any) -> bool:
    if isinstance(value, bool):
        return False
    if isinstance(value, (int, float)):
        return math.isfinite(float(value))
    if isinstance(value, str) and value.strip():
        try:
            return math.isfinite(float(value))
        except ValueError:
            return False
    return False


def _is_safe_numeric_usage_field(key: str, value: Any) -> bool:
    lowered = key.lower().replace("-", "_")
    compact = lowered.replace("_", "")
    exact_names = set(SAFE_NUMERIC_USAGE_KEY_NAMES)
    compact_names = {name.replace("_", "") for name in SAFE_NUMERIC_USAGE_KEY_NAMES}
    return (lowered in exact_names or compact in compact_names) and _is_numeric_usage_value(value)


def redact_sensitive(value: Any) -> Any:
    if isinstance(value, dict):
        redacted: Dict[str, Any] = {}
        for key, item in value.items():
            key_text = str(key)
            redacted[key] = (
                "[REDACTED]"
                if _is_sensitive_key(key_text) and not _is_safe_numeric_usage_field(key_text, item)
                else redact_sensitive(item)
            )
        return redacted
    if isinstance(value, list):
        return [redact_sensitive(item) for item in value]
    return value


def normalize_research_context(context: Optional[Dict[str, Any]] = None) -> Dict[str, str]:
    raw = context or {}

    def clean(*keys: str, default: str = "") -> str:
        for key in keys:
            value = raw.get(key)
            if value:
                return str(value).strip()
        return default

    return {
        "trace_id": clean("traceId", "trace_id", default=new_trace_id()),
        "experiment_id": clean("experimentId", "experiment_id", default=default_experiment_id()),
        "session_id": clean("sessionId", "session_id"),
        "build_request_id": clean("buildRequestId", "build_request_id"),
        "server_id": clean("serverId", "server_id"),
        "rag_enabled": clean("ragEnabled", "rag_enabled"),
        "dynamic_skill_selection": clean("dynamicSkillSelection", "dynamic_skill_selection"),
        "skill_selection_variant": clean("skillSelectionVariant", "skill_selection_variant"),
        "variant_id": clean("variantId", "variant_id"),
    }


def state_research_context(state: Optional[Dict[str, Any]] = None) -> Dict[str, str]:
    raw = state or {}
    return normalize_research_context({
        "trace_id": raw.get("trace_id"),
        "experiment_id": raw.get("experiment_id"),
        "session_id": raw.get("session_id"),
        "build_request_id": raw.get("build_request_id"),
        "server_id": raw.get("server_id"),
        "rag_enabled": raw.get("rag_enabled"),
        "dynamic_skill_selection": raw.get("dynamic_skill_selection"),
        "skill_selection_variant": raw.get("skill_selection_variant"),
        "variant_id": raw.get("variant_id"),
    })


def build_research_event(
    *,
    service: str,
    stage: str,
    event_name: str,
    status: str = "success",
    duration_ms: Optional[int] = None,
    error_code: Optional[str] = None,
    provider: Optional[str] = None,
    model: Optional[str] = None,
    metrics: Optional[Dict[str, Any]] = None,
    tags: Optional[Dict[str, Any]] = None,
    context: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    normalized = normalize_research_context(context)
    event = {
        "timestamp": now_iso(),
        **normalized,
        "service": service,
        "stage": stage,
        "event_name": event_name,
        "status": status,
        "duration_ms": duration_ms,
        "error_code": error_code,
        "provider": provider,
        "model": model,
        "metrics": redact_sensitive(deepcopy(metrics or {})),
        "tags": redact_sensitive(deepcopy(tags or {})),
    }
    return redact_sensitive(event)


def _jsonl_path() -> Path:
    configured = os.getenv("RESEARCH_EVENTS_JSONL_PATH")
    return Path(configured or "/tmp/etheral-research-events.jsonl").expanduser()


def _write_jsonl(event: Dict[str, Any]) -> None:
    path = _jsonl_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(event, ensure_ascii=True, default=str) + "\n")


def _persist_sync(event: Dict[str, Any]) -> None:
    global _mongo_client
    persisted = False
    if MongoClient is not None:
        try:
            if _mongo_client is None:
                mongo_uri = os.getenv("MONGO_URI") or os.getenv("MONGODB_URL") or "mongodb://localhost:27017"
                _mongo_client = MongoClient(mongo_uri, serverSelectionTimeoutMS=1000)
            db_name = os.getenv("RESEARCH_EVENTS_DB") or os.getenv("MONGO_DB_NAME") or os.getenv("MONGODB_DB") or "mcp_agent_db"
            collection_name = os.getenv("RESEARCH_EVENTS_COLLECTION", "research_events")
            _mongo_client[db_name][collection_name].insert_one(deepcopy(event))
            persisted = True
        except Exception:
            persisted = False
    if not persisted or os.getenv("RESEARCH_EVENTS_JSONL_MIRROR", "false").lower() == "true":
        _write_jsonl(event)


async def record_research_event(**kwargs: Any) -> Optional[Dict[str, Any]]:
    if not research_metrics_enabled():
        return None
    event = build_research_event(**kwargs)
    try:
        _persist_sync(event)
    except Exception:
        try:
            _write_jsonl(event)
        except Exception:
            return event
    return event
