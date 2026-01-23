"""
Generate Tools - Tools for generating MCP Server
"""

import os
import httpx
from typing import Literal, Dict, Any, List, Optional
from langchain_core.tools import tool
import asyncio
import logging
from contextlib import AsyncExitStack
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@tool
async def create_MCPServer(query: List[str]) -> str:
    """
        The tool for creating MCP server
        
        QUERY EXAMPLE:
            {
            "request": "Reddit:\nReddit API Usage Guide\n\nStep 1: Get Access Token\n\ncurl -X POST \\\n  -H \"User-Agent: script:your_app_name:v1.0 (by /u/your_username)\" \\\n  -H \"Content-Type: application/x-www-form-urlencoded\" \\\n  -d 'grant_type=password&username=your_username&password=your_password' \\\n  --user 'your_client_id:your_client_secret' \\\n  https://www.reddit.com/api/v1/access_token\n\nResponse:\n{\n  \"access_token\": \"your_access_token_here\",\n  \"token_type\": \"bearer\",\n  \"expires_in\": 3600,\n  \"scope\": \"*\"\n}\n\nStep 2: Use Access Token for API Calls\n\ncurl -H \"Authorization: bearer your_access_token\" \\\n     -A \"your_app_name/1.0 by your_username\" \\\n     https://oauth.reddit.com/api/v1/me\n\nResponse:\n{\n  \"comment_karma\": 0,\n  \"created\": 1389649907.0,\n  \"created_utc\": 1389649907.0,\n  \"has_mail\": false,\n  \"has_mod_mail\": false,\n  \"has_verified_email\": null,\n  \"id\": \"1\",\n  \"is_gold\": false,\n  \"is_mod\": true,\n  \"link_karma\": 1,\n  \"name\": \"reddit_bot\",\n  \"over_18\": true\n}\n\nOther Endpoints:\nGET:\n- /api/v1/me\n- /api/v1/me/karma\n- /api/v1/me/prefs\n- /api/v1/me/trophies\n- /api/announcements/v1\n\nPOST:\n- /api/announcements/v1/read_all",
            "userId": "user123",
            "email": "user@example.com"
            }
        
        RESPONSE EXAMPLE:
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
            
        ARGS:
            query: List of parameters
            query[0] - request
            query[1] - userId
            query[2] - email
    """
    if not query:
        return "❌❓ There no input in query then how can I do this?"
    
    if len(query) < 3:
        return "❌ Error: Query must contain at least 3 parameters: request, userId, and email"
    
    # Extract parameters from query
    request_data = query[0]
    user_id = query[1]
    email = query[2]
    
    # Validate inputs
    if not request_data or not user_id or not email:
        return "❌ Error: All parameters (request, userId, email) are required"
    
    # Prepare the payload
    payload = {
        "request": request_data,
        "userId": user_id,
        "email": email
    }
    
    try:
        # Send POST request to create MCP server using async httpx
        create_url = "http://localhost:8080/api/mcp/create"
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                create_url,
                json=payload,
                headers={"Content-Type": "application/json"}
            )
        
        # Check response status
        if response.status_code == 200 or response.status_code == 201:
            result = response.json()
            
            # Format the success response
            server_id = result.get("serverId", "unknown")
            config = result.get("config", {})
            
            return f"""✅ MCP Server created successfully!
            
                    📋 Server Details:
                    - Server ID: {server_id}
                    - Status: {result.get("status", "success")}

                    ⚙️ Configuration:
                    {config}

                    You can now use this MCP server with the provided configuration."""
        
        elif response.status_code == 400:
            return f"❌ Bad Request: Invalid input data. Please check your request format."
        
        elif response.status_code == 401:
            return f"❌ Unauthorized: Authentication failed."
        
        elif response.status_code == 500:
            return f"❌ Server Error: The MCP server creation service encountered an error."
        
        else:
            return f"❌ Error: Received status code {response.status_code}. Response: {response.text}"
    
    except httpx.TimeoutException:
        return "❌ Error: Request timed out. The MCP server creation service is not responding."
    
    except httpx.ConnectError:
        return "❌ Error: Cannot connect to MCP server creation service at http://localhost:8080. Please ensure the service is running."
    
    except httpx.RequestError as e:
        return f"❌ Error: Request failed - {str(e)}"
    
    except Exception as e:
        return f"❌ Unexpected Error: {str(e)}"

@tool
async def test_mcp_server(MCPLink: str):
    """Test MCP Server functionality"""
    
    # Cấu hình server parameters
    server_params = StdioServerParameters(
        command="python",  # command để chạy server
        args=[MCPLink],  # đường dẫn đến server
        env=None  # environment variables (optional)
    )
    
    exit_stack = AsyncExitStack()
    
    try:
        # Kết nối với server
        read, write = await exit_stack.enter_async_context(
            stdio_client(server_params)
        )
        
        # Tạo session
        session = await exit_stack.enter_async_context(
            ClientSession(read, write)
        )
        
        # Initialize connection
        logger.info("Initializing connection...")
        await session.initialize()
        logger.info("✓ Connection initialized")
        
        # 1. Test list tools
        logger.info("Testing list_tools...")
        tools_response = await session.list_tools()
        print(f"✓ Available tools: {tools_response.tools}")
        
        # 2. Test call tool
        if tools_response.tools:
            tool_name = tools_response.tools[0].name
            logger.info(f"Testing call_tool with '{tool_name}'...")
            
            result = await session.call_tool(
                name=tool_name,
                arguments={"test": "value"}  # Thay arguments phù hợp
            )
            print(f"✓ Tool result: {result}")
        
        # 3. Test list resources
        logger.info("Testing list_resources...")
        resources_response = await session.list_resources()
        print(f"✓ Resources: {resources_response.resources}")
        
        # 4. Test list prompts (optional)
        logger.info("Testing list_prompts...")
        prompts_response = await session.list_prompts()
        print(f"✓ Prompts: {prompts_response.prompts}")
        
        logger.info("✅ All tests passed!")
        
    except Exception as error:
        logger.error(f"❌ Test failed: {error}", exc_info=True)
        raise
        
    finally:
        await exit_stack.aclose()


# Export tools list
GENERATE_TOOLS = [
    create_MCPServer
]