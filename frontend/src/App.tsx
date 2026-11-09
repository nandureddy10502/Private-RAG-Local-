import React, { useState, useEffect, useRef, useCallback } from 'react'
import {
  FileText,
  Send,
  Loader2,
  AlertCircle,
  Trash2,
  BookOpen,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  X,
  RotateCcw,
  Copy,
  Check,
  LogOut,
  User,
  Lock
} from 'lucide-react'

interface CurrentUser {
  id: number
  username: string
}

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
  user_id?: number
}

interface HistoryItem {
  id: number
  user_id: number
  role: 'user' | 'assistant'
  content: string
  timestamp: string
  citations?: SourceCitation[]
}

interface ErrorBannerState {
  title: string
  message: string
  type: 'timeout' | 'network' | 'server'
  retryQuery?: string
}

const LLM_TIMEOUT_MS = 60000

export function App() {
  // Authentication state
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(() => {
    try {
      const saved = localStorage.getItem('rag_current_user')
      return saved ? JSON.parse(saved) : null
    } catch {
      return null
    }
  })
  const [loginUsername, setLoginUsername] = useState<string>('admin')
  const [loginPassword, setLoginPassword] = useState<string>('admin123')
  const [loginLoading, setLoginLoading] = useState<boolean>(false)
  const [loginError, setLoginError] = useState<string | null>(null)

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
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isHistoryLoading, setIsHistoryLoading] = useState<boolean>(false)
  const [inputQuery, setInputQuery] = useState<string>('')
  const [isChatLoading, setIsChatLoading] = useState<boolean>(false)
  const [thinkingSeconds, setThinkingSeconds] = useState<number>(0)
  const [expandedSources, setExpandedSources] = useState<Record<string, boolean>>({})
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const [activeError, setActiveError] = useState<ErrorBannerState | null>(null)

  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const chatEndRef = useRef<HTMLDivElement>(null)

  const formatTimestamp = (isoString?: string) => {
    if (!isoString) return ''
    try {
      const d = new Date(isoString)
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    } catch {
      return isoString
    }
  }

  // Auto-scroll anchor
  const scrollToBottom = useCallback((smooth = true) => {
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
      }, 20)
    })
  }, [])

  useEffect(() => {
    if (currentUser) {
      scrollToBottom(true)
    }
  }, [messages, isChatLoading, expandedSources, currentUser, scrollToBottom])

  // Thinking timer
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null
    if (isChatLoading) {
      setThinkingSeconds(0)
      interval = setInterval(() => {
        setThinkingSeconds((s) => s + 1)
      }, 1000)
    } else {
      setThinkingSeconds(0)
    }
    return () => {
      if (interval) clearInterval(interval)
    }
  }, [isChatLoading])

  // Fetch document index list
  const checkHealthAndDocs = useCallback(async () => {
    setIsRefreshingDocs(true)
    try {
      const healthRes = await fetch('/health', { signal: AbortSignal.timeout(3000) })
      if (healthRes.ok) {
        setBackendOnline(true)
        if (activeError?.type === 'network') setActiveError(null)
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
      // Ignored
    } finally {
      setIsRefreshingDocs(false)
    }
  }, [activeError])

  useEffect(() => {
    checkHealthAndDocs()
  }, [checkHealthAndDocs])

  // Fetch user history from /api/history/{user_id}
  const fetchUserHistory = useCallback(async (userId: number) => {
    setIsHistoryLoading(true)
    try {
      const res = await fetch(`/api/history/${userId}`)
      if (res.ok) {
        const data = await res.json()
        const historyRows: HistoryItem[] = data.history || []

        if (historyRows.length > 0) {
          const mapped: ChatMessage[] = historyRows.map((h) => ({
            id: `hist-${h.id}`,
            role: h.role,
            content: h.content,
            timestamp: formatTimestamp(h.timestamp),
            sources: h.citations || [],
          }))
          setMessages(mapped)
        } else {
          setMessages([
            {
              id: 'welcome',
              role: 'assistant',
              content:
                'Session initialized. Documents in the sidebar are indexed locally. Inquire about company policies, architecture, or financials.',
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            },
          ])
        }
      }
    } catch {
      // Backend may be offline
    } finally {
      setIsHistoryLoading(false)
    }
  }, [])

  // When currentUser loads or changes, fetch their history
  useEffect(() => {
    if (currentUser?.id) {
      fetchUserHistory(currentUser.id)
    } else {
      setMessages([])
    }
  }, [currentUser, fetchUserHistory])

  // Login handler
  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoginError(null)
    setLoginLoading(true)

    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: loginUsername.trim(),
          password: loginPassword,
        }),
      })

      if (!res.ok) {
        if (res.status === 401) {
          throw new Error('Invalid username or password.')
        }
        const errData = await res.json().catch(() => null)
        throw new Error(errData?.detail || `Login failed (${res.status})`)
      }

      const data = await res.json()
      const userObj: CurrentUser = { id: data.id, username: data.username }
      setCurrentUser(userObj)
      try {
        localStorage.setItem('rag_current_user', JSON.stringify(userObj))
      } catch {
        // Storage unavailable
      }
    } catch (err: unknown) {
      setLoginError(err instanceof Error ? err.message : 'Authentication failed.')
    } finally {
      setLoginLoading(false)
    }
  }

  // Logout handler
  const handleLogout = () => {
    setCurrentUser(null)
    try {
      localStorage.removeItem('rag_current_user')
    } catch {
      // Ignore
    }
    setMessages([])
    setActiveError(null)
    setUploadFeedback(null)
  }

  // File upload handling
  const validateAndSetFile = (file: File) => {
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      setUploadFeedback({
        type: 'error',
        message: 'Unsupported format. Select a PDF file.',
      })
      setSelectedFile(null)
      return
    }
    setSelectedFile(file)
    setUploadFeedback(null)
  }

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedFile) return

    setIsUploading(true)
    setUploadFeedback(null)

    const formData = new FormData()
    formData.append('file', selectedFile)

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 90000)

    try {
      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
        signal: controller.signal,
      })
      clearTimeout(timeoutId)

      if (!response.ok) {
        const errData = await response.json().catch(() => null)
        throw new Error(errData?.detail || `Upload failed (${response.status})`)
      }

      const data: UploadResponse = await response.json()
      setUploadFeedback({
        type: 'success',
        message: `Ingested ${data.chunks_ingested} chunks from ${data.filename}`,
        chunkCount: data.chunks_ingested,
      })

      setSelectedFile(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
      checkHealthAndDocs()
    } catch (err: unknown) {
      clearTimeout(timeoutId)
      let msg = 'Upload failed'
      if (err instanceof Error) {
        msg = err.name === 'AbortError' ? 'Upload timed out' : err.message
      }
      setUploadFeedback({ type: 'error', message: msg })
    } finally {
      setIsUploading(false)
    }
  }

  // Execute chat query with user_id
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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: trimmed,
          user_id: currentUser?.id,
        }),
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        const errData = await response.json().catch(() => null)
        throw new Error(errData?.detail || `HTTP ${response.status}`)
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
          content: data.response || data.answer || 'No answer found in context.',
          timestamp: assistantTimestamp,
          sources: data.sources || [],
        },
      ])
    } catch (err: unknown) {
      clearTimeout(timeoutId)
      let errorType: 'timeout' | 'network' | 'server' = 'server'
      let errorTitle = 'Query error'
      let errorMessage = 'An error occurred during inference.'

      if (err instanceof Error) {
        if (err.name === 'AbortError') {
          errorType = 'timeout'
          errorTitle = 'Inference timeout'
          errorMessage = `Model evaluation exceeded ${LLM_TIMEOUT_MS / 1000}s limit.`
        } else if (
          err.message.includes('Failed to fetch') ||
          err.message.includes('NetworkError')
        ) {
          errorType = 'network'
          errorTitle = 'Backend unreachable'
          errorMessage = 'Cannot reach backend at 127.0.0.1:8000.'
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

      setMessages([
        ...updatedMessages,
        {
          id: `err-${Date.now()}`,
          role: 'assistant',
          content: `${errorTitle}: ${errorMessage}`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          error: true,
          queryAttempted: trimmed,
        },
      ])
    } finally {
      setIsChatLoading(false)
    }
  }

  const toggleSources = (msgId: string) => {
    setExpandedSources((prev) => {
      const next = { ...prev, [msgId]: !prev[msgId] }
      setTimeout(() => scrollToBottom(true), 30)
      return next
    })
  }

  const handleCopySnippet = (snippet: string, key: string) => {
    navigator.clipboard.writeText(snippet)
    setCopiedKey(key)
    setTimeout(() => setCopiedKey(null), 1500)
  }

  const handleClearChat = () => {
    setActiveError(null)
    setMessages([
      {
        id: 'reset',
        role: 'assistant',
        content: 'Conversation cleared. Enter a prompt to query your indexed documents.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      },
    ])
  }

  const formatBytes = (bytes?: number) => {
    if (!bytes) return ''
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const sampleQueries = [
    'What was the GAAP revenue and operating income in Q3 2026?',
    'What are the core hours and equipment stipends for remote workers?',
    'What distance metric and parameters are configured for ChromaDB in Project Titan?',
  ]

  // =========================================================================
  // SCREEN 1: SLEEK ENTERPRISE LOGIN (RENDERED WHEN currentUser === null)
  // =========================================================================
  if (!currentUser) {
    return (
      <div className="min-h-screen w-screen flex items-center justify-center bg-[#141415] text-[#ededed] font-sans antialiased p-4 select-none">
        <div className="w-full max-w-[340px] bg-[#19191b] border border-white/[0.08] rounded-lg p-6 space-y-5">
          {/* Brand & Title */}
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold tracking-tight text-[#ededed]">Privacy RAG</span>
              <span className="text-[10px] font-mono text-[#85858b] px-1.5 py-0.5 rounded border border-white/[0.06] bg-[#141415]">
                Air-Gapped
              </span>
            </div>
            <p className="text-xs text-[#85858b]">Local enterprise authentication</p>
          </div>

          {/* Login Form */}
          <form onSubmit={handleLoginSubmit} className="space-y-3.5">
            <div className="space-y-1.5">
              <label className="text-[11px] font-medium text-[#a1a1a6] block">
                Username
              </label>
              <div className="relative">
                <input
                  type="text"
                  required
                  value={loginUsername}
                  onChange={(e) => setLoginUsername(e.target.value)}
                  placeholder="admin or guest"
                  className="w-full h-9 bg-[#141415] border border-white/[0.08] focus:border-white/30 rounded-md px-3 text-xs text-[#ededed] placeholder-[#85858b] focus:outline-none transition-colors"
                />
                <User className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#85858b] pointer-events-none" />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-medium text-[#a1a1a6] block">
                Password
              </label>
              <div className="relative">
                <input
                  type="password"
                  required
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  placeholder="Password"
                  className="w-full h-9 bg-[#141415] border border-white/[0.08] focus:border-white/30 rounded-md px-3 text-xs text-[#ededed] placeholder-[#85858b] focus:outline-none transition-colors"
                />
                <Lock className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#85858b] pointer-events-none" />
              </div>
            </div>

            {loginError && (
              <div className="p-2 rounded border border-[#e5484d]/30 bg-[#1c1415] text-[#e5484d] text-xs flex items-center gap-1.5 animate-fadeIn">
                <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
                <span>{loginError}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loginLoading || !loginUsername.trim() || !loginPassword}
              className="w-full h-9 bg-[#ededed] text-[#141415] hover:bg-white active:scale-[0.99] text-xs font-medium rounded-md transition-all duration-120 flex items-center justify-center gap-1.5 disabled:opacity-30 disabled:pointer-events-none cursor-pointer mt-1"
            >
              {loginLoading ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Verifying credentials...</span>
                </>
              ) : (
                <span>Sign in</span>
              )}
            </button>
          </form>

          {/* Quick Demo Accounts Helper */}
          <div className="pt-3 border-t border-white/[0.06] space-y-2">
            <span className="text-[10px] text-[#85858b] block font-mono">Demo accounts</span>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  setLoginUsername('admin')
                  setLoginPassword('admin123')
                  setLoginError(null)
                }}
                className="text-left p-2 rounded border border-white/[0.06] bg-[#141415] hover:bg-[#232325] transition-colors cursor-pointer"
              >
                <div className="text-[11px] font-medium text-[#ededed]">admin</div>
                <div className="text-[10px] font-mono text-[#85858b]">admin123</div>
              </button>

              <button
                type="button"
                onClick={() => {
                  setLoginUsername('guest')
                  setLoginPassword('guest123')
                  setLoginError(null)
                }}
                className="text-left p-2 rounded border border-white/[0.06] bg-[#141415] hover:bg-[#232325] transition-colors cursor-pointer"
              >
                <div className="text-[11px] font-medium text-[#ededed]">guest</div>
                <div className="text-[10px] font-mono text-[#85858b]">guest123</div>
              </button>
            </div>
          </div>

          <p className="text-[10px] text-center text-[#85858b] font-mono">
            Local SQLite authentication • Zero external auth servers
          </p>
        </div>
      </div>
    )
  }

  // =========================================================================
  // SCREEN 2: AUTHENTICATED CHAT DASHBOARD & HISTORY
  // =========================================================================
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#141415] text-[#ededed] font-sans antialiased">
      {/* ========================================================= */}
      {/* SIDEBAR                                                   */}
      {/* ========================================================= */}
      <aside className="w-[260px] flex-shrink-0 flex flex-col border-r border-white/[0.08] bg-[#0f0f10] select-none">
        {/* Brand Header */}
        <div className="h-13 px-4 border-b border-white/[0.08] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium tracking-tight text-[#ededed]">Privacy RAG</span>
            <span className="text-[10px] font-mono text-[#85858b] px-1.5 py-0.5 rounded border border-white/[0.06] bg-[#19191b]">
              Local
            </span>
          </div>

          <div
            className={`h-2 w-2 rounded-full ${
              backendOnline === true
                ? 'bg-[#4cc38a]'
                : backendOnline === false
                ? 'bg-[#e5484d]'
                : 'bg-[#85858b]'
            }`}
            title={backendOnline ? 'Backend 127.0.0.1:8000' : 'Offline'}
          />
        </div>

        {/* Sidebar Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {/* Document Ingestion Card */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between text-xs text-[#a1a1a6]">
              <span>Upload PDF</span>
              <span className="text-[10px] font-mono tabular-nums text-[#85858b]">Max 50MB</span>
            </div>

            <form onSubmit={handleUpload} className="space-y-2">
              <div
                onDragOver={(e) => {
                  e.preventDefault()
                  setIsDragging(true)
                }}
                onDragLeave={(e) => {
                  e.preventDefault()
                  setIsDragging(false)
                }}
                onDrop={(e) => {
                  e.preventDefault()
                  setIsDragging(false)
                  if (e.dataTransfer.files?.[0]) validateAndSetFile(e.dataTransfer.files[0])
                }}
                onClick={() => fileInputRef.current?.click()}
                className={`border border-dashed rounded-md p-3 text-center cursor-pointer transition-colors duration-150 ${
                  isDragging
                    ? 'border-white/30 bg-[#232325]'
                    : selectedFile
                    ? 'border-white/20 bg-[#19191b]'
                    : 'border-white/[0.1] hover:border-white/20 bg-[#141415]'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/pdf,.pdf"
                  onChange={(e) => {
                    if (e.target.files?.[0]) validateAndSetFile(e.target.files[0])
                  }}
                  className="hidden"
                  disabled={isUploading}
                />
                {selectedFile ? (
                  <div className="space-y-1">
                    <p className="text-xs text-[#ededed] font-medium truncate">{selectedFile.name}</p>
                    <p className="text-[11px] font-mono tabular-nums text-[#85858b]">
                      {formatBytes(selectedFile.size)}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <p className="text-xs text-[#a1a1a6]">Select PDF or drop here</p>
                    <p className="text-[10px] text-[#85858b]">Recursive 1000 / 200</p>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="submit"
                  disabled={!selectedFile || isUploading}
                  className="flex-1 h-8 px-3 rounded-md text-xs font-medium bg-[#ededed] text-[#141415] hover:bg-white active:scale-[0.99] transition-all duration-120 disabled:opacity-30 disabled:pointer-events-none cursor-pointer flex items-center justify-center gap-1.5"
                >
                  {isUploading ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      <span>Ingesting...</span>
                    </>
                  ) : (
                    <span>Upload document</span>
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
                    className="h-8 w-8 rounded-md border border-white/[0.08] hover:bg-[#232325] text-[#85858b] hover:text-[#ededed] transition-colors flex items-center justify-center cursor-pointer"
                    title="Remove file"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </form>

            {uploadFeedback && (
              <div
                className={`p-2.5 rounded-md text-xs border leading-relaxed ${
                  uploadFeedback.type === 'success'
                    ? 'border-[#4cc38a]/20 bg-[#4cc38a]/5 text-[#4cc38a]'
                    : 'border-[#e5484d]/20 bg-[#e5484d]/5 text-[#e5484d]'
                }`}
              >
                {uploadFeedback.message}
              </div>
            )}
          </div>

          {/* Ingested Documents List */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-[#a1a1a6]">
              <span>Knowledge base</span>
              <button
                onClick={checkHealthAndDocs}
                disabled={isRefreshingDocs}
                className="text-[#85858b] hover:text-[#ededed] transition-colors p-0.5 rounded cursor-pointer"
                title="Refresh index list"
              >
                <RefreshCw className={`h-3 w-3 ${isRefreshingDocs ? 'animate-spin' : ''}`} />
              </button>
            </div>

            {documents.length === 0 ? (
              <div className="p-3 border border-white/[0.06] rounded-md bg-[#141415] text-center">
                <p className="text-xs text-[#85858b]">No documents indexed</p>
              </div>
            ) : (
              <div className="space-y-1 max-h-52 overflow-y-auto pr-0.5">
                {documents.map((doc, idx) => (
                  <div
                    key={`${doc.file_name}-${idx}`}
                    className="h-8 px-2 rounded-md hover:bg-[#19191b] flex items-center justify-between text-xs transition-colors duration-100 group"
                  >
                    <div className="flex items-center gap-2 truncate pr-2">
                      <FileText className="h-3.5 w-3.5 text-[#85858b] flex-shrink-0" />
                      <span className="text-[#ededed] truncate" title={doc.file_name}>
                        {doc.file_name}
                      </span>
                    </div>
                    <span className="text-[11px] font-mono tabular-nums text-[#85858b] flex-shrink-0">
                      {doc.chunks} ch
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Sidebar Footer */}
        <div className="p-3 border-t border-white/[0.08] bg-[#0f0f10] text-[11px] text-[#85858b] space-y-1 font-mono">
          <div className="flex items-center justify-between">
            <span>Model</span>
            <span className="text-[#a1a1a6]">qwen2.5-coder:7b</span>
          </div>
          <div className="flex items-center justify-between">
            <span>Vector index</span>
            <span className="text-[#a1a1a6]">all-MiniLM-L6-v2</span>
          </div>
          <div className="flex items-center justify-between">
            <span>User database</span>
            <span className="text-[#a1a1a6]">SQLite</span>
          </div>
        </div>
      </aside>

      {/* ========================================================= */}
      {/* MAIN CHAT AREA                                            */}
      {/* ========================================================= */}
      <main className="flex-1 flex flex-col h-full bg-[#141415] relative overflow-hidden">
        {/* Header with User Info and Logout */}
        <header className="h-13 border-b border-white/[0.08] px-6 flex items-center justify-between bg-[#0f0f10] flex-shrink-0">
          <div className="flex items-center gap-3">
            <span className="text-xs font-medium text-[#ededed]">Corporate Assistant</span>
            <span className="text-[11px] text-[#85858b]">Strict context retrieval</span>
          </div>

          <div className="flex items-center gap-2.5">
            {/* User identifier badge */}
            <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-[#19191b] border border-white/[0.08] text-[11px] font-mono text-[#a1a1a6]">
              <User className="h-3 w-3 text-[#85858b]" />
              <span>{currentUser.username}</span>
            </div>

            {/* Clear button */}
            <button
              onClick={handleClearChat}
              className="flex items-center gap-1 text-xs text-[#85858b] hover:text-[#ededed] px-2 py-1 rounded hover:bg-[#19191b] transition-colors cursor-pointer"
              title="Clear chat view"
            >
              <Trash2 className="h-3 w-3" />
              <span>Clear</span>
            </button>

            {/* Logout button */}
            <button
              onClick={handleLogout}
              className="flex items-center gap-1 text-xs text-[#85858b] hover:text-[#e5484d] px-2 py-1 rounded hover:bg-[#19191b] transition-colors cursor-pointer ml-1"
              title="Sign out of account"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span>Logout</span>
            </button>
          </div>
        </header>

        {/* Error Banner */}
        {activeError && (
          <div className="mx-6 mt-3 p-3 rounded-md border border-[#e5484d]/30 bg-[#1c1415] text-xs text-[#ededed] flex items-start justify-between gap-3 animate-fadeIn">
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-[#e5484d] font-medium">
                <AlertCircle className="h-3.5 w-3.5" />
                <span>{activeError.title}</span>
              </div>
              <p className="text-[#a1a1a6] leading-relaxed">{activeError.message}</p>
              {activeError.retryQuery && (
                <button
                  onClick={() => {
                    const q = activeError.retryQuery
                    setActiveError(null)
                    if (q) executeChatQuery(q)
                  }}
                  className="mt-1 inline-flex items-center gap-1 text-[11px] text-[#ededed] hover:underline cursor-pointer"
                >
                  <RotateCcw className="h-3 w-3" />
                  Retry query
                </button>
              )}
            </div>

            <button
              onClick={() => setActiveError(null)}
              className="text-[#85858b] hover:text-[#ededed] p-1 cursor-pointer"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* Messages List */}
        <div
          ref={messagesContainerRef}
          className="flex-1 overflow-y-auto px-6 py-6 space-y-4"
        >
          <div className="max-w-[700px] mx-auto space-y-4">
            {isHistoryLoading && (
              <div className="text-center py-4 text-xs text-[#85858b] flex items-center justify-center gap-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span>Loading isolated history...</span>
              </div>
            )}

            {messages.map((message) => {
              const isUser = message.role === 'user'
              const hasSources = message.sources && message.sources.length > 0
              const isExpanded = !!expandedSources[message.id]

              return (
                <div
                  key={message.id}
                  className={`flex flex-col space-y-1.5 animate-fadeIn ${
                    isUser ? 'items-end' : 'items-start'
                  }`}
                >
                  {/* Bubble */}
                  <div
                    className={`rounded-lg px-3.5 py-2.5 text-xs leading-relaxed max-w-[85%] ${
                      isUser
                        ? 'bg-[#232325] border border-white/[0.08] text-[#ededed]'
                        : message.error
                        ? 'bg-[#1c1415] border border-[#e5484d]/30 text-[#e5484d]'
                        : 'bg-[#19191b] border border-white/[0.06] text-[#ededed]'
                    }`}
                  >
                    <div className="whitespace-pre-wrap break-words">{message.content}</div>

                    {message.error && message.queryAttempted && (
                      <div className="mt-2 pt-1.5 border-t border-white/[0.06] flex items-center justify-between text-[11px]">
                        <span className="text-[#85858b] font-mono truncate">
                          Failed: {message.queryAttempted}
                        </span>
                        <button
                          onClick={() => executeChatQuery(message.queryAttempted!)}
                          disabled={isChatLoading}
                          className="text-[#ededed] hover:underline ml-2 cursor-pointer inline-flex items-center gap-1"
                        >
                          <RotateCcw className="h-3 w-3" />
                          Retry
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Sources Drawer */}
                  {!isUser && hasSources && (
                    <div className="w-full max-w-[85%] border border-white/[0.06] rounded-md bg-[#161617] p-2 space-y-2">
                      <button
                        onClick={() => toggleSources(message.id)}
                        className="flex items-center justify-between w-full text-[11px] text-[#a1a1a6] hover:text-[#ededed] transition-colors cursor-pointer"
                      >
                        <span className="flex items-center gap-1.5 font-mono">
                          <BookOpen className="h-3 w-3 text-[#85858b]" />
                          <span>Sources ({message.sources!.length})</span>
                        </span>
                        {isExpanded ? (
                          <ChevronUp className="h-3 w-3 text-[#85858b]" />
                        ) : (
                          <ChevronDown className="h-3 w-3 text-[#85858b]" />
                        )}
                      </button>

                      {isExpanded && (
                        <div className="space-y-1.5 pt-1 border-t border-white/[0.06]">
                          {message.sources!.map((src, sIdx) => {
                            const key = `${message.id}-${sIdx}`
                            const isCopied = copiedKey === key

                            return (
                              <div
                                key={key}
                                className="rounded border border-white/[0.06] bg-[#19191b] p-2 text-[11px] space-y-1.5"
                              >
                                <div className="flex items-center justify-between font-mono text-[#85858b]">
                                  <div className="flex items-center gap-1.5 truncate max-w-[220px]">
                                    <FileText className="h-3 w-3 flex-shrink-0" />
                                    <span className="text-[#ededed] truncate" title={src.file_name}>
                                      {src.file_name}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-2 tabular-nums">
                                    <span>p. {src.page !== undefined ? src.page + 1 : '—'}</span>
                                    <span>#{src.chunk_index}</span>
                                  </div>
                                </div>

                                {src.preview && (
                                  <div className="relative group">
                                    <blockquote className="border-l border-white/20 pl-2 text-[11px] font-mono text-[#a1a1a6] leading-relaxed select-text">
                                      {src.preview}
                                    </blockquote>
                                    <button
                                      onClick={() => handleCopySnippet(src.preview!, key)}
                                      className="absolute right-1 top-1 p-1 rounded bg-[#232325] text-[#85858b] hover:text-[#ededed] opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                                      title="Copy excerpt"
                                    >
                                      {isCopied ? (
                                        <Check className="h-3 w-3 text-[#4cc38a]" />
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

                  <span className="text-[10px] font-mono text-[#85858b] px-1">
                    {message.timestamp}
                  </span>
                </div>
              )
            })}

            {/* Thinking state */}
            {isChatLoading && (
              <div className="flex flex-col space-y-1.5 animate-fadeIn items-start">
                <div className="rounded-lg px-3 py-2 bg-[#19191b] border border-white/[0.06] text-xs flex items-center gap-2.5 text-[#a1a1a6]">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-[#85858b]" />
                  <span>Evaluating context</span>
                  <span className="text-[10px] font-mono tabular-nums text-[#85858b]">
                    {thinkingSeconds}s
                  </span>
                </div>
              </div>
            )}

            {/* Sample queries when history is empty or initial turn */}
            {messages.length === 1 && !isChatLoading && (
              <div className="pt-6 space-y-2">
                <p className="text-[11px] text-[#85858b]">Sample queries</p>
                <div className="space-y-1.5">
                  {sampleQueries.map((query, i) => (
                    <button
                      key={i}
                      onClick={() => executeChatQuery(query)}
                      className="w-full text-left p-2.5 rounded-md border border-white/[0.06] bg-[#19191b] hover:bg-[#232325] text-xs text-[#a1a1a6] hover:text-[#ededed] transition-colors cursor-pointer"
                    >
                      {query}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div ref={chatEndRef} className="h-px w-full" />
          </div>
        </div>

        {/* Input Bar */}
        <div className="p-3 border-t border-white/[0.08] bg-[#0f0f10] flex-shrink-0">
          <form
            onSubmit={(e) => {
              e.preventDefault()
              executeChatQuery(inputQuery)
            }}
            className="max-w-[700px] mx-auto flex items-center gap-2"
          >
            <input
              type="text"
              value={inputQuery}
              onChange={(e) => setInputQuery(e.target.value)}
              placeholder={
                backendOnline === false
                  ? 'Backend offline (127.0.0.1:8000)...'
                  : 'Ask a question about the documents...'
              }
              disabled={isChatLoading || backendOnline === false}
              className="flex-1 h-9 bg-[#19191b] border border-white/[0.08] rounded-md px-3 text-xs text-[#ededed] placeholder-[#85858b] focus:outline-none focus:border-white/30 transition-colors disabled:opacity-40"
            />

            <button
              type="submit"
              disabled={!inputQuery.trim() || isChatLoading || backendOnline === false}
              className="h-9 px-3 rounded-md bg-[#ededed] text-[#141415] hover:bg-white active:scale-[0.99] text-xs font-medium transition-all duration-120 disabled:opacity-30 disabled:pointer-events-none cursor-pointer flex items-center gap-1.5"
            >
              <Send className="h-3 w-3" />
              <span>Send</span>
            </button>
          </form>

          <p className="text-[10px] text-center text-[#85858b] mt-1.5 font-mono">
            Air-gapped execution • User: {currentUser.username} • SQLite session
          </p>
        </div>
      </main>
    </div>
  )
}

export default App