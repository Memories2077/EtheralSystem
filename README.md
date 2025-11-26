## 🤖 Intelligent API-to-MCP Translator

This project focuses on building an AI-driven system that automatically translates RESTful API definitions into a format compatible with MCP Servers. The generated MCP modules are designed for seamless integration with platforms like Claude and other LLM-based environments, enabling scalable deployment and enhanced interoperability for AI applications.

## ⚡ Quick Start

1. Clone this project.
2. Create an environment file by referencing our env_example.txt (you need to embed your API_KEY)
   ```bash
   cp env_example.txt .env
   ```
3. Build an image for MCP servers:
   ```
   docker build -t mcp-gen .
   ```
4. Run docker-compose up services:

   ```bash
   docker-compose up -d
   ```

5. Use Postman to create your MCP servers (below is an example):
```bash
{
  "request": "Reddit:\nReddit API Usage Guide\n\nStep 1: Get Access Token\n\ncurl -X POST \\\n  -H \"User-Agent: script:your_app_name:v1.0 (by /u/your_username)\" \\\n  -H \"Content-Type: application/x-www-form-urlencoded\" \\\n  -d 'grant_type=password&username=your_username&password=your_password' \\\n  --user 'your_client_id:your_client_secret' \\\n  https://www.reddit.com/api/v1/access_token\n\nResponse:\n{\n  \"access_token\": \"your_access_token_here\",\n  \"token_type\": \"bearer\",\n  \"expires_in\": 3600,\n  \"scope\": \"*\"\n}\n\nStep 2: Use Access Token for API Calls\n\ncurl -H \"Authorization: bearer your_access_token\" \\\n     -A \"your_app_name/1.0 by your_username\" \\\n     https://oauth.reddit.com/api/v1/me\n\nResponse:\n{\n  \"comment_karma\": 0,\n  \"created\": 1389649907.0,\n  \"created_utc\": 1389649907.0,\n  \"has_mail\": false,\n  \"has_mod_mail\": false,\n  \"has_verified_email\": null,\n  \"id\": \"1\",\n  \"is_gold\": false,\n  \"is_mod\": true,\n  \"link_karma\": 1,\n  \"name\": \"reddit_bot\",\n  \"over_18\": true\n}\n\nOther Endpoints:\nGET:\n- /api/v1/me\n- /api/v1/me/karma\n- /api/v1/me/prefs\n- /api/v1/me/trophies\n- /api/announcements/v1\n\nPOST:\n- /api/announcements/v1/read_all",
  "dockerImage": "mcp-gen",
  "userId": "user123",
  "email": "user@example.com"
}
```


6. Access the Claude config, which is returned:
   ```bash
   {
    "mcpServers": {
        "mcp-server": {
            "command": "npx",
            "args": [
                "mcp-remote",
                "http://{localhost/IP/Domain_Name}:{port}/mcp/{server_id}?token={jwt}",
                "--allow-http"
            ]
        }
      }
   }
   ```
