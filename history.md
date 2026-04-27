# Nhật ký Thay đổi (Change Log)

## [2026-04-27] - Khắc phục lỗi Client MetaClaw & Cấu hình Model (MetaClaw Client Fix & Model Config)

- **Sửa lỗi Khởi tạo Client**: Khắc phục lỗi `AttributeError` khi gọi `ChatOpenAI` thông qua MetaClaw Proxy bằng cách chuẩn hóa tham số khởi tạo.
- **Cập nhật Model mặc định**: Thay đổi model mặc định cho MetaClaw sang `qwen/qwen3-next-80b-a3b-instruct` và cập nhật khóa cấu hình thành `METACLAW_MODEL`.
- **Tối ưu hóa llm_factory**: Cải thiện logic chọn model và bổ sung chú thích về việc xử lý headers trong `llm_factory.py`.

---

## [2026-04-21] - Cải tiến Cấu hình & Tích hợp MetaClaw (Configuration Improvements & MetaClaw Integration)

- **Cấu hình Tập trung**: Cải thiện `my_agent/config/__init__.py` với các biến môi trường rõ ràng hơn và giá trị mặc định hợp lý.
- **Tích hợp MetaClaw**: Xác nhận `METACLAW_ENABLED`, `METACLAW_BASE_URL`, và `METACLAW_API_KEY` được sử dụng đúng trong `llm_factory.py`.
- **Tài liệu**: Bổ sung hướng dẫn cấu hình MetaClaw trong `CLAUDE.md` và `.env` mẫu.

---

## [2026-04-20] - Kiến trúc State-Based & Đánh giá Thông minh (State-Based Architecture & Evaluation)

### 🚀 Cải tiến Kiến trúc & Luồng dữ liệu (Architectural Improvements)

- **Kiến trúc State-Based (Explicit State Architecture)**: Chuyển đổi từ cơ chế bóc tách marker dựa trên chuỗi (`API_DOCUMENTATION:`) sang sử dụng các key tường minh trong `AgentState` (`raw_api_doc`, `enriched_context`). Giải quyết triệt để lỗi mất dữ liệu khi tin nhắn bị LLM cắt ngắn hoặc format sai.
- **Node Sửa lỗi Tool Call (Tool Argument Repair)**: Triển khai `tools_node_wrapper` đóng vai trò "người gác cổng" dữ liệu. Node này tự động kiểm tra và "vá" các tham số của tool delegation (`task`) bằng dữ liệu từ state nếu phát hiện LLM truyền thiếu hoặc truyền generic placeholder.
- **Đánh giá Thành công bằng LLM (LLM-Based Success Evaluation)**: Nâng cấp `supervisor_final_node` sử dụng một pass LLM riêng biệt để đánh giá kết quả từ Generator. Hệ thống hiện xác thực "Server ID" và cấu hình JSON thực tế thay vì chỉ dựa vào từ khóa (keywords) mong manh.
- **Luồng Tắt (Orchestration Fast-path)**: Triển khai cơ chế điều hướng nhanh trong `supervisor_final_node`. Sau khi Examiner hoàn thành enrichment, hệ thống sẽ tự động kích hoạt Generator mà không cần qua bước Supervisor routing, giúp giảm 1 turn LLM và tăng tốc độ phản hồi.

### 🛠️ Tối ưu hóa Generator & Sửa lỗi (Generator Optimization & Bug Fixes)

- **Truyền tải Documentation Toàn vẹn (Full Doc Transmission)**: Generator Agent hiện tự xây dựng tham số query cho tool `create_MCPServer` bằng cách lấy trực tiếp từ state, đảm bảo 100% dữ liệu API specification (ngay cả khi rất dài) được gửi đi mà không bị LLM làm hư hại hay cắt cụt.
- **Fix Import & Reliability**: 
  - Sửa lỗi `NameError: get_message_content` trong `generator_agent.py`.
  - Tập trung hóa logic xử lý tin nhắn vào `my_agent/utils/state.py`.
  - Cập nhật prompt điều phối để Supervisor nhận diện tốt hơn các tín hiệu hoàn thành từ MetaClaw Proxy.

---

## [2026-04-19] - Hệ thống Điều phối Đa Agent & Khắc phục Luồng Dữ liệu

### 🚀 Khắc phục Luồng Dữ liệu & Vòng lặp Agent (Data Flow & Loop Fixes)

