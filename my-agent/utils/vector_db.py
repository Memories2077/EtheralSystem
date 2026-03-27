import os
import logging
import datetime
import chromadb
from typing import Dict, Any, List, Optional

from llama_index.core import Document, VectorStoreIndex, StorageContext, Settings
from llama_index.core.node_parser import HierarchicalNodeParser, get_leaf_nodes
from llama_index.core.retrievers import AutoMergingRetriever
from llama_index.core.storage.docstore import SimpleDocumentStore
from llama_index.vector_stores.chroma import ChromaVectorStore
from llama_index.llms.langchain import LangChainLLM
from llama_index.embeddings.ollama import OllamaEmbedding
from langchain_google_genai import ChatGoogleGenerativeAI
from pydantic import SecretStr

from config import API_CONFIG, AGENT_CONFIG

logger = logging.getLogger(__name__)

# Constants
CHROMA_HOST = "localhost"
CHROMA_PORT = 8025
COLLECTION_NAME = "mcp_servers_hierarchical"
EMBEDDING_MODEL = "qwen3-embedding:0.6b"
OLLAMA_BASE_URL = "http://localhost:11434"
PERSIST_DIR = os.path.join(os.path.dirname(__file__), "..", "data", "llama_storage")

# Ensure persist directory exists
os.makedirs(PERSIST_DIR, exist_ok=True)

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
    
    # Persist the docstore to disk
    if os.path.exists(os.path.join(PERSIST_DIR, "docstore.json")):
        docstore = SimpleDocumentStore.from_persist_dir(persist_dir=PERSIST_DIR)
    else:
        docstore = SimpleDocumentStore()
    
    return StorageContext.from_defaults(
        vector_store=vector_store,
        docstore=docstore
    )

def persist_storage(storage_context: StorageContext):
    """Save storage context to disk."""
    storage_context.docstore.persist(persist_path=os.path.join(PERSIST_DIR, "docstore.json"))

async def get_embeddings(text: str) -> List[float]:
    """Compatibility function: Get embeddings for a given text using LlamaIndex/Ollama."""
    try:
        return await Settings.embed_model.aget_text_embedding(text)
    except Exception as e:
        logger.error(f"[VectorDB] ❌ Failed to get embeddings: {e}")
        return [0.0] * 1024

async def save_mcp_artifacts(server_id: str, user_id: str, email: str, artifacts: Dict[str, Any]):
    """
    Save MCP server artifacts using HierarchicalNodeParser.
    """
    logger.info(f"[VectorDB] Saving artifacts for server {server_id} using Hierarchical Indexing...")
    
    try:
        storage_context = get_storage_context()
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
            return

        # 1. Create hierarchical nodes
        node_parser = HierarchicalNodeParser.from_defaults(
            chunk_sizes=[2048, 512, 256] # Hierarchy: Large -> Medium -> Small (increased from 128)
        )
        nodes = node_parser.get_nodes_from_documents(documents)
        leaf_nodes = get_leaf_nodes(nodes)
        
        # 2. Add all nodes to docstore so they can be merged later
        storage_context.docstore.add_documents(nodes)
        
        # 3. Create/Update Index (only leaf nodes are stored in the vector store)
        # LlamaIndex will automatically associate leaves with parents in the docstore.
        VectorStoreIndex(
            leaf_nodes,
            storage_context=storage_context,
            show_progress=True
        )
        
        # 4. Persist docstore
        persist_storage(storage_context)
            
        logger.info(f"[VectorDB] ✅ Successfully indexed {len(leaf_nodes)} leaf nodes for {server_id}")
        
    except Exception as e:
        logger.error(f"[VectorDB] ❌ Failed to save artifacts: {e}")

async def search_mcp_artifacts(query_text: str, n_results: int = 3) -> List[Dict[str, Any]]:
    """
    Search for related MCP artifacts using AutoMergingRetriever.
    """
    logger.info(f"[VectorDB] 🔍 Searching with AutoMergingRetriever: '{query_text[:50]}...'")
    try:
        storage_context = get_storage_context()
        
        # 1. Reconstruct index from storage
        index = VectorStoreIndex.from_vector_store(
            storage_context.vector_store,
            storage_context=storage_context
        )
        
        # 2. Create Base Retriever (fetches leaf nodes)
        base_retriever = index.as_retriever(similarity_top_k=n_results * 5) # Fetch more to allow merging (increased from * 2)
        
        # 3. Create AutoMergingRetriever
        retriever = AutoMergingRetriever(
            base_retriever,
            storage_context,
            verbose=True
        )
        
        # 4. Perform Retrieval
        nodes = retriever.retrieve(query_text)
        
        # 5. Format results for the agent (compatible with previous format)
        formatted_results = []
        for node in nodes[:n_results]:
            formatted_results.append({
                "id": node.node_id,
                "content": node.get_content(),
                "metadata": node.metadata,
                "distance": getattr(node, 'score', 0.0)
            })
        
        logger.info(f"[VectorDB] ✅ Found {len(formatted_results)} relevant (possibly merged) documents")
        return formatted_results
            
    except Exception as e:
        logger.error(f"[VectorDB] ❌ Search failed: {e}")
        return []
