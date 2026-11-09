import React, { useState, useEffect, useRef, useCallback } from 'react'
import {
  ShieldCheck,
  UploadCloud,
  FileText,
  Send,
  Bot,
  User,
  Loader2,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Trash2,
  Sparkles,
  BookOpen,
  Database,
  ChevronDown,
  ChevronUp,
  Cpu,
  RefreshCw,
  FolderOpen,
  X,
  RotateCcw,
  WifiOff,
  Copy,
  Check,
  Server
} from 'lucide-react'

interface SourceCitation {
  file_name: string
  page: number
  chunk_index: number
  preview?: string
}

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: string
  sources?: SourceCitation[]
  error?: boolean
  queryAttempted?: string
}

interface UploadResponse {
  status: string
  message: string
  filename: string
  chunks_ingested: number
  chunk_count?: number
  file_size_bytes?: number
}

interface DocumentSummary {
  file_name: string
  chunks: number
}

interface ChatApiResponse {
  status: string
  query: string
  response: string
  answer?: string
  sources: SourceCitation[]
}

interface ErrorBannerState {
  title: string
  message: string
  type: 'timeout' | 'network' | 'server'
  retryQuery?: string
}

const LLM_TIMEOUT_MS = 60000 // 60 seconds timeout for local 7B inference

