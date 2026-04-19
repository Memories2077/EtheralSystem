import httpx
import asyncio

async def check_chroma():
    base_url = "http://localhost:8025/api/v2/tenants/default_tenant/databases/default_database"
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(f"{base_url}/collections")
            response.raise_for_status()
            collections = response.json()
            for col in collections:
                print(f"Collection: {col['name']}, ID: {col['id']}, Metadata: {col['metadata']}")
                
                try:
                    query_payload = {
                        "query_embeddings": [[0.0] * 1024],
                        "n_results": 1
                    }
                    q_res = await client.post(f"{base_url}/collections/{col['id']}/query", json=query_payload)
                    if q_res.status_code == 200:
                        print(f"  Dimension 1024: OK")
                    else:
                        print(f"  Dimension 1024: FAILED ({q_res.status_code}) - {q_res.text}")
                        
                    query_payload_384 = {
                        "query_embeddings": [[0.0] * 384],
                        "n_results": 1
                    }
                    q_res_384 = await client.post(f"{base_url}/collections/{col['id']}/query", json=query_payload_384)
                    if q_res_384.status_code == 200:
                        print(f"  Dimension 384: OK")
                    else:
                        print(f"  Dimension 384: FAILED ({q_res_384.status_code}) - {q_res_384.text}")
                except Exception as e:
                    print(f"  Error querying: {e}")
                    
    except Exception as e:
        print(f"Error connecting to Chroma: {e}")

if __name__ == "__main__":
    asyncio.run(check_chroma())
