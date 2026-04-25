import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { motion } from 'framer-motion'
import { api } from '@/api/client'
import Button from '@/components/ui/Button'

export default function Login({ onLogin }: { onLogin: (token: string) => void }) {
  const [password, setPassword]     = useState('')
  const [showPassword, setShowPass] = useState(false)
  const [loading, setLoading]       = useState(false)
  const [error, setError]           = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!password.trim()) return
    setLoading(true); setError('')
    try {
      const { token } = await api.login(password)
      localStorage.setItem('jarvis_token', token)
      onLogin(token)
    } catch {
      setError('비밀번호가 틀렸습니다')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-bg1">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-card p-8 w-full max-w-sm space-y-6"
      >
        <div className="text-center">
          <h1 className="text-2xl font-bold text-text-primary">Jarvis</h1>
          <p className="text-sm text-text-muted mt-1">비밀번호를 입력하세요</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="relative">
            <label htmlFor="password" className="sr-only">비밀번호</label>
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              name="password"
              autoComplete="current-password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="비밀번호"
              autoFocus
              className="glass-input w-full px-4 py-3 pr-11 text-sm rounded-lg"
            />
            <button
              type="button"
              onClick={() => setShowPass(v => !v)}
              aria-label={showPassword ? '비밀번호 숨기기' : '비밀번호 표시'}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary transition-colors"
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          {error && (
            <p role="alert" className="text-xs text-status-error">{error}</p>
          )}
          <Button type="submit" loading={loading} disabled={!password.trim()} className="w-full">
            로그인
          </Button>
        </form>
      </motion.div>
    </div>
  )
}
