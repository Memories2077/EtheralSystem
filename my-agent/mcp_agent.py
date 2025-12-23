"""
MCP Agent - Agent tích hợp với MCP Server tools
"""
from langchain_google_genai import ChatGoogleGenerativeAI
from deepagents import create_deep_agent
import os

# Import các MCP tools
from mcp_tools import MCP_TOOLS


# Khởi tạo model
model = ChatGoogleGenerativeAI(model="gemini-2.5-flash")

# System prompt cho MCP Agent
mcp_instructions = """\
You are an intelligent assistant with access to a Model Context Protocol (MCP) Server.
You can:
- Search and retrieve data from the MCP Server
- Create, update, and delete resources
- List and manage resources

When the user asks you to interact with data or resources, use the appropriate MCP tools.
Always provide clear and helpful responses.
"""

# Tạo agent với MCP tools
mcp_agent = create_deep_agent(
    model=model,
    system_prompt=mcp_instructions,
    tools=MCP_TOOLS
)


if __name__ == "__main__":
    print(f"\n{'='*60}")
    print("MCP AGENT INITIALIZED")
    print(f"{'='*60}\n")
    
    # Ví dụ sử dụng
    queries = [
        "List all available resources from the MCP server",
        "Search for resources related to 'user data'",
    ]
    
    for query in queries:
        print(f"\n{'='*60}")
        print(f"QUERY: {query}")
        print(f"{'='*60}\n")
        
        result = mcp_agent.invoke({"messages": [{"role": "user", "content": query}]})
        
        # Lấy response cuối cùng
        if "messages" in result:
            last_message = result["messages"][-1]
            content = last_message.content if hasattr(last_message, 'content') else str(last_message)
            
            # Extract text nếu là list
            if isinstance(content, list):
                text_parts = []
                for item in content:
                    if isinstance(item, dict) and 'text' in item:
                        text_parts.append(item['text'])
                content = '\n'.join(text_parts)
            
            print("RESPONSE:")
            print(content)
            print()
