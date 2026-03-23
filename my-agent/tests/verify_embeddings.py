import asyncio
import sys
import os

# Add the parent directory to sys.path to import utils
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from utils.vector_db import get_embeddings

async def test_real_embeddings():
    print("=" * 60)
    print("VERIFYING OLLAMA EMBEDDINGS")
    print("=" * 60)
    
    test_text = "Checking if Ollama returns real embeddings."
    print(f"Input text: '{test_text}'")
    
    embeddings = await get_embeddings(test_text)
    
    if not embeddings:
        print("❌ FAILED: get_embeddings returned None or empty list")
        return
    
    is_zeros = all(v == 0.0 for v in embeddings)
    length = len(embeddings)
    
    print(f"Embedding length: {length}")
    print(f"First 5 values: {embeddings[:5]}")
    
    if is_zeros:
        print("❌ FAILED: System is still using dummy (all zeros) embeddings.")
    else:
        print("✅ SUCCESS: System is using REAL embeddings from Ollama!")
        
    if length != 1024:
        print(f"⚠️ WARNING: Expected length 1024, but got {length}.")
    
    print("=" * 60)

if __name__ == "__main__":
    asyncio.run(test_real_embeddings())
