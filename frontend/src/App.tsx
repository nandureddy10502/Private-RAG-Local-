import { useState, useEffect } from 'react'
import { 
  ShieldCheck, 
  Server, 
  Cpu, 
  Database, 
  CheckCircle2, 
  RefreshCw, 
  AlertCircle,
  Activity,
  Layers,
  Terminal
} from 'lucide-react'

interface HealthResponse {
  status: string
  timestamp: string
  services: {
    api: string
    ollama: string
  }
  ollama_models: string[]
  environment: {
    mode: string
  }
}

export function App() {
  const [health, setHealth] = useState<HealthResponse | null>(null)
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)
  const [lastChecked, setLastChecked] = useState<string>('')

  const checkHealth = async () => {
    setLoading(true)
    setError(null)
    try {
      // Connect to FastAPI backend (proxied via Vite or direct)
      const res = await fetch('/health')
      if (!res.ok) {
        throw new Error(`Server returned ${res.status}: ${res.statusText}`)
      }
      const data: HealthResponse = await res.json()
      setHealth(data)
      setLastChecked(new Date().toLocaleTimeString())
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to connect to backend'
      setError(msg)
      setHealth(null)
      setLastChecked(new Date().toLocaleTimeString())
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    checkHealth()
  }, [])

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900/60 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
              <ShieldCheck className="h-6 w-6 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-bold text-lg text-white tracking-tight">Privacy-Preserving RAG</h1>
                <span className="text-xs px-2 py-0.5 rounded-full font-mono font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  Air-Gapped
                </span>
              </div>
              <p className="text-xs text-slate-400">Enterprise Semantic Search on Local Hardware</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <button
              onClick={checkHealth}
              disabled={loading}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 active:scale-95 transition border border-slate-700 text-slate-200 disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              Test API Connection
            </button>
            <div className="text-right hidden sm:block">
              <div className="text-[11px] text-slate-500">Last Checked</div>
              <div className="text-xs font-mono text-slate-300">{lastChecked || 'Checking...'}</div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-8 flex-1 w-full space-y-8">
        
        {/* Status Banner */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Backend API Box */}
          <div className="p-5 rounded-xl border border-slate-800 bg-slate-900/50 relative overflow-hidden">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                <Server className="h-4 w-4 text-cyan-400" />
                FastAPI Backend
              </span>
              {health?.status === 'healthy' ? (
                <span className="flex items-center gap-1.5 text-xs text-emerald-400 font-medium">
                  <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
                  Online (:8000)
                </span>
              ) : (
                <span className="flex items-center gap-1.5 text-xs text-amber-400 font-medium">
                  <AlertCircle className="h-3.5 w-3.5" />
                  {loading ? 'Connecting...' : 'Offline'}
                </span>
              )}
            </div>
            <div className="text-sm font-medium text-slate-200">
              {health ? 'Service is running normally' : (error || 'Backend not reachable')}
            </div>
            <div className="text-xs text-slate-500 mt-1 font-mono">
              Endpoint: /health
            </div>
          </div>

          {/* Ollama Service Box */}
          <div className="p-5 rounded-xl border border-slate-800 bg-slate-900/50">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                <Cpu className="h-4 w-4 text-purple-400" />
                Local Ollama Engine
              </span>
              {health?.services?.ollama === 'connected' ? (
                <span className="flex items-center gap-1.5 text-xs text-emerald-400 font-medium">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                  Connected (:11434)
                </span>
              ) : (
                <span className="flex items-center gap-1.5 text-xs text-slate-400 font-medium">
                  <Activity className="h-3.5 w-3.5 text-amber-400" />
                  {health?.services?.ollama || 'Pending'}
                </span>
              )}
            </div>
            <div className="text-sm font-medium text-slate-200 truncate">
              {health?.ollama_models?.length 
                ? `${health.ollama_models.length} model(s) installed` 
                : 'Waiting for Ollama models'}
            </div>
            <div className="text-xs text-slate-500 mt-1 truncate font-mono">
              {health?.ollama_models?.length 
                ? health.ollama_models.slice(0, 2).join(', ')
                : 'ollama list'}
            </div>
          </div>

          {/* Vector Store Box */}
          <div className="p-5 rounded-xl border border-slate-800 bg-slate-900/50">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                <Database className="h-4 w-4 text-emerald-400" />
                ChromaDB Vector Store
              </span>
              <span className="text-xs text-cyan-400 font-medium">Local Disk</span>
            </div>
            <div className="text-sm font-medium text-slate-200">
              Zero Cloud Dependencies
            </div>
            <div className="text-xs text-slate-500 mt-1 font-mono">
              Embeddings stay on localhost
            </div>
          </div>
        </section>

        {/* Phase Roadmap */}
        <section className="p-6 rounded-2xl border border-slate-800 bg-slate-900/30">
          <div className="flex items-center gap-2 mb-4">
            <Layers className="h-5 w-5 text-cyan-400" />
            <h2 className="text-base font-semibold text-white">Project Execution Roadmap</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* Phase 1 */}
            <div className="p-4 rounded-xl border border-cyan-500/40 bg-cyan-950/20">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-cyan-400">PHASE 1</span>
                <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-cyan-500/20 text-cyan-300">
                  COMPLETED
                </span>
              </div>
              <h3 className="font-semibold text-slate-200 text-sm mb-1">Project Scaffolding</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Monorepo setup with FastAPI, virtualenv, dependencies, Vite, React, TypeScript, and Tailwind CSS.
              </p>
            </div>

            {/* Phase 2 */}
            <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/20">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-slate-500">PHASE 2</span>
                <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-slate-800 text-slate-400">
                  NEXT UP
                </span>
              </div>
              <h3 className="font-semibold text-slate-300 text-sm mb-1">Document Ingestion</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                PDF upload endpoint, LangChain PyPDF parsing, recursive text chunking, and ChromaDB persistence.
              </p>
            </div>

            {/* Phase 3 */}
            <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/20">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-slate-500">PHASE 3</span>
                <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-slate-800 text-slate-400">
                  PLANNED
                </span>
              </div>
              <h3 className="font-semibold text-slate-300 text-sm mb-1">RAG Core</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Similarity search against ChromaDB, context-augmented prompt templates, and local Ollama streaming.
              </p>
            </div>

            {/* Phase 4 */}
            <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/20">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-slate-500">PHASE 4</span>
                <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-slate-800 text-slate-400">
                  PLANNED
                </span>
              </div>
              <h3 className="font-semibold text-slate-300 text-sm mb-1">Dual-Pane Interface</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Drag-and-drop document manager on the left and full streaming conversational UI on the right.
              </p>
            </div>
          </div>
        </section>

        {/* Quick Diagnostic / System Info */}
        <section className="p-6 rounded-2xl border border-slate-800 bg-slate-900/40">
          <div className="flex items-center gap-2 mb-4">
            <Terminal className="h-5 w-5 text-indigo-400" />
            <h2 className="text-base font-semibold text-white">Live Diagnostics & Health Payload</h2>
          </div>

          <div className="rounded-xl bg-slate-950 p-4 border border-slate-800 font-mono text-xs overflow-x-auto text-slate-300">
            {loading ? (
              <div className="text-slate-500 py-2">Querying /health endpoint...</div>
            ) : health ? (
              <pre className="text-emerald-400">{JSON.stringify(health, null, 2)}</pre>
            ) : (
              <div className="text-rose-400 py-2">
                {`Error contacting backend: ${error}\nMake sure uvicorn is running on port 8000.`}
              </div>
            )}
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-900 py-4 text-center text-xs text-slate-600">
        Privacy-Preserving RAG • Monorepo Scaffolding • Air-Gapped Localhost Architecture
      </footer>
    </div>
  )
}

export default App
