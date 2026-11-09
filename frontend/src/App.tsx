import React, { useState, useEffect, useRef } from 'react'
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
  Trash2,
  Sparkles,
  BookOpen,
  Database,
  ChevronDown,
  ChevronUp,
  Cpu,
  RefreshCw,
  FolderOpen
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

export function App() {
  // Sidebar & Upload states
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [isUploading, setIsUploading] = useState<boolean>(false)
  const [uploadFeedback, setUploadFeedback] = useState<{
    type: 'success' | 'error'
    message: string
    chunkCount?: number
  } | null>(null)
  const [documents, setDocuments] = useState<DocumentSummary[]>([])
  const [isRefreshingDocs, setIsRefreshingDocs] = useState<boolean>(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Chat states
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome-message',
      role: 'assistant',
      content:
        'Hello! I am your secure corporate assistant. You can upload enterprise PDF documents using the sidebar, and I will answer your questions strictly using their verified context. No data ever leaves this machine.',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ])
  const [inputQuery, setInputQuery] = useState<string>('')
  const [isChatLoading, setIsChatLoading] = useState<boolean>(false)
  const [expandedSources, setExpandedSources] = useState<Record<string, boolean>>({})

  const chatEndRef = useRef<HTMLDivElement>(null)

  // Auto-scroll chat to latest message
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isChatLoading])

  // Fetch indexed documents list on mount
  const fetchDocuments = async () => {
    setIsRefreshingDocs(true)
    try {
      const res = await fetch('/api/documents')
      if (res.ok) {
        const data = await res.json()
        setDocuments(data.documents || [])
      }
    } catch {
      // Backend may still be initializing or starting up
    } finally {
      setIsRefreshingDocs(false)
    }
  }

  useEffect(() => {
    fetchDocuments()
  }, [])

  // Handle file selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0]
      if (!file.name.toLowerCase().endsWith('.pdf')) {
        setUploadFeedback({
          type: 'error',
          message: 'Please select a valid PDF file (.pdf).',
        })
        setSelectedFile(null)
        return
      }
      setSelectedFile(file)
      setUploadFeedback(null)
    }
  }

  // Handle PDF Upload to /api/upload
  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedFile) return

    setIsUploading(true)
    setUploadFeedback(null)

    const formData = new FormData()
    formData.append('file', selectedFile)

    try {
      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        const errData = await response.json().catch(() => null)
        throw new Error(errData?.detail || `Upload failed with HTTP ${response.status}`)
      }

      const data: UploadResponse = await response.json()
      setUploadFeedback({
        type: 'success',
        message: data.message || `Successfully ingested ${data.chunks_ingested} chunks!`,
        chunkCount: data.chunks_ingested,
      })

      // Reset file input
      setSelectedFile(null)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }

      // Refresh documents list
      fetchDocuments()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'An unexpected error occurred during upload.'
      setUploadFeedback({
        type: 'error',
        message: msg,
      })
    } finally {
      setIsUploading(false)
    }
  }

  // Handle sending chat message to /api/chat
  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    const query = inputQuery.trim()
    if (!query || isChatLoading) return

    const userMessageId = `user-${Date.now()}`
    const userTimestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

    const newMessages: ChatMessage[] = [
      ...messages,
      {
        id: userMessageId,
        role: 'user',
        content: query,
        timestamp: userTimestamp,
      },
    ]

    setMessages(newMessages)
    setInputQuery('')
    setIsChatLoading(true)

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query }),
      })

      if (!response.ok) {
        const errData = await response.json().catch(() => null)
        throw new Error(errData?.detail || `Chat query failed with HTTP ${response.status}`)
      }

      const data: ChatApiResponse = await response.json()
      const assistantMessageId = `assistant-${Date.now()}`
      const assistantTimestamp = new Date().toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      })

      setMessages([
        ...newMessages,
        {
          id: assistantMessageId,
          role: 'assistant',
          content: data.response || data.answer || 'No response generated.',
          timestamp: assistantTimestamp,
          sources: data.sources || [],
        },
      ])
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to query the local assistant.'
      const errorMsgId = `assistant-error-${Date.now()}`
      setMessages([
        ...newMessages,
        {
          id: errorMsgId,
          role: 'assistant',
          content: `⚠️ Error: ${msg}\nPlease make sure the backend and Ollama are running.`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          error: true,
        },
      ])
    } finally {
      setIsChatLoading(false)
    }
  }

  const toggleSources = (msgId: string) => {
    setExpandedSources((prev) => ({
      ...prev,
      [msgId]: !prev[msgId],
    }))
  }

  const handleClearChat = () => {
    setMessages([
      {
        id: 'reset-welcome',
        role: 'assistant',
        content:
          'Chat history cleared. How can I assist you with your ingested enterprise documents?',
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

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-950 text-slate-100 font-sans">
      {/* ========================================================= */}
      {/* SIDEBAR: Document Upload & Knowledge Base Management      */}
      {/* ========================================================= */}
      <aside className="w-80 sm:w-96 flex-shrink-0 flex flex-col border-r border-slate-800 bg-slate-900/60 backdrop-blur-xl">
        {/* Brand Header */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20 flex-shrink-0">
              <ShieldCheck className="h-6 w-6 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-bold text-base text-white tracking-tight">Privacy RAG</h1>
                <span className="text-[10px] px-2 py-0.5 rounded-full font-mono font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  Air-Gapped
                </span>
              </div>
              <p className="text-xs text-slate-400">Zero Cloud Exfiltration</p>
            </div>
          </div>
        </div>

        {/* Scrollable Document Ingestion & Store Area */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {/* Upload Form Card */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <UploadCloud className="h-4 w-4 text-cyan-400" />
              <h2 className="text-sm font-semibold text-slate-200">Upload PDF Document</h2>
            </div>

            <form onSubmit={handleUpload} className="space-y-3">
              <div
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-all ${
                  selectedFile
                    ? 'border-cyan-500/50 bg-cyan-950/20'
                    : 'border-slate-700 hover:border-slate-600 bg-slate-950/40 hover:bg-slate-950/60'
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
                  <div className="p-2 rounded-full bg-slate-800 text-slate-300">
                    <FileText className="h-5 w-5 text-cyan-400" />
                  </div>
                  {selectedFile ? (
                    <div className="max-w-full">
                      <p className="text-xs font-medium text-cyan-300 truncate px-2">
                        {selectedFile.name}
                      </p>
                      <p className="text-[11px] text-slate-400 font-mono">
                        {formatFileSize(selectedFile.size)}
                      </p>
                    </div>
                  ) : (
                    <>
                      <p className="text-xs text-slate-300 font-medium">
                        Click to browse PDF file
                      </p>
                      <p className="text-[11px] text-slate-500">Max size 50MB • Air-gapped only</p>
                    </>
                  )}
                </div>
              </div>

              {/* Upload Action Button */}
              <button
                type="submit"
                disabled={!selectedFile || isUploading}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold text-white bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 active:scale-[0.98] transition disabled:opacity-40 disabled:pointer-events-none shadow-md shadow-cyan-900/20"
              >
                {isUploading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin text-white" />
                    <span>Processing & Ingesting...</span>
                  </>
                ) : (
                  <>
                    <UploadCloud className="h-4 w-4" />
                    <span>Upload & Embed PDF</span>
                  </>
                )}
              </button>
            </form>

            {/* Upload Feedback Message */}
            {uploadFeedback && (
              <div
                className={`mt-3 p-3 rounded-xl text-xs border flex items-start gap-2.5 animate-fadeIn ${
                  uploadFeedback.type === 'success'
                    ? 'bg-emerald-950/30 border-emerald-500/30 text-emerald-300'
                    : 'bg-rose-950/30 border-rose-500/30 text-rose-300'
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
                      Indexed into local ChromaDB collection.
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
                onClick={fetchDocuments}
                disabled={isRefreshingDocs}
                className="text-slate-400 hover:text-slate-200 transition p-1 rounded hover:bg-slate-800"
                title="Refresh indexed document list"
              >
                <RefreshCw className={`h-3 w-3 ${isRefreshingDocs ? 'animate-spin' : ''}`} />
              </button>
            </div>

            {documents.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-800 p-4 text-center">
                <FolderOpen className="h-6 w-6 text-slate-600 mx-auto mb-1.5" />
                <p className="text-xs text-slate-400">No documents ingested yet</p>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Upload a PDF above to begin querying
                </p>
              </div>
            ) : (
              <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                {documents.map((doc, idx) => (
                  <div
                    key={`${doc.file_name}-${idx}`}
                    className="flex items-center justify-between p-2.5 rounded-xl border border-slate-800/80 bg-slate-900/40 hover:bg-slate-900/80 transition"
                  >
                    <div className="flex items-center gap-2.5 overflow-hidden">
                      <div className="h-7 w-7 rounded-lg bg-cyan-950/50 border border-cyan-800/30 flex items-center justify-center flex-shrink-0">
                        <FileText className="h-3.5 w-3.5 text-cyan-400" />
                      </div>
                      <span className="text-xs text-slate-200 truncate font-medium max-w-[170px]" title={doc.file_name}>
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

        {/* Local Security & Architecture Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/60">
          <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1.5">
            <span className="flex items-center gap-1.5">
              <Cpu className="h-3.5 w-3.5 text-purple-400" />
              Ollama Engine
            </span>
            <span className="text-emerald-400 font-mono">qwen2.5-coder:7b</span>
          </div>
          <div className="flex items-center justify-between text-[11px] text-slate-400">
            <span className="flex items-center gap-1.5">
              <Database className="h-3.5 w-3.5 text-cyan-400" />
              Vector Embeddings
            </span>
            <span className="text-slate-300 font-mono">all-MiniLM-L6-v2</span>
          </div>
        </div>
      </aside>

      {/* ========================================================= */}
      {/* MAIN CHAT AREA                                            */}
      {/* ========================================================= */}
      <main className="flex-1 flex flex-col h-full bg-slate-950 relative overflow-hidden">
        {/* Chat Header */}
        <header className="h-16 border-b border-slate-800/80 px-6 flex items-center justify-between bg-slate-900/40 backdrop-blur-md flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-tr from-cyan-600 to-blue-600 flex items-center justify-center">
              <Bot className="h-4 w-4 text-white" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white">Enterprise AI Assistant</h2>
              <p className="text-[11px] text-slate-400 flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                Grounded strictly in local document context
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleClearChat}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800/80 transition active:scale-95 border border-slate-800"
              title="Clear message history"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>Clear Chat</span>
            </button>
          </div>
        </header>

        {/* Messages Scrollable Container */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-8 py-6 space-y-6">
          {messages.map((message) => {
            const isUser = message.role === 'user'
            const hasSources = message.sources && message.sources.length > 0
            const isExpanded = expandedSources[message.id]

            return (
              <div
                key={message.id}
                className={`flex gap-3.5 max-w-3xl ${isUser ? 'ml-auto flex-row-reverse' : 'mr-auto'}`}
              >
                {/* Avatar */}
                <div
                  className={`h-8 w-8 rounded-xl flex items-center justify-center flex-shrink-0 text-white ${
                    isUser
                      ? 'bg-blue-600 shadow-md shadow-blue-500/20'
                      : message.error
                      ? 'bg-rose-600 shadow-md shadow-rose-500/20'
                      : 'bg-gradient-to-tr from-cyan-600 to-slate-800 border border-cyan-500/30'
                  }`}
                >
                  {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
                </div>

                {/* Message Bubble & Content */}
                <div className={`flex flex-col space-y-2 max-w-[85%] ${isUser ? 'items-end' : 'items-start'}`}>
                  <div
                    className={`rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm ${
                      isUser
                        ? 'bg-blue-600 text-white rounded-tr-none'
                        : message.error
                        ? 'bg-rose-950/40 border border-rose-500/30 text-rose-200 rounded-tl-none'
                        : 'bg-slate-900 border border-slate-800/90 text-slate-200 rounded-tl-none'
                    }`}
                  >
                    <div className="whitespace-pre-wrap break-words">{message.content}</div>
                  </div>

                  {/* Source Citations Display */}
                  {!isUser && hasSources && (
                    <div className="w-full rounded-xl border border-slate-800 bg-slate-900/60 p-3 space-y-2 mt-1">
                      <button
                        onClick={() => toggleSources(message.id)}
                        className="flex items-center justify-between w-full text-xs font-medium text-cyan-400 hover:text-cyan-300 transition"
                      >
                        <span className="flex items-center gap-1.5">
                          <BookOpen className="h-3.5 w-3.5" />
                          Source Citations ({message.sources!.length})
                        </span>
                        {isExpanded ? (
                          <ChevronUp className="h-3.5 w-3.5" />
                        ) : (
                          <ChevronDown className="h-3.5 w-3.5" />
                        )}
                      </button>

                      {/* Expanded Sources Details */}
                      {isExpanded && (
                        <div className="space-y-2 pt-2 border-t border-slate-800/80">
                          {message.sources!.map((src, sIdx) => (
                            <div
                              key={`${message.id}-src-${sIdx}`}
                              className="rounded-lg bg-slate-950/60 border border-slate-800/70 p-2.5 text-xs space-y-1.5"
                            >
                              <div className="flex items-center justify-between font-mono text-[11px] text-slate-300">
                                <span className="font-semibold text-cyan-300 truncate max-w-[200px]" title={src.file_name}>
                                  📄 {src.file_name}
                                </span>
                                <div className="flex items-center gap-1.5 text-slate-400">
                                  <span className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700">
                                    Page {src.page !== undefined ? src.page + 1 : 'N/A'}
                                  </span>
                                  <span className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700">
                                    Chunk #{src.chunk_index}
                                  </span>
                                </div>
                              </div>
                              {src.preview && (
                                <p className="text-slate-400 text-[11px] leading-relaxed italic bg-slate-900/80 p-2 rounded border border-slate-800">
                                  "{src.preview}"
                                </p>
                              )}
                            </div>
                          ))}
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

          {/* Typing / Retrieval Loading Indicator */}
          {isChatLoading && (
            <div className="flex gap-3.5 max-w-3xl mr-auto animate-fadeIn">
              <div className="h-8 w-8 rounded-xl bg-gradient-to-tr from-cyan-600 to-slate-800 border border-cyan-500/30 flex items-center justify-center flex-shrink-0 text-white">
                <Bot className="h-4 w-4" />
              </div>
              <div className="rounded-2xl rounded-tl-none px-4 py-3 bg-slate-900 border border-slate-800 text-sm flex items-center gap-2.5 text-slate-400 shadow-sm">
                <Loader2 className="h-4 w-4 animate-spin text-cyan-400" />
                <span className="text-xs">Searching local ChromaDB & querying Ollama...</span>
              </div>
            </div>
          )}

          <div ref={chatEndRef} />
        </div>

        {/* Chat Input Bar */}
        <div className="p-4 sm:p-5 border-t border-slate-800/80 bg-slate-900/30 backdrop-blur-md">
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
                  documents.length > 0
                    ? 'Ask a question about the uploaded documents...'
                    : 'Upload a document in the sidebar to begin asking questions...'
                }
                disabled={isChatLoading}
                className="w-full bg-slate-900/90 border border-slate-700/80 rounded-xl px-4 py-3 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 transition pr-12 disabled:opacity-50"
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5 text-xs text-slate-500 pointer-events-none">
                <Sparkles className="h-4 w-4 text-cyan-500/70" />
              </div>
            </div>

            <button
              type="submit"
              disabled={!inputQuery.trim() || isChatLoading}
              className="h-11 w-11 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 active:scale-95 text-white flex items-center justify-center transition disabled:opacity-40 disabled:pointer-events-none shadow-md shadow-cyan-900/30 flex-shrink-0"
              title="Send message"
            >
              {isChatLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </button>
          </form>

          <p className="text-[10px] text-center text-slate-500 mt-2">
            Air-Gapped Local Architecture: All prompts and document chunks remain strictly on your local device.
          </p>
        </div>
      </main>
    </div>
  )
}

export default App