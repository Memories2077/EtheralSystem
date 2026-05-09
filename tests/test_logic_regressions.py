import json
import importlib

import pytest
from langchain_core.messages import AIMessage


def test_sanitize_api_documentation_preserves_yaml_indentation():
    from my_agent.tools.generator_tools import sanitize_api_documentation

    doc = "openapi: 3.0.0\r\npaths:\r\n  /users:\r\n    get:\r\n      responses:\r\n        '200': {}\r\n"

    assert sanitize_api_documentation(doc) == (
        "openapi: 3.0.0\n"
        "paths:\n"
        "  /users:\n"
        "    get:\n"
        "      responses:\n"
        "        '200': {}"
    )


@pytest.mark.asyncio
async def test_create_mcp_server_uses_explicit_rag_context(monkeypatch):
    from my_agent.tools import generator_tools

    captured = {}

    class StubMCPResponse:
        serverId = "server-123"

        def to_tool_result(self):
            return {
                "status": "running",
                "serverId": self.serverId,
                "config": {"mcpServers": {}},
                "serverCreated": True,
            }

    async def fake_create_mcp_server(payload):
        captured["payload"] = payload
        return StubMCPResponse()

    rag_context = [{"id": "artifact-1", "technical_data": {"base_url": "https://api.example.com"}}]
    monkeypatch.setattr(generator_tools, "create_mcp_server", fake_create_mcp_server)

    result = await generator_tools.create_MCPServer.ainvoke({
        "query": ["openapi: 3.0.0\npaths: {}", "user-1", "user@example.com"],
        "rag_context": rag_context,
    })

    assert json.loads(result)["serverId"] == "server-123"
    assert captured["payload"].rag_context == rag_context


def test_parse_rag_context_returns_only_lists():
    from my_agent.agents.sub_agents.generator_agent import parse_rag_context

    assert parse_rag_context('[{"id": "x"}]') == [{"id": "x"}]
    assert parse_rag_context('{"id": "x"}') == []
    assert parse_rag_context("not-json") == []


def import_graph_with_dummy_llm(monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", "dummy")
    return importlib.import_module("my_agent.agents.graph")


def test_tool_repair_preserves_structured_generator_payload(monkeypatch):
    graph = import_graph_with_dummy_llm(monkeypatch)

    task = "API_DOCUMENTATION:\nopenapi: 3.0.0\n\nENRICHED_CONTEXT (RAG):\n[]"

    assert graph._needs_task_repair(task) is False
    assert graph._needs_task_repair("process the provided specification") is True


@pytest.mark.asyncio
async def test_supervisor_final_preserves_successful_generator_json(monkeypatch):
    graph = import_graph_with_dummy_llm(monkeypatch)
    final_json = json.dumps({
        "status": "running",
        "serverId": "server-123",
        "config": {"mcpServers": {}},
        "serverCreated": True,
    })

    result = await graph.supervisor_final_node({
        "messages": [AIMessage(content=final_json)],
        "next_agent": "supervisor_final",
        "final_response": final_json,
        "history": ["_ran_generator"],
        "retry_count": 0,
        "current_plan": "",
        "is_complete": False,
        "raw_api_doc": "openapi: 3.0.0",
        "enriched_context": "[]",
    })

    assert result["next_agent"] == "end"
    assert result["final_response"] == final_json
    assert result["is_complete"] is True
