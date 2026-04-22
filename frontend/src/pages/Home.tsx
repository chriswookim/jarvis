import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { api } from '@/api/client'
import StatCard from '@/components/ui/StatCard'
import Card from '@/components/ui/Card'
import Badge from '@/components/ui/Badge'

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08 } },
}
const item = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0 },
}

export default function Home() {
  const [stats, setStats] = useState({ doc_count: 0, knowledge_count: 0, task_count: 0 })
  const [tasks, setTasks] = useState<{ id: number; title: string; priority: string; assignee: string }[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([api.stats(), api.getTasks()])
      .then(([s, t]) => { setStats(s); setTasks(t.slice(0, 5)) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

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
          {[0,1,2].map(i => (
            <div key={i} className="glass-card p-5 h-20 animate-pulse bg-neutral-bg3" />
          ))}
        </div>
      ) : (
        <motion.div variants={item} className="grid grid-cols-3 gap-4">
          <StatCard label="총 문서" value={stats.doc_count} icon="📄" />
          <StatCard label="지식 항목" value={stats.knowledge_count} icon="◎" color="text-status-info" />
          <StatCard label="대기 중인 할 일" value={stats.task_count} icon="✓" color="text-status-warning" />
        </motion.div>
      )}

      <motion.div variants={item}>
        <Card title="최근 할 일">
          {tasks.length === 0 ? (
            <p className="text-sm text-text-muted py-4 text-center">할 일이 없습니다</p>
          ) : (
            <ul className="space-y-2">
              {tasks.map(t => (
                <li key={t.id} className="flex items-center justify-between py-2.5 border-b border-border-subtle last:border-0">
                  <span className="text-sm text-text-primary truncate mr-3">{t.title}</span>
                  <div className="flex gap-2 shrink-0">
                    <Badge value={t.priority} type="priority" />
                    <Badge value={t.assignee} type="assignee" />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </motion.div>
    </motion.div>
  )
}
