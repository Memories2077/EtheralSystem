#!/bin/bash

# Thư mục các project
LANGCHAIN_DIR="."
MCP_GEN_DIR="../mcp-gen"
CHATBOT_DIR="../chatbot_mcp_client"

# Hàm hiển thị hướng dẫn
usage() {
    echo "Sử dụng: $0 {up|down|restart|logs-agent|logs-backend|logs-frontend|logs|ps|rebuild}"
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
        echo " - Frontend: http://localhost:3000"
        echo " - LangGraph: http://localhost:2024"
        echo " - MCP Gen: http://localhost:8080"
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
