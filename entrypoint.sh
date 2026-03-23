#!/bin/bash

# Khởi chạy Ollama server ở chế độ nền
ollama serve &

# Đợi server sẵn sàng
sleep 5

# Kiểm tra xem model đã có chưa, nếu chưa thì pull
echo "Checking model qwen3-embedding:0.6b..."
ollama pull qwen3-embedding:0.6b

# Giữ container tiếp tục chạy
wait