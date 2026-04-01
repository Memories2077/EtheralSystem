# Nhật ký Thay đổi (Change Log)

## [2026-03-27 23:34] - Tối ưu hóa RAG & Tích hợp Backend

### 🚀 Tính năng mới & Tích hợp

- **Backend Context Injection**: Công cụ `create_MCPServer` hiện đã tự động gọi hệ thống RAG để tìm kiếm các tài liệu liên quan trước khi tạo server.
- **Payload mở rộng**: Dữ liệu gửi tới Backend (`/api/mcp/create`) hiện bao gồm trường `rag_context`, cung cấp ngữ cảnh đầy đủ cho việc tạo mã nguồn MCP Server.

### 🛠️ Tối ưu hóa hệ thống RAG (Auto-Merging)

- **Tăng kích thước Leaf Node**: Điều chỉnh `chunk_sizes` từ 128 lên **256** characters để đảm bảo tính toàn vẹn của thông tin.
- **Mở rộng phạm vi tìm kiếm**: Tăng `similarity_top_k` lên **x5** lần số lượng kết quả (`n_results * 5`). Điều này giúp tăng tỉ lệ gộp (merge) các node con thành node cha, cung cấp ngữ cảnh liền mạch hơn.
- **Cải thiện logic xử lý**: Cập nhật `vector_db.py` để hỗ trợ tốt hơn việc truy xuất phân cấp.

### ✅ Kiểm chứng (Verification)

- Đã xác minh thành công qua script [test_generator_tool.py].
- Kết quả kiểm thử cho thấy Agent đã tự động trích xuất đúng ngữ cảnh và đóng gói vào payload gửi tới Backend.

---

## [2026-03-31 00:00] - Sửa lỗi Blocking Calls & Tăng độ chính xác RAG

### 🛠️ Khắc phục lỗi hệ thống (Bug Fixes)

- **Async Isolation (Blocking Calls)**: Giải quyết triệt để lỗi `Blocking call to socket.socket.connect` bằng cách đưa các tác vụ đồng bộ của ChromaDB và LlamaIndex vào luồng riêng biệt (`asyncio.to_thread`). Điều này giúp LangGraph hoạt động mượt mà hơn trong môi trường ASGI.
- **Loại bỏ nhiễu ngữ cảnh (Relevance Filtering)**: Thiết lập ngưỡng độ tương đồng (`similarity score` >= 0.35). Các kết quả tìm kiếm không đạt yêu cầu sẽ bị loại bỏ, ngăn chặn việc nạp dữ liệu sai lệch (ví dụ: input là Notion nhưng output lại lấy context từ Reddit).

### 📈 Cải thiện trải nghiệm (Improvements)

- **Minh bạch hóa xử lý Agent**: Thêm logic ghi log chi tiết trong `generator_tools` để theo dõi số lượng context tìm được hoặc thông báo nạp context trống (zero-shot) khi không có tài liệu liên quan.
- **Độ tin cậy của VectorDB**: Cải thiện hàm tìm kiếm trong `vector_db.py` để xử lý các node phân cấp chính xác hơn với cơ chế lọc mới.

### ✅ Kiểm chứng (Verification)

- Đã chạy thành công script [test_hierarchical_rag.py].
- Xác minh không còn cảnh báo "Blocking call" từ LangGraph dev.
- Kiểm tra tính năng lọc: Query về Notion không còn bị ảnh hưởng bởi dữ liệu Reddit cũ trong DB.

---

## [2026-03-31 16:35] - Sửa lỗi Container & Đồng bộ hóa Agent Task

### 🛠️ Khắc phục lỗi hệ thống (Bug Fixes)

- **Container Entrypoint Fix (CRLF)**: Giải quyết lỗi `exec /entrypoint.sh: no such file or directory` khi chạy Ollama trên Windows.
    - **Before**: Dockerfile chỉ copy và chmod script, dẫn đến lỗi nếu file có định dạng xuống dòng Windows (CRLF).
    - **After**: Thêm lệnh `sed -i 's/\r$//' /entrypoint.sh` vào `Dockerfile.ollama` để tự động chuẩn hóa định dạng sang Linux (LF) trong quá trình build.
- **Generator Agent Task Extraction**: Sửa lỗi Generator Agent không nhận diện được task được giao từ Examiner Agent, dẫn đến việc dùng chuỗi mặc định vô nghĩa gửi lên Backend.
    - **Before**: Agent chỉ tìm task trong `ToolMessage`, bỏ qua `AIMessage` chứa nội dung delegation (`DELEGATE_TO_GENERATOR:`).
    - **After**: Cập nhật vòng lặp quét tin nhắn trong `generator_agent.py` để kiểm tra thuộc tính `.content` của tất cả các loại tin nhắn, đảm bảo nhận diện đúng payload đã được làm giàu (Enriched Task).

