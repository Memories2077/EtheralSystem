# Phân tích Kiến trúc & Đề xuất Tích hợp MetaClaw

## Vấn đề của Luồng Tuần tự Hiện tại

```
[User Request]
     │
     ▼
 Supervisor  ──►  Examiner  ──►  Generator  ──►  mcp-gen
  (route)        (analyze)       (generate)      (build)
```

**Tại sao luồng này cứng nhắc khi có MetaClaw?**

| Vấn đề | Mô tả |
|--------|-------|
| **Forced sequencing** | Dù task đơn giản, vẫn phải đi qua Examiner → Generator – không thể skip hay loop |
| **No dynamic re-routing** | Nếu Generator thất bại, Supervisor không thể tự động quyết định "hỏi lại Examiner" hay "đổi chiến lược" |
| **Skill injection tại compile-time** | `SkillRouter` inject context vào prompt theo regex cố định, không theo ngữ cảnh thực |
| **Wasted LLM calls** | Supervisor, Examiner, Generator đều gọi LLM riêng, cada lớp không biết gì nhau đã học |
| **MetaClaw không có "điểm vào"** | Proxy chỉ có giá trị nếu nằm dưới *tất cả* LLM call – nhưng hiện mỗi agent init LLM riêng |

---

## Đề xuất Kiến trúc Mới: "MetaClaw-as-Brain"

> Thay vì pipeline cứng, dùng **một Orchestrator động** trung tâm.
> MetaClaw không "chạy" thay agent; nó là layer intelligence nằm dưới mọi LLM call.

### Tầm nhìn mục tiêu

```
[User Request]
     │
     ▼
 ┌──────────────────────────────────────────────────────┐
 │             Orchestrator Node (LangGraph)             │
 │    - Nhận request, quyết định cần làm gì             │
 │    - Không sequential – ra quyết định per iteration   │
 └──────────────────────────────────────────────────────┘
          │              │               │
          ▼              ▼               ▼
     [Examine]       [Generate]      [Validate]
     (nếu cần)       (nếu đủ)        (always)
          │              │               │
          └──────────────┴───────────────┘
                         │
               ┌─────────▼──────────┐
               │   MetaClaw Proxy   │  ← TẤT CẢ LLM call đều qua đây
               │  (port :30000)     │
               │  • Skill Injection │
               │  • Memory Recall   │
               └─────────┬──────────┘
                         │
                    [LLM Provider]
                  (Gemini / Groq)
```

---

## 3 Thay đổi Cụ thể Được Đề xuất

### 1. Gộp LLM Provider vào MetaClaw (thay đổi nhỏ nhất, ảnh hưởng lớn nhất)

**File:** `langChain-application/my-agent/agents/supervisor.py` (và tất cả agent khác)

```python
# BEFORE (mỗi agent tự new ChatGoogleGenerativeAI):
self.model = ChatGoogleGenerativeAI(model=config["model"], api_key=api_key)

# AFTER (tất cả agent đều đi qua MetaClaw):
from langchain_openai import ChatOpenAI
import os

def get_llm(model_name: str):
    if os.getenv("METACLAW_ENABLED") == "true":
        return ChatOpenAI(
            base_url=os.getenv("METACLAW_BASE_URL", "http://localhost:30000/v1"),
            api_key=os.getenv("METACLAW_API_KEY", "metaclaw"),
            model=model_name
        )
    # fallback
    from langchain_google_genai import ChatGoogleGenerativeAI
    return ChatGoogleGenerativeAI(model=model_name, api_key=api_key)

self.model = get_llm(config["model"])
```

**Lợi ích:** Ngay lập tức Supervisor, Examiner, Generator đều được MetaClaw inject skill phù hợp – **không cần đổi bất kỳ logic nào khác**.

---

### 2. Chuyển Supervisor thành Orchestrator động (thay đổi trung bình)

Thay vì Supervisor chỉ "delegate based on keyword", nó nên dùng LLM (đã qua MetaClaw) để **quyết định next step** sau mỗi turn:

