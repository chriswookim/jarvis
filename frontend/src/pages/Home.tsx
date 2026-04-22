import { useEffect, useState, useCallback } from 'react'
import { motion } from 'framer-motion'
import { api, Task } from '@/api/client'
import StatCard from '@/components/ui/StatCard'
import Card from '@/components/ui/Card'

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08 } },
}
const item = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0 },
}

type LogEntry = { id: number; level: string; action: string; message: string; created_at: string }

const LEVEL_STYLE: Record<string, string> = {
  success: 'text-status-success',
  error: 'text-status-error',
  info: 'text-text-muted',
}
const LEVEL_DOT: Record<string, string> = {
  success: 'bg-status-success',
  error: 'bg-status-error',
  info: 'bg-neutral-bg6',
}

function timeAgo(dateStr: string) {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000)
  if (diff < 60) return `${diff}초 전`
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`
  return `${Math.floor(diff / 3600)}시간 전`
}

export default function Home() {
  const [stats, setStats] = useState({ doc_count: 0, knowledge_count: 0, task_count: 0 })
  const [tasks, setTasks] = useState<Task[]>([])
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(() => {
    Promise.all([api.stats(), api.getTasks('pending'), api.activity(20)])
      .then(([s, t, l]) => { setStats(s); setTasks(t.slice(0, 5)); setLogs(l) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    refresh()
    const timer = setInterval(refresh, 4000)
    return () => clearInterval(timer)
  }, [refresh])

  return (
    <motion.div initial="hidden" animate="show" variants={stagger} className="space-y-8">
      <motion.div variants={item}>
        <h1 className="text-2xl font-semibold text-text-primary">대시보드</h1>
        <p className="text-sm text-text-muted mt-1">
          {new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })}
        </p>
      </motion.div>

      {loading ? (
        <div className="grid grid-cols-3 gap-4">
          {[0, 1, 2].map(i => <div key={i} className="glass-card p-5 h-20 animate-pulse bg-neutral-bg3" />)}
        </div>
      ) : (
        <motion.div variants={item} className="grid grid-cols-3 gap-4">
          <StatCard label="총 문서" value={stats.doc_count} icon="📄" />
          <StatCard label="지식 항목" value={stats.knowledge_count} icon="◎" color="text-status-info" />
          <StatCard label="대기 중인 할 일" value={stats.task_count} icon="✓" color="text-status-warning" />
        </motion.div>
      )}

      <motion.div variants={item} className="grid grid-cols-2 gap-4">
        {/* 최근 할 일 */}
        <Card title="최근 할 일">
          {tasks.length === 0 ? (
            <p className="text-sm text-text-muted py-4 text-center">할 일이 없습니다</p>
          ) : (
            <ul className="space-y-0 divide-y divide-border-subtle">
              {tasks.map(t => (
                <li key={t.id} className="flex items-center justify-between py-2.5">
                  <span className="text-sm text-text-primary truncate mr-3">{t.title}</span>
                  <div className="flex gap-1.5 shrink-0">
                    <span className="text-xs text-text-muted bg-neutral-bg4 px-1.5 py-0.5 rounded">{t.team}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* 활동 로그 */}
        <Card title="활동 로그">
          {logs.length === 0 ? (
            <p className="text-sm text-text-muted py-4 text-center">활동 내역이 없습니다</p>
          ) : (
            <ul className="space-y-0 divide-y divide-border-subtle max-h-64 overflow-y-auto">
              {logs.map(l => (
                <li key={l.id} className="flex items-start gap-2.5 py-2">
                  <span className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${LEVEL_DOT[l.level] ?? 'bg-neutral-bg6'}`} />
                  <div className="flex-1 min-w-0">
                    <p className={`text-xs font-medium ${LEVEL_STYLE[l.level] ?? 'text-text-muted'}`}>
                      {l.action}
                    </p>
                    <p className="text-xs text-text-secondary truncate">{l.message}</p>
                  </div>
                  <span className="text-xs text-text-muted shrink-0 mt-0.5">{timeAgo(l.created_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </motion.div>
    </motion.div>
  )
}