### ✅ Kiểm chứng (Verification)

- **Ollama**: Build lại image thành công, script `/entrypoint.sh` thực thi bình thường, tự động pull model mà không bị treo.
- **Backend Integration**: Kiểm tra file input tại `/app/input/` trên backend đã chứa đầy đủ documentation thay vì chuỗi placeholder "Generate content based on the user's request".

---

## [2026-03-31 23:00] - Sửa lỗi Hallucination (JWT/Config) & Bảo toàn dữ liệu cuối

### 🛠️ Khắc phục lỗi hệ thống (Bug Fixes)

- **Bypass LLM Summarization (Final Response)**: Ngăn chặn hiện tượng LLM tự ý "tóm tắt" hoặc thay đổi các chuỗi ký tự ngẫu nhiên (như JWT Token) và cấu trúc JSON trong phản hồi cuối cùng.
    - **Vấn đề**: `supervisor_final_node` trước đây luôn gọi LLM để tóm tắt kết quả từ Generator, dẫn đến việc hỏng Token hoặc sai lệch cú pháp JSON config của MCP Server.
    - **Giải pháp**: Thêm logic kiểm tra trong `test.py` và `test_with_examiner.py`. Nếu nội dung chứa cấu hình MCP Server (`Server Details` & `Configuration`), Agent sẽ trả về trực tiếp kết quả gốc mà không qua LLM xử lý lại.
- **Tăng cường System Prompt**: Cập nhật chỉ dẫn hệ thống trong `supervisor_final_node` để yêu cầu LLM (nếu có được gọi) phải giữ nguyên 100% các đoạn code, URL và Tokens.

### ✅ Kiểm chứng (Verification)

- **Độ chính xác Token**: Xác nhận JWT Token trong JSON config trả về khớp hoàn toàn với Token được tạo ra bởi Generator, không còn tình trạng mất dấu ngoặc hay sai ký tự Base64.
- **Cấu hình MCP**: Link MCP Server và các tham số `args` được bảo toàn nguyên vẹn, sẵn sàng để copy-paste vào file cấu hình của Claude Desktop hoặc các MCP Client khác.

---

## [2026-04-01 22:58] - Refactor RAG Post-Processing (Strict Parameter Mapping)

### 🚀 Tính năng mới & Tối ưu hóa (New Features & Optimization)

- **Strict Technical Extraction**: Thay thế việc tóm tắt ngữ cảnh RAG bằng ngôn ngữ tự nhiên (prose summary) bằng cơ chế trích xuất dữ liệu kỹ thuật có cấu trúc (structured JSON).
    - **Cơ chế**: Sử dụng LLM với prompt ràng buộc chặt chẽ (Zero-Summarization) để trích xuất `base_url`, `auth_scheme`, `endpoints`, và `parameters` (gồm type, enum, required flags) từ các đoạn mã/tài liệu RAG.
    - **Lợi ích**: Đảm bảo không mất mát các ràng buộc dữ liệu quan trọng và giữ nguyên quy ước đặt tên (camelCase vs snake_case).
- **Loại bỏ RAG dư thừa**: Xóa bỏ bước tìm kiếm RAG lặp lại trong công cụ `create_MCPServer`. Dữ liệu ngữ cảnh hiện được luân chuyển trực tiếp từ Examiner Agent tới công cụ dưới dạng JSON.

### 🛠️ Thay đổi hệ thống (System Changes)

- **`openapi_parser.py` (NEW)**: Tiện ích trung tâm xử lý việc trích xuất dữ liệu kỹ thuật từ các kết quả RAG bằng LLM.
- **Examiner Agent Refactor**: Cập nhật logic từ "Synthesize" (tổng hợp văn bản) sang "Extract" (trích xuất cấu trúc). Phối hợp với `openapi_parser` để đóng gói dữ liệu vào task của Generator.
- **Generator Agent & Tools**: Cập nhật `create_MCPServer` để tự động nhận diện và phân giải khối dữ liệu `ENRICHED_CONTEXT (RAG)` từ task payload.

### ✅ Kiểm chứng (Verification)

- **Tính toàn vẹn dữ liệu**: Xác nhận `rag_context` gửi lên Backend chứa map tham số chi tiết thay vì một đoạn văn bản tóm tắt.
- **Zero-Summarization**: LLM không còn giải thích các tham số trong `rag_context`, chỉ trả về spec kỹ thuật thuần túy.

---

_Người thực hiện: Nguyen Thanh Tung_