- **Ngăn chặn Vòng lặp Vô tận (Infinite Loop Prevention)**: Tái cấu trúc logic `route_after_tools` trong `graph.py`. Hệ thống hiện chỉ kiểm tra tín hiệu điều phối (`DELEGATE_TO_...`) trong các tin nhắn của **turn hiện tại**, ngăn chặn việc kích hoạt lại các agent từ các tín hiệu cũ trong lịch sử.
- **Kiểm tra Type Tin nhắn Chắc chắn (Robust Message Checking)**: Thay thế việc kiểm tra `isinstance` (dễ lỗi khi bị serialize) bằng việc kiểm tra thuộc tính `.type == "human"` hoặc `.type == "ai"`. Điều này đảm bảo hệ thống luôn tìm thấy yêu cầu gốc của người dùng (`Original Prompt`) ngay cả khi chạy trong Docker/LangGraph API.
- **Chuẩn hóa Marker Dữ liệu (Marker Unification)**: Thống nhất sử dụng marker `API_DOCUMENTATION:` (viết hoa, có gạch dưới) trên toàn bộ hệ thống (`graph.py`, `examiner`, `generator`). Khắc phục lỗi mismatch khiến Examiner không tìm thấy documentation được trích xuất.
- **Bảo toàn Ngữ cảnh Gốc (Context Preservation)**: Sửa lỗi `ORIGINAL_PROMPT: N/A`. Examiner hiện đã có thể tìm thấy và truyền lại yêu cầu gốc của người dùng tới Generator, giúp Generator có đủ ngữ cảnh để tạo server chính xác.

### 🛠️ Tối ưu hóa RAG & Sửa lỗi (RAG Optimization & Bug Fixes)

- **Giảm nhiễu RAG (Noise Reduction)**: Tăng ngưỡng độ tương đồng (`similarity threshold`) từ `0.35` lên `0.45` lên `0.45` để lọc bỏ các tài liệu lịch sử không liên quan (ví dụ: không lấy Reddit khi đang yêu cầu ArXiv).
- **Sửa lỗi Code (Bug Fixes)**: 
  - Khắc phục lỗi `NameError: name 're' is not defined` trong `generator_agent.py`.
  - Sửa lỗi `tools_node_wrapper` cố gắng "sửa" tham số cho các tool không phải là delegation (như `mark_task_complete`).

---

## [2026-04-18] - MetaClaw Dynamic Orchestration & Intelligence Refinement

### 🚀 Tái cấu trúc Luồng điều phối (Orchestration Refactor)

- **MetaClaw-Centric Orchestration**: Chuyển đổi mô hình điều phối từ "Heuristic-based" (dựa trên từ khóa) sang "Intelligence-based" (dựa trên trí tuệ của MetaClaw). Hiện tại, chỉ MetaClaw (Supervisor) mới có quyền quyết định khi nào hoàn thành task.
- **Cumulative State Tracking**: Nâng cấp trường `history` trong `AgentState` sử dụng `operator.add`. Điều này cho phép hệ thống lưu trữ toàn bộ nhật ký các bước đã thực hiện (ví dụ: "Examiner analyzed docs", "Generator finished attempt") mà không bị ghi đè, giúp Supervisor có cái nhìn toàn cảnh về tiến trình.
- **Simplified Supervisor Final Node**: Loại bỏ các logic kiểm tra thành công cứng nhắc (regex/keyword matching). Node này hiện đóng vai trò như một "Evaluator bridge" sạch sẽ, luôn quay lại Supervisor để đánh giá kết quả từ sub-agents.
- **Sequential Awareness Prompt**: Cập nhật `_ROUTING_SYSTEM_PROMPT` để MetaClaw nhận diện được quy trình tiêu chuẩn: `Examiner` (Phân tích) → `Generator` (Tạo) cho các yêu cầu tạo server.

### 🛠️ Tối ưu hóa & Độ tin cậy (Optimization & Reliability)

- **Centralized LLM Factory**: Triển khai `my-agent/utils/llm_factory.py` làm entry point duy nhất cho tất cả LLM calls. Tự động tích hợp MetaClaw Proxy khi phát hiện biến môi trường `METACLAW_ENABLED=true`.
- **Retry Guard Mechanism**: Thiết lập `MAX_RETRIES = 3` để ngăn chặn vòng lặp vô tận khi Agent không thể hoàn thành task.
- **Node Tracking Support**: Cập nhật các wrapper `examiner_node_with_tracking` và `generator_node_with_tracking` để tự động đẩy các tracking markers vào lịch sử tích lũy.

