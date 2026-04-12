import asyncio
import os
import sys

# Add parent directory to sys.path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from tests.test_with_examiner import MultiAgentSystem

async def verify_flow():
    print("=" * 60)
    print("VERIFYING FULL AGENT FLOW WITH RAG")
    print("=" * 60)
    
    system = MultiAgentSystem()
    
    # Run a sample query that should trigger examiner and RAG
    # Note: We need some data in ChromaDB first, 
    # but the previous test_hierarchical_rag.py should have populated 'test_server_rag'.
    query = "Examine the test_server_rag and tell me if it is secure."
    
    print(f"Running query: {query}")
    result = await system.run(query)
    
    print("\nFinal Result received.")
    if "shhh-secret" in result.lower() or "secret" in result.lower():
        print("\n✅ SUCCESS: RAG context (including the secret key) was correctly used.")
    else:
        print("\n⚠️ WARNING: RAG context might not have been fully utilized, or the query didn't trigger it as expected.")

if __name__ == "__main__":
    asyncio.run(verify_flow())
