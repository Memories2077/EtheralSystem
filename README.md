## 🤖 Intelligent API-to-MCP Translator

This project focuses on building an AI-driven system that automatically translates RESTful API definitions into a format compatible with MCP Servers. The generated MCP modules are designed for seamless integration with platforms like Claude and other LLM-based environments, enabling scalable deployment and enhanced interoperability for AI applications.

## 🏗️ Architecture: Hybrid Agent Skill System

The platform utilizes a **Hybrid Agent Skill System** to achieve high-precision code generation. Instead of using a single monolithic prompt, the engine dynamically assembles specialized "skills" based on the input context.

### 🔄 System Flow

```mermaid
graph TD
    Input[API Documentation / Specification] --> Router{SkillRouter}
    
    subgraph "Skill Discovery & Assembly"
    Router -->|Mode: MCP| MCPSkill[MCP Generation Skill]
    Router -->|Mode: OpenAPI| OpenAPISkill[OpenAPI Analysis Skill]
    
    MCPSkill --> Fragments[Fragment Discovery]
    OpenAPISkill --> Fragments
    
    Fragments --> System[System Logic]
    Fragments --> Auth{Auth Guard}
    Fragments --> Schema[Schema/Zod Mappings]
    
    Auth -->|Auth Detected| Inject[Inject Requirements]
    Auth -->|No Auth| Isolated[Anti-Contamination]
    end
    
    System & Inject & Isolated & Schema --> Prompt[Stitched AI Prompt]
    Prompt --> LLM[GenAI Execution]
    LLM --> Code[Production-Ready MCP Server]
```

### 🧠 Core Components

#### 🛠️ Modular Skill Pipeline (`src/skills/`)
All prompt logic is decomposed into reusable Markdown fragments. This allows for:
- **Zero Knowledge Contamination**: Anti-contamination guards prevent the model from "hallucinating" auth parameters into public APIs.
- **Context Optimization**: Dynamically trimming examples and instructions to fit within token limits (managed via `utils/token-counter.ts`).
- **High Consistency**: Common patterns (like Zod mappings and HTTP request structures) are shared across all generations.

#### 🔐 Intelligent Auth Guard
The system automatically scans input specifications for security schemes (OAuth2, Bearer, Basic Auth, API Keys). 
- If **Auth is detected**: The generator injects specialized handlers and parameter injection logic.
- If **No Auth is found**: The system applies strict isolation prompts to ensure no security vulnerabilities are accidentally introduced.

#### 🧩 Skill Directory Structure
```text
src/skills/
├── auth/           # Security & authentication logic fragments
├── mcp/            # MCP server architecture & transport patterns
├── openapi/        # OpenAPI spec analysis & YAML generation
└── skill-router.ts # The brain that assembles context-aware prompts
```

---

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
