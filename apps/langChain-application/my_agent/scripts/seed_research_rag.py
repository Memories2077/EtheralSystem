import argparse
import asyncio
import datetime
import json
import re
import sys
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from llama_index.core import Document

from my_agent.utils import vector_db
from my_agent.utils.vector_db import search_mcp_artifacts


def read_input(path: str) -> str:
    if path == "-":
        return sys.stdin.read()
    with open(path, "r", encoding="utf-8") as handle:
        return handle.read()


def endpoint_sections(api_doc: str) -> list[str]:
    parts = re.split(r"(?=^## Endpoint \d+:)", api_doc, flags=re.MULTILINE)
    return [part.strip() for part in parts if part.strip().startswith("## Endpoint")]


def sections_matching(sections: list[str], *needles: str) -> str:
    lowered_needles = [needle.lower() for needle in needles]
    matches = [
        section
        for section in sections
        if any(needle in section.lower() for needle in lowered_needles)
    ]
    return "\n\n".join(matches)


def build_seed_documents(args: argparse.Namespace, api_doc: str) -> list[Document]:
    timestamp = datetime.datetime.now().isoformat()
    sections = endpoint_sections(api_doc)
    base_metadata: dict[str, Any] = {
        "server_id": args.server_id,
        "user_id": "research_rag_seed",
        "email": "research-rag-seed@local",
        "timestamp": timestamp,
        "case_id": args.case_id,
        "base_url": args.base_url,
        "seed_kind": "research_rag_seed",
    }
    overview = "\n".join(
        [
            f"Case: {args.case_id}",
            f"Title: {args.api_title}",
            f"Base URL: {args.base_url}",
            "Service label: jsonplaceholder",
            "",
            api_doc,
        ]
    )
    specs = [
        ("api_doc", f"{args.case_id}-api-doc.txt", overview),
        (
            "jsonplaceholder",
            f"{args.case_id}-jsonplaceholder-overview.txt",
            "\n".join(
                [
                    "JSONPlaceholder CRUD API.",
                    f"Case: {args.case_id}",
                    f"Base URL: {args.base_url}",
                    "Endpoints include posts, comments, and users.",
                    "",
                    overview,
                ]
            ),
        ),
        (
            "posts",
            f"{args.case_id}-posts.txt",
            sections_matching(sections, "path: /posts", "post resource", "fake post"),
        ),
        (
            "comments",
            f"{args.case_id}-comments.txt",
            sections_matching(sections, "comments", "postid"),
        ),
        (
            "users",
            f"{args.case_id}-users.txt",
            sections_matching(sections, "path: /users", "user profile"),
        ),
    ]

    documents: list[Document] = []
    for doc_type, filename, content in specs:
        text = content.strip()
        if not text:
            continue
        metadata = {
            **base_metadata,
            "type": doc_type,
            "filename": filename,
        }
        documents.append(
            Document(
                text=text,
                doc_id=f"{args.server_id}_{doc_type}",
                metadata=metadata,
            )
        )
    return documents


def existing_seed_count(server_id: str) -> int:
    vector_db._ensure_vector_db_dependencies()
    chroma_module = vector_db.chromadb
    if chroma_module is None:
        return 0
    client = chroma_module.HttpClient(host=vector_db.CHROMA_HOST, port=vector_db.CHROMA_PORT)
    collection = client.get_or_create_collection(vector_db.COLLECTION_NAME)
    result = collection.get(where={"server_id": server_id}, limit=1)
    return len(result.get("ids") or [])


async def verify_retrieval(query_text: str, n_results: int) -> list[dict[str, Any]]:
    return await search_mcp_artifacts(query_text, n_results=n_results)


def evidence_label(item: dict[str, Any]) -> str:
    metadata = item.get("metadata") or {}
    return str(
        metadata.get("type")
        or metadata.get("filename")
        or metadata.get("server_id")
        or item.get("id")
        or "unknown"
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed research RAG data into the Gemini Chroma collection.")
    parser.add_argument("--case-id", required=True)
    parser.add_argument("--api-title", default="")
    parser.add_argument("--base-url", default="")
    parser.add_argument("--input-path", required=True)
    parser.add_argument("--server-id", default="")
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--n-results", type=int, default=3)
    parser.add_argument("--require-retrieval", action="store_true")
    args = parser.parse_args()

    args.server_id = args.server_id or f"research-rag-seed-{args.case_id}"
    api_doc = read_input(args.input_path).strip()
    if not api_doc:
        raise SystemExit("RAG seed input is empty.")

    indexed_nodes = 0
    documents = build_seed_documents(args, api_doc)
    if not documents:
        raise SystemExit("RAG seed produced no documents.")

    exists = existing_seed_count(args.server_id)
    status = "skipped_existing"
    if args.force or exists == 0:
        indexed_nodes = vector_db._sync_process_and_save(args.server_id, documents)
        status = "indexed"

    query_text = "\n".join(
        [
            f"JSONPlaceholder research RAG query for {args.case_id}.",
            api_doc,
        ]
    )
    results = asyncio.run(verify_retrieval(query_text, args.n_results))
    summary = {
        "status": status,
        "server_id": args.server_id,
        "collection": vector_db.COLLECTION_NAME,
        "chroma_host": vector_db.CHROMA_HOST,
        "chroma_port": vector_db.CHROMA_PORT,
        "document_count": len(documents),
        "indexed_nodes": indexed_nodes,
        "retrieval_count": len(results),
        "evidence_labels": [evidence_label(item) for item in results[: args.n_results]],
        "scores": [item.get("distance") for item in results[: args.n_results]],
    }
    print(json.dumps(summary, indent=2))
    if args.require_retrieval and not results:
        raise SystemExit("RAG seed verification failed: retrieval returned no evidence.")


if __name__ == "__main__":
    main()
