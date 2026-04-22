import { useEffect, useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { api } from '@/api/client'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'

type Status = 'pending' | 'in_progress' | 'done'
type Priority = 'all' | 'high' | 'medium' | 'low'
type Task = { id: number; title: string; priority: string; assignee: string; status: Status }

const COLUMNS: { id: Status; label: string; color: string; headerColor: string }[] = [
  { id: 'pending',     label: '대기 중',  color: 'border-neutral-bg5',     headerColor: 'text-text-secondary' },
  { id: 'in_progress', label: '진행 중',  color: 'border-status-info/40',   headerColor: 'text-status-info' },
  { id: 'done',        label: '완료',     color: 'border-status-success/40', headerColor: 'text-status-success' },
]

const STATUS_ORDER: Status[] = ['pending', 'in_progress', 'done']

const PRIORITY_DOT: Record<string, string> = {
  high:   'bg-status-error',
  medium: 'bg-status-warning',
  low:    'bg-status-success',
}

export default function Tasks() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [filter, setFilter] = useState<Priority>('all')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(true)
  const [dragOverCol, setDragOverCol] = useState<Status | null>(null)
  const draggingId = useRef<number | null>(null)

  useEffect(() => {
    api.getTasks().then(data => setTasks(data as Task[])).finally(() => setLoading(false))
  }, [])

  const moveTask = async (id: number, newStatus: Status) => {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, status: newStatus } : t))
    try {
      await api.updateTask(id, newStatus)
    } catch {
      api.getTasks().then(data => setTasks(data as Task[]))
    }
  }

  const handleReport = async () => {
    setSending(true)
    await api.sendReport()
    setSending(false); setSent(true)
    setTimeout(() => setSent(false), 3000)
  }

  const PRIORITY_FILTERS: { label: string; value: Priority }[] = [
    { label: '전체', value: 'all' },
    { label: '높음', value: 'high' },
    { label: '보통', value: 'medium' },
    { label: '낮음', value: 'low' },
  ]

  const visibleTasks = (status: Status) =>
    tasks.filter(t =>
      t.status === status &&
      (filter === 'all' || t.priority === filter)
    )

  // Drag handlers
  const onDragStart = (id: number) => { draggingId.current = id }
  const onDragEnd   = () => { draggingId.current = null; setDragOverCol(null) }
  const onDragOver  = (e: React.DragEvent, col: Status) => {
    e.preventDefault()
    setDragOverCol(col)
  }
  const onDrop = (e: React.DragEvent, col: Status) => {
    e.preventDefault()
    if (draggingId.current !== null) moveTask(draggingId.current, col)
    setDragOverCol(null)
  }

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-text-primary">할 일</h1>
        <Button onClick={handleReport} loading={sending} variant={sent ? 'secondary' : 'primary'}>
          {sent ? '✓ 전송됨' : '📱 Telegram 보고'}
        </Button>
      </div>

      {/* 우선순위 필터 */}
      <div className="flex gap-1 bg-neutral-bg3 p-1 rounded-lg w-fit">
        {PRIORITY_FILTERS.map(f => (
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

      {/* 칸반 보드 */}
      {loading ? (
        <div className="grid grid-cols-3 gap-4">
          {[0, 1, 2].map(i => (
            <div key={i} className="glass-card p-4 space-y-3">
              <div className="h-4 w-24 bg-neutral-bg4 rounded animate-pulse" />
              {[0, 1].map(j => <div key={j} className="h-16 bg-neutral-bg3 rounded-lg animate-pulse" />)}
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-4 items-start">
          {COLUMNS.map(col => {
            const colTasks = visibleTasks(col.id)
            const isDragTarget = dragOverCol === col.id
            return (
              <div
                key={col.id}
                onDragOver={e => onDragOver(e, col.id)}
                onDragLeave={() => setDragOverCol(null)}
                onDrop={e => onDrop(e, col.id)}
                className={`glass-card p-4 border-t-2 transition-colors min-h-[200px] ${col.color} ${
                  isDragTarget ? 'bg-white/10 ring-1 ring-white/20' : ''
                }`}
              >
                {/* 컬럼 헤더 */}
                <div className="flex items-center justify-between mb-4">
                  <h3 className={`text-sm font-semibold ${col.headerColor}`}>
                    {col.label}
                  </h3>
                  <span className="text-xs text-text-muted bg-neutral-bg4 px-2 py-0.5 rounded-full">
                    {colTasks.length}
                  </span>
                </div>

                {/* 카드 목록 */}
                <AnimatePresence>
                  <div className="space-y-2">
                    {colTasks.length === 0 ? (
                      <p className="text-xs text-text-muted text-center py-6 border border-dashed border-border-subtle rounded-lg">
                        없음
                      </p>
                    ) : (
                      colTasks.map(task => {
                        const colIdx = STATUS_ORDER.indexOf(col.id)
                        const canPrev = colIdx > 0
                        const canNext = colIdx < STATUS_ORDER.length - 1
                        return (
                          <motion.div
                            key={task.id}
                            layout
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            draggable
                            onDragStart={() => onDragStart(task.id)}
                            onDragEnd={onDragEnd}
                            className="bg-neutral-bg3 hover:bg-neutral-bg4 border border-border-subtle rounded-lg p-3 cursor-grab active:cursor-grabbing transition-colors group"
                          >
                            {/* 제목 + 우선순위 점 */}
                            <div className="flex items-start gap-2 mb-2.5">
                              <span className={`mt-1 w-1.5 h-1.5 rounded-full shrink-0 ${PRIORITY_DOT[task.priority] ?? 'bg-neutral-bg6'}`} />
                              <p className="text-sm text-text-primary leading-snug flex-1">{task.title}</p>
                            </div>

                            {/* 배지 + 이동 버튼 */}
                            <div className="flex items-center justify-between gap-1">
                              <div className="flex gap-1 flex-wrap">
                                <Badge value={task.priority} type="priority" />
                                <Badge value={task.assignee} type="assignee" />
                              </div>
                              {/* 이동 버튼 (hover 시 표시) */}
                              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                                {canPrev && (
                                  <button
                                    onClick={() => moveTask(task.id, STATUS_ORDER[colIdx - 1])}
                                    title="이전 단계"
                                    className="w-5 h-5 flex items-center justify-center rounded bg-neutral-bg5 hover:bg-neutral-bg6 text-text-secondary hover:text-text-primary text-xs transition-colors"
                                  >
                                    ←
                                  </button>
                                )}
                                {canNext && (
                                  <button
                                    onClick={() => moveTask(task.id, STATUS_ORDER[colIdx + 1])}
                                    title="다음 단계"
                                    className="w-5 h-5 flex items-center justify-center rounded bg-neutral-bg5 hover:bg-neutral-bg6 text-text-secondary hover:text-text-primary text-xs transition-colors"
                                  >
                                    →
                                  </button>
                                )}
                              </div>
                            </div>
                          </motion.div>
                        )
                      })
                    )}
                  </div>
                </AnimatePresence>
              </div>
            )
          })}
        </div>
      )}

      <p className="text-xs text-text-muted">총 {tasks.length}개</p>
    </motion.div>
  )
}
