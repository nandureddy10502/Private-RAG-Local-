"""Test verification for document_processor.py"""
from pathlib import Path
from document_processor import load_and_chunk_pdf

def create_sample_pdf(file_path: Path):
    paragraphs = [
        "Paragraph 1: Enterprise organizations face a critical dilemma: they possess vast repositories of internal knowledge (HR policies, financial reports, proprietary codebases) that could be leveraged by AI, but corporate security protocols strictly prohibit sending this sensitive data to external cloud APIs like OpenAI or Anthropic.",
        "Paragraph 2: This project delivers a completely local, air-gapped Retrieval-Augmented Generation (RAG) pipeline. By keeping vector embeddings and Large Language Model (LLM) inference strictly on the host machine, organizations gain semantic search capabilities with zero risk of data exfiltration.",
        "Paragraph 3: 100% Data Privacy: Ensure zero bytes of document data or user queries are transmitted over the public internet during inference. Ingest PDF and DOCX files, chunk them appropriately, and retrieve highly relevant context for user queries.",
        "Paragraph 4: Performant Local Inference: Run a quantized LLM (e.g., Llama 3 8B or Qwen) locally via Ollama with acceptable response latency (time-to-first-token < 3 seconds on standard GPU). Intuitive Interface: Provide a clean, web-based chat interface allowing non-technical users to upload documents and query them seamlessly.",
        "Paragraph 5: Modern decoupled architecture, ensuring heavy ML workloads are separated from the frontend client. Backend API orchestrates the RAG pipeline. ChromaDB is an open-source locally hosted vector store that saves document embeddings directly to the local disk."
    ]

    stream_lines = ["BT", "/F1 12 Tf", "50 750 Td"]
    for p in paragraphs:
        # Escape parenthesis
        clean_p = p.replace("(", "\\(").replace(")", "\\)")
        stream_lines.append(f"({clean_p}) Tj")
        stream_lines.append("T*")
        stream_lines.append("T*")
    stream_lines.append("ET")
    
    stream_content = "\n".join(stream_lines).encode("latin1")
    length = len(stream_content)

    pdf_bytes = (
        b"%PDF-1.4\n"
        b"1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n"
        b"2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n"
        b"3 0 obj << /Type /Page /Parent 2 0 R /Resources << /Font << /F1 4 0 R >> >> /MediaBox [0 0 612 792] /Contents 5 0 R >> endobj\n"
        b"4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj\n"
        + f"5 0 obj << /Length {length} >> stream\n".encode("latin1")
        + stream_content
        + b"\nendstream\nendobj\n"
        b"xref\n0 6\n"
        b"0000000000 65535 f \n"
        b"0000000009 00000 n \n"
        b"0000000058 00000 n \n"
        b"0000000115 00000 n \n"
        b"0000000244 00000 n \n"
        b"0000000325 00000 n \n"
        b"trailer << /Size 6 /Root 1 0 R >>\n"
        b"startxref\n500\n%%EOF\n"
    )

    file_path.write_bytes(pdf_bytes)


if __name__ == "__main__":
    sample_pdf = Path("test_document.pdf")
    create_sample_pdf(sample_pdf)
    print(f"Created sample PDF: {sample_pdf.resolve()} ({sample_pdf.stat().st_size} bytes)")

    # Test chunking with default chunk_size=1000 and overlap=200
    chunks_default = load_and_chunk_pdf(sample_pdf, chunk_size=1000, chunk_overlap=200)
    print(f"\n--- Default Settings (chunk_size=1000, overlap=200) ---")
    print(f"Generated {len(chunks_default)} chunks.")
    for idx, c in enumerate(chunks_default):
        print(f"Chunk {idx}: {len(c.page_content)} chars | Metadata: {c.metadata}")

    # Test with smaller chunk size to verify overlap mechanics
    chunks_small = load_and_chunk_pdf(sample_pdf, chunk_size=400, chunk_overlap=100)
    print(f"\n--- Smaller Chunks (chunk_size=400, overlap=100) ---")
    print(f"Generated {len(chunks_small)} chunks.")
    for idx, c in enumerate(chunks_small):
        print(f"Chunk {idx}: {len(c.page_content)} chars | Preview: {c.page_content[:60]}...")
