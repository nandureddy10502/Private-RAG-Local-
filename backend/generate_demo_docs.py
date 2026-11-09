"""
Script to generate realistic corporate demo PDFs and ingest them into ChromaDB.

Generates 3 enterprise documents:
1. Q3_2026_Financial_Summary.pdf
2. Global_Remote_Work_Policy.pdf
3. Project_Titan_Architecture_Specs.pdf

Saves them in backend/demo_docs/ and parses, chunks, and ingests them
into the local ChromaDB vector store.
"""

from pathlib import Path
import sys
import os

from fpdf import FPDF


class CorporateDocPDF(FPDF):
    def __init__(self, document_title: str, doc_classification: str = "CONFIDENTIAL // INTERNAL USE ONLY"):
        super().__init__()
        self.document_title = document_title
        self.doc_classification = doc_classification

    def header(self):
        self.set_font("Helvetica", "B", 8)
        self.set_text_color(110, 110, 110)
        self.cell(0, 6, self.doc_classification, border=0, align="R")
        self.ln(8)

    def footer(self):
        self.set_y(-15)
        self.set_font("Helvetica", "I", 8)
        self.set_text_color(130, 130, 130)
        self.cell(0, 10, f"Page {self.page_no()}/{{nb}} - Privacy-Preserving Enterprise Knowledge Base", align="C")


def build_pdf(filename: str, title: str, subtitle: str, sections: list[tuple[str, str]], output_dir: Path) -> Path:
    """Generates a structured corporate PDF document."""
    pdf = CorporateDocPDF(document_title=title)
    pdf.add_page()
    pdf.set_auto_page_break(auto=True, margin=20)

    # Document Header Title
    pdf.set_font("Helvetica", "B", 18)
    pdf.set_text_color(24, 28, 36)
    pdf.multi_cell(0, 9, title)
    pdf.ln(2)

    # Subtitle / Metadata
    pdf.set_font("Helvetica", "I", 10)
    pdf.set_text_color(80, 85, 95)
    pdf.multi_cell(0, 6, subtitle)
    pdf.ln(6)

    # Divider line
    pdf.set_draw_color(210, 215, 222)
    pdf.set_line_width(0.5)
    pdf.line(pdf.get_x(), pdf.get_y(), pdf.get_x() + 190, pdf.get_y())
    pdf.ln(6)

    # Sections / Paragraphs
    for heading, text in sections:
        # Section Heading
        pdf.set_font("Helvetica", "B", 12)
        pdf.set_text_color(30, 35, 45)
        pdf.multi_cell(0, 7, heading)
        pdf.ln(1)

        # Section Body
        pdf.set_font("Helvetica", "", 10)
        pdf.set_text_color(50, 55, 65)
        pdf.multi_cell(0, 5.5, text)
        pdf.ln(5)

    output_path = output_dir / filename
    pdf.output(str(output_path))
    return output_path


