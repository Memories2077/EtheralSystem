import httpx
import asyncio

async def reset_collection():
    base_url = "http://localhost:8025/api/v2/tenants/default_tenant/databases/default_database"
    collection_name = "mcp_servers"
    
    async with httpx.AsyncClient() as client:
        # Get collection ID
        print(f"Finding collection '{collection_name}'...")
        response = await client.get(f"{base_url}/collections")
        if response.status_code == 200:
            collections = response.json()
            col_id = None
            for col in collections:
                if col["name"] == collection_name:
                    col_id = col["id"]
                    break
            
            if col_id:
                print(f"Deleting collection {collection_name} (ID: {col_id})...")
                del_res = await client.delete(f"{base_url}/collections/{collection_name}")
                if del_res.status_code == 200:
                    print("✅ Collection deleted successfully.")
                else:
                    print(f"❌ Failed to delete collection: {del_res.status_code} - {del_res.text}")
            else:
                print(f"Collection {collection_name} not found.")
        else:
            print(f"Error listing collections: {response.status_code}")

if __name__ == "__main__":
    asyncio.run(reset_collection())
