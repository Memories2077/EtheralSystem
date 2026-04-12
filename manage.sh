#!/bin/bash

# Thư mục các project
LANGCHAIN_DIR="."
MCP_GEN_DIR="../mcp-gen"

# Hàm hiển thị hướng dẫn
usage() {
    echo "Sử dụng: $0 {up|down|restart|logs-agent|logs-backend|logs|ps|rebuild}"
    exit 1
}

case "$1" in
    up)
        echo "--- Ensuring shared network exists ---"
        docker network create mcp-network 2>/dev/null || true

        echo "--- Khởi chạy backend (mcp-gen) ---"

        (cd "$MCP_GEN_DIR" && docker compose up -d)
        echo "--- Khởi chạy agent services (langChain-application) ---"
        (cd "$LANGCHAIN_DIR" && docker compose up -d)
        echo "Hệ thống đã khởi chạy thành công!"
        ;;
    down)
        echo "--- Dừng agent services ---"
        (cd "$LANGCHAIN_DIR" && docker compose down)
        echo "--- Dừng backend ---"
        (cd "$MCP_GEN_DIR" && docker compose down)
        echo "Đã dừng toàn bộ services."
        ;;
    logs-agent)
        (cd "$LANGCHAIN_DIR" && docker compose logs -f)
        ;;
    logs-backend)
        (cd "$MCP_GEN_DIR" && docker compose logs -f)
        ;;
    logs)
        echo "Sử dụng: $0 logs-agent hoặc $0 logs-backend để xem chi tiết."
        docker compose -f "$LANGCHAIN_DIR/docker-compose.yaml" -p langgraph-app logs -f & \
        docker compose -f "$MCP_GEN_DIR/docker-compose.yml" -p mcp-gen logs -f
        ;;
    ps)
        echo "--- Trạng thái langChain-application ---"
        (cd "$LANGCHAIN_DIR" && docker compose ps)
        echo ""
        echo "--- Trạng thái mcp-gen ---"
        (cd "$MCP_GEN_DIR" && docker compose ps)
        ;;
    rebuild)
        echo "--- Rebuilding systems ---"
        (cd "$MCP_GEN_DIR" && docker compose build)
        (cd "$LANGCHAIN_DIR" && docker compose build)
        $0 up
        ;;
    restart)
        $0 down
        $0 up
        ;;
    *)
        usage
        ;;
esac
