import asyncio
import sys
import os

# Add parent directory to sys.path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from utils.vector_db import save_mcp_artifacts, search_mcp_artifacts

async def test_hierarchical_rag():
    print("=" * 60)
    print("TESTING HIERARCHICAL RAG (AUTO-MERGING)")
    print("=" * 60)
    
    server_id = "test_server_rag"
    user_id = "test_user"
    email = "test@example.com"
    
    # Create a long-ish document to test chunking and merging
    long_content = "\n".join([f"This is line {i} of a long API documentation. It discusses various endpoints and security schemes." for i in range(1, 50)])
    long_content += "\nCRITICAL_INFO: The secret key for this API is 'shhh-secret'."
    
    artifacts = {
        "input": {"content": long_content, "name": "test-doc.txt"},
        "openapi": {"content": "openapi: 3.0.1\ninfo:\n  title: Test API\npaths: {}", "name": "test.yaml"}
    }
    
    print("Step 1: Saving artifacts with hierarchical indexing...")
    await save_mcp_artifacts(server_id, user_id, email, artifacts)
    
    print("\nStep 2: Searching for 'CRITICAL_INFO'...")
    # This should trigger retrieval of the small chunk containing CRITICAL_INFO
    # and potentially merge it with surrounding context.
    results = await search_mcp_artifacts("What is the secret key in the CRITICAL_INFO section?")
    
    print(f"\nFound {len(results)} results.")
    for i, res in enumerate(results, 1):
        print(f"\nResult {i}:")
        print(f"Metadata: {res['metadata']}")
        print(f"Content length: {len(res['content'])}")
        print(f"Preview: {res['content'][:500]}...")
    
    if results and len(results[0]["content"]) > 200:
        print("\n✅ SUCCESS: Retrieved document seems to have preserved context (length > 200).")
    else:
        print("\n❌ FAILED or insufficient context.")

if __name__ == "__main__":
    asyncio.run(test_hierarchical_rag())
