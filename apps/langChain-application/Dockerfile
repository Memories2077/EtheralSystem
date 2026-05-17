FROM python:3.12-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# --- Layer dependency cache ---
# Chỉ copy pyproject.toml trước để pip install được cache riêng.
# Layer này chỉ bị invalidate khi pyproject.toml thay đổi,
# KHÔNG bị ảnh hưởng bởi thay đổi code trong my_agent/.
COPY pyproject.toml .

# Tạo package stub để pip install . không yêu cầu source code. 
# Cài đặt thêm langgraph-cli để có lệnh 'langgraph' trong PATH.
RUN mkdir -p my_agent && pip install --no-cache-dir . langgraph-cli

# --- Layer source code ---
# Copy toàn bộ source code sau khi đã cài xong dependencies.
# Thay đổi code sẽ chỉ invalidate layer này, bỏ qua bước pip install.
COPY . .

# Set environment variables
ENV PYTHONUNBUFFERED=1

# Expose the default langgraph port
EXPOSE 2024

# Run langgraph dev server bound to all interfaces
CMD ["langgraph", "dev", "--host", "0.0.0.0", "--port", "2024"]