```python
# Thêm vào supervisor.py: conditional routing dựa trên LLM decision
async def route(self, state: GraphState) -> str:
    """
    MetaClaw-enriched routing: LLM tự quyết định agent nào cần chạy tiếp.
    MetaClaw đã inject skill relevant vào prompt của câu hỏi này.
    """
    decision_prompt = f"""
    Current task: {state['task']}
    Work done so far: {state['history']}
    Available agents: [examiner, generator, validator, done]
    
    Which agent should handle next? Reply with just the agent name.
    """
    response = await self.model.ainvoke([HumanMessage(content=decision_prompt)])
    return response.content.strip().lower()
```

**So với hiện tại:** Supervisor hiện tại (`supervisor.py:46`) chỉ gọi `ainvoke` 1 lần và return, không có vòng lặp iteration. Cần bổ sung loop trong LangGraph graph.

---

### 3. Bỏ mcp-gen ra khỏi luồng LangGraph – dùng Tool Call (thay đổi lớn nhất)

Hiện tại `mcp-gen` nhận lệnh như một service cuối của pipeline. Nếu mcp-gen cũng đi qua MetaClaw Proxy, thì:

```
Orchestrator
    │
    │ tool_call: "build_mcp_server"
    ▼
  mcp-gen (Tool)          ← mcp-gen = Tool, không phải Step
    │
    │ gọi internal LLM (qua MetaClaw proxy)
    ▼
  MetaClaw ──► LLM
    │
  Result trả về Orchestrator
    │
  Orchestrator quyết định "done" hay "retry"
```

**Lợi ích:** mcp-gen không còn là endpoint cứng ở cuối pipeline; Orchestrator có thể gọi nó nhiều lần, retry với context khác, hoặc skip nếu không cần.

---

## Roadmap Thực thi (3 giai đoạn)

### Giai đoạn 1: Proxy hóa toàn bộ LLM call (1-2 ngày)
- [ ] Tạo `utils/llm_factory.py` trong `langChain-application` – single entry point để lấy LLM
- [ ] Sửa `supervisor.py`, `examiner_agent.py`, `generator_agent.py` dùng factory
- [ ] Thêm METACLAW vars vào `.env` của `langChain-application`
> **Kết quả:** MetaClaw tự inject skill phù hợp vào TỪNG agent call, không cần thay đổi logic agent

### Giai đoạn 2: Dynamic Routing trong Supervisor (2-3 ngày)
- [ ] Bổ sung vòng lặp iteration trong LangGraph graph (conditional edges)
- [ ] Supervisor dùng LLM để quyết định next agent thay vì hardcode sequence
- [ ] Thêm state tracking: `history`, `retry_count`, `current_plan`

### Giai đoạn 3: mcp-gen as Tool + RL Feedback (optional, 3-5 ngày)
- [ ] Expose mcp-gen như một LangChain Tool (thay vì cuối pipeline)
- [ ] Sau mỗi build success/fail → gửi quality score về MetaClaw RL endpoint
- [ ] MetaClaw tự tối ưu prompt theo thời gian dựa trên feedback

---

## Bản tóm tắt: Cần thay gì, không cần thay gì

| Thành phần | Cần thay? | Thay gì |
|---|---|---|
| `genai.ts` (mcp-gen) | **Đã revert** – có thể để sau | Trỏ về MetaClaw proxy |
| `supervisor.py` | ✅ **Nên thay** | Dùng `llm_factory`, thêm routing loop |
| `examiner_agent.py` | ✅ **Nên thay** | Dùng `llm_factory` |
| `generator_agent.py` | ✅ **Nên thay** | Dùng `llm_factory` |
| LangGraph graph definition | ✅ **Nên thay** | Thêm conditional edges, bỏ forced sequence |
| `src/skills/` (mcp-gen) | 🔶 **Có thể để sau** | Move sang `~/.metaclaw/skills/` |
| Feedback RL | 🔶 **Tùy chọn** | Post quality score về MetaClaw |

> [!IMPORTANT]
> **Thay đổi ít code nhất, hiệu quả cao nhất** là tạo `llm_factory.py` và sửa 3 agent dùng nó. Chỉ ~20 dòng code thay đổi mà toàn bộ intelligence layer lập tức được MetaClaw serve.

> [!NOTE]
> User đã revert thay đổi `genai.ts` trong mcp-gen – đây là quyết định hợp lý vì MetaClaw proxy chưa được setup locally. Ưu tiên tích hợp `langChain-application` trước vì nó là layer dễ kiểm soát hơn.
