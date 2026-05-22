import json
import os
import urllib.error
import urllib.request
from typing import Any

from dotenv import load_dotenv
from google import genai


load_dotenv()

MODEL = os.getenv("GEMINI_EMBEDDING_MODEL", "gemini-embedding-2")
CHROMA_HOST = os.getenv("CHROMA_HOST", "localhost")
CHROMA_PORT = int(os.getenv("CHROMA_PORT", "8025"))
COLLECTION_NAME = os.getenv("GEMINI_CHROMA_SMOKE_COLLECTION", "gemini_embedding_2_smoke")
BASE_URL = (
    f"http://{CHROMA_HOST}:{CHROMA_PORT}"
    "/api/v2/tenants/default_tenant/databases/default_database"
)


def request(method: str, path: str, body: dict[str, Any] | None = None) -> Any:
    data = None if body is None else json.dumps(body).encode("utf-8")
    req = urllib.request.Request(
        BASE_URL + path,
        data=data,
        method=method,
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            text = resp.read().decode("utf-8")
            return json.loads(text) if text else {}
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8")
        raise RuntimeError(f"{method} {path} failed: {exc.code} {detail}") from exc


def embed(client: genai.Client, text: str) -> list[float]:
    result = client.models.embed_content(model=MODEL, contents=text)
    return [float(value) for value in result.embeddings[0].values]


def main() -> None:
    collection_id: str | None = None
    collection_created = False
    doc_text = (
        "Gemini embedding smoke document: ChromaDB can store MCP server "
        "research context vectors."
    )
    query_text = "Can ChromaDB retrieve the stored Gemini MCP research context?"

    try:
        client = genai.Client()
        doc_embedding = embed(client, doc_text)
        query_embedding = embed(client, query_text)
        collection = request(
            "POST",
            "/collections",
            {
                "name": COLLECTION_NAME,
                "get_or_create": True,
                "metadata": {"purpose": "gemini_embedding_smoke", "model": MODEL},
            },
        )
        collection_id = collection["id"]
        collection_created = True

        request(
            "POST",
            f"/collections/{collection_id}/upsert",
            {
                "ids": ["smoke-doc-1"],
                "embeddings": [doc_embedding],
                "documents": [doc_text],
                "metadatas": [{"source": "gemini-chroma-smoke", "model": MODEL}],
            },
        )
        count = request("GET", f"/collections/{collection_id}/count")
        result = request(
            "POST",
            f"/collections/{collection_id}/query",
            {
                "query_embeddings": [query_embedding],
                "n_results": 1,
                "include": ["documents", "metadatas", "distances"],
            },
        )

        print(
            json.dumps(
                {
                    "model": MODEL,
                    "embedding_dimension": len(doc_embedding),
                    "collection": COLLECTION_NAME,
                    "count_after_upsert": count,
                    "top_id": result["ids"][0][0],
                    "top_distance": result["distances"][0][0],
                    "top_document": result["documents"][0][0],
                },
                indent=2,
            )
        )
    finally:
        if collection_created:
            try:
                request("DELETE", f"/collections/{COLLECTION_NAME}")
                print(
                    json.dumps(
                        {
                            "cleanup": "deleted temporary collection",
                            "collection": COLLECTION_NAME,
                        }
                    )
                )
            except Exception as exc:
                print(json.dumps({"cleanup_error": str(exc)}))


if __name__ == "__main__":
    main()
