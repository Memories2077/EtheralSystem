from typing import Any


ACTIVE_GENERATED_MCP_STATUSES = ("running", "building", "created", "started")
ACTIVE_GENERATED_MCP_STATUS_SET = set(ACTIVE_GENERATED_MCP_STATUSES)


def filter_active_mcp_server_payload(payload: Any) -> Any:
    """Return only generated MCP records that are active or still becoming ready."""
    if not isinstance(payload, dict):
        return payload

    servers = payload.get("servers")
    if not isinstance(servers, list):
        return payload

    active_servers = [
        server
        for server in servers
        if isinstance(server, dict)
        and str(server.get("status") or "").strip().lower() in ACTIVE_GENERATED_MCP_STATUS_SET
    ]
    return {
        **payload,
        "servers": active_servers,
        "count": len(active_servers),
    }
