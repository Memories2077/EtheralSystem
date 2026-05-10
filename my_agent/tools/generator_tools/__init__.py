"""
Generate Tools - Tools for generating MCP Server
"""

import httpx
import json
from typing import Any, List, Optional
from langchain_core.tools import tool
import asyncio
import logging
from contextlib import AsyncExitStack
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client
from my_agent.utils.mcp_client import (
    MCPCreateRequest,
    MCPResponseValidationError,
    MCPTimeoutError,
    MCPUnavailableError,
    create_mcp_server,
    get_mcp_urls,
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def sanitize_api_documentation(doc: str) -> str:
    """
    Sanitize API documentation without changing semantic formatting.
    
    Args:
        doc: Raw API documentation string
        
    Returns:
        Sanitized documentation safe for YAML generation
    """
    if not doc:
        return ""
    
    # Preserve indentation and spacing because OpenAPI/YAML is whitespace-sensitive.
    sanitized = doc.replace("\r\n", "\n").replace("\r", "\n")
    sanitized = "".join(char for char in sanitized if ord(char) >= 32 or char in "\n\t")

    original_len = len(doc)
    sanitized_len = len(sanitized)
    if original_len != sanitized_len:
        logger.info(f"Sanitized API doc: {original_len} -> {sanitized_len} characters")
    
    return sanitized.strip("\n")


@tool
async def create_MCPServer(query: List[str], rag_context: Optional[List[Any]] = None) -> str:
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
            rag_context: Optional structured RAG context from the Examiner Agent.
    """
    if not query:
        logger.warning("Empty query provided to create_MCPServer")
        return "❌❓ There no input in query then how can I do this?"
    
    if len(query) < 3:
        logger.warning(f"Insufficient query parameters: {len(query)} provided, 3 required")
        return "❌ Error: Query must contain at least 3 parameters: request, userId, and email"
    
    # Extract parameters from query
    request_data = query[0]
    user_id = query[1]
    email = query[2]
    
    # Validate inputs
    if not request_data or not user_id or not email:
        logger.warning("One or more required parameters are empty")
        return "❌ Error: All parameters (request, userId, email) are required"
    
    logger.info(f"Creating MCP Server for user: {user_id}, email: {email}")
    logger.info(f"API documentation size (raw): {len(request_data)} characters")
    
    # Sanitize API documentation to prevent YAML parsing errors
    sanitized_request = sanitize_api_documentation(request_data)
    
    if not sanitized_request:
        logger.error("API documentation became empty after sanitization")
        return "❌ Error: API documentation is invalid or empty after sanitization"
    
    structured_rag_context = rag_context if isinstance(rag_context, list) else []
    
    # Backward compatibility: older callers may embed RAG context in request_data.
    if not structured_rag_context:
        import re
        rag_match = re.search(r"ENRICHED_CONTEXT \(RAG\):\n(.*?)(\n\nUSER_ID:|\Z)", request_data, re.DOTALL)
    else:
        rag_match = None
    if rag_match:
        try:
            rag_context_str = rag_match.group(1).strip()
            parsed_rag_context = json.loads(rag_context_str)
            if isinstance(parsed_rag_context, list):
                structured_rag_context = parsed_rag_context
                logger.info(f"Successfully extracted {len(structured_rag_context)} structured RAG items from request.")
        except Exception as e:
            logger.warning(f"Failed to parse RAG context from request: {e}")
            structured_rag_context = []

    create_request = MCPCreateRequest(
        request=sanitized_request,
        userId=user_id,
        email=email,
        rag_context=structured_rag_context,
    )
    mcp_urls = get_mcp_urls()
    
    try:
        result = await create_mcp_server(create_request)
        tool_result = result.to_tool_result()
        logger.info(f"MCP Server created successfully: {result.serverId}")
        return json.dumps(tool_result, indent=2)
    except httpx.HTTPStatusError as status_error:
        response = status_error.response
        logger.error(f"mcp-gen returned status code {response.status_code}: {response.text[:500]}")
        error_detail = ""
        try:
            error_data = response.json()
            error_detail = error_data.get("message", error_data.get("error", ""))
        except Exception:
            error_detail = response.text[:200]

        if response.status_code == 400:
            return f"❌ Error: Server creation failed due to invalid input data. {error_detail}"
        if response.status_code == 401:
            return "❌ Error: Server creation failed because mcp-gen authentication failed."
        if response.status_code >= 500:
            return f"❌ Error: Server creation failed because mcp-gen returned a server error. {error_detail}"
        return f"❌ Error: Server creation failed with status code {response.status_code}. {error_detail}"
    except MCPTimeoutError as timeout_error:
        logger.error(f"Request timed out after waiting for backend: {timeout_error}")
        return "❌ Error: mcp-gen timed out while creating the MCP server. The backend may still be processing or unavailable."
    except MCPUnavailableError as connect_error:
        logger.error(f"Connection failed: {connect_error}")
        return f"❌ Error: mcp-gen unavailable at {mcp_urls.create_url}. Ensure the service is reachable and MCP_BASE_URL includes /api."
    except MCPResponseValidationError as validation_error:
        logger.error(f"Invalid mcp-gen response: {validation_error}")
        return f"❌ Error: MCP Server may have been created, but mcp-gen returned an invalid response: {validation_error}"
    except httpx.RequestError as request_error:
        logger.error(f"Request error: {request_error}")
        return f"❌ Error: Request failed - {str(request_error)}"
    
    except Exception as e:
        logger.error(f"Unexpected error: {e}", exc_info=True)
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