def generate_all_demo_documents(output_dir: Path) -> list[Path]:
    output_dir.mkdir(parents=True, exist_ok=True)
    generated_files = []

    # =========================================================================
    # Document 1: Q3_2026_Financial_Summary.pdf
    # =========================================================================
    doc1_sections = [
        (
            "1. Executive Financial Summary and GAAP Revenue Growth",
            "In the third fiscal quarter of 2026, the company generated consolidated GAAP revenue of "
            "$142.8 million, representing a 24.5% year-over-year expansion compared to $114.7 million in Q3 2025. "
            "Non-GAAP Gross Margin expanded by 180 basis points to reach 78.4%, driven by operational optimizations in on-premises "
            "compute cluster allocation and favorable contract negotiations with domestic hardware vendors. "
            "GAAP operating income reached $31.2 million, translating to an operating margin of 21.8%, compared to $22.1 million "
            "in the prior-year period. Net income for the quarter reached $26.4 million, with diluted earnings per share (EPS) of $0.58."
        ),
        (
            "2. Subscription ARR and Customer Retention Metrics",
            "Annual Recurring Revenue (ARR) across our core software portfolio closed the quarter at $349.5 million, "
            "reflecting an accelerated annualized trajectory. Enterprise tier subscription ARR accounted for $285.4 million "
            "(+31% YoY), characterized by an expansion in average contract value (ACV) to $142,000 across Fortune 500 accounts. "
            "Net Revenue Retention (NRR) remained robust at 124%, underscoring strong cross-sell velocity for on-prem semantic "
            "search modules and air-gapped indexing clusters. The commercial and SMB segment maintained $64.1 million in ARR, "
            "with gross monthly churn dropping to a record low of 1.1%."
        ),
        (
            "3. Geographic Revenue Distribution and International Sovereign Deployments",
            "From a regional perspective, the Americas geographic theater generated $88.5 million, accounting for 62% of consolidated "
            "top-line revenue and demonstrating 22% year-over-year growth. The Europe, Middle East, and Africa (EMEA) segment delivered "
            "$37.1 million, marking a notable 28% year-over-year surge propelled by heightened demand for GDPR-compliant and NIS2-certified "
            "air-gapped semantic document processing installations in Frankfurt and Zurich. The Asia-Pacific (APAC) theater contributed "
            "$17.2 million (+26% YoY), driven by sovereign deployment mandates in Singapore, Tokyo, and Sydney."
        ),
        (
            "4. Operating Expenditures, R&D Capitalization, and Personnel Allocation",
            "Total operating expenses for Q3 2026 stood at $80.8 million, aligned with our disciplined capital allocation framework. "
            "Research and Development (R&D) expenditures totaled $41.3 million, or 28.9% of total revenue, reflecting aggressive "
            "investments in quantized tensor compilation, low-latency HNSW vector indices, and specialized parameter optimization "
            "for local corporate inference engines. Sales and Marketing (S&M) outlays were held flat at $27.4 million (19.2% of revenue), "
            "while General and Administrative (G&A) overhead totaled $12.1 million (8.5% of revenue)."
        ),
        (
            "5. Balance Sheet, Capital Expenditures, and Free Cash Flow Generation",
            "Operating cash flow for the quarter was $48.5 million. Capital expenditures (CapEx) totaled $12.1 million, dedicated "
            "principally to the acquisition of on-premises NVIDIA H100 and Blackwell B200 accelerated compute blades for internal "
            "model evaluation and automated integration benchmarking. Free Cash Flow (FCF) reached $36.4 million, representing a 25.5% "
            "FCF margin. The company concluded the quarter with $418.5 million in cash, cash equivalents, and short-term liquid "
            "treasury bills, maintaining zero long-term debt and providing substantial balance-sheet flexibility."
        ),
        (
            "6. Fiscal Guidance and Q4 2026 Strategic Targets",
            "For the fourth quarter of fiscal 2026, management projects GAAP revenue between $154.0 million and $158.0 million, "
            "representing projected full-year FY2026 revenue of $562.0 million to $566.0 million (+25.8% to +26.7% YoY). Full-year "
            "non-GAAP operating margin is guided at 22.0% to 23.5%. The company remains committed to funding domestic compute expansion "
            "purely through generated operational cash flows while targeting full air-gapped federal compliance certifications by Q1 2027."
        ),
    ]

    doc1_path = build_pdf(
        filename="Q3_2026_Financial_Summary.pdf",
        title="Q3 2026 Financial Results & Operational Summary",
        subtitle="Fiscal Year 2026 Third Quarter Review - Published November 2026 | Financial Planning & Analysis",
        sections=doc1_sections,
        output_dir=output_dir,
    )
    generated_files.append(doc1_path)

    # =========================================================================
    # Document 2: Global_Remote_Work_Policy.pdf
    # =========================================================================
    doc2_sections = [
        (
            "1. Policy Scope and Asynchronous Operating Philosophy",
            "This Global Remote Work Policy establishes operational mandates for all full-time employees, contractors, and "
            "affiliates globally. The organization operates under a distributed, asynchronous-first communication paradigm where "
            "all substantive engineering decisions, architectural proposals, and policy revisions must be memorialized in verified "
            "internal technical documentation rather than transient synchronous meetings. This policy ensures operational continuity, "
            "equitable geographic participation, and uncompromising compliance with enterprise privacy standards."
        ),
        (
            "2. Core Working Hours and Cross-Functional Availability",
            "To facilitate critical cross-regional collaboration, all remote personnel are expected to maintain availability "
            "during standard core hours between 10:00 UTC and 15:00 UTC, Monday through Thursday. During core windows, personnel "
            "must be reachable via approved corporate instant messaging channels and respond to operational escalations within "
            "60 minutes. Outside core hours, employees maintain full autonomy over their working schedules, provided deliverables "
            "and sprint commitments meet established quality thresholds."
        ),
        (
            "3. Home Office Equipment Stipends and Ergonomic Allowances",
            "The company provides all newly onboarded remote employees with a one-time, non-taxable Home Office Setup Stipend "
            "of $1,200 USD (or local currency equivalent). This stipend covers designated ergonomic equipment, including sit-stand desks, "
            "ergonomic task chairs, and external peripherals. Furthermore, personnel receive a recurring monthly broadband connectivity "
            "allowance of $75 USD, disbursed automatically on the final payroll cycle of each calendar month. Corporate laptops are "
            "subject to a mandatory 24-month hardware lifecycle replacement program."
        ),
        (
            "4. Endpoint Cybersecurity, FIDO2 MFA, and Full Disk Encryption",
            "All company-owned workstations must maintain full-disk hardware encryption at all times (BitLocker with XTS-AES-256 "
            "on Windows; FileVault 2 on macOS). Personal computers (BYOD) are strictly prohibited from storing or processing company "
            "data. Multi-Factor Authentication (MFA) requires physical FIDO2 hardware tokens (YubiKey 5 NFC Series); SMS and email "
            "verification methods are deprecated and blocked. Inactivity locks must trigger after 5 minutes of idle time with biometric "
            "or hardware-key unlock enforced."
        ),
        (
            "5. Data Classification Tiers and Air-Gapped Storage Rules",
            "Corporate information is classified under four distinct tiers: Public, Internal, Confidential, and Restricted. "
            "Restricted data (including client source code, unredacted financial audits, and cryptographic private keys) may only "
            "be processed within designated local air-gapped hardware enclaves. Under no circumstances may employees copy, sync, or "
            "backup company files to commercial third-party cloud storage platforms (such as personal Dropbox, Google Drive, or iCloud). "
            "Local indexing engines must run on isolated localhost ports without external telemetry."
        ),
        (
            "6. Cross-Border Relocation and 90-Day International Working Thresholds",
            "Employees are authorized to work from locations outside their primary tax residency jurisdiction for a cumulative "
            "maximum of 90 calendar days per rolling 12-month period, subject to prior manager notification and legal compliance clearance. "
            "Working from countries subject to comprehensive international sanctions or export restrictions (OFAC Tier 3 jurisdictions) "
            "is strictly prohibited. Any planned temporary international relocation exceeding 30 consecutive days requires written "
            "approval from People Operations and Global Tax Compliance."
        ),
        (
            "7. Security Incident Reporting and Emergency Wipe Protocols",
            "In the event of a lost, stolen, or compromised corporate device, the employee must contact the 24/7 Security Operations "
            "Center (SOC) via emergency phone (+1-800-555-0199) or email (soc-urgent@enterprise.internal) within 60 minutes of discovery. "
            "Upon confirmation of an unaccounted endpoint, the SOC will initiate an immediate cryptographic remote wipe command "
            "and revoke all associated access credentials, hardware tokens, and OAuth refresh sessions."
        ),
    ]

    doc2_path = build_pdf(
        filename="Global_Remote_Work_Policy.pdf",
        title="Global Remote Work & Distributed Security Policy",
        subtitle="Human Resources & InfoSec Governance Directive - Ref: HR-SEC-2026-v4.2 | Effective Q4 2026",
        sections=doc2_sections,
        output_dir=output_dir,
    )
    generated_files.append(doc2_path)

    # =========================================================================
    # Document 3: Project_Titan_Architecture_Specs.pdf
    # =========================================================================
    doc3_sections = [
        (
            "1. Project Titan Overview and High-Level Topology",
            "Project Titan represents the next-generation, air-gapped enterprise data plane engineered for high-throughput "
            "semantic retrieval, vector embedding orchestration, and autonomous context synthesis across distributed on-premises "
            "infrastructure. The architecture is engineered to operate in sovereign environments devoid of public internet egress. "
            "The cluster topology comprises an event ingestion fabric, an asynchronous text chunking pipeline, a persistent HNSW "
            "vector indexing core, and a local quantized large language model (LLM) inference cluster running on dedicated hardware."
        ),
        (
            "2. Ingestion Fabric and Apache Kafka Event Streaming",
            "Document ingestion events are mediated through a 5-broker Apache Kafka cluster operating with KRaft consensus "
            "(removing ZooKeeper dependencies). Ingestion payloads adhere to Apache Avro schemas registered within an internal "
            "Confluent-compatible Schema Registry. Topics are partitioned by document_hash and tenant_id with an established replication "
            "factor of 3 and min.insync.replicas set to 2. Message buffers are calibrated to support sustained throughput spikes of up to "
            "25,000 document modification events per second with zero payload degradation."
        ),
        (
            "3. Persistent Vector Storage and ChromaDB Index Configuration",
            "The vector indexing tier utilizes a clustered ChromaDB persistent backend configured with Hierarchical Navigable Small "
            "World (HNSW) space indices. The distance metric is fixed to Cosine Similarity. Index construction parameters are calibrated "
            "at M=32 (bidirectional link density) and efConstruction=200, achieving a balance between index construction time and high-recall "
            "graph quality. Search-time exploration is parameterized at efSearch=128, guaranteeing 99.4% recall on top-k=4 nearest neighbor "
            "queries across a corpus of 10 million pre-embedded chunks."
        ),
        (
            "4. Relational Metadata, Audit Logging, and TimescaleDB",
            "Document metadata, access control lists (ACLs), user session tokens, and chunk lineage are persisted in a high-availability "
            "PostgreSQL 16 cluster equipped with TimescaleDB extensions for query telemetry. Primary and replica nodes replicate "
            "synchronously via streaming physical replication with automatic failover managed by Patroni and etcd v3.5. Audit logs "
            "record every retrieval request, document chunk hash, and model response timestamp for automated SOC2 compliance auditing."
        ),
        (
            "5. Zero-Trust Service Mesh and Mutual TLS (mTLS)",
            "All inter-service microservice communications transit an internal Istio Service Mesh (version 1.22) enforcing strict "
            "mutual TLS (mTLS) with cryptographically validated SPIFFE/SPIRE x509 workload identities. Direct IP-to-IP ingress is "
            "blocked by eBPF-driven Cilium network policies. Microservices expose internal gRPC APIs with Protocol Buffers v3, "
            "eliminating JSON parsing overhead and reducing inter-node serialization latency to under 1.2 milliseconds."
        ),
        (
            "6. Local Model Inference Engine and Hardware Pinned Accelerators",
            "Inference services execute on dedicated compute nodes hosting NVIDIA A100 (80GB SXM4) or RTX 4090 accelerators. "
            "The primary text generation engine runs local Ollama with quantized 'qwen2.5-coder:7b' (Q4_K_M GGUF format), "
            "delivering generation speeds of 72 tokens per second at 32k context lengths. Sentence embedding generation utilizes "
            "'all-MiniLM-L6-v2' (384-dimensional dense vectors) executed locally on CPU via ONNX Runtime with AVX-512 vectorization."
        ),
        (
            "7. Autoscaling Criteria, Health Checks, and Latency SLAs",
            "Workload autoscaling is governed by Kubernetes Horizontal Pod Autoscaler (HPA) using custom Prometheus metrics. "
            "Scale-out triggers when average CPU exceeds 70% or queue depth exceeds 250 pending chunks per worker for 30 consecutive "
            "seconds. The architectural Service Level Agreement (SLA) mandates: p50 end-to-end query latency < 95ms, p95 < 180ms, "
            "and p99 < 350ms, with 99.99% service availability across internal enterprise networks."
        ),
    ]

    doc3_path = build_pdf(
        filename="Project_Titan_Architecture_Specs.pdf",
        title="Project Titan - Distributed Architecture & Systems Specification",
        subtitle="System Engineering Architecture Review - Document ID: SPEC-TITAN-2026-REV3 | Cloud Infrastructure Group",
        sections=doc3_sections,
        output_dir=output_dir,
    )
    generated_files.append(doc3_path)

    return generated_files


