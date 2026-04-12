import asyncio
from test import MultiAgentSystem

async def main():
    system = MultiAgentSystem()
    
    # Test with a known API that we might have "historical data" for if we previously saved it
    # But since it's a new run, we'll just see if it handles the 'no results found' case gracefully
    query = """Create an MCP Server for JSONPlaceholder.
    Description:
    GET /posts: list all posts
    GET /posts/{id}: get a single post
    POST /posts: create a new post
    """
    
    print("Running system test...")
    await system.run(query)

if __name__ == "__main__":
    asyncio.run(main())
