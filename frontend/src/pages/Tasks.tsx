import { useEffect, useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { api, Task, CoS, TaskStatus } from '@/api/client'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'

const COS_CONFIG: Record<CoS, { label: string; icon: string; border: string; bg: string; text: string }> = {
  expedite:   { label: '긴급',    icon: '🚨', border: 'border-l-status-error',   bg: 'bg-status-error/5',   text: 'text-status-error' },
  fixed_date: { label: '기한고정', icon: '📅', border: 'border-l-status-warning', bg: 'bg-status-warning/5', text: 'text-status-warning' },
  standard:   { label: '일반',    icon: '📌', border: 'border-l-status-info',    bg: 'bg-status-info/5',    text: 'text-status-info' },
  intangible: { label: '장기개선', icon: '💡', border: 'border-l-neutral-bg6',    bg: 'bg-neutral-bg3',      text: 'text-text-muted' },
}

const COS_ORDER: CoS[] = ['expedite', 'fixed_date', 'standard', 'intangible']

const COLUMNS: { id: TaskStatus; label: string; accent: string }[] = [
  { id: 'pending',     label: '대기 중', accent: 'border-t-neutral-bg5' },
  { id: 'in_progress', label: '진행 중', accent: 'border-t-status-info' },
  { id: 'done',        label: '완료',    accent: 'border-t-status-success' },
]
const STATUS_ORDER: TaskStatus[] = ['pending', 'in_progress', 'done']

const WIP_LIMIT = 5

export default function Tasks() {
  const [tasks, setTasks]     = useState<Task[]>([])
  const [cosFilter, setCosFilter] = useState<CoS | 'all'>('all')
  const [teamFilter, setTeamFilter] = useState('all')
  const [sending, setSending] = useState(false)
  const [sent, setSent]       = useState(false)
  const [loading, setLoading] = useState(true)
  const [dragOverCol, setDragOverCol] = useState<TaskStatus | null>(null)
  const draggingId = useRef<number | null>(null)

  useEffect(() => {
    api.getTasks().then(setTasks).finally(() => setLoading(false))
  }, [])

  const teams = ['all', ...Array.from(new Set(tasks.map(t => t.team).filter(Boolean)))]

  const visibleTasks = (status: TaskStatus) =>
    tasks.filter(t =>
      t.status === status &&
      (cosFilter === 'all' || t.class_of_service === cosFilter) &&
      (teamFilter === 'all' || t.team === teamFilter)
    )

  const patchTask = async (id: number, patch: { status?: string; class_of_service?: string }) => {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, ...patch } as Task : t))
    try {
      await api.updateTask(id, patch)
    } catch {
      api.getTasks().then(setTasks)
    }
  }

  const handleReport = async () => {
    setSending(true)
    await api.sendReport()
    setSending(false); setSent(true)
    setTimeout(() => setSent(false), 3000)
  }

  // drag handlers
  const onDragStart = (id: number) => { draggingId.current = id }
  const onDragEnd   = () => { draggingId.current = null; setDragOverCol(null) }
  const onDragOver  = (e: React.DragEvent, col: TaskStatus) => { e.preventDefault(); setDragOverCol(col) }
  const onDrop = (e: React.DragEvent, col: TaskStatus) => {
    e.preventDefault()
    if (draggingId.current !== null) patchTask(draggingId.current, { status: col })
    setDragOverCol(null)
  }

  const inProgressCount = tasks.filter(t => t.status === 'in_progress').length

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-text-primary">할 일</h1>
        <Button onClick={handleReport} loading={sending} variant={sent ? 'secondary' : 'primary'}>
          {sent ? '✓ 전송됨' : '📱 Telegram 보고'}
        </Button>
      </div>

      {/* WIP 경고 */}
      {inProgressCount > WIP_LIMIT && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          className="flex items-center gap-2 bg-status-warning/10 border border-status-warning/25 rounded-lg px-4 py-2.5">
          <span className="text-status-warning text-sm font-medium">
            ⚠️ WIP 한도 초과 — 진행 중 {inProgressCount}건 (권장 {WIP_LIMIT}건 이하)
          </span>
        </motion.div>
      )}

      {/* 필터 */}
      <div className="flex flex-wrap gap-2">
        {/* CoS 필터 */}
        <div className="flex gap-1 bg-neutral-bg3 p-1 rounded-lg">
          <button onClick={() => setCosFilter('all')}
            className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${cosFilter === 'all' ? 'bg-brand text-white' : 'text-text-secondary hover:text-text-primary'}`}>
            전체
          </button>
          {COS_ORDER.map(cos => (
            <button key={cos} onClick={() => setCosFilter(cos)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors flex items-center gap-1 ${cosFilter === cos ? 'bg-brand text-white' : 'text-text-secondary hover:text-text-primary'}`}>
              {COS_CONFIG[cos].icon} {COS_CONFIG[cos].label}
            </button>
          ))}
        </div>
        {/* 팀 필터 */}
        <div className="flex gap-1 bg-neutral-bg3 p-1 rounded-lg flex-wrap">
          {teams.map(t => (
            <button key={t} onClick={() => setTeamFilter(t)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${teamFilter === t ? 'bg-neutral-bg6 text-text-primary' : 'text-text-secondary hover:text-text-primary'}`}>
              {t === 'all' ? '전체팀' : t}
            </button>
          ))}
        </div>
      </div>

      {/* 칸반 보드 */}
      {loading ? (
        <div className="grid grid-cols-3 gap-4">
          {[0, 1, 2].map(i => (
            <div key={i} className="glass-card p-4 space-y-3">
              <div className="h-4 w-24 bg-neutral-bg4 rounded animate-pulse" />
              {[0, 1].map(j => <div key={j} className="h-20 bg-neutral-bg3 rounded-lg animate-pulse" />)}
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-4 items-start">
          {COLUMNS.map(col => {
            const colTasks  = visibleTasks(col.id)
            const isDragTarget = dragOverCol === col.id
            const colIdx    = STATUS_ORDER.indexOf(col.id)

            return (
              <div key={col.id}
                onDragOver={e => onDragOver(e, col.id)}
                onDragLeave={() => setDragOverCol(null)}
                onDrop={e => onDrop(e, col.id)}
                className={`glass-card p-4 border-t-2 transition-all min-h-[200px] ${col.accent} ${isDragTarget ? 'bg-white/10 ring-1 ring-white/20' : ''}`}
              >
                {/* 컬럼 헤더 */}
                <div className="flex items-center justify-between mb-4">
                  <span className="text-sm font-semibold text-text-secondary">{col.label}</span>
                  <span className="text-xs text-text-muted bg-neutral-bg4 px-2 py-0.5 rounded-full">{colTasks.length}</span>
                </div>

                {/* CoS 수영 레인 */}
                <AnimatePresence>
                  <div className="space-y-4">
                    {COS_ORDER.map(cos => {
                      const lane = colTasks.filter(t => t.class_of_service === cos)
                      if (lane.length === 0) return null
                      const cfg = COS_CONFIG[cos]
                      return (
                        <div key={cos}>
                          <p className={`text-xs font-medium mb-1.5 flex items-center gap-1 ${cfg.text}`}>
                            {cfg.icon} {cfg.label}
                          </p>
                          <div className="space-y-2">
                            {lane.map(task => {
                              const canPrev = colIdx > 0
                              const canNext = colIdx < STATUS_ORDER.length - 1
                              return (
                                <motion.div key={task.id} layout
                                  initial={{ opacity: 0, scale: 0.95 }}
                                  animate={{ opacity: 1, scale: 1 }}
                                  exit={{ opacity: 0, scale: 0.95 }}
                                  draggable
                                  onDragStart={() => onDragStart(task.id)}
                                  onDragEnd={onDragEnd}
                                  className={`border-l-2 rounded-lg p-2.5 cursor-grab active:cursor-grabbing group transition-colors ${cfg.border} ${cfg.bg} hover:bg-neutral-bg4`}
                                >
                                  <p className="text-sm text-text-primary leading-snug mb-2">{task.title}</p>
                                  {task.due_date && (
                                    <p className="text-xs text-status-warning mb-1.5">📅 {task.due_date}</p>
                                  )}
                                  <div className="flex items-center justify-between gap-1">
                                    <div className="flex gap-1 flex-wrap">
                                      <span className="text-xs bg-neutral-bg5 text-text-muted px-1.5 py-0.5 rounded">
                                        {task.team}
                                      </span>
                                      {task.assignee && task.assignee !== '나' && (
                                        <span className="text-xs bg-brand-subtle text-brand-light px-1.5 py-0.5 rounded border border-brand/20">
                                          {task.assignee}
                                        </span>
                                      )}
                                    </div>
                                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                                      {canPrev && (
                                        <button
                                          onClick={() => patchTask(task.id, { status: STATUS_ORDER[colIdx - 1] })}
                                          className="w-5 h-5 flex items-center justify-center rounded bg-neutral-bg5 hover:bg-neutral-bg6 text-text-secondary hover:text-text-primary text-xs transition-colors"
                                          title="이전 단계">←</button>
                                      )}
                                      {canNext && (
                                        <button
                                          onClick={() => patchTask(task.id, { status: STATUS_ORDER[colIdx + 1] })}
                                          className="w-5 h-5 flex items-center justify-center rounded bg-neutral-bg5 hover:bg-neutral-bg6 text-text-secondary hover:text-text-primary text-xs transition-colors"
                                          title="다음 단계">→</button>
                                      )}
                                    </div>
                                  </div>
                                </motion.div>
                              )
                            })}
                          </div>
                        </div>
                      )
                    })}
                    {colTasks.length === 0 && (
                      <p className="text-xs text-text-muted text-center py-6 border border-dashed border-border-subtle rounded-lg">없음</p>
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