---

## [2026-04-14] - MetaClaw Support & LLM Proxy Configuration

### 🚀 Tính năng mới & Cơ sở hạ tầng (New Features & Infrastructure)

- **MetaClaw Integration**: Tích hợp hỗ trợ MetaClaw làm LLM provider. Cho phép Agent chạy qua proxy MetaClaw để sử dụng các công cụ và bộ nhớ nâng cao.
- **ChatOpenAI Adapter**: Cập nhật `generator_agent.py` để sử dụng `ChatOpenAI` khi `METACLAW_ENABLED` là true, cho phép tương thích hoàn toàn với API của MetaClaw.
- **External Model Configuration**: Thêm các biến môi trường `METACLAW_BASE_URL` và `METACLAW_API_KEY` vào hệ thống cấu hình `config/__init__.py`.

### 🛠️ Tối ưu hóa Agent (Agent Optimization)

- **Flexible Provider Logic**: Agent giờ đây có khả năng chuyển đổi linh hoạt giữa trực tiếp Google SDK và MetaClaw Proxy dựa trên cấu hình môi trường, giúp dễ dàng triển khai trong các môi trường khác nhau (Docker vs Local).

## [2026-04-13 12:30] - Cải thiện Generator Agent & Chuẩn hóa Output MCP Config

### 🛠️ Khắc phục lỗi hệ thống (Bug Fixes)

- **Generator Agent Error Handling**: Nâng cấp logic xử lý lỗi trong `generator_agent_node`. Agent hiện đã có khả năng nhận diện và báo cáo các lỗi cụ thể từ tool `create_MCPServer` (ví dụ: lỗi kết nối backend, lỗi dữ liệu đầu vào) thay vì cố gắng tiếp tục quy trình và trả về kết quả rác.
- **Output Formatting & Summarization Bypass**: Cập nhật prompt của Generator Agent để luôn bao gồm các section "Server Details:" và "Configuration:".
  - **Lý do**: Việc chuẩn hóa header này giúp Supervisor Agent nhận diện được kết quả đã hoàn tất và kích hoạt cơ chế bypass (pass-through), ngăn chặn việc LLM tóm tắt lại làm hỏng cấu trúc JSON hoặc mất mát thông tin quan trọng như Server ID và Tokens.
- **Full Info Delivery**: Đảm bảo phản hồi cuối cùng của Generator Agent chứa đầy đủ cả thông báo trạng thái thân thiện và khối JSON cấu hình kỹ thuật để người dùng có thể copy-paste ngay lập tức.

---

## [2026-04-13 10:45] - Chuẩn hóa Cấu hình Kết nối MCP Manager (Docker Alignment)

### 🛠️ Khắc phục lỗi hệ thống (Bug Fixes)

- **MCP Base URL Alignment**: Cập nhật `MCP_BASE_URL` trong `.env.example` thành `http://docker-manager:8080/api`.
  - **Lý do**: Đảm bảo cấu hình mẫu đồng bộ với logic mạng trong `docker-compose.yaml`, giúp Agent container có thể kết nối trực tiếp với dịch vụ quản lý MCP qua mạng nội bộ Docker (`mcp-network`).

---

## [2026-04-12 22:30] - Sửa lỗi LangGraph Streaming & Chuẩn hóa Output JSON

### 🚀 Tính năng mới & Tối ưu hóa (New Features & Optimization)

- **Strict JSON Output Enforcement**: Ràng buộc Generator Agent chỉ trả về duy nhất khối JSON cấu hình MCP server (theo yêu cổng người dùng).
  - **Prompt Update**: Cập nhật `generator.txt` với yêu cầu format JSON nghiêm ngặt.
  - **Agent Logic**: Thêm chỉ dẫn cuối cùng trong `generator_agent.py` để LLM không trả về văn bản thừa.
  - **Summarization Bypass**: Cập nhật `supervisor_final_node` trong `test.py` để bỏ qua bước tóm tắt nếu kết quả đã là JSON, tránh việc LLM làm hỏng cấu trúc hoặc halluncinate tokens.
