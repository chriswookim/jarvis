import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { api } from '@/api/client'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'

type Priority = 'all' | 'high' | 'medium' | 'low'
type Task = { id: number; title: string; priority: string; assignee: string }

export default function Tasks() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [filter, setFilter] = useState<Priority>('all')
  const [assigneeFilter, setAssigneeFilter] = useState('all')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.getTasks().then(setTasks).finally(() => setLoading(false))
  }, [])

  const assignees = ['all', ...Array.from(new Set(tasks.map(t => t.assignee)))]
  const filtered = tasks.filter(t =>
    (filter === 'all' || t.priority === filter) &&
    (assigneeFilter === 'all' || t.assignee === assigneeFilter)
  )

  const handleReport = async () => {
    setSending(true)
    await api.sendReport()
    setSending(false); setSent(true)
    setTimeout(() => setSent(false), 3000)
  }

  const FILTERS: { label: string; value: Priority }[] = [
    { label: '전체', value: 'all' },
    { label: '높음', value: 'high' },
    { label: '보통', value: 'medium' },
    { label: '낮음', value: 'low' },
  ]

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-text-primary">할 일</h1>
        <Button onClick={handleReport} loading={sending} variant={sent ? 'secondary' : 'primary'}>
          {sent ? '✓ 전송됨' : '📱 Telegram 보고'}
        </Button>
      </div>

      {/* 필터 */}
      <div className="flex flex-wrap gap-2">
        <div className="flex gap-1 bg-neutral-bg3 p-1 rounded-lg">
          {FILTERS.map(f => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                filter === f.value
                  ? 'bg-brand text-white'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="flex gap-1 bg-neutral-bg3 p-1 rounded-lg">
          {assignees.map(a => (
            <button
              key={a}
              onClick={() => setAssigneeFilter(a)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                assigneeFilter === a
                  ? 'bg-neutral-bg6 text-text-primary'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              {a === 'all' ? '전체' : a}
            </button>
          ))}
        </div>
      </div>

      <Card>
        {loading ? (
          <div className="space-y-3">
            {[0,1,2].map(i => <div key={i} className="h-10 bg-neutral-bg3 rounded animate-pulse" />)}
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-text-muted text-center py-8">할 일이 없습니다</p>
        ) : (
          <AnimatePresence>
            <ul className="space-y-0 divide-y divide-border-subtle">
              {filtered.map((t, i) => (
                <motion.li
                  key={t.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: i * 0.03 }}
                  className="flex items-center gap-3 py-3"
                >
                  <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                    t.priority === 'high' ? 'bg-status-error' :
                    t.priority === 'medium' ? 'bg-status-warning' : 'bg-status-success'
                  }`} />
                  <span className="flex-1 text-sm text-text-primary">{t.title}</span>
                  <div className="flex gap-2">
                    <Badge value={t.priority} type="priority" />
                    <Badge value={t.assignee} type="assignee" />
                  </div>
                </motion.li>
              ))}
            </ul>
          </AnimatePresence>
        )}
      </Card>

      <p className="text-xs text-text-muted">총 {filtered.length}개</p>
    </motion.div>
  )
}
