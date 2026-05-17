import asyncio
import os
import sys

# Add parent directory to path so we can import agents, utils, etc.
# sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from my_agent.utils.vector_db import save_mcp_artifacts, search_mcp_artifacts

async def main():
    server_id = "test_server_fix"
    artifacts = {
        "input": {"content": "Test API documentation content", "name": "test.txt"},
        "openapi": {"content": "openapi: 3.0.0\ninfo:\n  title: Test", "name": "test.yaml"},
        "typescript": {"content": "export const test = () => {}", "name": "test.ts"}
    }
    
    print("--- Testing save_mcp_artifacts ---")
    await save_mcp_artifacts(server_id, "test_user", "test@example.com", artifacts)
    
    print("\n--- Testing search_mcp_artifacts ---")
    results = await search_mcp_artifacts("Test API documentation")
    if results:
        print(f"✅ Search successful! Found {len(results)} results.")
        for res in results:
            print(f"  - {res['id']}: {res['metadata']['type']}")
    else:
        print("❌ Search failed to find results.")

if __name__ == "__main__":
    asyncio.run(main())
