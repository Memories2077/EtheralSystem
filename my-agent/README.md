# Multi-Agent System (MCP Server Generator)

Hệ thống đa agent với kiến trúc Supervisor-SubAgent, được xây dựng bằng LangChain, LangGraph và LlamaIndex. Hệ thống chuyên dụng để tạo và quản lý các MCP (Model Context Protocol) Servers.

## 🏗️ Cấu trúc

```
my-agent/
├── agents/                      # Triển khai các Agent (Supervisor, Generator, Examiner)
│   ├── sub_agents/              # Các sub-agents chuyên biệt
├── config/                      # Cấu hình hệ thống (API keys, model settings)
├── data/                        # Dữ liệu lưu trữ (LlamaIndex storage, ChromaDB)
├── prompts/                     # Prompt cho các agent
├── scripts/                     # Script tiện ích
├── tests/                       # Bộ test suite và script kiểm tra RAG
├── tools/                       # Định nghĩa các tool cho agent
├── utils/                       # Các hàm tiện ích (Vector DB, State management)
└── README.md                    # Tài liệu hướng dẫn chính
```

## 🤖 Các Agent

### 1. Supervisor Agent (Agent Giám sát)

- **Vai trò**: Phân tích yêu cầu và điều phối.
- **Nhiệm vụ**:
  - Nhận yêu cầu từ người dùng (ví dụ: "Tạo MCP Server cho API này").
  - Ủy thác công việc cho `Generator Agent` hoặc `Examiner Agent`.
  - Tổng hợp kết quả cuối cùng để phản hồi người dùng.

### 2. Generator Agent (Agent Tạo mã)

- **Vai trò**: Tạo mã nguồn cho MCP Server.
- **Tools**: `create_MCPServer`, `test_mcp_server`.
- **Nhiệm vụ**:
  - Dựa trên tài liệu API, tạo mã nguồn TypeScript cho MCP Server.
  - Tự động cài đặt và kiểm tra server sau khi tạo.
  - Lưu trữ kết quả (code, specs) vào Vector DB để tham khảo trong tương lai.

### 3. Examiner Agent (Agent Kiểm tra)

- **Vai trò**: Phân tích và làm phong phú ngữ cảnh (RAG).
- **Nhiệm vụ**:
  - Trích xuất thông tin quan trọng từ tài liệu API hoặc yêu cầu.
  - Sử dụng **Hierarchical RAG** để tìm kiếm các mã nguồn hoặc tài liệu cũ liên quan.
  - Cung cấp ngữ cảnh phong phú (Enriched Context) cho Generator Agent để tăng độ chính xác.

## 🧠 Advanced RAG (Hierarchical & Auto-Merging)

Hệ thống sử dụng **LlamaIndex** để triển khai kỹ thuật RAG tiên tiến:

- **Hierarchical Indexing**: Tài liệu được chia thành nhiều cấp độ (Nodes) từ lớn đến nhỏ (2048, 512, 128 bytes).
- **Auto-Merging Retriever**: Khi các node con nhỏ được tìm thấy, hệ thống sẽ tự động hợp nhất chúng thành node cha lớn hơn để cung cấp ngữ cảnh đầy đủ, tránh việc thông tin bị cắt vụn.
- **LangChain Integration**: Sử dụng `LangChainLLM` để tích hợp LLM từ LangChain vào quy trình xử lý của LlamaIndex.

## ⚙️ Cài đặt

1. **Cài đặt môi trường**:
Project sử dụng virtual environment tại thư mục gốc `.venv`.

2. **Cấu hình file `.env`**:
```env
GEMINI_API_KEY=your_gemini_api_key
TAVILY_API_KEY=your_tavily_api_key
MCP_BASE_URL=http://localhost:8000
```

## 🚀 Kiểm tra và Chạy thử

### Kiểm tra RAG và Embeddings:
```bash
# Trong thư mục my-agent/
..\.venv\Scripts\python.exe tests/verify_embeddings.py
..\.venv\Scripts\python.exe tests/test_hierarchical_rag.py
```

### Chạy hệ thống (Interactive Mode):
```bash
..\.venv\Scripts\python.exe tests/test_with_examiner.py
```

## 🛡️ Best Practices
1. **Dữ liệu Lịch sử**: Luôn cho phép Examiner Agent chạy trước để tìm kiếm các pattern cũ, giúp Generator Agent hoạt động hiệu quả hơn.
2. **Context merging**: Tính năng Auto-merging được bật mặc định, giúp các đoạn code dài không bị mất ngữ cảnh khi truy xuất.

## 📚 Tài liệu tham khảo
- LangChain: https://python.langchain.com/
- LlamaIndex: https://www.llamaindex.ai/
- LangGraph: https://langchain-ai.github.io/langgraph/
- Tavily API: https://tavily.com/