def ingest_demo_documents(pdf_paths: list[Path]):
    """Parses, chunks, and ingests generated demo PDFs into ChromaDB."""
    print("\n" + "=" * 70)
    print("INGESTING DEMO DOCUMENTS INTO CHROMADB")
    print("=" * 70)

    # Automatically import document_processor and vector_store
    from document_processor import load_and_chunk_pdf
    from vector_store import ingest_documents, get_native_collection

    total_chunks = 0

    for path in pdf_paths:
        print(f"\nProcessing: {path.name} ({path.stat().st_size} bytes)")
        
        # 1. Parse and chunk
        chunks = load_and_chunk_pdf(path, chunk_size=1000, chunk_overlap=200)
        print(f"-> Generated {len(chunks)} text chunks (size=1000, overlap=200)")

        # 2. Ingest into ChromaDB
        chunk_ids = ingest_documents(chunks)
        print(f"-> Ingested {len(chunk_ids)} chunks into ChromaDB.")
        total_chunks += len(chunks)

    # 3. Verify collection statistics
    col = get_native_collection()
    print("\n" + "=" * 70)
    print(f"SUCCESS: Ingested {total_chunks} total chunks across {len(pdf_paths)} documents.")
    print(f"ChromaDB total indexed chunks now: {col.count()}")
    print("=" * 70)


if __name__ == "__main__":
    current_dir = Path(__file__).parent
    demo_docs_dir = current_dir / "demo_docs"

    print("Generating 3 corporate demo PDF documents in:", demo_docs_dir)
    generated_pdfs = generate_all_demo_documents(demo_docs_dir)

    print("\nGenerated PDFs:")
    for p in generated_pdfs:
        print(f"  - {p.name} [{p.stat().st_size} bytes]")

    # Ingest into ChromaDB
    ingest_demo_documents(generated_pdfs)
