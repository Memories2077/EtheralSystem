import sys
from pathlib import Path


BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from mcp_server_filtering import filter_active_mcp_server_payload
from shared import build_mcp_complete_payload


def test_filter_active_mcp_server_payload_excludes_terminal_states():
    payload = {
        "servers": [
            {"serverId": "running-1", "status": "running"},
            {"serverId": "building-1", "status": "building"},
            {"serverId": "created-1", "status": "created"},
            {"serverId": "started-1", "status": "started"},
            {"serverId": "error-1", "status": "error"},
            {"serverId": "deleted-1", "status": "deleted"},
            {"serverId": "stopped-1", "status": "stopped"},
        ],
        "count": 7,
    }

    filtered = filter_active_mcp_server_payload(payload)

    assert [server["serverId"] for server in filtered["servers"]] == [
        "running-1",
        "building-1",
        "created-1",
        "started-1",
    ]
    assert filtered["count"] == 4


def test_build_mcp_complete_payload_defaults_missing_status_to_unknown():
    payload = build_mcp_complete_payload({"serverId": "server-123"})

    assert payload["serverId"] == "server-123"
    assert payload["status"] == "unknown"


def test_build_mcp_complete_payload_preserves_explicit_running_status():
    payload = build_mcp_complete_payload({
        "serverId": "server-123",
        "status": "running",
    })

    assert payload["serverId"] == "server-123"
    assert payload["status"] == "running"