- **LangGraph Streaming Fix (Frontend)**: Khắc phục lỗi không hiển thị response khi stream từ LangGraph.
  - **Event Handling**: Hỗ trợ xử lý event `messages/partial`.
  - **Extraction Refactor**: Nâng cấp hàm `extractContent` trong `use-chat-store.ts` để bóc tách dữ liệu từ các cấu trúc phức tạp/lồng nhau của LangGraph SDK (array/object).

### 🛠️ Khắc phục lỗi hệ thống (Bug Fixes)

- **RAG Indexing Fix**: Sửa lỗi Generator Agent không lấy được `serverId` để index RAG khi tool `create_MCPServer` chuyển sang trả về định dạng JSON (thay vì text).

---

## [2026-04-12 22:30] - Di chuyển sang MongoDB cho VectorDB (Scalability Fix)

### 🚀 Tính năng mới & Cơ sở hạ tầng (New Features & Infrastructure)

- **MongoDB Integration (Shared Storage)**: Chuyển đổi hệ thống `DocStore` từ file JSON cục bộ sang **MongoDB** để tăng khả năng mở rộng và hiệu suất.
  - **Dùng chung hạ tầng**: Tận dụng container MongoDB sẵn có của dự án `mcp-gen` để tiết kiệm tài nguyên.
  - **Tách biệt dữ liệu**: Dữ liệu của agent được lưu vào database riêng `mcp_agent_db`.
- **LlamaIndex Scaling**: Thay thế `SimpleDocumentStore` bằng `MongoDocumentStore`, giải quyết triệt để lỗi `doc_id not found` do mất đồng bộ giữa bộ nhớ và file vật lý.

### 🛠️ Khắc phục lỗi & Dọn dẹp (Bug Fixes & Cleanup)

- **Fix Inconsistency**: Loại bỏ việc phụ thuộc vào file `docstore.json` – nguyên nhân gây ra lỗi khi dữ liệu phình to.
- **Dependency Update**: Cập nhật `pyproject.toml` với các thư viện cần thiết (`llama-index-storage-docstore-mongodb`, `pymongo`).
- **Storage Cleanup**: Xóa bỏ các file lưu trữ JSON cũ không còn cần thiết.

---

## [2026-04-12 16:15] - Sửa lỗi Xung đột Mạng Docker & Dọn dẹp Cảnh báo Compose

### 🛠️ Khắc phục lỗi hệ thống (Bug Fixes)

- **Docker Networking Fix (External Network)**: Giải quyết triệt để lỗi `network mcp-network exists but was not created by compose` khi chạy lệnh `./manage.sh up`.
  - **Vấn đề**: Script `manage.sh` tạo mạng thủ công, nhưng `docker-compose.yaml` lại khai báo mạng như một thành phần do Compose quản lý, dẫn đến tranh chấp quyền sở hữu.
  - **Giải pháp**: Cập nhật cấu hình `mcp-network` thành `external: true` trong `langChain-application/docker-compose.yaml`. Điều này báo cho Docker Compose sử dụng mạng đã có sẵn thay vì cố gắng khởi tạo lại.
- **Obsolete Warning Cleanup**: Loại bỏ thuộc tính `version` đã lỗi thời trong file `docker-compose.yml` của `chatbot_mcp_client`.
  - **Lợi ích**: Giảm bớt các dòng cảnh báo (warning) không cần thiết trong terminal khi khởi hệ thống, giúp theo dõi logs sạch sẽ hơn.

### ✅ Kiểm chứng (Verification)

- Đảm bảo tính đồng bộ cấu hình mạng trên cả 3 project (`mcp-gen`, `langChain-application`, `chatbot_mcp_client`).
- Xác nhận các service có thể kết nối với nhau qua mạng `mcp-network` mà không gặp lỗi khởi tạo.

---

## [2026-04-12 00:05] - Sửa lỗi MCP Routing (404) & Tối ưu hóa Mạng shared

- **Issue**: Lỗi "404 Not Found" khi gọi công cụ `create_MCPServer`. Agent trước đó trỏ nhầm endpoint tới `gemini-backend:8000` thay vì `docker-manager:8080`.
- **Changes**:
  - **Routing Fix**: Cập nhật `MCP_BASE_URL` trong `docker-compose.yaml` để trỏ trực tiếp tới hostname `docker-manager` trên cổng `8080`.
  - **Network Dependency**: Cập nhật script `manage.sh` để tự động kiểm tra và khởi tạo `mcp-network` (`docker network create`) trước khi chạy các service, đảm bảo các container không bị lỗi "network not found".
  - **Tool Code Refactor**: Cập nhật `generator_tools/__init__.py` để sử dụng biến môi trường linh hoạt cho `MCP_BASE_URL` thay vì fix cứng `localhost`.
