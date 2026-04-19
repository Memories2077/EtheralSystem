import httpx
import asyncio

async def test_ollama():
    url = "http://localhost:11434/api/embeddings"
    model = "qwen3-embedding:0.6b"
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                url,
                json={"model": model, "prompt": "test"}
            )
            response.raise_for_status()
            emb = response.json()["embedding"]
            print(f"Embedding dimension for {model}: {len(emb)}")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    asyncio.run(test_ollama())
