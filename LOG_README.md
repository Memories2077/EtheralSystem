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

- Đã xác minh thành công qua script [test_generator_tool.py](file:///c:/Users/tung/Downloads/DoAnChuyenNganh/langChain-application/tmp/test_generator_tool.py).
- Kết quả kiểm thử cho thấy Agent đã tự động trích xuất đúng ngữ cảnh và đóng gói vào payload gửi tới Backend.

---

_Người thực hiện: Nguyen Thanh Tung_
