import os
import logging
import datetime
import asyncio
from typing import Dict, Any, List, Optional, TYPE_CHECKING, cast

try:
    import chromadb
    from llama_index.core import Document, VectorStoreIndex, StorageContext, Settings
    from llama_index.core.node_parser import HierarchicalNodeParser, get_leaf_nodes
    from llama_index.core.retrievers import AutoMergingRetriever
    from llama_index.storage.docstore.mongodb import MongoDocumentStore
    from llama_index.vector_stores.chroma import ChromaVectorStore
    from llama_index.llms.langchain import LangChainLLM
    from llama_index.embeddings.google_genai import GoogleGenAIEmbedding
except ImportError as e:
    chromadb = None
    Document = VectorStoreIndex = StorageContext = Settings = None
    HierarchicalNodeParser = get_leaf_nodes = AutoMergingRetriever = None
    MongoDocumentStore = ChromaVectorStore = LangChainLLM = GoogleGenAIEmbedding = None
    _VECTOR_DB_IMPORT_ERROR = e
else:
    _VECTOR_DB_IMPORT_ERROR = None

if TYPE_CHECKING:
    from llama_index.core import Document as LlamaDocument
else:
    LlamaDocument = Any
from my_agent.config import API_CONFIG
from my_agent.utils.llm_factory import get_llm
from my_agent.utils.research_metrics import duration_since_ms, monotonic_ms, record_research_event

logger = logging.getLogger(__name__)

# Constants
CHROMA_HOST = os.getenv("CHROMA_HOST", "localhost")
CHROMA_PORT = int(os.getenv("CHROMA_PORT", "8025"))
COLLECTION_NAME = os.getenv("CHROMA_COLLECTION_NAME", "mcp_servers_hierarchical_gemini")
EMBEDDING_MODEL = os.getenv("GEMINI_EMBEDDING_MODEL", "gemini-embedding-2")

MONGO_URI = API_CONFIG.get("mongo_uri", "mongodb://mongodb:27017")
MONGO_DB_NAME = API_CONFIG.get("mongo_db_name", "mcp_agent_db")
GEMINI_API_KEY = API_CONFIG.get("gemini_api_key", "")
_EMBEDDING_INIT_ERROR: Exception | None = None

def _ensure_vector_db_dependencies() -> None:
    """Raise a clear runtime error if optional vector DB dependencies are missing."""
    if _VECTOR_DB_IMPORT_ERROR is not None:
        raise ImportError(
            "Vector DB dependencies are not installed. Install project dependencies from "
            "pyproject.toml before using RAG features."
        ) from _VECTOR_DB_IMPORT_ERROR
    if _EMBEDDING_INIT_ERROR is not None:
        raise RuntimeError(
            "Gemini embedding model is not configured. Ensure GEMINI_API_KEY is set "
            "and llama-index-embeddings-google-genai is installed before using RAG features."
        ) from _EMBEDDING_INIT_ERROR


# Global LlamaIndex Settings
if Settings is not None and GoogleGenAIEmbedding is not None and LangChainLLM is not None:
    try:
        if not GEMINI_API_KEY:
            raise ValueError("GEMINI_API_KEY is not set")
        google_embedding_cls = cast(Any, GoogleGenAIEmbedding)
        settings = cast(Any, Settings)
        settings.embed_model = google_embedding_cls(
            model_name=EMBEDDING_MODEL,
            api_key=GEMINI_API_KEY,
            timeout=60,
        )
        langchain_llm_cls = cast(Any, LangChainLLM)
        settings.llm = langchain_llm_cls(llm=get_llm(temperature=0.0))
    except Exception as e:
        _EMBEDDING_INIT_ERROR = e
        logger.warning("[VectorDB] Gemini embedding initialization skipped: %s", e)

