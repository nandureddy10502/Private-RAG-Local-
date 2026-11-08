"""
RAG Pipeline Module for Privacy-Preserving Local RAG.

Connects to local Ollama instance running 'qwen2.5-coder:7b' and ChromaDB
retriever to deliver air-gapped corporate semantic QA with strict context boundaries.
"""

from typing import List, Dict, Any, Optional
import os

from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser
from langchain_core.runnables import RunnablePassthrough
from langchain_core.documents import Document
from langchain_ollama import ChatOllama

from vector_store import similarity_search, get_vector_store

OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://127.0.0.1:11434")
DEFAULT_MODEL = os.getenv("OLLAMA_MODEL", "qwen2.5-coder:7b")

# Strict System Prompt specified in requirements
SYSTEM_PROMPT = (
    "You are a secure corporate assistant. Answer the user's question using ONLY "
    "the provided context. If the answer is not in the context, say you do not know."
)

PROMPT_TEMPLATE = """{system_prompt}

Context:
{context}

Question:
{question}

Answer:"""


def get_llm(
    model: str = DEFAULT_MODEL,
    temperature: float = 0.0,
    base_url: str = OLLAMA_BASE_URL,
) -> ChatOllama:
    """
    Initializes a local ChatOllama LLM instance.
    """
    return ChatOllama(
        model=model,
        temperature=temperature,
        base_url=base_url,
    )


def format_docs(docs: List[Document]) -> str:
    """
    Formats a list of retrieved Document objects into a clean, labeled context string.
    """
    if not docs:
        return "No relevant context found in corporate documents."

    formatted = []
    for i, doc in enumerate(docs, 1):
        source = doc.metadata.get("file_name") or doc.metadata.get("source", "Unknown Document")
        page = doc.metadata.get("page", 0)
        formatted.append(f"--- Document Source {i}: {source} (Page {page}) ---\n{doc.page_content.strip()}")

    return "\n\n".join(formatted)


def build_rag_chain(llm: Optional[ChatOllama] = None):
    """
    Builds and returns an LCEL RAG chain for question answering.
    """
    if llm is None:
        llm = get_llm()

    prompt = ChatPromptTemplate.from_template(PROMPT_TEMPLATE)

    chain = (
        {
            "context": lambda x: format_docs(x["documents"]),
            "question": lambda x: x["question"],
            "system_prompt": lambda _: SYSTEM_PROMPT,
        }
        | prompt
        | llm
        | StrOutputParser()
    )
    return chain


def query_rag(
    question: str,
    k: int = 4,
    llm: Optional[ChatOllama] = None,
) -> Dict[str, Any]:
    """
    Full retrieval-augmented generation pipeline execution.

    Args:
        question: The user query.
        k: Number of relevant document chunks to fetch from ChromaDB.
        llm: Optional pre-configured ChatOllama instance.

    Returns:
        Dictionary containing:
            - question: original query
            - answer: generated response from local Ollama model
            - sources: list of source metadata dictionaries
            - raw_documents: retrieved Document objects
    """
    # 1. Fetch relevant document chunks from ChromaDB
    retrieved_docs = similarity_search(question, k=k)

    # 2. Build RAG chain
    chain = build_rag_chain(llm=llm)

    # 3. Execute generation
    response = chain.invoke({
        "question": question,
        "documents": retrieved_docs,
    })

    # 4. Extract source information
    sources = []
    for doc in retrieved_docs:
        sources.append({
            "file_name": doc.metadata.get("file_name") or os.path.basename(doc.metadata.get("source", "")),
            "page": doc.metadata.get("page"),
            "chunk_index": doc.metadata.get("chunk_index"),
            "preview": doc.page_content[:150] + "...",
        })

    return {
        "question": question,
        "answer": response.strip(),
        "sources": sources,
        "raw_documents": retrieved_docs,
    }


# Convenience alias
ask_question = query_rag


if __name__ == "__main__":
    import sys

    test_query = (
        sys.argv[1]
        if len(sys.argv) > 1
        else "How does this project maintain 100% data privacy and avoid cloud APIs?"
    )

    print(f"Executing RAG pipeline with model '{DEFAULT_MODEL}'...")
    print(f"Question: {test_query}\n")

    result = query_rag(test_query, k=2)

    print("=" * 60)
    print("ANSWER:")
    print("=" * 60)
    print(result["answer"])
    print("\n" + "=" * 60)
    print("SOURCES USED:")
    print("=" * 60)
    for s in result["sources"]:
        print(f"- {s['file_name']} (Page {s['page']}, Chunk {s['chunk_index']})")
