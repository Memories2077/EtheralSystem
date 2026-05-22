import json
import importlib
import asyncio
import sys

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


def test_create_mcp_server_uses_explicit_rag_context(monkeypatch):
    from my_agent.tools import generator_tools

    captured = {}
    recorded_events = []

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

    result = asyncio.run(generator_tools.create_MCPServer.ainvoke({
        "query": ["openapi: 3.0.0\npaths: {}", "user-1", "user@example.com"],
        "rag_context": rag_context,
        "research_context": {
            "trace_id": "trace-123",
            "experiment_id": "experiment-123",
            "session_id": "session-123",
            "build_request_id": "build-123",
            "rag_enabled": "false",
            "dynamic_skill_selection": "false",
            "skill_selection_variant": "static",
            "variant_id": "static-rag-off",
        },
    }))

    assert json.loads(result)["serverId"] == "server-123"
    assert captured["payload"].rag_context == rag_context
    assert captured["payload"].ragEnabled == "false"
    assert captured["payload"].dynamicSkillSelection == "false"
    assert captured["payload"].skillSelectionVariant == "static"
    assert captured["payload"].variantId == "static-rag-off"


def test_parse_rag_context_returns_only_lists():
    from my_agent.agents.sub_agents.generator_agent import parse_rag_context

    assert parse_rag_context('[{"id": "x"}]') == [{"id": "x"}]
    assert parse_rag_context('{"id": "x"}') == []
    assert parse_rag_context("not-json") == []

def test_agent_research_redaction_preserves_safe_numeric_usage_fields():
    from my_agent.utils.research_metrics import redact_sensitive

    redacted = redact_sensitive({
        "api_key": "secret",
        "Authorization": "Bearer secret",
        "jwt": "eyJ.secret",
        "cookie": "sid=secret",
        "prompt_token_estimate": 100,
        "completion_tokens": 50,
        "estimatedTotalTokens": "150",
        "rag_context_tokens": 25,
        "skill_total_tokens": 10,
        "token": 123,
        "access_token_count": 1,
    })

    assert redacted["api_key"] == "[REDACTED]"
    assert redacted["Authorization"] == "[REDACTED]"
    assert redacted["jwt"] == "[REDACTED]"
    assert redacted["cookie"] == "[REDACTED]"
    assert redacted["prompt_token_estimate"] == 100
    assert redacted["completion_tokens"] == 50
    assert redacted["estimatedTotalTokens"] == "150"
    assert redacted["rag_context_tokens"] == 25
    assert redacted["skill_total_tokens"] == 10
    assert redacted["token"] == "[REDACTED]"
    assert redacted["access_token_count"] == "[REDACTED]"


def test_examiner_rag_disabled_bypasses_retrieval(monkeypatch):
    from my_agent.agents.sub_agents import examiner_agent

    async def fail_search(*_args, **_kwargs):
        raise AssertionError("RAG search should not run when rag_enabled=false")

    monkeypatch.setattr(examiner_agent, "search_mcp_artifacts", fail_search)

    result = asyncio.run(examiner_agent.examiner_agent_node({
        "messages": [HumanMessage(content="DELEGATE_TO_EXAMINER: API_DOCUMENTATION:\nGET /items")],
        "next_agent": "examiner",
        "final_response": "",
        "history": [],
        "retry_count": 0,
        "current_plan": "",
        "is_complete": False,
        "raw_api_doc": "openapi: 3.0.0\npaths: {}",
        "enriched_context": "",
        "rag_enabled": "false",
    }))

    assert result["next_agent"] == "generator"
    assert result["enriched_context"] == "[]"
    assert "DELEGATE_TO_GENERATOR" in result["messages"][0].content


