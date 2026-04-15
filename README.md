# 🧠 MCP Agent Engine: Autonomous Generation & RAG

[![Python](https://img.shields.io/badge/Python-3.10+-3776AB?logo=python&logoColor=white)](https://www.python.org/)
[![LangGraph](https://img.shields.io/badge/Orchestration-LangGraph-black)](https://langchain-ai.github.io/langgraph/)
[![RAG](https://img.shields.io/badge/Context-Hierarchical--RAG-orange)](https://vapi.ai)
[![MetaClaw](https://img.shields.io/badge/MetaClaw-Provider-blueviolet)](https://github.com/metaclaw)

The core agentic engine powering the **Gemini InsightLink** ecosystem. This repository contains the stateful LangGraph orchestration logic, hierarchical RAG systems, and specialized sub-agents designed to analyze codebases and generate fully functional MCP (Model Context Protocol) servers.

---

## 🤖 Multi-Agent Orchestration

Driven by **LangGraph**, the engine utilizes a specialized multi-agent architecture to ensure precision in complex tasks:

*   **Examiner Agent**: The "scout" of the system. It proactively explores the target environment or codebase, identifying patterns, dependencies, and integration points.
*   **Generator Agent**: The architect. It consumes findings from the Examiner and produces production-ready MCP server implementations, configuration JSONs, and robust deployment scripts.
*   **Supervisor Node**: The gatekeeper. It manages the state machine, validates agent outputs against strict schemas, and ensures the system remains resilient across long-running tasks.

---

## ✨ Advanced Capabilities

### 🛡️ MetaClaw Provider Integration
Native support for **MetaClaw** as a high-fidelity LLM provider. This allows the agents to utilize advanced tool-calling capabilities and shared memory models across different sessions.

### 📚 Hierarchical RAG (Retrieval-Augmented Generation)
Combines codebase-wide indexing with deep semantic search. The engine maintains a hierarchical representation of your project, allowing it to retrieve relevant context without being overwhelmed by file size or quantity.

### 🏗️ Autonomous MCP Generation
Simply describe your requirements, and the engine will:
1.  Analyze the target API or environment.
2.  Generate the Python/TypeScript boilerplate for the MCP server.
3.  Produce a valid `mcp_config.json`.
4.  Provide a deployment-ready Dockerfile.

### 📡 Real-time Telemetry
Exposes granular internal state updates via the LangGraph SDK. This allows frontends (like the InsightLink Chatbot) to visualize the agent's progress, tool calls, and decision-making logic in real-time.

---

## 🛠️ Technical Stack

*   **Orchestration**: LangGraph, LangChain.
*   **Vector Database**: ChromaDB (Support for hierarchical indexing).
*   **LLM Support**: Google Gemini (2.0-Flash / 2.5-Series), MetaClaw Proxy, OpenAI-compatible APIs.
*   **Persistence**: MongoDB (Storing agent checkpoints and thread states).

---

## 🚀 Getting Started

### Prerequisites
*   Python 3.10 or higher.
*   Docker & Docker Compose (for MongoDB and ChromaDB).

### Configuration
Create a `.env` file based on `.env.example`:

```bash
# 1. LLM & Tools
GEMINI_API_KEY="your_api_key"
TAVILY_API_KEY="your_tavily_key"

# 2. MetaClaw (Brain) Configuration
METACLAW_ENABLED=true
METACLAW_BASE_URL="https://llmapi.iec-uit.com/v1"
METACLAW_API_KEY="your_metaclaw_key"

# 3. Persistence
MONGO_URI=mongodb://localhost:27017
MONGO_DB_NAME=mcp_agent_db
```

### Installation
We provide a management script for ease of use:
```bash
# Initialize environment and dependencies
sh manage.sh setup
```

### Running the Engine
```bash
# Start the LangGraph API server in development mode
sh manage.sh start
```

---

## 🧪 Testing & Verification

The suite includes dedicated tools for verifying the RAG pipeline and agent logic:
```bash
# Verify RAG & Embeddings
python tests/verify_embeddings.py

# Test Hierarchical RAG indexing
python tests/test_hierarchical_rag.py

# Run interactive Examiner loop
python tests/test_with_examiner.py
```

---

## 📄 License
MIT License. See [LICENSE](LICENSE) for details.
