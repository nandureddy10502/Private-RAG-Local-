from datetime import datetime
from pathlib import Path
import os
import shutil
from typing import List, Optional

import httpx
from fastapi import FastAPI, File, UploadFile, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from document_processor import load_and_chunk_pdf
from vector_store import ingest_documents, similarity_search, get_vector_store
from rag_chain import query_rag

app = FastAPI(
    title="Privacy-Preserving RAG Backend",
    description="Air-gapped local RAG API powered by FastAPI, LangChain, ChromaDB, and Ollama",
    version="1.0.0",
)

# Enable CORS for local frontend development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

TEMP_DIR = Path(__file__).parent / "temp"
TEMP_DIR.mkdir(parents=True, exist_ok=True)

OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://127.0.0.1:11434")


class SearchRequest(BaseModel):
    query: str
    k: Optional[int] = 4


class ChatRequest(BaseModel):
    question: str
    k: Optional[int] = 4


class SearchResult(BaseModel):
    content: str
    metadata: dict


@app.get("/")
def read_root():
    return {
        "name": "Privacy-Preserving RAG API",
        "status": "online",
        "version": "1.0.0",
        "timestamp": datetime.utcnow().isoformat(),
        "docs_url": "/docs",
        "health_check": "/health",
        "endpoints": {
            "upload_pdf": "POST /api/upload",
            "list_documents": "GET /api/documents",
            "similarity_search": "POST /api/search",
        },
    }


@app.get("/health")
async def health_check():
    ollama_status = "disconnected"
    ollama_models = []

    try:
        async with httpx.AsyncClient(timeout=2.0) as client:
            response = await client.get(f"{OLLAMA_BASE_URL}/api/tags")
            if response.status_code == 200:
                ollama_status = "connected"
                data = response.json()
                ollama_models = [m.get("name") for m in data.get("models", [])]
    except Exception as exc:
        ollama_status = f"unavailable ({type(exc).__name__})"

    # ChromaDB collection statistics
    try:
        vs = get_vector_store()
        doc_count = vs._collection.count()
    except Exception:
        doc_count = 0

    return {
        "status": "healthy",
        "timestamp": datetime.utcnow().isoformat(),
        "services": {
            "api": "healthy",
            "ollama": ollama_status,
            "vector_store": "ready",
        },
        "chroma_chunks_indexed": doc_count,
        "ollama_models": ollama_models,
        "environment": {
            "mode": "air-gapped / local",
        },
    }


@app.post("/api/upload")
@app.post("/upload")
async def upload_pdf(file: UploadFile = File(...)):
    """
    Accepts a PDF file upload, saves it to /temp, extracts text,
    splits into chunks with LangChain, and stores vectors into ChromaDB.
    """
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(
            status_code=400,
            detail="Invalid file format. Only PDF files are supported.",
        )

    # Sanitize and prepare destination file path in temp directory
    safe_filename = Path(file.filename).name
    temp_path = TEMP_DIR / safe_filename

    try:
        # Save uploaded bytes to local /temp directory
        with temp_path.open("wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        file_size = temp_path.stat().st_size
        if file_size == 0:
            raise HTTPException(status_code=400, detail="Uploaded PDF file is empty.")

        # 1. Parse and chunk the PDF
        chunks = load_and_chunk_pdf(temp_path, chunk_size=1000, chunk_overlap=200)

        # 2. Ingest into local ChromaDB
        chunk_ids = ingest_documents(chunks)

        return {
            "status": "success",
            "message": f"Successfully ingested {len(chunks)} chunks into local ChromaDB.",
            "filename": safe_filename,
            "file_size_bytes": file_size,
            "chunk_count": len(chunks),
            "chunk_ids": chunk_ids,
            "sample_preview": chunks[0].page_content[:200] if chunks else "",
        }

    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Ingestion failed: {str(exc)}")


@app.get("/api/documents")
def list_documents():
    """
    Lists distinct documents currently indexed in the local ChromaDB vector store.
    """
    try:
        vs = get_vector_store()
        col = vs._collection
        data = col.get()
        metadatas = data.get("metadatas", []) or []
        
        # Aggregate chunk counts by file_name
        doc_summary = {}
        for meta in metadatas:
            if not meta:
                continue
            name = meta.get("file_name") or Path(meta.get("source", "unknown")).name
            if name not in doc_summary:
                doc_summary[name] = {"file_name": name, "chunks": 0}
            doc_summary[name]["chunks"] += 1

        return {
            "total_chunks": col.count(),
            "documents": list(doc_summary.values()),
        }
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to query index: {str(exc)}")


@app.post("/api/search")
def search_knowledge_base(request: SearchRequest):
    """
    Performs similarity search against the local ChromaDB store.
    """
    try:
        results = similarity_search(request.query, k=request.k)
        return {
            "query": request.query,
            "match_count": len(results),
            "results": [
                SearchResult(content=r.page_content, metadata=r.metadata)
                for r in results
            ],
        }
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Search failed: {str(exc)}")


@app.post("/api/chat")
@app.post("/chat")
def chat_with_rag(request: ChatRequest):
    """
    Executes full air-gapped RAG pipeline: retrieves ChromaDB chunks
    and prompts local Ollama qwen2.5-coder:7b model.
    """
    try:
        result = query_rag(request.question, k=request.k)
        return {
            "status": "success",
            "question": result["question"],
            "answer": result["answer"],
            "sources": result["sources"],
        }
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"RAG query failed: {str(exc)}")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