def test_vector_db_uses_gemini_embedding_configuration(monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", "dummy")
    monkeypatch.setenv("GEMINI_EMBEDDING_MODEL", "gemini-embedding-2")
    monkeypatch.setenv("CHROMA_COLLECTION_NAME", "mcp_servers_hierarchical_gemini")
    sys.modules.pop("my_agent.utils.vector_db", None)

    vector_db = importlib.import_module("my_agent.utils.vector_db")

    assert vector_db.EMBEDDING_MODEL == "gemini-embedding-2"
    assert vector_db.COLLECTION_NAME == "mcp_servers_hierarchical_gemini"
    assert not hasattr(vector_db, "OLLAMA_BASE_URL")


def test_examiner_rag_enabled_preserves_retrieval(monkeypatch):
    from my_agent.agents.sub_agents import examiner_agent
    from my_agent.utils import openapi_parser

    captured = {}
    recorded_events = []

    async def fake_search(api_doc, n_results):
        captured["api_doc"] = api_doc
        captured["n_results"] = n_results
        return [{
            "id": "artifact-1",
            "content": "safe context",
            "metadata": {"type": "api_doc", "server_id": "server-1", "filename": "fixture.yaml"},
        }]

    async def fake_extract(related_contents, _llm):
        captured["related_contents"] = related_contents
        return [{"id": "structured-1"}]

    async def fake_record_research_event(**kwargs):
        recorded_events.append(kwargs)
        return kwargs

    monkeypatch.setattr(examiner_agent, "search_mcp_artifacts", fake_search)
    monkeypatch.setattr(examiner_agent, "record_research_event", fake_record_research_event)
    monkeypatch.setattr(openapi_parser, "extract_structured_context", fake_extract)

    result = asyncio.run(examiner_agent.examiner_agent_node({
        "messages": [HumanMessage(content="DELEGATE_TO_EXAMINER: API_DOCUMENTATION:\nGET /items")],
        "next_agent": "examiner",
        "final_response": "",
        "history": [],
        "retry_count": 0,
        "current_plan": "",
        "is_complete": False,
        "raw_api_doc": "openapi: 3.0.0\npaths: {}",
        "enriched_context": "",
        "rag_enabled": "true",
    }))

    assert captured["api_doc"] == "openapi: 3.0.0\npaths: {}"
    assert captured["n_results"] == 3
    assert captured["related_contents"][0]["id"] == "artifact-1"
    assert json.loads(result["enriched_context"]) == [{"id": "structured-1"}]
    delegation = result["messages"][0].content
    assert "DELEGATE_TO_GENERATOR:" in delegation
    assert "ORIGINAL_PROMPT:" in delegation
    assert "API_DOCUMENTATION:\nopenapi: 3.0.0\npaths: {}" in delegation
    assert "ENRICHED_CONTEXT (RAG):" in delegation
    metrics = recorded_events[-1]["metrics"]
    assert metrics["rag_context_tokens"] > 0
    assert metrics["rag_returned_count"] == 1
    assert metrics["rag_context_item_count"] == 1
    assert metrics["rag_top_3_evidence_labels"] == ["api_doc"]
    assert len(metrics["rag_top_3_evidence_hashes"]) == 1


def test_generator_falls_back_to_direct_create_when_llm_omits_tool_call(monkeypatch):
    from my_agent.agents.sub_agents import generator_agent
    from my_agent.utils import llm_factory

    captured = {}
    recorded_events = []

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

    async def fake_record_research_event(**kwargs):
        recorded_events.append(kwargs)
        return kwargs

    class FakeCreateMCPServerTool:
        async def ainvoke(self, args):
            return await fake_create_mcp_server(args)

    monkeypatch.setattr(llm_factory, "get_llm", lambda *args, **kwargs: NoToolCallLLM())
    monkeypatch.setattr(generator_agent, "create_MCPServer", FakeCreateMCPServerTool())
    monkeypatch.setattr(generator_agent, "fetch_mcp_files", fake_fetch_mcp_files)
    monkeypatch.setattr(generator_agent, "save_mcp_artifacts", fake_save_mcp_artifacts)
    monkeypatch.setattr(generator_agent, "record_research_event", fake_record_research_event)

    result = asyncio.run(generator_agent.generator_agent_node({
        "messages": [AIMessage(content="DELEGATE_TO_GENERATOR: API_DOCUMENTATION:\nGET /items")],
        "next_agent": "generator",
        "final_response": "",
        "history": [],
        "retry_count": 0,
        "current_plan": "",
        "is_complete": False,
        "raw_api_doc": "openapi: 3.0.0\npaths: {}",
        "enriched_context": "[]",
    }))

    output = json.loads(result["final_response"])
    assert output["serverId"] == "real-server-123"
    assert "fake-hallucinated-id" not in result["final_response"]
    assert captured["args"]["query"][0] == "openapi: 3.0.0\npaths: {}"
    assert captured["args"]["rag_context"] == []
    assert recorded_events[-1]["service"] == "langgraph-agent"
    assert recorded_events[-1]["event_name"] == "generator_completed"
    assert recorded_events[-1]["metrics"]["server_created"] is True


def import_graph_with_dummy_llm(monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", "dummy")
    return importlib.import_module("my_agent.agents.graph")


def test_tool_repair_preserves_structured_generator_payload(monkeypatch):
    graph = import_graph_with_dummy_llm(monkeypatch)

    task = "API_DOCUMENTATION:\nopenapi: 3.0.0\n\nENRICHED_CONTEXT (RAG):\n[]"

    assert graph._needs_task_repair(task) is False
    assert graph._needs_task_repair("process the provided specification") is True


def test_supervisor_final_preserves_successful_generator_json(monkeypatch):
    graph = import_graph_with_dummy_llm(monkeypatch)
    final_json = json.dumps({
        "status": "running",
        "serverId": "server-123",
        "config": {"mcpServers": {}},
        "serverCreated": True,
    })

    result = asyncio.run(graph.supervisor_final_node({
        "messages": [AIMessage(content=final_json)],
        "next_agent": "supervisor_final",
        "final_response": final_json,
        "history": ["_ran_generator"],
        "retry_count": 0,
        "current_plan": "",
        "is_complete": False,
        "raw_api_doc": "openapi: 3.0.0",
        "enriched_context": "[]",
    }))

    assert result["next_agent"] == "end"
    assert result["final_response"] == final_json
    assert result["is_complete"] is True


def test_supervisor_routes_clear_mcp_creation_request_when_llm_omits_tool_call(monkeypatch):
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

    result = asyncio.run(graph.supervisor_node({
        "messages": [HumanMessage(content=prompt)],
        "next_agent": "",
        "final_response": "",
        "history": [],
        "retry_count": 0,
        "current_plan": "",
        "is_complete": False,
        "raw_api_doc": "",
        "enriched_context": "",
    }))

    assert result["next_agent"] == "tools"
    assert result["messages"][0].tool_calls[0]["name"] == "delegate_to_examiner_agent"


def test_supervisor_routes_metaclaw_api_doc_payload_when_llm_omits_tool_call(monkeypatch):
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

    result = asyncio.run(graph.supervisor_node({
        "messages": [HumanMessage(content=prompt)],
        "next_agent": "",
        "final_response": "",
        "history": [],
        "retry_count": 0,
        "current_plan": "",
        "is_complete": False,
        "raw_api_doc": "",
        "enriched_context": "",
    }))

    assert result["next_agent"] == "tools"
    assert result["messages"][0].tool_calls[0]["name"] == "delegate_to_examiner_agent"
