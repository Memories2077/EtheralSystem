## 🤖 Intelligent API-to-MCP Translator

This project focuses on building an AI-driven system that automatically translates RESTful API definitions into a format compatible with MCP Servers. The generated MCP modules are designed for seamless integration with platforms like Claude and other LLM-based environments, enabling scalable deployment and enhanced interoperability for AI applications.

## ⚡ Quick Start

### Prerequisites

- Docker & Docker Compose installed
- Access to Ollama server (https://ollama.timnguyen.id.vn)
- Node.js 20+ (for local development)

### Installation Steps

1. Clone this project:

   ```bash
   git clone <your-repo>
   cd mcp-gen
   ```

2. Create an environment file:

   ```bash
   cp env_example.txt .env
   ```

   Configure the following variables:

   ```bash
   # Ollama Configuration (required)
   OLLAMA_BASE_URL=https://ollama.timnguyen.id.vn
   OLLAMA_MODEL=qwen2.5:7b
   OLLAMA_TEMPERATURE=0.5
   OLLAMA_TIMEOUT_MS=60000

   # MongoDB & RabbitMQ (optional, defaults provided in docker-compose)
   MONGO_URI=mongodb://mongodb:27017
   RABBITMQ_URL=amqp://guest:guest@rabbitmq:5672

   # Public URL for MCP server access
   PUBLIC_URL=https://your-domain.com

   # Default Docker Image for MCP Servers (recommended: pre-build this image)
   DEFAULT_MCP_IMAGE=mcp-gen
   ```

3. **Build the base MCP server image (Important!):**

   ```bash
   docker build -t mcp-gen .
   ```

   This creates a reusable image that all MCP server containers will use. Building this once saves time (~20-30s per request) and disk space.

4. Build Docker Compose services:

   ```bash
   docker-compose build
   ```

5. Start all services:

   ```bash
   docker-compose up -d
   ```

   Services will start on:

   - API Manager: `http://localhost:8080`
   - Proxy: `http://localhost:8081`
   - MongoDB: `localhost:27017`
   - RabbitMQ: `localhost:5672` (management UI: `http://localhost:15672`)

6. Create an MCP server from an API specification using cURL:

   ```bash
   curl -X POST http://localhost:8080/api/mcp/create \
     -H "Content-Type: application/json" \
     -d '{
       "request": "Your API documentation or specification here...\n\nExample:\nGET /api/users - Get list of users\nPOST /api/users - Create new user\nGET /api/users/{id} - Get user by ID",
       "userId": "user123",
       "email": "user@example.com"
     }'
   ```

   **Required fields:**

   - `request`: API documentation/specification
   - `userId`: Unique user identifier
   - `email`: User email address
   - `name`: Name for the MCP server (optional)

   **Optional fields:**

   - `dockerImage`: Custom Docker image name (defaults to `mcp-gen` from env variable `DEFAULT_MCP_IMAGE`)

   **Response example:**

   ```json
   {
     "status": "success",
     "serverId": "mcp-server-abc123",
     "config": {
       "mcpServers": {
         "my-api-mcp": {
           "command": "npx",
           "args": [
             "mcp-remote",
             "http://your-domain.com:8080/mcp/mcp-server-abc123?token=jwt_token_here",
             "--allow-http"
           ]
         }
       }
     }
   }
   ```

7. The generated MCP server is now ready to use with Claude or other LLM platforms. Copy the configuration to your Claude settings.