# Initialize Chroma and Storage
def get_storage_context():
    """Initialize or retrieve the storage context for LlamaIndex."""
    _ensure_vector_db_dependencies()
    chroma_module = cast(Any, chromadb)
    chroma_vector_store_cls = cast(Any, ChromaVectorStore)
    mongo_docstore_cls = cast(Any, MongoDocumentStore)
    storage_context_cls = cast(Any, StorageContext)

    db = chroma_module.HttpClient(host=CHROMA_HOST, port=CHROMA_PORT)
    chroma_collection = db.get_or_create_collection(COLLECTION_NAME)
    vector_store = chroma_vector_store_cls(chroma_collection=chroma_collection)
    
    # Use MongoDB for DocStore
    docstore = mongo_docstore_cls.from_uri(uri=MONGO_URI, db_name=MONGO_DB_NAME)
    
    return storage_context_cls.from_defaults(
        vector_store=vector_store,
        docstore=docstore
    )

async def get_embeddings(text: str) -> List[float]:
    """Compatibility function: Get embeddings for a given text using Gemini."""
    try:
        _ensure_vector_db_dependencies()
        settings = cast(Any, Settings)
        return await settings.embed_model.aget_text_embedding(text)
    except Exception as e:
        logger.error("[VectorDB] Failed to get Gemini embeddings: %s", e)
        return []

def _sync_process_and_save(server_id: str, documents: List[LlamaDocument]):
    """Synchronous helper for saving artifacts without blocking event loop."""
    storage_context = get_storage_context()
    
    # 1. Create hierarchical nodes
    node_parser_cls = cast(Any, HierarchicalNodeParser)
    get_leaf_nodes_fn = cast(Any, get_leaf_nodes)
    vector_store_index_cls = cast(Any, VectorStoreIndex)

    node_parser = node_parser_cls.from_defaults(
        chunk_sizes=[2048, 512, 256] # Hierarchy: Large -> Medium -> Small (increased from 128)
    )
    nodes = node_parser.get_nodes_from_documents(documents)
    leaf_nodes = get_leaf_nodes_fn(nodes)
    
    # 2. Add all nodes to docstore so they can be merged later
    storage_context.docstore.add_documents(nodes)
    
    # 3. Create/Update Index (only leaf nodes are stored in the vector store)
    vector_store_index_cls(
        leaf_nodes,
        storage_context=storage_context,
        show_progress=True
    )
    
    return len(leaf_nodes)

async def check_similar_content_exists(query_text: str, similarity_threshold: float = 0.7) -> Optional[Dict[str, Any]]:
    """
    Check if similar content already exists in ChromaDB.
    
    Args:
        query_text: The content to check for similarity
        similarity_threshold: Minimum similarity score to consider as duplicate (0.0-1.0)
    
    Returns:
        Dict with similar document info if found, None otherwise
    """
    logger.info(f"[VectorDB] 🔍 Checking for similar content (threshold: {similarity_threshold})")
    try:
        # Search with higher k to find potential duplicates
        similar_results = await asyncio.to_thread(_sync_search_artifacts, query_text, n_results=5)
        
        # LlamaIndex node scores are similarity scores where higher is better.
        # Chroma distances may be lower-is-better, but `_sync_search_artifacts` stores
        # the retriever score in `distance` for backward compatibility.
        for result in similar_results:
            score = result.get("distance", 0.0)
            if score >= similarity_threshold:
                logger.warning(
                    f"[VectorDB] ⚠️ Similar content found! Score: {score:.4f} >= {similarity_threshold}. "
                    f"Server ID: {result.get('metadata', {}).get('server_id', 'unknown')}"
                )
                return result
        
        logger.info(f"[VectorDB] ✅ No similar content found (highest score: {similar_results[0]['distance'] if similar_results else 0.0:.4f})")
        return None
        
    except Exception as e:
        logger.error(f"[VectorDB] ❌ Failed to check for similar content: {e}")
        # Return None to allow saving in case of error (fail-safe)
        return None

