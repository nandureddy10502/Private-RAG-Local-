# Privacy-Preserving Enterprise RAG

An air-gapped, zero-cost Retrieval-Augmented Generation (RAG) system for private enterprise documents.

---

## Architecture Overview

```
                      +-----------------------------+
                      |   React + Vite Frontend     |
                      |   (TypeScript, Tailwind CSS)|
                      |    http://localhost:5173    |
                      +--------------+--------------+
                                     |
                                REST API
                                     |
                      +--------------v--------------+
                      |       FastAPI Backend       |
                      |    http://localhost:8000    |
                      +-------+--------------+------+
                              |              |
                +-------------v---+      +---v-------------+
                | ChromaDB Store  |      | Ollama Server   |
                | (Local Vectors) |      | (Local LLM/Emb) |
                +-----------------+      +-----------------+
```

---

## Monorepo Structure

```
├── backend/
│   ├── .venv/               # Isolated Python virtual environment
│   ├── main.py              # FastAPI server with health check & Ollama discovery
│   └── requirements.txt     # Core ML/RAG dependencies (FastAPI, LangChain, ChromaDB, PyPDF2, sentence-transformers)
├── frontend/
│   ├── src/                 # React + TypeScript source code with Tailwind CSS
│   ├── package.json         # Node dependencies
│   ├── vite.config.ts       # Vite config with backend proxy
│   └── index.html           # HTML entry point
└── README.md
```

---

## Quickstart

### 1. Backend

```bash
cd backend
# Activate virtual environment
# Windows:
.venv\Scripts\activate
# Run backend server
python -m uvicorn main:app --reload --port 8000
```
- API Root: `http://localhost:8000/`
- Health Check: `http://localhost:8000/health`
- Interactive OpenAPI Docs: `http://localhost:8000/docs`

### 2. Frontend

```bash
cd frontend
npm run dev
```
- App UI: `http://localhost:5173/`

---

## Roadmap

- [x] **Phase 1: Project Scaffolding** (Monorepo, virtualenv, FastAPI health check, Vite React TypeScript & Tailwind CSS)
- [ ] **Phase 2: Document Ingestion Pipeline** (PDF parsing, recursive text splitting, ChromaDB vectorization)
- [ ] **Phase 3: Retrieval & Generation Core** (Top-K similarity retrieval, LangChain prompt template, local LLM generation)
- [ ] **Phase 4: Dual-Pane Interface & Polish** (Upload/delete pane, streaming chat UI, offline verification)

