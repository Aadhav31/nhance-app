import { Loader2 } from 'lucide-react'

export default function LoadingScreen({ message = 'Loading…' }) {
  return (
    <div className="min-h-screen bg-dark-900 flex flex-col items-center justify-center gap-4">
      <div className="text-2xl font-black tracking-tight bg-gradient-to-r from-primary-400 to-cyan-400 bg-clip-text text-transparent">
        NHANCE
      </div>
      <Loader2 className="w-6 h-6 text-primary-400 animate-spin" />
      <p className="text-slate-500 text-sm">{message}</p>
    </div>
  )
}
