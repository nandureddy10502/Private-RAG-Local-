"""
Vector Store module for Privacy-Preserving Local RAG.

Manages vector embeddings and local ChromaDB persistence using
LangChain's Chroma integration and HuggingFaceEmbeddings ('all-MiniLM-L6-v2').
"""

from pathlib import Path
from typing import List, Optional
import os

from langchain_core.documents import Document
from langchain_community.vectorstores import Chroma
from langchain_community.embeddings import HuggingFaceEmbeddings

# Default local persistence directory
DEFAULT_PERSIST_DIR = str(Path(__file__).parent / "chroma_db")
DEFAULT_COLLECTION_NAME = "enterprise_knowledge_base"
DEFAULT_MODEL_NAME = "all-MiniLM-L6-v2"

# Singleton/cached embeddings instance
_embeddings_instance: Optional[HuggingFaceEmbeddings] = None


def get_embeddings(model_name: str = DEFAULT_MODEL_NAME) -> HuggingFaceEmbeddings:
    """
    Returns a cached HuggingFaceEmbeddings instance running locally.
    """
    global _embeddings_instance
    if _embeddings_instance is None:
        _embeddings_instance = HuggingFaceEmbeddings(
            model_name=model_name,
            model_kwargs={"device": "cpu"},
            encode_kwargs={"normalize_embeddings": True},
        )
    return _embeddings_instance


def get_vector_store(
    persist_directory: str = DEFAULT_PERSIST_DIR,
    collection_name: str = DEFAULT_COLLECTION_NAME,
) -> Chroma:
    """
    Initializes or loads a local persistent Chroma vector store.
    """
    Path(persist_directory).mkdir(parents=True, exist_ok=True)
    embeddings = get_embeddings()
    return Chroma(
        collection_name=collection_name,
        embedding_function=embeddings,
        persist_directory=persist_directory,
    )


def ingest_documents(
    chunks: List[Document],
    persist_directory: str = DEFAULT_PERSIST_DIR,
    collection_name: str = DEFAULT_COLLECTION_NAME,
) -> List[str]:
    """
    Saves document chunks to the local ChromaDB directory.

    Args:
        chunks: List of LangChain Document objects to embed and store.
        persist_directory: Path to local directory where ChromaDB stores vectors.
        collection_name: Name of the vector collection.

    Returns:
        List of generated chunk IDs stored in ChromaDB.
    """
    if not chunks:
        return []

    vector_store = get_vector_store(
        persist_directory=persist_directory,
        collection_name=collection_name,
    )
    
    # Add documents to ChromaDB
    ids = vector_store.add_documents(chunks)
    return ids


def similarity_search(
    query_string: str,
    k: int = 4,
    persist_directory: str = DEFAULT_PERSIST_DIR,
    collection_name: str = DEFAULT_COLLECTION_NAME,
) -> List[Document]:
    """
    Performs a similarity search against the local ChromaDB vector store.

    Args:
        query_string: The natural language search query.
        k: Number of top relevant document chunks to return (default 4).
        persist_directory: Path to local directory where ChromaDB vectors are stored.
        collection_name: Name of the vector collection.

    Returns:
        List of top matching LangChain Document chunks ordered by similarity.
    """
    if not query_string or not query_string.strip():
        return []

    vector_store = get_vector_store(
        persist_directory=persist_directory,
        collection_name=collection_name,
    )

    return vector_store.similarity_search(query_string, k=k)


if __name__ == "__main__":
    import sys

    print("--- Testing vector_store.py ---")
    test_docs = [
        Document(
            page_content="Air-gapped RAG ensures sensitive enterprise documents never leave the host machine.",
            metadata={"source": "security_policy.pdf", "page": 1, "chunk_index": 0},
        ),
        Document(
            page_content="Ollama and ChromaDB run 100% locally on localhost with zero public cloud telemetry.",
            metadata={"source": "system_specs.pdf", "page": 1, "chunk_index": 1},
        ),
        Document(
            page_content="RecursiveCharacterTextSplitter maintains paragraph structure with 200 character overlap.",
            metadata={"source": "chunking_guide.pdf", "page": 2, "chunk_index": 0},
        ),
    ]

    print(f"Ingesting {len(test_docs)} sample chunks...")
    doc_ids = ingest_documents(test_docs)
    print(f"Successfully ingested {len(doc_ids)} chunks into ChromaDB.")

    query = "How does local air-gapped security work?"
    print(f"\nSearching for: '{query}'")
    results = similarity_search(query, k=2)

    for i, res in enumerate(results):
        print(f"\nMatch #{i+1}:")
        print(f"Content: {res.page_content}")
        print(f"Metadata: {res.metadata}")
