import { useEffect, useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { api, Task, CoS, TaskStatus } from '@/api/client'
import Button from '@/components/ui/Button'

const TEAMS = [
  '기획홍보팀', '법제팀', '해외수주지원팀', '산업혁신팀', '총무관리팀',
  '정보화팀', '경영지원팀', '회원서비스팀', '경력관리팀', '인재육성팀', '엔지니어링데일리',
]

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

interface NewTaskForm {
  title: string
  class_of_service: CoS
  team: string
  assignee: string
  due_date: string
}

const EMPTY_FORM: NewTaskForm = {
  title: '', class_of_service: 'standard', team: '기획홍보팀', assignee: '나', due_date: '',
}

export default function Tasks() {
  const [tasks, setTasks]         = useState<Task[]>([])
  const [cosFilter, setCosFilter] = useState<CoS | 'all'>('all')
  const [teamFilter, setTeamFilter] = useState('all')
  const [sending, setSending]     = useState(false)
  const [sent, setSent]           = useState(false)
  const [loading, setLoading]     = useState(true)
  const [dragOverCol, setDragOverCol] = useState<TaskStatus | null>(null)
  const draggingId = useRef<number | null>(null)

  const [showForm, setShowForm]   = useState(false)
  const [form, setForm]           = useState<NewTaskForm>(EMPTY_FORM)
  const [creating, setCreating]   = useState(false)

  useEffect(() => {
    api.getTasks().then(setTasks).finally(() => setLoading(false))
  }, [])

  const allTeams = ['all', ...Array.from(new Set(tasks.map(t => t.team).filter(Boolean)))]

  const visibleTasks = (status: TaskStatus) =>
    tasks.filter(t =>
      t.status === status &&
      (cosFilter === 'all' || t.class_of_service === cosFilter) &&
      (teamFilter === 'all' || t.team === teamFilter)
    )

  const patchTask = async (id: number, patch: { status?: string; class_of_service?: string; team?: string }) => {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, ...patch } as Task : t))
    try {
      await api.updateTask(id, patch)
    } catch {
      api.getTasks().then(setTasks)
    }
  }

  const removeTask = async (id: number) => {
    setTasks(prev => prev.filter(t => t.id !== id))
    try {
      await api.deleteTask(id)
    } catch {
      api.getTasks().then(setTasks)
    }
  }

  const handleCreate = async () => {
    if (!form.title.trim()) return
    setCreating(true)
    try {
      const created = await api.createTask({
        title: form.title.trim(),
        class_of_service: form.class_of_service,
        team: form.team,
        assignee: form.assignee || '나',
        due_date: form.due_date || undefined,
      })
      setTasks(prev => [created, ...prev])
      setForm(EMPTY_FORM)
      setShowForm(false)
    } finally {
      setCreating(false)
    }
  }

  const handleReport = async () => {
    setSending(true)
    await api.sendReport()
    setSending(false); setSent(true)
    setTimeout(() => setSent(false), 3000)
  }

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
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-text-primary">할 일</h1>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => { setForm(EMPTY_FORM); setShowForm(v => !v) }}>
            {showForm ? '✕ 닫기' : '+ 새 할 일'}
          </Button>
          <Button onClick={handleReport} loading={sending} variant={sent ? 'secondary' : 'primary'}>
            {sent ? '✓ 전송됨' : '📱 Telegram 보고'}
          </Button>
        </div>
      </div>

      {/* 새 할 일 폼 */}
      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
            className="glass-card p-5 space-y-4">
            <h3 className="text-sm font-semibold text-text-primary">새 할 일 추가</h3>
            <div className="grid grid-cols-2 gap-3">
              {/* 제목 */}
              <div className="col-span-2">
                <label className="text-xs text-text-muted mb-1 block">제목 *</label>
                <input
                  value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  onKeyDown={e => e.key === 'Enter' && handleCreate()}
                  placeholder="할 일 내용을 입력하세요"
                  className="glass-input w-full px-3 py-2 text-sm rounded-lg outline-none"
                  autoFocus
                />
              </div>
              {/* CoS */}
              <div>
                <label className="text-xs text-text-muted mb-1 block">서비스 등급</label>
                <select
                  value={form.class_of_service}
                  onChange={e => setForm(f => ({ ...f, class_of_service: e.target.value as CoS }))}
                  className="glass-input w-full px-3 py-2 text-sm bg-neutral-bg3 rounded-lg border border-border-subtle outline-none cursor-pointer"
                >
                  {COS_ORDER.map(c => (
                    <option key={c} value={c}>{COS_CONFIG[c].icon} {COS_CONFIG[c].label}</option>
                  ))}
                </select>
              </div>
              {/* 팀 */}
              <div>
                <label className="text-xs text-text-muted mb-1 block">담당 팀</label>
                <select
                  value={form.team}
                  onChange={e => setForm(f => ({ ...f, team: e.target.value }))}
                  className="glass-input w-full px-3 py-2 text-sm bg-neutral-bg3 rounded-lg border border-border-subtle outline-none cursor-pointer"
                >
                  {TEAMS.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              {/* 담당자 */}
              <div>
                <label className="text-xs text-text-muted mb-1 block">담당자</label>
                <input
                  value={form.assignee}
                  onChange={e => setForm(f => ({ ...f, assignee: e.target.value }))}
                  placeholder="나"
                  className="glass-input w-full px-3 py-2 text-sm rounded-lg outline-none"
                />
              </div>
              {/* 기한 */}
              <div>
                <label className="text-xs text-text-muted mb-1 block">기한 (선택)</label>
                <input
                  type="date"
                  value={form.due_date}
                  onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))}
                  className="glass-input w-full px-3 py-2 text-sm bg-neutral-bg3 rounded-lg border border-border-subtle outline-none cursor-pointer"
                />
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" size="sm" onClick={() => setShowForm(false)}>취소</Button>
              <Button size="sm" onClick={handleCreate} loading={creating} disabled={!form.title.trim()}>
                추가
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

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
        <div className="flex gap-1 bg-neutral-bg3 p-1 rounded-lg flex-wrap">
          {allTeams.map(t => (
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
            const colTasks = visibleTasks(col.id)
            const isDragTarget = dragOverCol === col.id
            const colIdx = STATUS_ORDER.indexOf(col.id)

            return (
              <div key={col.id}
                onDragOver={e => onDragOver(e, col.id)}
                onDragLeave={() => setDragOverCol(null)}
                onDrop={e => onDrop(e, col.id)}
                className={`glass-card p-4 border-t-2 transition-all min-h-[200px] ${col.accent} ${isDragTarget ? 'bg-white/10 ring-1 ring-white/20' : ''}`}
              >
                <div className="flex items-center justify-between mb-4">
                  <span className="text-sm font-semibold text-text-secondary">{col.label}</span>
                  <span className="text-xs text-text-muted bg-neutral-bg4 px-2 py-0.5 rounded-full">{colTasks.length}</span>
                </div>

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
                                      {/* 팀 배지 — 클릭으로 팀 순환 변경 */}
                                      <select
                                        value={task.team || '미분류'}
                                        onChange={e => patchTask(task.id, { team: e.target.value })}
                                        onClick={e => e.stopPropagation()}
                                        className="text-xs bg-neutral-bg5 text-text-muted px-1.5 py-0.5 rounded border-0 outline-none cursor-pointer hover:bg-neutral-bg6 transition-colors"
                                        title="팀 변경"
                                      >
                                        {TEAMS.map(t => <option key={t} value={t}>{t}</option>)}
                                        <option value="미분류">미분류</option>
                                      </select>
                                      {/* CoS 배지 — 클릭으로 변경 */}
                                      <select
                                        value={task.class_of_service || 'standard'}
                                        onChange={e => patchTask(task.id, { class_of_service: e.target.value })}
                                        onClick={e => e.stopPropagation()}
                                        className={`text-xs px-1.5 py-0.5 rounded border-0 outline-none cursor-pointer transition-colors ${cfg.text} bg-transparent hover:bg-neutral-bg5`}
                                        title="CoS 변경"
                                      >
                                        {COS_ORDER.map(c => (
                                          <option key={c} value={c}>{COS_CONFIG[c].icon} {COS_CONFIG[c].label}</option>
                                        ))}
                                      </select>
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
                                      <button
                                        onClick={() => removeTask(task.id)}
                                        className="w-5 h-5 flex items-center justify-center rounded bg-neutral-bg5 hover:bg-status-error/20 text-text-muted hover:text-status-error text-xs transition-colors"
                                        title="삭제">✕</button>
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
