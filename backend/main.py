from datetime import datetime
from pathlib import Path
from contextlib import asynccontextmanager
import os
import shutil
import threading
from typing import List, Optional

import httpx
from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from document_processor import load_and_chunk_pdf
from vector_store import (
    ingest_documents,
    similarity_search,
    get_vector_store,
    get_native_collection,
    get_embeddings,
)
from rag_chain import query_rag


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Preload HuggingFace embedding weights in a background thread so first search/upload is instant
    threading.Thread(target=get_embeddings, daemon=True).start()
    yield


app = FastAPI(
    title="Privacy-Preserving RAG Backend",
    description="Air-gapped local RAG API powered by FastAPI, LangChain, ChromaDB, and Ollama",
    version="1.0.0",
    lifespan=lifespan,
)

# Configure CORS middleware so React frontend can communicate with all endpoints
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


class ChatRequest(BaseModel):
    query: Optional[str] = None
    question: Optional[str] = None
    k: Optional[int] = 4

    def get_query_text(self) -> str:
        text = self.query or self.question
        if not text or not text.strip():
            raise ValueError("Query string cannot be empty.")
        return text.strip()


class SearchRequest(BaseModel):
    query: str
    k: Optional[int] = 4


@app.get("/")
def read_root():
    return {
        "name": "Privacy-Preserving RAG API",
        "status": "online",
        "version": "1.0.0",
        "timestamp": datetime.utcnow().isoformat(),
        "docs_url": "/docs",
        "endpoints": {
            "health": "GET /health",
            "upload_pdf": "POST /upload",
            "chat": "POST /chat",
            "list_documents": "GET /api/documents",
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

    try:
        col = get_native_collection()
        doc_count = col.count()
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


@app.post("/upload")
@app.post("/api/upload")
def upload_pdf(file: UploadFile = File(...)):
    """
    Accepts a PDF file upload, saves it temporarily in /temp,
    extracts & chunks it with document_processor.py, and embeds/stores
    it in vector_store.py (ChromaDB).
    """
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(
            status_code=400,
            detail="Invalid file format. Only PDF files are supported.",
        )

    safe_filename = Path(file.filename).name
    temp_path = TEMP_DIR / safe_filename

    try:
        # Save file temporarily to /temp
        with temp_path.open("wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        file_size = temp_path.stat().st_size
        if file_size == 0:
            raise HTTPException(status_code=400, detail="Uploaded PDF file is empty.")

        # 1. Extract text and split into chunks with document_processor.py
        chunks = load_and_chunk_pdf(temp_path, chunk_size=1000, chunk_overlap=200)

        # 2. Ingest into ChromaDB with vector_store.py
        chunk_ids = ingest_documents(chunks)

        return {
            "status": "success",
            "message": f"Successfully ingested {len(chunks)} chunks into ChromaDB.",
            "filename": safe_filename,
            "chunks_ingested": len(chunks),
            "chunk_count": len(chunks),
            "file_size_bytes": file_size,
            "chunk_ids": chunk_ids,
        }

    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Ingestion failed: {str(exc)}")
    finally:
        # File is kept in temp or can be cleaned up
        pass


@app.post("/chat")
@app.post("/api/chat")
def chat_endpoint(request: ChatRequest):
    """
    Accepts a JSON body with a 'query' string, passes it to rag_chain.py,
    and returns the LLM's response with source citations.
    """
    try:
        query_text = request.get_query_text()
    except ValueError as err:
        raise HTTPException(status_code=400, detail=str(err))

    try:
        # Query local RAG chain
        result = query_rag(query_text, k=request.k or 4)
        return {
            "status": "success",
            "query": query_text,
            "response": result["answer"],
            "answer": result["answer"],
            "sources": result["sources"],
        }
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"RAG query failed: {str(exc)}")


@app.get("/api/documents")
def list_documents():
    """
    Lists distinct documents currently indexed in ChromaDB.
    """
    try:
        col = get_native_collection()
        data = col.get()
        metadatas = data.get("metadatas", []) or []

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


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