async def save_mcp_artifacts(server_id: str, user_id: str, email: str, artifacts: Dict[str, Any], skip_if_similar: bool = True) -> Dict[str, Any]:
    """
    Save MCP server artifacts using HierarchicalNodeParser.
    
    Args:
        server_id: The server ID
        user_id: The user ID
        email: The user email
        artifacts: The artifacts to save
        skip_if_similar: If True, check for similar content before saving (default: True)
    
    Returns:
        Dict with status and details about the operation
    """
    start_ms = monotonic_ms()
    logger.info(f"[VectorDB] Saving artifacts for server {server_id} using Hierarchical Indexing...")

    try:
        _ensure_vector_db_dependencies()
        # Check for similar content if flag is enabled
        if skip_if_similar:
            # Combine all artifact contents for similarity check
            combined_content = " ".join([
                artifacts.get(key, {}).get("content", "") 
                for key in ["input", "openapi", "typescript"] 
                if artifacts.get(key, {}).get("content")
            ])
            
            if combined_content:
                similar_doc = await check_similar_content_exists(combined_content, similarity_threshold=0.7)
                if similar_doc:
                    logger.warning(
                        f"[VectorDB] ⏭️ Skipping save for server {server_id} - "
                        f"similar content exists (server: {similar_doc.get('metadata', {}).get('server_id')}, "
                        f"similarity: {similar_doc.get('distance', 0):.4f})"
                    )
                    return {
                        "status": "skipped_duplicate",
                        "reason": "Similar content already exists in ChromaDB",
                        "similar_server_id": similar_doc.get("metadata", {}).get("server_id"),
                        "similarity_score": similar_doc.get("distance", 0)
                    }

        timestamp = datetime.datetime.now().isoformat()

        documents = []

        # Process files into LlamaIndex Documents
        file_mappings = {
            "input": ("api_doc", "api-input"),
            "openapi": ("openapi_yaml", f"{server_id}.yaml"),
            "typescript": ("typescript_code", f"{server_id}.ts")
        }

        for key, (file_type, default_name) in file_mappings.items():
            if key in artifacts and artifacts[key].get("content"):
                content = artifacts[key]["content"]
                document_cls = cast(Any, Document)
                doc = document_cls(
                    text=content,
                    doc_id=f"{server_id}_{file_type}",
                    metadata={
                        "server_id": server_id,
                        "user_id": user_id,
                        "email": email,
                        "type": file_type,
                        "filename": artifacts[key].get("name", default_name),
                        "timestamp": timestamp
                    }
                )
                documents.append(doc)

        if not documents:
            logger.warning("[VectorDB] ⚠️ No documents to save")
            return {"status": "skipped_empty", "reason": "No documents to save"}

        # Execute blocking logic in a separate thread
        num_leaves = await asyncio.to_thread(_sync_process_and_save, server_id, documents)

        logger.info(f"[VectorDB] ✅ Successfully indexed {num_leaves} leaf nodes for {server_id}")
        await record_research_event(
            service="langgraph-agent",
            stage="artifact_indexing",
            event_name="artifact_index_completed",
            status="success",
            duration_ms=duration_since_ms(start_ms),
            context={"server_id": server_id},
            metrics={
                "artifact_index_success": True,
                "artifact_document_count": len(documents),
                "artifact_leaf_node_count": num_leaves,
            },
        )
        return {
            "status": "success",
            "indexed_nodes": num_leaves,
            "documents_count": len(documents)
        }

    except Exception as e:
        logger.error(f"[VectorDB] ❌ Failed to save artifacts: {e}")
        await record_research_event(
            service="langgraph-agent",
            stage="artifact_indexing",
            event_name="artifact_index_completed",
            status="failure",
            duration_ms=duration_since_ms(start_ms),
            error_code=e.__class__.__name__,
            context={"server_id": server_id},
        )
        return {"status": "error", "reason": str(e)}

