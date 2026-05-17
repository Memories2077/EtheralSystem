#!/bin/bash

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Thư mục các project
LANGCHAIN_DIR="$SCRIPT_DIR"
MCP_GEN_DIR="$(cd "$SCRIPT_DIR/../mcp-gen" && pwd)"
CHATBOT_DIR="$(cd "$SCRIPT_DIR/../chatbot_mcp_client" && pwd)"

# WSL installs can have Docker Compose without the buildx CLI plugin. In that
# case, force Compose onto the classic builder instead of failing immediately.
if ! docker buildx version >/dev/null 2>&1; then
    export DOCKER_BUILDKIT="${DOCKER_BUILDKIT:-0}"
    export COMPOSE_DOCKER_CLI_BUILD="${COMPOSE_DOCKER_CLI_BUILD:-0}"
fi

# Hàm hiển thị hướng dẫn
usage() {
    echo "Usage: $0 {up|down|restart|logs-agent|logs-backend|logs-frontend|logs|ps|rebuild}"
    echo ""
    echo "Requires Docker Compose and the external shared network 'mcp-network'."
    echo "The 'up' command creates 'mcp-network' automatically if needed."
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

        echo "--- Khởi chạy chatbot frontend client (chatbot_mcp_client) ---"
        (cd "$CHATBOT_DIR" && docker compose up -d)

        echo "Hệ thống đã khởi chạy thành công!"
        echo "URLs:"
        echo " - Frontend: http://localhost:9002"
        echo " - Chatbot backend: http://localhost:8000"
        echo " - LangGraph: http://localhost:2024"
        echo " - mcp-gen manager: http://localhost:8080"
        echo " - mcp-gen proxy: http://localhost:8081"
        ;;
    down)
        echo "--- Dừng chatbot client ---"
        (cd "$CHATBOT_DIR" && docker compose down)
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
    logs-frontend)
        (cd "$CHATBOT_DIR" && docker compose logs -f)
        ;;
    logs)
        echo "Theo dõi logs của tất cả services..."
        docker compose -f "$LANGCHAIN_DIR/docker-compose.yaml" logs -f & \
        docker compose -f "$MCP_GEN_DIR/docker-compose.yml" logs -f & \
        docker compose -f "$CHATBOT_DIR/docker-compose.yml" logs -f 
        ;;
    ps)
        echo "--- Trạng thái langChain-application ---"
        (cd "$LANGCHAIN_DIR" && docker compose ps)
        echo ""
        echo "--- Trạng thái mcp-gen ---"
        (cd "$MCP_GEN_DIR" && docker compose ps)
        echo ""
        echo "--- Trạng thái chatbot_mcp_client ---"
        (cd "$CHATBOT_DIR" && docker compose ps)
        ;;
    rebuild)
        echo "--- Rebuilding systems ---"
        (cd "$MCP_GEN_DIR" && docker compose build)
        (cd "$LANGCHAIN_DIR" && docker compose build)
        (cd "$CHATBOT_DIR" && docker compose build)
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
