# Multi-Agent System

Hệ thống đa agent với kiến trúc Supervisor-SubAgent, được xây dựng bằng LangChain và LangGraph.

## 🏗️ Cấu trúc

```
my-agent/
├── config/                      # Cấu hình hệ thống
│   └── __init__.py             # Agent config, API config
│
├── prompts/                     # Prompts cho từng agent
│   ├── supervisor_prompt.txt   # Prompt cho Supervisor
│   ├── research_agent_prompt.txt
│   ├── analysis_agent_prompt.txt
│   └── execution_agent_prompt.txt
│
├── agents/                      # Agent implementations
│   ├── __init__.py
│   ├── supervisor.py           # Supervisor Agent
│   └── sub_agents/
│       ├── __init__.py
│       ├── research_agent.py   # Research Agent
│       ├── analysis_agent.py   # Analysis Agent
│       └── execution_agent.py  # Execution Agent
│
├── tools/                       # Tools cho từng agent
│   ├── supervisor_tools/       # Tools cho Supervisor
│   │   └── __init__.py        # Delegation, coordination
│   ├── research_tools/         # Tools cho Research
│   │   └── __init__.py        # Web search, data gathering
│   ├── analysis_tools/         # Tools cho Analysis
│   │   └── __init__.py        # Data analysis, reporting
│   └── execution_tools/        # Tools cho Execution
│       └── __init__.py        # API calls, MCP operations
│
├── utils/                       # Utilities
│   └── __init__.py
│
└── main.py                      # Entry point
```

## 🤖 Các Agent

### 1. Supervisor Agent

- **Vai trò**: Điều phối và phân công công việc
- **Tools**: Delegation, status checking, result synthesis
- **Nhiệm vụ**:
  - Phân tích yêu cầu của người dùng
  - Phân công công việc cho sub-agents
  - Tổng hợp kết quả

### 2. Research Agent

- **Vai trò**: Thu thập thông tin
- **Tools**: Web search (Tavily), news search, document retrieval
- **Nhiệm vụ**:
  - Tìm kiếm thông tin trên web
  - Thu thập dữ liệu từ nhiều nguồn
  - Tóm tắt và tổ chức findings

### 3. Analysis Agent

- **Vai trò**: Phân tích dữ liệu
- **Tools**: Data analysis, comparison, report generation, statistics
- **Nhiệm vụ**:
  - Phân tích dữ liệu
  - Tạo báo cáo
  - Đưa ra insights và recommendations

### 4. Execution Agent

- **Vai trò**: Thực thi hành động
- **Tools**: MCP API calls, CRUD operations, resource management
- **Nhiệm vụ**:
  - Gọi API đến MCP Server
  - Tạo/đọc/cập nhật/xóa resources
  - Thực hiện các tác vụ cụ thể

## ⚙️ Cài đặt

1. **Cài đặt dependencies**:

```bash
pip install -e .
```

2. **Cấu hình môi trường** (tạo file `.env`):

```env
GOOGLE_API_KEY=your_google_api_key
TAVILY_API_KEY=your_tavily_api_key
MCP_BASE_URL=http://localhost:8000
MCP_API_KEY=your_mcp_api_key
```

## 🚀 Sử dụng

### Chạy ví dụ mẫu:

```bash
python my-agent/main.py
```

### Interactive Mode:

Uncomment dòng `system.interactive_mode()` trong `main.py` và chạy:

```bash
python my-agent/main.py
```

### Sử dụng từng agent riêng:

```python
from agents import SupervisorAgent, ResearchAgent, AnalysisAgent, ExecutionAgent

# Research Agent
research = ResearchAgent()
result = research.invoke("Find information about AI trends")

# Analysis Agent
analysis = AnalysisAgent()
result = analysis.invoke("Analyze this data: [1, 2, 3, 4, 5]")

# Execution Agent
execution = ExecutionAgent()
result = execution.invoke("List all resources from MCP server")

# Supervisor (tự động phân công)
supervisor = SupervisorAgent()
result = supervisor.invoke("Research AI trends and create a report")
```

## 🔧 Tùy chỉnh

### Thêm tools mới:

1. Tạo function trong thư mục `tools/` tương ứng
2. Thêm vào list tools (ví dụ: `RESEARCH_TOOLS`)

### Chỉnh sửa prompts:

- Edit các file `.txt` trong thư mục `prompts/`

### Thay đổi cấu hình:

- Chỉnh sửa `config/__init__.py`

## 📝 Ví dụ

### Supervisor phân công công việc:

```python
system = MultiAgentSystem()
system.run(
    "Research the latest AI developments and create an analysis report",
    agent_type="supervisor"
)
```

### Research Agent:

```python
system.run(
    "Find information about LangGraph framework",
    agent_type="research"
)
```

### Analysis Agent:

```python
system.run(
    "Analyze sales data: [100, 150, 200, 180, 220]",
    agent_type="analysis"
)
```

### Execution Agent:

```python
system.run(
    "Create a new resource named 'test' in the MCP server",
    agent_type="execution"
)
```

## 🎯 Best Practices

1. **Supervisor Agent**: Sử dụng cho các tác vụ phức tạp cần nhiều bước
2. **Direct Agent**: Gọi trực tiếp agent cụ thể khi biết rõ loại tác vụ
3. **Error Handling**: Agents tự động xử lý lỗi và retry khi cần
4. **Context**: Truyền context khi cần chia sẻ thông tin giữa các agents

## 📚 Tài liệu

- LangChain: https://python.langchain.com/
- LangGraph: https://langchain-ai.github.io/langgraph/
- Tavily API: https://tavily.com/