def _sync_search_artifacts(query_text: str, n_results: int) -> List[Dict[str, Any]]:
    """Synchronous helper for searching artifacts without blocking event loop."""
    storage_context = get_storage_context()

    vector_store_index_cls = cast(Any, VectorStoreIndex)
    auto_merging_retriever_cls = cast(Any, AutoMergingRetriever)

    try:
        # 1. Reconstruct index from storage
        index = vector_store_index_cls.from_vector_store(
            storage_context.vector_store,
            storage_context=storage_context
        )

        # 2. Create Base Retriever (fetches leaf nodes)
        base_retriever = index.as_retriever(similarity_top_k=n_results * 5) # Fetch more to allow merging

        # 3. Create AutoMergingRetriever
        retriever = auto_merging_retriever_cls(
            base_retriever,
            storage_context,
            verbose=True
        )

        # 4. Perform Retrieval
        nodes = retriever.retrieve(query_text)
    except Exception as e:
        # If AutoMergingRetriever fails (e.g., doc_id not found), fall back to simple retrieval
        logger.warning(f"[VectorDB] ⚠️ AutoMergingRetriever failed ({e}), falling back to simple retrieval")
        index = vector_store_index_cls.from_vector_store(
            storage_context.vector_store,
            storage_context=storage_context
        )
        base_retriever = index.as_retriever(similarity_top_k=n_results)
        nodes = base_retriever.retrieve(query_text)
    
    # 5. Format results and filter out low relevance context
    formatted_results = []
    for node in nodes[:n_results]:
        score = getattr(node, 'score', 0.0)
        logger.info(f"[VectorDB] Retrieved chunk '{node.node_id}' with similarity score: {score:.4f}")
        
        # Threshold filter to avoid passing completely unrelated context 
        # (e.g. asking for Notion but getting Reddit)
        # Increased threshold to 0.45 for higher precision and less noise
        if score < 0.45:
            logger.warning(f"[VectorDB] ⚠️ Discarding chunk due to low score {score:.4f} < 0.45")
            continue
            
        formatted_results.append({
            "id": node.node_id,
            "content": node.get_content(),
            "metadata": node.metadata,
            "distance": score
        })
        
    return formatted_results

async def search_mcp_artifacts(query_text: str, n_results: int = 3) -> List[Dict[str, Any]]:
    """
    Search for related MCP artifacts using AutoMergingRetriever.
    """
    start_ms = monotonic_ms()
    logger.info(f"[VectorDB] 🔍 Searching with AutoMergingRetriever: '{query_text[:50]}...'")
    try:
        _ensure_vector_db_dependencies()
        # Execute blocking retrieval in a separate thread
        formatted_results = await asyncio.to_thread(_sync_search_artifacts, query_text, n_results)
        
        logger.info(f"[VectorDB] ✅ Found {len(formatted_results)} relevant (possibly merged) documents")
        scores = [
            float(result.get("distance", 0.0))
            for result in formatted_results
            if isinstance(result.get("distance", 0.0), (int, float))
        ]
        await record_research_event(
            service="langgraph-agent",
            stage="rag",
            event_name="rag_retrieval_completed",
            status="success",
            duration_ms=duration_since_ms(start_ms),
            metrics={
                "rag_top_k": n_results,
                "rag_returned_count": len(formatted_results),
                "rag_similarity_min": min(scores) if scores else None,
                "rag_similarity_max": max(scores) if scores else None,
                "rag_similarity_mean": sum(scores) / len(scores) if scores else None,
                "query_length": len(query_text),
            },
        )
        return formatted_results
            
    except Exception as e:
        logger.error(f"[VectorDB] ❌ Search failed: {e}")
        await record_research_event(
            service="langgraph-agent",
            stage="rag",
            event_name="rag_retrieval_completed",
            status="failure",
            duration_ms=duration_since_ms(start_ms),
            error_code=e.__class__.__name__,
            metrics={"rag_top_k": n_results, "query_length": len(query_text)},
        )
        return []
