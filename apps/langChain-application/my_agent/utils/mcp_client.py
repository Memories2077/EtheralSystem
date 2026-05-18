"""Typed mcp-gen API client helpers.

This module centralizes URL construction, request/response validation, and HTTP
error classification for the mcp-gen manager API. ``MCP_BASE_URL`` is the API
base URL and must include ``/api`` (for example, ``http://docker-manager:8080/api``).
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

import httpx


DEFAULT_MCP_BASE_URL = "http://docker-manager:8080/api"


class MCPClientError(Exception):
    """Base exception for mcp-gen client failures."""


class MCPUnavailableError(MCPClientError):
    """Raised when mcp-gen cannot be reached."""


class MCPTimeoutError(MCPClientError):
    """Raised when mcp-gen does not respond before the timeout."""


class MCPResponseValidationError(MCPClientError):
    """Raised when mcp-gen returns an unexpected response payload."""


@dataclass(frozen=True)
class MCPCreateRequest:
    """Request body for ``POST /api/mcp/create``."""

    request: str
    userId: str
    email: str
    rag_context: List[Any] = field(default_factory=list)
    traceId: Optional[str] = None
    experimentId: Optional[str] = None
    sessionId: Optional[str] = None
    buildRequestId: Optional[str] = None

    def to_payload(self) -> Dict[str, Any]:
        payload = {
            "request": self.request,
            "userId": self.userId,
            "email": self.email,
            "rag_context": self.rag_context,
        }
        for key in ("traceId", "experimentId", "sessionId", "buildRequestId"):
            value = getattr(self, key)
            if value:
                payload[key] = value
        return payload


@dataclass(frozen=True)
class MCPCreateResponse:
    """Validated response from ``POST /api/mcp/create``."""

    serverId: str
    claudeConfig: Dict[str, Any]
    status: str
    raw: Dict[str, Any] = field(default_factory=dict)

    @classmethod
    def from_payload(cls, payload: Dict[str, Any]) -> "MCPCreateResponse":
        if not isinstance(payload, dict):
            raise MCPResponseValidationError("mcp-gen response must be a JSON object")

        server_id = payload.get("serverId")
        if not isinstance(server_id, str) or not server_id.strip():
            raise MCPResponseValidationError("mcp-gen response is missing a non-empty 'serverId'")

        claude_config = payload.get("claudeConfig", {})
        if not isinstance(claude_config, dict):
            raise MCPResponseValidationError("mcp-gen response field 'claudeConfig' must be an object")

        status = payload.get("status", "running")
        if not isinstance(status, str) or not status.strip():
            raise MCPResponseValidationError("mcp-gen response field 'status' must be a non-empty string")

        return cls(
            serverId=server_id.strip(),
            claudeConfig=claude_config,
            status=status.strip(),
            raw=payload,
        )

    def to_tool_result(self) -> Dict[str, Any]:
        return {
            "status": self.status,
            "serverId": self.serverId,
            "config": self.claudeConfig,
            "serverCreated": True,
        }


@dataclass(frozen=True)
class MCPUrls:
    """Canonical mcp-gen URLs derived from ``MCP_BASE_URL``."""

    api_base_url: str

    @property
    def create_url(self) -> str:
        return f"{self.api_base_url}/mcp/create"

    def files_url(self, server_id: str) -> str:
        return f"{self.api_base_url}/mcp/{server_id}/files"

    def status_url(self, server_id: str) -> str:
        return f"{self.api_base_url}/mcp/{server_id}/status"

    def delete_url(self, server_id: str) -> str:
        return f"{self.api_base_url}/mcp/{server_id}"


def normalize_mcp_base_url(raw_url: Optional[str] = None) -> str:
    """Return a normalized mcp-gen API base URL that includes ``/api``."""

    base_url = (raw_url or os.environ.get("MCP_BASE_URL") or DEFAULT_MCP_BASE_URL).strip().rstrip("/")
    if not base_url:
        base_url = DEFAULT_MCP_BASE_URL
    if not base_url.endswith("/api"):
        base_url = f"{base_url}/api"
    return base_url


def get_mcp_urls(raw_url: Optional[str] = None) -> MCPUrls:
    return MCPUrls(api_base_url=normalize_mcp_base_url(raw_url))


async def create_mcp_server(
    payload: MCPCreateRequest,
    *,
    client: Optional[httpx.AsyncClient] = None,
    timeout: Optional[httpx.Timeout] = None,
) -> MCPCreateResponse:
    """Create an MCP server and validate the mcp-gen response."""

    urls = get_mcp_urls()
    owns_client = client is None
    http_client = client or httpx.AsyncClient(
        timeout=timeout
        or httpx.Timeout(connect=10.0, read=300.0, write=10.0, pool=10.0)
    )

    try:
        response = await http_client.post(
            urls.create_url,
            json=payload.to_payload(),
            headers={"Content-Type": "application/json"},
        )
        response.raise_for_status()
        return MCPCreateResponse.from_payload(response.json())
    except httpx.TimeoutException as exc:
        raise MCPTimeoutError("mcp-gen timed out while creating the MCP server") from exc
    except httpx.ConnectError as exc:
        raise MCPUnavailableError(f"cannot connect to mcp-gen at {urls.create_url}") from exc
    except httpx.HTTPStatusError:
        raise
    except ValueError as exc:
        raise MCPResponseValidationError("mcp-gen response was not valid JSON") from exc
    finally:
        if owns_client:
            await http_client.aclose()


async def fetch_mcp_files(
    server_id: str,
    *,
    client: Optional[httpx.AsyncClient] = None,
    timeout: float = 30.0,
) -> Dict[str, Any]:
    """Fetch generated files from ``GET /api/mcp/:serverId/files``."""

    urls = get_mcp_urls()
    owns_client = client is None
    http_client = client or httpx.AsyncClient(timeout=timeout)

    try:
        response = await http_client.get(urls.files_url(server_id))
        response.raise_for_status()
        payload = response.json()
        files = payload.get("files", {})
        if not isinstance(files, dict):
            raise MCPResponseValidationError("mcp-gen files response field 'files' must be an object")
        return files
    except httpx.TimeoutException as exc:
        raise MCPTimeoutError(f"mcp-gen timed out while fetching files for server '{server_id}'") from exc
    except httpx.ConnectError as exc:
        raise MCPUnavailableError(f"cannot connect to mcp-gen at {urls.files_url(server_id)}") from exc
    except httpx.HTTPStatusError:
        raise
    except ValueError as exc:
        raise MCPResponseValidationError("mcp-gen files response was not valid JSON") from exc
    finally:
        if owns_client:
            await http_client.aclose()
