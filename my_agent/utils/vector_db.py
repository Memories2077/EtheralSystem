import os
import logging
import datetime
import chromadb
import asyncio
from typing import Dict, Any, List, Optional

from llama_index.core import Document, VectorStoreIndex, StorageContext, Settings
from llama_index.core.node_parser import HierarchicalNodeParser, get_leaf_nodes
from llama_index.core.retrievers import AutoMergingRetriever
from llama_index.storage.docstore.mongodb import MongoDocumentStore
from llama_index.vector_stores.chroma import ChromaVectorStore
from llama_index.llms.langchain import LangChainLLM
from llama_index.embeddings.ollama import OllamaEmbedding
from langchain_google_genai import ChatGoogleGenerativeAI
from pydantic import SecretStr

from my_agent.config import API_CONFIG, AGENT_CONFIG

logger = logging.getLogger(__name__)

# Constants
CHROMA_HOST = os.getenv("CHROMA_HOST", "localhost")
CHROMA_PORT = int(os.getenv("CHROMA_PORT", "8025"))
COLLECTION_NAME = "mcp_servers_hierarchical"
EMBEDDING_MODEL = "qwen3-embedding:0.6b"
OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")

MONGO_URI = API_CONFIG.get("mongo_uri", "mongodb://mongodb:27017")
MONGO_DB_NAME = API_CONFIG.get("mongo_db_name", "mcp_agent_db")

# Global LlamaIndex Settings
Settings.embed_model = OllamaEmbedding(
    model_name=EMBEDDING_MODEL,
    base_url=OLLAMA_BASE_URL,
    request_timeout=60.0,
)
Settings.llm = LangChainLLM(
    llm=ChatGoogleGenerativeAI(
        model=AGENT_CONFIG["supervisor"]["model"],
        api_key=SecretStr(API_CONFIG["gemini_api_key"]),
    )
)

# Initialize Chroma and Storage
def get_storage_context():
    """Initialize or retrieve the storage context for LlamaIndex."""
    db = chromadb.HttpClient(host=CHROMA_HOST, port=CHROMA_PORT)
    chroma_collection = db.get_or_create_collection(COLLECTION_NAME)
    vector_store = ChromaVectorStore(chroma_collection=chroma_collection)
    
    # Use MongoDB for DocStore
    docstore = MongoDocumentStore.from_uri(uri=MONGO_URI, db_name=MONGO_DB_NAME)
    
    return StorageContext.from_defaults(
        vector_store=vector_store,
        docstore=docstore
    )

async def get_embeddings(text: str) -> List[float]:
    """Compatibility function: Get embeddings for a given text using LlamaIndex/Ollama."""
    try:
        return await Settings.embed_model.aget_text_embedding(text)
    except Exception as e:
        logger.error(f"[VectorDB] ❌ Failed to get embeddings: {e}")
        return [0.0] * 1024

def _sync_process_and_save(server_id: str, documents: List[Document]):
    """Synchronous helper for saving artifacts without blocking event loop."""
    storage_context = get_storage_context()
    
    # 1. Create hierarchical nodes
    node_parser = HierarchicalNodeParser.from_defaults(
        chunk_sizes=[2048, 512, 256] # Hierarchy: Large -> Medium -> Small (increased from 128)
    )
    nodes = node_parser.get_nodes_from_documents(documents)
    leaf_nodes = get_leaf_nodes(nodes)
    
    # 2. Add all nodes to docstore so they can be merged later
    storage_context.docstore.add_documents(nodes)
    
    # 3. Create/Update Index (only leaf nodes are stored in the vector store)
    VectorStoreIndex(
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
        
        # Check if any result exceeds the similarity threshold
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
    logger.info(f"[VectorDB] Saving artifacts for server {server_id} using Hierarchical Indexing...")

    try:
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
                doc = Document(
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
        return {
            "status": "success",
            "indexed_nodes": num_leaves,
            "documents_count": len(documents)
        }

    except Exception as e:
        logger.error(f"[VectorDB] ❌ Failed to save artifacts: {e}")
        return {"status": "error", "reason": str(e)}

def _sync_search_artifacts(query_text: str, n_results: int) -> List[Dict[str, Any]]:
    """Synchronous helper for searching artifacts without blocking event loop."""
    storage_context = get_storage_context()

    try:
        # 1. Reconstruct index from storage
        index = VectorStoreIndex.from_vector_store(
            storage_context.vector_store,
            storage_context=storage_context
        )

        # 2. Create Base Retriever (fetches leaf nodes)
        base_retriever = index.as_retriever(similarity_top_k=n_results * 5) # Fetch more to allow merging

        # 3. Create AutoMergingRetriever
        retriever = AutoMergingRetriever(
            base_retriever,
            storage_context,
            verbose=True
        )

        # 4. Perform Retrieval
        nodes = retriever.retrieve(query_text)
    except Exception as e:
        # If AutoMergingRetriever fails (e.g., doc_id not found), fall back to simple retrieval
        logger.warning(f"[VectorDB] ⚠️ AutoMergingRetriever failed ({e}), falling back to simple retrieval")
        index = VectorStoreIndex.from_vector_store(
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
    logger.info(f"[VectorDB] 🔍 Searching with AutoMergingRetriever: '{query_text[:50]}...'")
    try:
        # Execute blocking retrieval in a separate thread
        formatted_results = await asyncio.to_thread(_sync_search_artifacts, query_text, n_results)
        
        logger.info(f"[VectorDB] ✅ Found {len(formatted_results)} relevant (possibly merged) documents")
        return formatted_results
            
    except Exception as e:
        logger.error(f"[VectorDB] ❌ Search failed: {e}")
        return []
