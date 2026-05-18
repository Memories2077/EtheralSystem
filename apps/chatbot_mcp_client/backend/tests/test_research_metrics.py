import asyncio
import json
import sys
from pathlib import Path


BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

import research_metrics
from research_metrics import build_research_event, record_research_event, redact_sensitive
from shared import normalize_request_context


def test_redact_sensitive_removes_secrets_and_raw_inputs():
    payload = {
        "apiKey": "secret-key",
        "Authorization": "Bearer secret",
        "input_hash": "safe-hash",
        "nested": {
            "rawUserContent": "private prompt",
            "promptText": "private prompt",
        },
    }

    redacted = redact_sensitive(payload)

    assert redacted["apiKey"] == "[REDACTED]"
    assert redacted["Authorization"] == "[REDACTED]"
    assert redacted["input_hash"] == "safe-hash"
    assert redacted["nested"]["rawUserContent"] == "[REDACTED]"
    assert redacted["nested"]["promptText"] == "[REDACTED]"


def test_build_research_event_preserves_correlation_context():
    event = build_research_event(
        service="chatbot-backend",
        stage="runtime",
        event_name="mcp_metadata_checked",
        context={
            "traceId": "trace-123",
            "experimentId": "paper-mvp",
            "sessionId": "session-123",
            "buildRequestId": "build-123",
            "serverId": "server-123",
        },
        metrics={"mcp_tool_count": 3},
    )

    assert event["trace_id"] == "trace-123"
    assert event["experiment_id"] == "paper-mvp"
    assert event["session_id"] == "session-123"
    assert event["build_request_id"] == "build-123"
    assert event["server_id"] == "server-123"
    assert event["metrics"]["mcp_tool_count"] == 3


def test_record_research_event_disabled_is_noop(monkeypatch, tmp_path):
    output_path = tmp_path / "events.jsonl"
    monkeypatch.setenv("RESEARCH_METRICS_ENABLED", "false")
    monkeypatch.setenv("RESEARCH_EVENTS_JSONL_PATH", str(output_path))

    event = asyncio.run(
        record_research_event(
            service="chatbot-backend",
            stage="chat",
            event_name="chat_stream_completed",
        )
    )

    assert event is None
    assert not output_path.exists()


def test_record_research_event_enabled_writes_correlated_jsonl(monkeypatch, tmp_path):
    output_path = tmp_path / "events.jsonl"
    monkeypatch.setenv("RESEARCH_METRICS_ENABLED", "true")
    monkeypatch.setenv("RESEARCH_EVENTS_JSONL_PATH", str(output_path))
    monkeypatch.setattr(research_metrics, "MongoClient", None)
    monkeypatch.setattr(research_metrics, "_mongo_client", None)

    event = asyncio.run(
        record_research_event(
            service="chatbot-backend",
            stage="runtime",
            event_name="mcp_metadata_checked",
            context={"traceId": "trace-123", "experimentId": "paper-mvp"},
            metrics={"token": "secret", "mcp_tool_count": 2},
        )
    )

    assert event is not None
    saved = json.loads(output_path.read_text(encoding="utf-8").strip())
    assert saved["trace_id"] == "trace-123"
    assert saved["experiment_id"] == "paper-mvp"
    assert saved["metrics"]["token"] == "[REDACTED]"
    assert saved["metrics"]["mcp_tool_count"] == 2


def test_normalize_request_context_defaults_and_preserves_research_ids(monkeypatch):
    monkeypatch.setenv("RESEARCH_EXPERIMENT_ID", "paper-default")

    context = normalize_request_context({
        "buildRequestId": "build-123",
        "traceId": "trace-123",
    })

    assert context["traceId"] == "trace-123"
    assert context["experimentId"] == "paper-default"
    assert context["buildRequestId"] == "build-123"
    assert context["sessionId"] == "chat-session"
