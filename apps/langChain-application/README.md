# 🧠 MCP Agent Engine: Autonomous Generation & RAG

[![Python](https://img.shields.io/badge/Python-3.12+-3776AB?logo=python&logoColor=white)](https://www.python.org/)
[![LangGraph](https://img.shields.io/badge/Orchestration-LangGraph-black)](https://langchain-ai.github.io/langgraph/)
[![RAG](https://img.shields.io/badge/Context-Hierarchical--RAG-orange)](https://vapi.ai)
[![MetaClaw](https://img.shields.io/badge/MetaClaw-Provider-blueviolet)](https://github.com/metaclaw)

The core agentic engine powering the **Gemini InsightLink** ecosystem. This repository contains the stateful LangGraph orchestration logic, hierarchical RAG systems, and specialized sub-agents designed to analyze API documentation, enrich generation context with RAG, invoke mcp-gen, and index generated MCP artifacts.

---

## 🤖 Multi-Agent Orchestration

The canonical LangGraph app is exported from `my_agent/agents/graph.py:app` and
registered in `langgraph.json`.

```text
User request
  -> supervisor
  -> tools
  -> examiner or generator
  -> supervisor_final
  -> tools, supervisor, or end
```

Core runtime nodes:

- **Supervisor Node**: LLM-based router that preserves the original user request in `raw_api_doc`, chooses the next graph tool, tracks `history`, and enforces the `MAX_RETRIES` loop guard.
- **Tools Node**: Executes the supervisor delegation tools and repairs incomplete tool arguments from explicit state (`raw_api_doc` and `enriched_context`) before routing.
- **Examiner Agent**: Searches prior MCP artifacts through hierarchical RAG, extracts structured technical context, stores it in `enriched_context`, and emits a generator delegation payload.
- **Generator Agent**: Builds a state-backed `create_MCPServer` request, calls mcp-gen, fetches generated artifacts, and indexes them back into the vector store when available.
- **Supervisor Final Node**: Evaluates sub-agent output, fast-paths successful Examiner output directly to Generator, ends on successful Generator output, or loops back to Supervisor when retry is still allowed.

Important state fields:

- `messages`: accumulated LangChain messages.
- `raw_api_doc`: original API documentation or user request, used as the canonical generation input.
- `enriched_context`: structured RAG context produced by the Examiner.
- `history`, `retry_count`, `current_plan`, `is_complete`: routing, retry, and completion controls.

For the detailed edge-by-edge graph description, see `docs/GRAPH_ARCHITECTURE.md`.

---

## ✨ Advanced Capabilities

### 🛡️ MetaClaw Provider Integration

Native support for **MetaClaw** as a high-fidelity LLM provider. This allows the agents to use advanced tool-calling capabilities and shared memory models across sessions.

### 📚 Hierarchical RAG (Retrieval-Augmented Generation)

Combines codebase-wide indexing with deep semantic search. The engine maintains a hierarchical representation of generated artifacts and related context, allowing it to retrieve relevant context without being overwhelmed by file size or quantity.

### 🏗️ Autonomous MCP Generation

Provide API documentation and user metadata, and the engine will:

1. Analyze the API documentation.
2. Enrich the generation request with RAG context.
3. Call mcp-gen through `POST /api/mcp/create`.
4. Return the generated Claude/MCP configuration.
5. Fetch generated artifacts from `GET /api/mcp/:serverId/files` and index them for future RAG retrieval when available.

### 📡 Real-time Telemetry

Exposes granular internal state updates via the LangGraph SDK. This allows frontends, such as the InsightLink Chatbot, to visualize agent progress, tool calls, and routing decisions in real time.

---

## 🛠️ Technical Stack

- **Orchestration**: LangGraph, LangChain.
- **Vector Database**: ChromaDB with LlamaIndex `HierarchicalNodeParser` and `AutoMergingRetriever`.
- **Embeddings**: Ollama-backed `qwen3-embedding:0.6b` embeddings.
- **LLM Support**: MetaClaw proxy, direct Google Gemini, and direct Groq.
- **Persistence**: MongoDB-backed LlamaIndex docstore for hierarchical RAG metadata where configured.
- **MCP generation backend**: mcp-gen manager API.

---

## 🚀 Getting Started

### Prerequisites

- Python 3.12 or higher. This matches `pyproject.toml` and the Docker image.
- Docker and Docker Compose.
- Git Bash or WSL on Windows if using `manage.sh`.
- A sibling `../mcp-gen` repository and `../chatbot_mcp_client` repository when using `manage.sh up` for the full ecosystem.

### Shared Docker network

`docker-compose.yaml` uses an external Docker network named `mcp-network`. Create it before starting Compose if you are not using `manage.sh up`:

```bash
docker network create mcp-network
```

`manage.sh up` creates this network automatically if it does not already exist.

### Configuration

Create a `.env` file based on `.env.example`:

```bash
cp .env.example .env
```

Key service URL convention:

- `MCP_BASE_URL` is the mcp-gen API base URL and **must include `/api`**.
  - Docker Compose default: `http://docker-manager:8080/api`
  - Host-local default: `http://localhost:8080/api`
- If a root manager URL is needed by future code, use `MCP_MANAGER_URL` such as `http://docker-manager:8080`.

Example core variables:

```bash
GEMINI_API_KEY="your_api_key"
TAVILY_API_KEY="your_tavily_key"
MCP_BASE_URL=http://localhost:8080/api
MCP_MANAGER_URL=http://localhost:8080
MONGO_URI=mongodb://localhost:27017
MONGO_DB_NAME=mcp_agent_db
```

### Installation

Install dependencies in a Python 3.12 environment:

```bash
python -m pip install --upgrade pip
python -m pip install -e .
```

### Running the LangGraph engine only

```bash
langgraph dev --host 0.0.0.0 --port 2024
```

### Running with Docker Compose

Start only this repository's services:

```bash
docker compose up -d
```

### Running the full local ecosystem

`manage.sh` orchestrates sibling repositories and supports these commands:

```bash
sh manage.sh up
sh manage.sh down
sh manage.sh restart
sh manage.sh logs
sh manage.sh logs-agent
sh manage.sh logs-backend
sh manage.sh logs-frontend
sh manage.sh ps
sh manage.sh rebuild
```

Service URLs printed by `manage.sh up`:

- Frontend: `http://localhost:9002`
- Chatbot backend: `http://localhost:8000`
- LangGraph: `http://localhost:2024`
- mcp-gen manager: `http://localhost:8080`
- mcp-gen proxy: `http://localhost:8081`

---

## 🔌 mcp-gen API Contract

The generator tool sends this request to `POST /api/mcp/create`:

```json
{
  "request": "string",
  "userId": "string",
  "email": "string",
  "rag_context": []
}
```

It expects a response like:

```json
{
  "serverId": "string",
  "claudeConfig": {},
  "status": "running"
}
```

After creation, the generator fetches artifacts from `GET /api/mcp/:serverId/files`. The final user response distinguishes:

- server creation success or failure,
- artifact fetch success, skipped, or failure,
- RAG indexing success, skipped, or failure,
- warnings from post-creation processing.

---

## 🧪 Testing & Verification

Useful smoke checks:

```bash
python -m compileall my_agent
python my_agent/scripts/check_chroma.py
python my_agent/scripts/check_ollama.py
python my_agent/scripts/check_deps.py
```

Additional verification scripts may require local services and provider API keys.

---

## 📄 License

MIT License. See `LICENSE` for details.
