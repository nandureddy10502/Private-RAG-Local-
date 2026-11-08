"""
Document Ingestion & Processing Module for Privacy-Preserving Local RAG.

Provides PDF loading and recursive character text splitting using LangChain.
"""

from pathlib import Path
from typing import List, Union
import os

from langchain_core.documents import Document
from langchain_community.document_loaders import PyPDFLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter


def load_and_chunk_pdf(
    file_path: Union[str, Path],
    chunk_size: int = 1000,
    chunk_overlap: int = 200,
) -> List[Document]:
    """
    Loads a PDF file, extracts its text, and splits it into chunks.

    Args:
        file_path: Absolute or relative path to the PDF document.
        chunk_size: Maximum character length of each chunk (default 1000).
        chunk_overlap: Number of overlapping characters between adjacent chunks (default 200).

    Returns:
        List of LangChain Document chunks with content and metadata.

    Raises:
        FileNotFoundError: If the specified file does not exist.
        ValueError: If the file is not a PDF or is empty.
    """
    path = Path(file_path).resolve()
    if not path.is_file():
        raise FileNotFoundError(f"PDF file not found at: {path}")

    if path.suffix.lower() != ".pdf":
        raise ValueError(f"Expected a .pdf file, but got: {path.name}")

    # 1. Load the PDF document using LangChain's PyPDFLoader
    loader = PyPDFLoader(str(path))
    raw_documents = loader.load()

    if not raw_documents:
        raise ValueError(f"No readable text extracted from PDF: {path.name}")

    # 2. Configure RecursiveCharacterTextSplitter
    text_splitter = RecursiveCharacterTextSplitter(
        chunk_size=chunk_size,
        chunk_overlap=chunk_overlap,
        separators=["\n\n", "\n", " ", ""],
        length_function=len,
    )

    # 3. Split documents into chunks
    chunks = text_splitter.split_documents(raw_documents)

    # Enrich metadata with chunk identifiers
    for idx, chunk in enumerate(chunks):
        chunk.metadata["chunk_index"] = idx
        chunk.metadata["file_name"] = path.name

    return chunks


# Alias for flexible calling convention
process_pdf = load_and_chunk_pdf


if __name__ == "__main__":
    import sys

    if len(sys.argv) > 1:
        target_path = sys.argv[1]
        print(f"Testing ingestion for: {target_path}")
        chunks = load_and_chunk_pdf(target_path)
        print(f"Successfully generated {len(chunks)} chunks.")
        if chunks:
            print("\nSample chunk [0]:")
            print(f"Metadata: {chunks[0].metadata}")
            print(f"Content preview: {chunks[0].page_content[:200]}...")
    else:
        print("Usage: python document_processor.py <path_to_pdf>")

