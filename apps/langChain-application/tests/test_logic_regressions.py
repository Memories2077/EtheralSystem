import json
import importlib

import pytest
from langchain_core.messages import AIMessage, HumanMessage


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


@pytest.mark.asyncio
async def test_generator_falls_back_to_direct_create_when_llm_omits_tool_call(monkeypatch):
    from my_agent.agents.sub_agents import generator_agent
    from my_agent.utils import llm_factory

    captured = {}

    class NoToolCallLLM:
        def bind_tools(self, _tools):
            return self

        async def ainvoke(self, _messages):
            return AIMessage(
                content="Server 'MCP_Server_001' provisioned successfully. Server ID: fake-hallucinated-id"
            )

    async def fake_create_mcp_server(args):
        captured["args"] = args
        return json.dumps({
            "status": "running",
            "serverId": "real-server-123",
            "config": {"mcpServers": {}},
            "serverCreated": True,
        })

    async def fake_fetch_mcp_files(_server_id):
        return {}

    async def fake_save_mcp_artifacts(**_kwargs):
        return {"status": "skipped_empty"}

    class FakeCreateMCPServerTool:
        async def ainvoke(self, args):
            return await fake_create_mcp_server(args)

    monkeypatch.setattr(llm_factory, "get_llm", lambda *args, **kwargs: NoToolCallLLM())
    monkeypatch.setattr(generator_agent, "create_MCPServer", FakeCreateMCPServerTool())
    monkeypatch.setattr(generator_agent, "fetch_mcp_files", fake_fetch_mcp_files)
    monkeypatch.setattr(generator_agent, "save_mcp_artifacts", fake_save_mcp_artifacts)

    result = await generator_agent.generator_agent_node({
        "messages": [AIMessage(content="DELEGATE_TO_GENERATOR: API_DOCUMENTATION:\nGET /items")],
        "next_agent": "generator",
        "final_response": "",
        "history": [],
        "retry_count": 0,
        "current_plan": "",
        "is_complete": False,
        "raw_api_doc": "openapi: 3.0.0\npaths: {}",
        "enriched_context": "[]",
    })

    output = json.loads(result["final_response"])
    assert output["serverId"] == "real-server-123"
    assert "fake-hallucinated-id" not in result["final_response"]
    assert captured["args"]["query"][0] == "openapi: 3.0.0\npaths: {}"
    assert captured["args"]["rag_context"] == []


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


@pytest.mark.asyncio
async def test_supervisor_routes_clear_mcp_creation_request_when_llm_omits_tool_call(monkeypatch):
    graph = import_graph_with_dummy_llm(monkeypatch)

    class NoToolCallLLM:
        def bind_tools(self, _tools):
            return self

        async def ainvoke(self, _messages):
            return AIMessage(content="I can help with that.")

    monkeypatch.setattr(graph, "_supervisor_llm", NoToolCallLLM())

    prompt = """Please create an MCP Server based on the following description.

Rick and Morty API Usage Guide
Base URL: https://rickandmortyapi.com/api
Authentication: All endpoints are public.
Method: GET /character
Query Parameters:
- page
Response 200 OK: paginated JSON results.
"""

    result = await graph.supervisor_node({
        "messages": [HumanMessage(content=prompt)],
        "next_agent": "",
        "final_response": "",
        "history": [],
        "retry_count": 0,
        "current_plan": "",
        "is_complete": False,
        "raw_api_doc": "",
        "enriched_context": "",
    })

    assert result["next_agent"] == "tools"
    assert result["messages"][0].tool_calls[0]["name"] == "delegate_to_examiner_agent"


@pytest.mark.asyncio
async def test_supervisor_routes_metaclaw_api_doc_payload_when_llm_omits_tool_call(monkeypatch):
    graph = import_graph_with_dummy_llm(monkeypatch)

    class NoToolCallLLM:
        def bind_tools(self, _tools):
            return self

        async def ainvoke(self, _messages):
            return AIMessage(content="I can help with that.")

    monkeypatch.setattr(graph, "_supervisor_llm", NoToolCallLLM())

    prompt = """Rick and Morty API Usage Guide

Base URL: https://rickandmortyapi.com/api

Authentication: All endpoints are public (no API key required).

A. Get All Characters
Method: GET /character
Query Parameters:
- page
- name
Response 200 OK: Pagination Info object where results is an array of Character objects.
"""

    result = await graph.supervisor_node({
        "messages": [HumanMessage(content=prompt)],
        "next_agent": "",
        "final_response": "",
        "history": [],
        "retry_count": 0,
        "current_plan": "",
        "is_complete": False,
        "raw_api_doc": "",
        "enriched_context": "",
    })

    assert result["next_agent"] == "tools"
    assert result["messages"][0].tool_calls[0]["name"] == "delegate_to_examiner_agent"