export function App() {
  // Sidebar & Upload states
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [isDragging, setIsDragging] = useState<boolean>(false)
  const [isUploading, setIsUploading] = useState<boolean>(false)
  const [uploadFeedback, setUploadFeedback] = useState<{
    type: 'success' | 'error'
    message: string
    chunkCount?: number
  } | null>(null)
  const [documents, setDocuments] = useState<DocumentSummary[]>([])
  const [isRefreshingDocs, setIsRefreshingDocs] = useState<boolean>(false)
  const [backendOnline, setBackendOnline] = useState<boolean | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Chat states
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome-message',
      role: 'assistant',
      content:
        'Welcome to the Privacy-Preserving Enterprise RAG Assistant. Upload your internal documents in the sidebar, and I will answer your questions strictly using verified local context. All vectors and inferences remain 100% on your machine.',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ])
  const [inputQuery, setInputQuery] = useState<string>('')
  const [isChatLoading, setIsChatLoading] = useState<boolean>(false)
  const [thinkingSeconds, setThinkingSeconds] = useState<number>(0)
  const [expandedSources, setExpandedSources] = useState<Record<string, boolean>>({})
  const [copiedSnippetId, setCopiedSnippetId] = useState<string | null>(null)
  const [activeError, setActiveError] = useState<ErrorBannerState | null>(null)

  // DOM Refs for auto-scroll
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const chatEndRef = useRef<HTMLDivElement>(null)

  // Robust auto-scroll to absolute bottom
  const scrollToBottom = useCallback((smooth = true) => {
    // requestAnimationFrame ensures layout calculations (like expanded citations) have rendered
    requestAnimationFrame(() => {
      setTimeout(() => {
        if (chatEndRef.current) {
          chatEndRef.current.scrollIntoView({
            behavior: smooth ? 'smooth' : 'auto',
            block: 'end',
          })
        }
        if (messagesContainerRef.current) {
          messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight
        }
      }, 30)
    })
  }, [])

  // Auto-scroll when messages, thinking state, or expanded sources change
  useEffect(() => {
    scrollToBottom(true)
  }, [messages, isChatLoading, expandedSources, scrollToBottom])

  // Timer for thinking indicator
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null
    if (isChatLoading) {
      setThinkingSeconds(0)
      interval = setInterval(() => {
        setThinkingSeconds((prev) => prev + 1)
      }, 1000)
    } else {
      setThinkingSeconds(0)
    }
    return () => {
      if (interval) clearInterval(interval)
    }
  }, [isChatLoading])

  // Health check & Document listing
  const checkHealthAndDocs = useCallback(async () => {
    setIsRefreshingDocs(true)
    try {
      const healthRes = await fetch('/health', { signal: AbortSignal.timeout(3000) })
      if (healthRes.ok) {
        setBackendOnline(true)
        if (activeError?.type === 'network') {
          setActiveError(null)
        }
      } else {
        setBackendOnline(false)
      }
    } catch {
      setBackendOnline(false)
    }

    try {
      const res = await fetch('/api/documents', { signal: AbortSignal.timeout(3000) })
      if (res.ok) {
        const data = await res.json()
        setDocuments(data.documents || [])
      }
    } catch {
      // Ignored if backend starting
    } finally {
      setIsRefreshingDocs(false)
    }
  }, [activeError])

  useEffect(() => {
    checkHealthAndDocs()
  }, [checkHealthAndDocs])

  // Drag and Drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0]
      validateAndSetFile(file)
    }
  }

  const validateAndSetFile = (file: File) => {
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      setUploadFeedback({
        type: 'error',
        message: 'Unsupported format. Please select a valid PDF file (.pdf).',
      })
      setSelectedFile(null)
      return
    }
    setSelectedFile(file)
    setUploadFeedback(null)
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      validateAndSetFile(e.target.files[0])
    }
  }

  // Upload handler with robust error catching
  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedFile) return

    setIsUploading(true)
    setUploadFeedback(null)

    const formData = new FormData()
    formData.append('file', selectedFile)

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 90000) // 90s for large PDF chunking

    try {
      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        const errData = await response.json().catch(() => null)
        throw new Error(errData?.detail || `Upload failed with status code ${response.status}`)
      }

      const data: UploadResponse = await response.json()
      setUploadFeedback({
        type: 'success',
        message: data.message || `Successfully ingested ${data.chunks_ingested} chunks!`,
        chunkCount: data.chunks_ingested,
      })

      setSelectedFile(null)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
      checkHealthAndDocs()
    } catch (err: unknown) {
      let msg = 'Failed to upload document.'
      if (err instanceof Error) {
        if (err.name === 'AbortError') {
          msg = 'Upload processing timed out. The document may be very large or dense.'
        } else {
          msg = err.message
        }
      }
      setUploadFeedback({
        type: 'error',
        message: msg,
      })
    } finally {
      setIsUploading(false)
    }
  }

  // Chat message submission with LLM timeout & network error handling
  const executeChatQuery = async (queryText: string) => {
    const trimmed = queryText.trim()
    if (!trimmed || isChatLoading) return

    setActiveError(null)

    const userMessageId = `user-${Date.now()}`
    const userTimestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

    const updatedMessages: ChatMessage[] = [
      ...messages,
      {
        id: userMessageId,
        role: 'user',
        content: trimmed,
        timestamp: userTimestamp,
      },
    ]

    setMessages(updatedMessages)
    setInputQuery('')
    setIsChatLoading(true)

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS)

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query: trimmed }),
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        const errData = await response.json().catch(() => null)
        const errMsg = errData?.detail || `Server returned HTTP ${response.status}: ${response.statusText}`
        throw new Error(errMsg)
      }

      const data: ChatApiResponse = await response.json()
      const assistantMessageId = `assistant-${Date.now()}`
      const assistantTimestamp = new Date().toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      })

      setBackendOnline(true)
      setMessages([
        ...updatedMessages,
        {
          id: assistantMessageId,
          role: 'assistant',
          content: data.response || data.answer || 'No response generated from the model.',
          timestamp: assistantTimestamp,
          sources: data.sources || [],
        },
      ])
    } catch (err: unknown) {
      clearTimeout(timeoutId)
      let errorType: 'timeout' | 'network' | 'server' = 'server'
      let errorTitle = 'LLM Generation Error'
      let errorMessage = 'An unexpected error occurred while communicating with the assistant.'

      if (err instanceof Error) {
        if (err.name === 'AbortError') {
          errorType = 'timeout'
          errorTitle = 'LLM Inference Timeout'
          errorMessage = `Local Ollama model ('qwen2.5-coder:7b') exceeded the ${LLM_TIMEOUT_MS / 1000}s limit. The model may be initializing or system resources may be constrained.`
        } else if (
          err.message.includes('Failed to fetch') ||
          err.message.includes('NetworkError') ||
          err.message.includes('Load failed')
        ) {
          errorType = 'network'
          errorTitle = 'Backend Unreachable'
          errorMessage =
            'Unable to connect to the FastAPI backend at http://127.0.0.1:8000. Ensure the server process is running.'
          setBackendOnline(false)
        } else {
          errorMessage = err.message
        }
      }

      setActiveError({
        title: errorTitle,
        message: errorMessage,
        type: errorType,
        retryQuery: trimmed,
      })

      const errorMsgId = `assistant-error-${Date.now()}`
      setMessages([
        ...updatedMessages,
        {
          id: errorMsgId,
          role: 'assistant',
          content: `⚠️ ${errorTitle}: ${errorMessage}`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          error: true,
          queryAttempted: trimmed,
        },
      ])
    } finally {
      setIsChatLoading(false)
    }
  }

  const handleSendMessage = (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    executeChatQuery(inputQuery)
  }

  const toggleSources = (msgId: string) => {
    setExpandedSources((prev) => {
      const next = { ...prev, [msgId]: !prev[msgId] }
      // Trigger scroll after state update
      setTimeout(() => scrollToBottom(true), 50)
      return next
    })
  }

  const handleCopySnippet = (snippet: string, snippetId: string) => {
    navigator.clipboard.writeText(snippet)
    setCopiedSnippetId(snippetId)
    setTimeout(() => setCopiedSnippetId(null), 2000)
  }

  const handleClearChat = () => {
    setActiveError(null)
    setMessages([
      {
        id: 'reset-welcome',
        role: 'assistant',
        content:
          'Chat history reset. How can I assist you with your ingested enterprise documents?',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      },
    ])
  }

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return ''
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  // Quick suggestion chips
  const suggestedPrompts = [
    'What is the primary objective of this project?',
    'How does local air-gapped security work?',
    'What chunk size and overlap are used for ingestion?',
  ]

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-950 text-slate-100 font-sans antialiased selection:bg-cyan-500/30 selection:text-cyan-200">
      {/* ========================================================= */}
      {/* SIDEBAR: Document Upload & Knowledge Base Management      */}
      {/* ========================================================= */}
      <aside className="w-80 sm:w-96 flex-shrink-0 flex flex-col border-r border-slate-800/80 bg-slate-900/70 backdrop-blur-xl transition-all duration-300 select-none">
        {/* Brand Header */}
        <div className="p-5 border-b border-slate-800/80 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20 flex-shrink-0 ring-1 ring-white/20">
              <ShieldCheck className="h-5 w-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-bold text-sm tracking-tight text-white">Privacy RAG</h1>
                <span className="text-[10px] px-2 py-0.5 rounded-full font-mono font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 flex items-center gap-1 shadow-sm">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                  Air-Gapped
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">Enterprise Semantic Search</p>
            </div>
          </div>

          <div
            className={`h-2.5 w-2.5 rounded-full ring-4 ${
              backendOnline === true
                ? 'bg-emerald-400 ring-emerald-500/20'
                : backendOnline === false
                ? 'bg-rose-500 ring-rose-500/20'
                : 'bg-amber-400 ring-amber-500/20'
            }`}
            title={
              backendOnline === true
                ? 'Backend connected (:8000)'
                : backendOnline === false
                ? 'Backend unreachable'
                : 'Checking backend...'
            }
          />
        </div>

        {/* Scrollable Ingestion Area */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {/* Upload Form Card */}
          <div className="rounded-2xl border border-slate-800/90 bg-slate-900/90 p-4 shadow-sm transition-all duration-200">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold text-slate-200 flex items-center gap-2">
                <UploadCloud className="h-4 w-4 text-cyan-400" />
                Upload PDF Document
              </span>
              <span className="text-[10px] font-mono text-slate-500">Max 50MB</span>
            </div>

            <form onSubmit={handleUpload} className="space-y-3">
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`relative border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-all duration-200 ${
                  isDragging
                    ? 'border-cyan-400 bg-cyan-950/40 scale-[1.01]'
                    : selectedFile
                    ? 'border-cyan-500/60 bg-cyan-950/20 shadow-inner'
                    : 'border-slate-700/80 hover:border-slate-600 bg-slate-950/40 hover:bg-slate-950/60'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/pdf,.pdf"
                  onChange={handleFileChange}
                  className="hidden"
                  disabled={isUploading}
                />
                <div className="flex flex-col items-center justify-center gap-1.5">
                  <div
                    className={`p-2.5 rounded-full transition-transform duration-200 ${
                      selectedFile ? 'bg-cyan-500/20 text-cyan-300 scale-105' : 'bg-slate-800 text-slate-300'
                    }`}
                  >
                    <FileText className="h-5 w-5 text-cyan-400" />
                  </div>
                  {selectedFile ? (
                    <div className="max-w-full px-2">
                      <p className="text-xs font-medium text-cyan-200 truncate">
                        {selectedFile.name}
                      </p>
                      <p className="text-[11px] text-slate-400 font-mono mt-0.5">
                        {formatFileSize(selectedFile.size)}
                      </p>
                    </div>
                  ) : (
                    <>
                      <p className="text-xs text-slate-200 font-medium">
                        Click or drag PDF here
                      </p>
                      <p className="text-[11px] text-slate-500">Indexed into local ChromaDB</p>
                    </>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2">
                <button
                  type="submit"
                  disabled={!selectedFile || isUploading}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold text-white bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 active:scale-[0.98] transition-all duration-200 disabled:opacity-40 disabled:pointer-events-none shadow-md shadow-cyan-950/40 cursor-pointer"
                >
                  {isUploading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin text-white" />
                      <span>Ingesting & Embedding...</span>
                    </>
                  ) : (
                    <>
                      <UploadCloud className="h-4 w-4" />
                      <span>Upload & Ingest</span>
                    </>
                  )}
                </button>

                {selectedFile && !isUploading && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      setSelectedFile(null)
                      if (fileInputRef.current) fileInputRef.current.value = ''
                    }}
                    className="p-2.5 rounded-xl text-slate-400 hover:text-slate-200 bg-slate-800 hover:bg-slate-700 transition-colors"
                    title="Remove selected file"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            </form>

            {/* Upload Feedback Message */}
            {uploadFeedback && (
              <div
                className={`mt-3 p-3 rounded-xl text-xs border flex items-start gap-2.5 animate-fadeIn transition-all duration-200 ${
                  uploadFeedback.type === 'success'
                    ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-300'
                    : 'bg-rose-950/40 border-rose-500/30 text-rose-300'
                }`}
              >
                {uploadFeedback.type === 'success' ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="h-4 w-4 text-rose-400 flex-shrink-0 mt-0.5" />
                )}
                <div className="flex-1 leading-relaxed">
                  <p className="font-medium">{uploadFeedback.message}</p>
                  {uploadFeedback.chunkCount !== undefined && (
                    <p className="text-[11px] text-emerald-400/80 mt-0.5 font-mono">
                      Persistent in local ChromaDB store.
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Ingested Documents List */}
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-400 px-1">
              <span className="flex items-center gap-1.5 uppercase tracking-wider text-[11px]">
                <Database className="h-3.5 w-3.5 text-cyan-400" />
                Knowledge Base ({documents.length})
              </span>
              <button
                onClick={checkHealthAndDocs}
                disabled={isRefreshingDocs}
                className="text-slate-400 hover:text-slate-200 transition-colors duration-150 p-1 rounded hover:bg-slate-800 cursor-pointer"
                title="Refresh knowledge base"
              >
                <RefreshCw className={`h-3 w-3 ${isRefreshingDocs ? 'animate-spin' : ''}`} />
              </button>
            </div>

            {documents.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-800/80 p-5 text-center bg-slate-950/30">
                <FolderOpen className="h-6 w-6 text-slate-600 mx-auto mb-1.5" />
                <p className="text-xs text-slate-400 font-medium">No documents ingested yet</p>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Upload a PDF above to enable semantic search
                </p>
              </div>
            ) : (
              <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                {documents.map((doc, idx) => (
                  <div
                    key={`${doc.file_name}-${idx}`}
                    className="flex items-center justify-between p-2.5 rounded-xl border border-slate-800/80 bg-slate-900/50 hover:bg-slate-900 hover:border-slate-700/80 transition-all duration-200 group"
                  >
                    <div className="flex items-center gap-2.5 overflow-hidden">
                      <div className="h-7 w-7 rounded-lg bg-cyan-950/60 border border-cyan-800/40 flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform">
                        <FileText className="h-3.5 w-3.5 text-cyan-400" />
                      </div>
                      <span
                        className="text-xs text-slate-200 truncate font-medium max-w-[170px]"
                        title={doc.file_name}
                      >
                        {doc.file_name}
                      </span>
                    </div>
                    <span className="text-[10px] font-mono font-medium px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700/60 flex-shrink-0">
                      {doc.chunks} {doc.chunks === 1 ? 'chunk' : 'chunks'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Local Architecture Info Footer */}
        <div className="p-4 border-t border-slate-800/80 bg-slate-950/80 text-[11px] text-slate-400 space-y-2">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <Cpu className="h-3.5 w-3.5 text-purple-400" />
              Ollama Model
            </span>
            <span className="text-emerald-400 font-mono font-medium">qwen2.5-coder:7b</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <Database className="h-3.5 w-3.5 text-cyan-400" />
              Embeddings
            </span>
            <span className="text-slate-300 font-mono">all-MiniLM-L6-v2</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <Server className="h-3.5 w-3.5 text-blue-400" />
              Local Endpoint
            </span>
            <span className="text-slate-400 font-mono">:8000 (Air-Gapped)</span>
          </div>
        </div>
      </aside>

      {/* ========================================================= */}
      {/* MAIN CHAT AREA                                            */}
      {/* ========================================================= */}
      <main className="flex-1 flex flex-col h-full bg-slate-950 relative overflow-hidden">
        {/* Chat Header */}
        <header className="h-16 border-b border-slate-800/80 px-6 flex items-center justify-between bg-slate-900/50 backdrop-blur-md flex-shrink-0 z-10">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-tr from-cyan-600 to-blue-600 flex items-center justify-center shadow-md shadow-cyan-900/30 ring-1 ring-white/10">
              <Bot className="h-5 w-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-white">Enterprise AI Assistant</h2>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-950/60 border border-cyan-800/50 text-cyan-300">
                  Strict Context Mode
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                Queries are strictly grounded in your ChromaDB document chunks
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleClearChat}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800/80 active:scale-[0.98] transition-all duration-150 border border-slate-800 cursor-pointer shadow-sm"
              title="Clear message history"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>Clear Chat</span>
            </button>
          </div>
        </header>

        {/* Global Error Banner (Backend Unreachable or LLM Timeout) */}
        {activeError && (
          <div className="mx-6 mt-4 p-4 rounded-2xl border border-rose-500/40 bg-gradient-to-r from-rose-950/60 via-slate-900/90 to-rose-950/60 backdrop-blur-md shadow-lg shadow-rose-950/30 flex items-start justify-between gap-4 animate-fadeIn z-20">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-xl bg-rose-500/20 text-rose-300 border border-rose-500/30 flex-shrink-0 mt-0.5">
                {activeError.type === 'network' ? (
                  <WifiOff className="h-5 w-5 text-rose-400" />
                ) : (
                  <AlertTriangle className="h-5 w-5 text-amber-400" />
                )}
              </div>
              <div>
                <h3 className="text-xs font-bold text-rose-200 tracking-wide uppercase">
                  {activeError.title}
                </h3>
                <p className="text-xs text-rose-100/90 mt-1 leading-relaxed max-w-2xl">
                  {activeError.message}
                </p>
                {activeError.retryQuery && (
                  <button
                    onClick={() => {
                      const q = activeError.retryQuery
                      setActiveError(null)
                      if (q) executeChatQuery(q)
                    }}
                    className="mt-2.5 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-rose-100 bg-rose-800/40 hover:bg-rose-800/60 border border-rose-700/60 active:scale-95 transition-all duration-150 cursor-pointer"
                  >
                    <RotateCcw className="h-3 w-3" />
                    Retry Query: "{activeError.retryQuery.slice(0, 35)}..."
                  </button>
                )}
              </div>
            </div>

            <button
              onClick={() => setActiveError(null)}
              className="text-rose-400 hover:text-rose-200 p-1.5 rounded-lg hover:bg-rose-900/30 transition-colors"
              title="Dismiss error banner"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Scrollable Chat Messages Container */}
        <div
          ref={messagesContainerRef}
          className="flex-1 overflow-y-auto px-4 sm:px-8 py-6 space-y-6 scroll-smooth"
        >
          {messages.map((message) => {
            const isUser = message.role === 'user'
            const hasSources = message.sources && message.sources.length > 0
            const isExpanded = !!expandedSources[message.id]

            return (
              <div
                key={message.id}
                className={`flex gap-3.5 max-w-3xl transition-all duration-200 animate-fadeIn ${
                  isUser ? 'ml-auto flex-row-reverse' : 'mr-auto'
                }`}
              >
                {/* Avatar Icon */}
                <div
                  className={`h-8 w-8 rounded-xl flex items-center justify-center flex-shrink-0 text-white shadow-md transition-transform duration-200 ${
                    isUser
                      ? 'bg-gradient-to-tr from-blue-600 to-indigo-600 shadow-blue-900/30'
                      : message.error
                      ? 'bg-rose-600 shadow-rose-900/30'
                      : 'bg-gradient-to-tr from-cyan-600 to-slate-800 border border-cyan-500/30 shadow-cyan-950/40'
                  }`}
                >
                  {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
                </div>

                {/* Message Bubble & Content */}
                <div className={`flex flex-col space-y-2 max-w-[85%] ${isUser ? 'items-end' : 'items-start'}`}>
                  <div
                    className={`rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm transition-all duration-200 ${
                      isUser
                        ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-tr-none shadow-blue-950/20'
                        : message.error
                        ? 'bg-rose-950/40 border border-rose-500/40 text-rose-200 rounded-tl-none shadow-rose-950/20'
                        : 'bg-slate-900/90 border border-slate-800/90 text-slate-100 rounded-tl-none shadow-slate-950/40'
                    }`}
                  >
                    <div className="whitespace-pre-wrap break-words">{message.content}</div>

                    {message.error && message.queryAttempted && (
                      <div className="mt-2.5 pt-2 border-t border-rose-500/20 flex items-center justify-between">
                        <span className="text-[11px] text-rose-300 font-mono truncate max-w-[200px]">
                          Query failed: {message.queryAttempted}
                        </span>
                        <button
                          onClick={() => executeChatQuery(message.queryAttempted!)}
                          disabled={isChatLoading}
                          className="flex items-center gap-1 text-[11px] font-semibold text-rose-200 hover:text-white underline ml-2 cursor-pointer"
                        >
                          <RotateCcw className="h-3 w-3" />
                          Retry
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Expandable Source Citations Component */}
                  {!isUser && hasSources && (
                    <div className="w-full rounded-xl border border-slate-800/90 bg-slate-900/70 backdrop-blur-sm overflow-hidden transition-all duration-300 shadow-sm mt-1">
                      <button
                        onClick={() => toggleSources(message.id)}
                        className="flex items-center justify-between w-full px-3.5 py-2.5 text-xs font-medium text-cyan-400 hover:text-cyan-300 hover:bg-cyan-950/20 active:bg-cyan-950/40 transition-all duration-200 cursor-pointer"
                      >
                        <span className="flex items-center gap-2">
                          <BookOpen className="h-3.5 w-3.5 text-cyan-400" />
                          <span>Verified Source Citations</span>
                          <span className="px-1.5 py-0.2 rounded-full bg-cyan-950 text-cyan-300 border border-cyan-800/50 text-[10px] font-mono">
                            {message.sources!.length}
                          </span>
                        </span>
                        {isExpanded ? (
                          <ChevronUp className="h-3.5 w-3.5 transition-transform duration-200" />
                        ) : (
                          <ChevronDown className="h-3.5 w-3.5 transition-transform duration-200" />
                        )}
                      </button>

                      {/* Animated Expanded Citations List */}
                      {isExpanded && (
                        <div className="p-3 pt-1 space-y-2 border-t border-slate-800/80 animate-fadeIn transition-all duration-300">
                          {message.sources!.map((src, sIdx) => {
                            const snippetKey = `${message.id}-src-${sIdx}`
                            const isCopied = copiedSnippetId === snippetKey

                            return (
                              <div
                                key={snippetKey}
                                className="rounded-xl bg-slate-950/70 border border-slate-800/80 p-3 text-xs space-y-2 hover:border-slate-700/80 transition-all duration-200 group"
                              >
                                <div className="flex items-center justify-between font-mono text-[11px] text-slate-300">
                                  <div className="flex items-center gap-1.5 truncate max-w-[220px]">
                                    <FileText className="h-3.5 w-3.5 text-cyan-400 flex-shrink-0" />
                                    <span
                                      className="font-semibold text-cyan-200 truncate"
                                      title={src.file_name}
                                    >
                                      {src.file_name}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-1.5 text-slate-400 flex-shrink-0">
                                    <span className="px-2 py-0.5 rounded-md bg-slate-800 border border-slate-700 text-[10px]">
                                      Page {src.page !== undefined ? src.page + 1 : 'N/A'}
                                    </span>
                                    <span className="px-2 py-0.5 rounded-md bg-slate-800 border border-slate-700 text-[10px]">
                                      Chunk #{src.chunk_index}
                                    </span>
                                  </div>
                                </div>

                                {src.preview && (
                                  <div className="relative group/snippet">
                                    <blockquote className="text-slate-300 text-[11px] leading-relaxed italic bg-slate-900/90 p-2.5 pr-8 rounded-lg border-l-2 border-cyan-500 font-sans">
                                      "{src.preview}"
                                    </blockquote>
                                    <button
                                      onClick={() => handleCopySnippet(src.preview!, snippetKey)}
                                      className="absolute right-2 top-2 p-1 rounded bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-slate-200 transition-colors opacity-0 group-hover/snippet:opacity-100 cursor-pointer"
                                      title="Copy citation snippet"
                                    >
                                      {isCopied ? (
                                        <Check className="h-3 w-3 text-emerald-400" />
                                      ) : (
                                        <Copy className="h-3 w-3" />
                                      )}
                                    </button>
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Timestamp */}
                  <span className="text-[10px] text-slate-500 font-mono px-1">
                    {message.timestamp}
                  </span>
                </div>
              </div>
            )
          })}

          {/* Smooth Visually Distinct 'Thinking...' Typing Indicator */}
          {isChatLoading && (
            <div className="flex gap-3.5 max-w-3xl mr-auto animate-fadeIn transition-all duration-300">
              <div className="relative h-8 w-8 rounded-xl bg-gradient-to-tr from-cyan-600 to-slate-800 border border-cyan-500/40 flex items-center justify-center flex-shrink-0 text-white shadow-lg shadow-cyan-950/40">
                <Bot className="h-4 w-4" />
                <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-cyan-500"></span>
                </span>
              </div>

              <div className="rounded-2xl rounded-tl-none px-4 py-3 bg-slate-900/90 border border-cyan-500/30 backdrop-blur-md shadow-lg shadow-cyan-950/20 space-y-2">
                <div className="flex items-center gap-3">
                  {/* Staggered bouncing indicator dots */}
                  <div className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-cyan-400 animate-bounce [animation-delay:-0.3s]"></span>
                    <span className="h-2 w-2 rounded-full bg-cyan-400 animate-bounce [animation-delay:-0.15s]"></span>
                    <span className="h-2 w-2 rounded-full bg-cyan-400 animate-bounce"></span>
                  </div>
                  <span className="text-xs font-medium text-cyan-200">
                    Generating answer from local context...
                  </span>
                  <span className="text-[11px] font-mono text-cyan-400/80 bg-cyan-950/60 px-1.5 py-0.5 rounded border border-cyan-800/40">
                    {thinkingSeconds}s
                  </span>
                </div>

                <p className="text-[11px] text-slate-400 font-mono flex items-center gap-1.5">
                  <Database className="h-3 w-3 text-cyan-400 animate-pulse" />
                  Similarity search on ChromaDB & prompt evaluation on Qwen 2.5
                </p>
              </div>
            </div>
          )}

          {/* Quick Prompt Suggestions when conversation is young */}
          {messages.length === 1 && !isChatLoading && (
            <div className="pt-4 max-w-2xl mx-auto space-y-3 animate-fadeIn">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                <Sparkles className="h-3.5 w-3.5 text-cyan-400" />
                Suggested Inquiries
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                {suggestedPrompts.map((prompt, i) => (
                  <button
                    key={i}
                    onClick={() => executeChatQuery(prompt)}
                    className="p-3 text-left rounded-xl border border-slate-800 bg-slate-900/40 hover:bg-slate-900 hover:border-cyan-500/40 active:scale-[0.98] transition-all duration-200 text-xs text-slate-300 hover:text-white cursor-pointer group shadow-sm"
                  >
                    <span className="line-clamp-2 leading-relaxed">{prompt}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Scroll Anchor */}
          <div ref={chatEndRef} className="h-px w-full" />
        </div>

        {/* Chat Input Bar (Sticky at Bottom) */}
        <div className="p-4 sm:p-5 border-t border-slate-800/80 bg-slate-900/40 backdrop-blur-md flex-shrink-0">
          <form
            onSubmit={handleSendMessage}
            className="max-w-3xl mx-auto relative flex items-center gap-2"
          >
            <div className="relative flex-1">
              <input
                type="text"
                value={inputQuery}
                onChange={(e) => setInputQuery(e.target.value)}
                placeholder={
                  backendOnline === false
                    ? 'Backend server is offline (:8000)...'
                    : documents.length > 0
                    ? 'Ask a question about the uploaded documents...'
                    : 'Upload a document in the sidebar to begin querying...'
                }
                disabled={isChatLoading || backendOnline === false}
                className="w-full bg-slate-900/90 border border-slate-700/80 rounded-xl px-4 py-3 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 transition-all duration-200 pr-12 disabled:opacity-50 shadow-inner"
              />
              <div className="absolute right-3.5 top-1/2 -translate-y-1/2 flex items-center gap-1.5 text-xs text-slate-500 pointer-events-none">
                <Sparkles className="h-4 w-4 text-cyan-500/70" />
              </div>
            </div>

            <button
              type="submit"
              disabled={!inputQuery.trim() || isChatLoading || backendOnline === false}
              className="h-11 w-11 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 active:scale-95 text-white flex items-center justify-center transition-all duration-200 disabled:opacity-40 disabled:pointer-events-none shadow-md shadow-cyan-900/30 flex-shrink-0 cursor-pointer"
              title="Send query"
            >
              {isChatLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </button>
          </form>

          <p className="text-[10px] text-center text-slate-500 mt-2 font-mono flex items-center justify-center gap-1.5">
            <ShieldCheck className="h-3 w-3 text-emerald-400" />
            Air-Gapped: Zero prompts or vector embeddings are transmitted outside localhost.
          </p>
        </div>
      </main>
    </div>
  )
}

export default App