- **Verification**: Xác nhận Agent đã có thể gọi thành công endpoint tại `docker-manager:8080` qua kết nối nội bộ Docker.

---

## [2026-04-11 22:20] - Tích hợp Docker Networking cho Chatbot & Agent

### 🚀 Tính năng mới & Cơ sở hạ tầng

- **Shared Docker Network (`mcp-network`)**: Khai báo và khởi tạo mạng bridge chung để cho phép các service của hệ thống Chatbot có thể truy cập Agent qua hostname `agent-service`.
- **Connectivity Mapping**: Cấu hình `agent-service` tham gia mạng `mcp-network`, mở cổng `2024` để sẵn sàng nhận các yêu cầu điều phối từ Chatbot Client.

### ✅ Kiểm chứng (Verification)

- Đã cập nhật `docker-compose.yaml` và xác nhận mạng được khởi tạo thành công khi chạy `docker-compose up`.

---

## [2026-04-01 22:58] - Refactor RAG Post-Processing (Strict Parameter Mapping)

### 🚀 Tính năng mới & Tối ưu hóa (New Features & Optimization)

- **Strict Technical Extraction**: Thay thế việc tóm tắt ngữ cảnh RAG bằng ngôn ngữ tự nhiên (prose summary) bằng cơ chế trích xuất dữ liệu kỹ thuật có cấu trúc (structured JSON).
- **Loại bỏ RAG dư thừa**: Xóa bỏ bước tìm kiếm RAG lặp lại trong công cụ `create_MCPServer`. Dữ liệu ngữ cảnh hiện được luân chuyển trực tiếp từ Examiner Agent tới công cụ dưới dạng JSON.

---

## [2026-03-31 23:00] - Sửa lỗi Hallucination (JWT/Config) & Bảo toàn dữ liệu cuối

### 🛠️ Khắc phục lỗi hệ thống (Bug Fixes)

- **Bypass LLM Summarization (Final Response)**: Ngăn chặn hiện tượng LLM tự ý "tóm tắt" hoặc thay đổi các chuỗi ký tự ngẫu nhiên (như JWT Token) và cấu trúc JSON trong phản hồi cuối cùng.
- **Tăng cường System Prompt**: Cập nhật chỉ dẫn hệ thống trong `supervisor_final_node` để yêu cầu LLM (nếu có được gọi) phải giữ nguyên 100% các đoạn code, URL và Tokens.

---

## [2026-03-31 16:35] - Sửa lỗi Container & Đồng bộ hóa Agent Task

### 🛠️ Khắc phục lỗi hệ thống (Bug Fixes)

- **Container Entrypoint Fix (CRLF)**: Giải quyết lỗi `exec /entrypoint.sh: no such file or directory` khi chạy Ollama trên Windows bằng cách xử lý `sed -i 's/\r$//'`.
- **Generator Agent Task Extraction**: Sửa lỗi Generator Agent không nhận diện được task được giao từ Examiner Agent trong chuỗi hội thoại.

---

## [2026-03-31 00:00] - Sửa lỗi Blocking Calls & Tăng độ chính xác RAG

### 🛠️ Khắc phục lỗi hệ thống (Bug Fixes)

- **Async Isolation (Blocking Calls)**: Giải quyết triệt để lỗi `Blocking call to socket.socket.connect` bằng `asyncio.to_thread`.
- **Loại bỏ nhiễu ngữ cảnh (Relevance Filtering)**: Thiết lập ngưỡng độ tương đồng (`similarity score` >= 0.35).

---

## [2026-03-27 23:34] - Tối ưu hóa RAG & Tích hợp Backend

### 🚀 Tính năng mới & Tích hợp

- **Backend Context Injection**: Công cụ `create_MCPServer` tự động gọi hệ thống RAG tìm tài liệu liên quan.
- **Tối ưu hóa RAG**: Tăng kích thước Leaf Node và mở rộng phạm vi tìm kiếm để cải thiện ngữ cảnh.

---

_Người thực hiện: Nguyen Thanh Tung_
