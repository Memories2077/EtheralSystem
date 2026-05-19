import asyncio
import json
import sys
from pathlib import Path


BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

import research_metrics
from mcp_tool_invocation import McpToolInvocationTracker, record_mcp_tool_invocation_event


class FakeAIMessage:
    def __init__(self, tool_calls):
        self.tool_calls = tool_calls
        self.content = ""


class ToolMessage:
    def __init__(self, tool_call_id, name=None, status="success", content="private raw output"):
        self.tool_call_id = tool_call_id
        self.name = name
        self.status = status
        self.content = content


def test_tracker_extracts_nested_tool_call_and_result():
    tracker = McpToolInvocationTracker(["get_posts"])

    tracker.observe({
        "model": {
            "messages": [
                FakeAIMessage([{"id": "call-1", "name": "get_posts", "args": {"userId": 1}}])
            ]
        }
    })
    tracker.observe({"tools": {"messages": [ToolMessage("call-1")]}})

    assert tracker.invocation_count == 1
    assert tracker.result_count == 1
    assert tracker.success is True
    assert tracker.invoked_tool_names == {"get_posts"}
    assert tracker.result_tool_names == {"get_posts"}


def test_tracker_ignores_non_generated_tool_names():
    tracker = McpToolInvocationTracker(["get_posts"])

    tracker.observe({"messages": [FakeAIMessage([{"id": "call-1", "name": "create_mcp_server"}])]})

    assert tracker.invocation_count == 0
    assert tracker.result_count == 0
    assert tracker.error_code == "mcp_tool_not_invoked"


def test_tracker_marks_error_tool_result_as_failure():
    tracker = McpToolInvocationTracker(["get_posts"])

    tracker.observe({"messages": [FakeAIMessage([{"id": "call-1", "name": "get_posts"}])]})
    tracker.observe({"messages": [ToolMessage("call-1", status="error")]})

    assert tracker.invocation_count == 1
    assert tracker.result_count == 1
    assert tracker.success is False
    assert tracker.error_code == "mcp_tool_result_error"


def test_invocation_event_records_safe_metrics_and_redacts_raw_values(monkeypatch, tmp_path):
    output_path = tmp_path / "events.jsonl"
    monkeypatch.setenv("RESEARCH_METRICS_ENABLED", "true")
    monkeypatch.setenv("RESEARCH_EVENTS_JSONL_PATH", str(output_path))
    monkeypatch.setattr(research_metrics, "MongoClient", None)
    monkeypatch.setattr(research_metrics, "_mongo_client", None)

    tracker = McpToolInvocationTracker(["get_posts"])
    tracker.observe({"messages": [FakeAIMessage([{"id": "call-1", "name": "get_posts"}])]})
    tracker.observe({"messages": [ToolMessage("call-1", content="raw private API response with token=secret")]})

    event = asyncio.run(
        record_mcp_tool_invocation_event(
            tracker,
            request_context={
                "traceId": "trace-123",
                "experimentId": "paper-mvp",
                "sessionId": "session-123",
                "buildRequestId": "build-123",
            },
            mcp_urls=["http://localhost:8081/mcp/server-123?token=secret-token"],
            available_tool_count=1,
            provider="gemini",
            model="gemini-2.5-flash",
            duration_ms=42,
            response_text="final user-visible answer with private details",
        )
    )

    assert event is not None
    saved = json.loads(output_path.read_text(encoding="utf-8").strip())
    saved_text = json.dumps(saved)
    assert saved["event_name"] == "mcp_tool_invocation_completed"
    assert saved["status"] == "success"
    assert saved["server_id"] == "server-123"
    assert saved["metrics"]["mcp_tool_invocation_count"] == 1
    assert saved["metrics"]["mcp_tool_success"] is True
    assert saved["metrics"]["response_length"] > 0
    assert saved["metrics"]["response_hash"]
    assert "secret-token" not in saved_text
    assert "private details" not in saved_text
    assert "raw private API response" not in saved_text


def test_no_invocation_event_is_failure_with_diagnostics(monkeypatch, tmp_path):
    output_path = tmp_path / "events.jsonl"
    monkeypatch.setenv("RESEARCH_METRICS_ENABLED", "true")
    monkeypatch.setenv("RESEARCH_EVENTS_JSONL_PATH", str(output_path))
    monkeypatch.setattr(research_metrics, "MongoClient", None)
    monkeypatch.setattr(research_metrics, "_mongo_client", None)

    tracker = McpToolInvocationTracker(["get_posts"])

    event = asyncio.run(
        record_mcp_tool_invocation_event(
            tracker,
            request_context={"traceId": "trace-123", "experimentId": "paper-mvp"},
            mcp_urls=["http://localhost:8081/mcp/server-123?token=secret-token"],
            available_tool_count=1,
            provider="gemini",
            model="gemini-2.5-flash",
            duration_ms=10,
        )
    )

    assert event is not None
    saved = json.loads(output_path.read_text(encoding="utf-8").strip())
    assert saved["status"] == "failure"
    assert saved["error_code"] == "mcp_tool_not_invoked"
    assert saved["metrics"]["mcp_tool_invocation_count"] == 0
    assert saved["metrics"]["mcp_tool_success"] is False
