import { useEffect, useState, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
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
const DONE_HIDE_DAYS = 7

interface NewTaskForm {
  title: string; class_of_service: CoS; team: string; assignee: string; due_date: string
}
const EMPTY_FORM: NewTaskForm = {
  title: '', class_of_service: 'standard', team: '기획홍보팀', assignee: '나', due_date: '',
}

function isSimilarTitle(a: string, b: string): boolean {
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim()
  if (norm(a) === norm(b)) return true
  const wa = norm(a).split(' ').filter(w => w.length > 1)
  const wb = new Set(norm(b).split(' ').filter(w => w.length > 1))
  if (wa.length === 0) return false
  const overlap = wa.filter(w => wb.has(w)).length
  return overlap / wa.length >= 0.6
}

function isDoneOld(task: Task): boolean {
  if (task.status !== 'done') return false
  if (!task.completed_at) return false
  const days = (Date.now() - new Date(task.completed_at).getTime()) / 86400000
  return days > DONE_HIDE_DAYS
}

export default function Tasks() {
  const [tasks, setTasks]               = useState<Task[]>([])
  const [unconfirmed, setUnconfirmed]   = useState<Task[]>([])
  const [searchParams, setSearchParams] = useSearchParams()
  const cosFilter = (searchParams.get('cos') as CoS | null) ?? 'all'
  const teamFilter = searchParams.get('team') ?? 'all'
  const setCosFilter = (v: CoS | 'all') =>
    setSearchParams(p => { p.set('cos', v); return p }, { replace: true })
  const setTeamFilter = (v: string) =>
    setSearchParams(p => { p.set('team', v); return p }, { replace: true })
  const [sending, setSending]           = useState(false)
  const [sent, setSent]                 = useState(false)
  const [loading, setLoading]           = useState(true)
  const [error, setError]               = useState<string | null>(null)
  const [dragOverCol, setDragOverCol]   = useState<TaskStatus | null>(null)
  const [showOldDone, setShowOldDone]   = useState(false)
  const [confirmingAll, setConfirmingAll] = useState(false)
  const draggingId = useRef<number | null>(null)

  const [showForm, setShowForm] = useState(false)
  const [form, setForm]         = useState<NewTaskForm>(EMPTY_FORM)
  const [creating, setCreating] = useState(false)

  // 검토 중인 태스크의 편집 상태
  const [editMap, setEditMap] = useState<Record<number, Partial<Task>>>({})

  const loadAll = () => {
    setLoading(true)
    Promise.all([api.getTasks(), api.getUnconfirmedTasks()])
      .then(([confirmed, unconf]) => { setTasks(confirmed); setUnconfirmed(unconf) })
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false))
  }

  useEffect(() => { loadAll() }, [])

  const allTeams = [
    'all',
    ...TEAMS.filter(t => tasks.some(task => task.team === t)),
    ...Array.from(new Set(tasks.map(t => t.team).filter(t => t && !TEAMS.includes(t)))),
  ]

  const visibleTasks = (status: TaskStatus) =>
    tasks.filter(t =>
      t.status === status &&
      (cosFilter === 'all' || t.class_of_service === cosFilter) &&
      (teamFilter === 'all' || t.team === teamFilter) &&
      (status !== 'done' || showOldDone || !isDoneOld(t))
    )

  const oldDoneCount = tasks.filter(isDoneOld).length

  const patchTask = async (id: number, patch: Parameters<typeof api.updateTask>[1]) => {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, ...patch } as Task : t))
    try { await api.updateTask(id, patch) }
    catch { api.getTasks().then(setTasks) }
  }

  const removeTask = async (id: number) => {
    setTasks(prev => prev.filter(t => t.id !== id))
    try { await api.deleteTask(id) }
    catch { api.getTasks().then(setTasks) }
  }

  const handleCreate = async () => {
    if (!form.title.trim()) return
    setCreating(true)
    try {
      const created = await api.createTask({
        title: form.title.trim(), class_of_service: form.class_of_service,
        team: form.team, assignee: form.assignee || '나',
        due_date: form.due_date || undefined,
      })
      setTasks(prev => [created, ...prev])
      setForm(EMPTY_FORM); setShowForm(false)
    } finally { setCreating(false) }
  }

  const handleReport = async () => {
    setSending(true); await api.sendReport()
    setSending(false); setSent(true); setTimeout(() => setSent(false), 3000)
  }

  // ── 검토 패널 핸들러 ───────────────────────────────────────
  const getEdit = (task: Task) => ({ ...task, ...(editMap[task.id] ?? {}) } as Task)

  const setEdit = (id: number, patch: Partial<Task>) =>
    setEditMap(prev => ({ ...prev, [id]: { ...(prev[id] ?? {}), ...patch } }))

  const handleConfirm = async (task: Task) => {
    const edited = getEdit(task)
    // 편집된 필드 먼저 저장
    const patch: Parameters<typeof api.updateTask>[1] = {}
    if (edited.title !== task.title) patch.title = edited.title
    if (edited.class_of_service !== task.class_of_service) patch.class_of_service = edited.class_of_service
    if (edited.team !== task.team) patch.team = edited.team
    if (edited.assignee !== task.assignee) patch.assignee = edited.assignee
    if (edited.due_date !== task.due_date) patch.due_date = edited.due_date ?? ''
    if (Object.keys(patch).length > 0) await api.updateTask(task.id, patch)
    const confirmed = await api.confirmTask(task.id)
    setTasks(prev => [confirmed, ...prev])
    setUnconfirmed(prev => prev.filter(t => t.id !== task.id))
    setEditMap(prev => { const n = { ...prev }; delete n[task.id]; return n })
  }

  const handleReject = async (id: number) => {
    if (!window.confirm('이 할 일을 삭제하시겠습니까?')) return
    setUnconfirmed(prev => prev.filter(t => t.id !== id))
    await api.deleteTask(id)
  }

  const handleConfirmAll = async () => {
    setConfirmingAll(true)
    try {
      await api.confirmAllTasks()
      await loadAll()
    } finally { setConfirmingAll(false) }
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
    <div className="flex flex-col h-full overflow-hidden">
      {/* 스크롤 영역 */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-4 lg:p-6 space-y-5">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">

            {/* 헤더 */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h1 className="text-2xl font-semibold text-text-primary">할 일</h1>
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" size="sm" onClick={() => { setForm(EMPTY_FORM); setShowForm(v => !v) }}>
                  {showForm ? '✕ 닫기' : '+ 새 할 일'}
                </Button>
                <Button size="sm" onClick={handleReport} loading={sending} variant={sent ? 'secondary' : 'primary'}>
                  {sent ? '✓ 전송됨' : '📱 보고'}
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
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="sm:col-span-2">
                      <label className="text-xs text-text-muted mb-1 block">제목 *</label>
                      <input
                        name="title"
                        autoComplete="off"
                        value={form.title}
                        onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                        onKeyDown={e => e.key === 'Enter' && handleCreate()}
                        placeholder="할 일 내용을 입력하세요"
                        className="glass-input w-full px-3 py-2 text-sm rounded-lg"
                        autoFocus
                      />
                    </div>
                    <div>
                      <label className="text-xs text-text-muted mb-1 block">서비스 등급</label>
                      <select
                        name="class_of_service"
                        aria-label="서비스 등급"
                        value={form.class_of_service}
                        onChange={e => setForm(f => ({ ...f, class_of_service: e.target.value as CoS }))}
                        className="glass-input w-full px-3 py-2 text-sm bg-neutral-bg3 rounded-lg border border-border-subtle cursor-pointer">
                        {COS_ORDER.map(c => <option key={c} value={c}>{COS_CONFIG[c].icon} {COS_CONFIG[c].label}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-text-muted mb-1 block">담당 팀</label>
                      <select
                        name="team"
                        aria-label="담당 팀"
                        value={form.team}
                        onChange={e => setForm(f => ({ ...f, team: e.target.value }))}
                        className="glass-input w-full px-3 py-2 text-sm bg-neutral-bg3 rounded-lg border border-border-subtle cursor-pointer">
                        {TEAMS.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-text-muted mb-1 block">담당자</label>
                      <input
                        name="assignee"
                        autoComplete="off"
                        value={form.assignee}
                        onChange={e => setForm(f => ({ ...f, assignee: e.target.value }))}
                        placeholder="나"
                        className="glass-input w-full px-3 py-2 text-sm rounded-lg" />
                    </div>
                    <div>
                      <label className="text-xs text-text-muted mb-1 block">기한 (선택)</label>
                      <input
                        type="date"
                        name="due_date"
                        value={form.due_date}
                        onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))}
                        className="glass-input w-full px-3 py-2 text-sm bg-neutral-bg3 rounded-lg border border-border-subtle cursor-pointer" />
                    </div>
                  </div>
                  <div className="flex gap-2 justify-end">
                    <Button variant="ghost" size="sm" onClick={() => setShowForm(false)}>취소</Button>
                    <Button size="sm" onClick={handleCreate} loading={creating} disabled={!form.title.trim()}>추가</Button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* ── 검토 대기 패널 ─────────────────────────────────── */}
            <AnimatePresence>
              {unconfirmed.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
                  className="glass-card border border-status-warning/30 bg-status-warning/5">
                  <div className="flex items-center justify-between px-5 py-3 border-b border-status-warning/20">
                    <div className="flex items-center gap-2">
                      <span className="text-status-warning text-sm font-semibold">
                        📋 검토 대기 — {unconfirmed.length}개
                      </span>
                      <span className="text-xs text-text-muted">AI가 추출한 할 일입니다. 확인 후 칸반에 추가됩니다.</span>
                    </div>
                    <Button size="sm" variant="secondary" onClick={handleConfirmAll} loading={confirmingAll}>
                      모두 수락
                    </Button>
                  </div>
                  <ul className="divide-y divide-border-subtle">
                    {unconfirmed.map(task => {
                      const edited = getEdit(task)
                      const cfg = COS_CONFIG[edited.class_of_service as CoS] ?? COS_CONFIG.standard
                      const duplicate = tasks.some(t => t.status !== 'done' && isSimilarTitle(t.title, edited.title))
                      return (
                        <li key={task.id} className="px-5 py-3 space-y-2">
                          <div className="flex items-start gap-2">
                            <input
                              value={edited.title}
                              onChange={e => setEdit(task.id, { title: e.target.value })}
                              className="flex-1 bg-transparent text-sm text-text-primary outline-none border-b border-transparent focus-visible:border-brand transition-colors pb-0.5"
                            />
                            {duplicate && (
                              <span className="text-xs text-status-warning bg-status-warning/10 px-2 py-0.5 rounded shrink-0" title="유사한 할 일이 이미 존재합니다">
                                중복 의심
                              </span>
                            )}
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <select value={edited.class_of_service}
                              aria-label="서비스 등급"
                              onChange={e => setEdit(task.id, { class_of_service: e.target.value as CoS })}
                              className={`text-xs px-2 py-1 rounded border-0 cursor-pointer bg-neutral-bg4 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand ${cfg.text}`}>
                              {COS_ORDER.map(c => <option key={c} value={c}>{COS_CONFIG[c].icon} {COS_CONFIG[c].label}</option>)}
                            </select>
                            <select value={edited.team}
                              aria-label="담당 팀"
                              onChange={e => setEdit(task.id, { team: e.target.value })}
                              className="text-xs px-2 py-1 rounded border-0 cursor-pointer bg-neutral-bg4 text-text-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand">
                              {TEAMS.map(t => <option key={t} value={t}>{t}</option>)}
                              <option value="미분류">미분류</option>
                            </select>
                            <input
                              aria-label="담당자"
                              value={edited.assignee ?? '나'}
                              onChange={e => setEdit(task.id, { assignee: e.target.value })}
                              placeholder="담당자"
                              className="text-xs px-2 py-1 rounded bg-neutral-bg4 text-text-muted w-20 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand"
                            />
                            <input type="date"
                              aria-label="기한"
                              value={edited.due_date ?? ''}
                              onChange={e => setEdit(task.id, { due_date: e.target.value || null })}
                              className="text-xs px-2 py-1 rounded bg-neutral-bg4 text-text-muted cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand"
                            />
                            <div className="flex gap-1 ml-auto">
                              <button
                                onClick={() => handleConfirm(task)}
                                className="text-xs px-3 py-1 rounded bg-status-success/20 text-status-success hover:bg-status-success/30 transition-colors font-medium">
                                ✓ 확인
                              </button>
                              <button
                                onClick={() => handleReject(task.id)}
                                className="text-xs px-3 py-1 rounded bg-neutral-bg4 text-text-muted hover:bg-status-error/20 hover:text-status-error transition-colors">
                                ✕ 삭제
                              </button>
                            </div>
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                </motion.div>
              )}
            </AnimatePresence>

            {/* WIP 경고 */}
            {inProgressCount > WIP_LIMIT && (
              <div className="flex items-center gap-2 bg-status-warning/10 border border-status-warning/25 rounded-lg px-4 py-2.5">
                <span className="text-status-warning text-sm font-medium">
                  ⚠️ WIP 한도 초과 — 진행 중 {inProgressCount}건 (권장 {WIP_LIMIT}건 이하)
                </span>
              </div>
            )}

            {/* 필터 */}
            <div className="flex flex-wrap gap-2">
              <div className="flex flex-wrap gap-1 bg-neutral-bg3 p-1 rounded-lg">
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
              <div className="flex flex-wrap gap-1 bg-neutral-bg3 p-1 rounded-lg">
                {allTeams.map(t => (
                  <button key={t} onClick={() => setTeamFilter(t)}
                    className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${teamFilter === t ? 'bg-neutral-bg6 text-text-primary' : 'text-text-secondary hover:text-text-primary'}`}>
                    {t === 'all' ? '전체팀' : t}
                  </button>
                ))}
              </div>
            </div>

            {error && (
              <div role="alert" className="bg-status-error/10 border border-status-error/25 rounded-lg px-4 py-3 text-sm text-status-error">
                {error}
              </div>
            )}

            {/* 칸반 보드 */}
            {loading ? (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {[0, 1, 2].map(i => (
                  <div key={i} className="glass-card p-4 space-y-3">
                    <div className="h-4 w-24 bg-neutral-bg4 rounded animate-pulse" />
                    {[0, 1].map(j => <div key={j} className="h-20 bg-neutral-bg3 rounded-lg animate-pulse" />)}
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-start">
                {COLUMNS.map(col => {
                  const colTasks = visibleTasks(col.id)
                  const isDragTarget = dragOverCol === col.id
                  const colIdx = STATUS_ORDER.indexOf(col.id)
                  const hiddenCount = col.id === 'done' && !showOldDone ? oldDoneCount : 0

                  return (
                    <div key={col.id}
                      onDragOver={e => onDragOver(e, col.id)}
                      onDragLeave={() => setDragOverCol(null)}
                      onDrop={e => onDrop(e, col.id)}
                      className={`glass-card p-4 border-t-2 transition-all min-h-[160px] ${col.accent} ${isDragTarget ? 'bg-white/10 ring-1 ring-white/20' : ''}`}
                    >
                      <div className="flex items-center justify-between mb-4">
                        <span className="text-sm font-semibold text-text-secondary">{col.label}</span>
                        <div className="flex items-center gap-1.5">
                          {hiddenCount > 0 && (
                            <button
                              onClick={() => setShowOldDone(true)}
                              className="text-xs text-text-muted hover:text-text-secondary underline transition-colors"
                              title={`${DONE_HIDE_DAYS}일 이상 지난 완료 ${hiddenCount}건 숨김`}
                            >
                              +{hiddenCount}개 숨김
                            </button>
                          )}
                          {col.id === 'done' && showOldDone && (
                            <button
                              onClick={() => setShowOldDone(false)}
                              className="text-xs text-text-muted hover:text-text-secondary transition-colors"
                            >
                              최근만
                            </button>
                          )}
                          <span className="text-xs text-text-muted bg-neutral-bg4 px-2 py-0.5 rounded-full">{colTasks.length}</span>
                        </div>
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
                                        <div className="flex items-center justify-between gap-1">
                                          <div className="flex gap-1 flex-wrap">
                                            <select
                                              aria-label="담당 팀"
                                              value={task.team || '미분류'}
                                              onChange={e => patchTask(task.id, { team: e.target.value })}
                                              onClick={e => e.stopPropagation()}
                                              className="text-xs bg-neutral-bg5 text-text-muted px-1.5 py-0.5 rounded border-0 cursor-pointer hover:bg-neutral-bg6 transition-colors">
                                              {TEAMS.map(t => <option key={t} value={t}>{t}</option>)}
                                              <option value="미분류">미분류</option>
                                            </select>
                                            <select
                                              aria-label="서비스 등급"
                                              value={task.class_of_service || 'standard'}
                                              onChange={e => patchTask(task.id, { class_of_service: e.target.value })}
                                              onClick={e => e.stopPropagation()}
                                              className={`text-xs px-1.5 py-0.5 rounded border-0 cursor-pointer transition-colors ${cfg.text} bg-transparent hover:bg-neutral-bg5`}>
                                              {COS_ORDER.map(c => (
                                                <option key={c} value={c}>{COS_CONFIG[c].icon} {COS_CONFIG[c].label}</option>
                                              ))}
                                            </select>
                                            <input
                                              type="date"
                                              aria-label="기한"
                                              value={task.due_date ?? ''}
                                              onChange={e => patchTask(task.id, { due_date: e.target.value || undefined })}
                                              onClick={e => e.stopPropagation()}
                                              className={`text-xs px-1.5 py-0.5 rounded border-0 cursor-pointer bg-neutral-bg5 hover:bg-neutral-bg6 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand ${task.due_date ? 'text-status-warning' : 'text-text-muted'}`}
                                            />
                                          </div>
                                          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                                            {canPrev && (
                                              <button
                                                onClick={() => patchTask(task.id, { status: STATUS_ORDER[colIdx - 1] })}
                                                aria-label="이전 단계"
                                                className="w-7 h-7 flex items-center justify-center rounded bg-neutral-bg5 hover:bg-neutral-bg6 text-text-secondary text-xs transition-colors" style={{touchAction:'manipulation'}}>←</button>
                                            )}
                                            {canNext && (
                                              <button
                                                onClick={() => patchTask(task.id, { status: STATUS_ORDER[colIdx + 1] })}
                                                aria-label="다음 단계"
                                                className="w-7 h-7 flex items-center justify-center rounded bg-neutral-bg5 hover:bg-neutral-bg6 text-text-secondary text-xs transition-colors" style={{touchAction:'manipulation'}}>→</button>
                                            )}
                                            <button
                                              onClick={() => removeTask(task.id)}
                                              aria-label="할 일 삭제"
                                              className="w-7 h-7 flex items-center justify-center rounded bg-neutral-bg5 hover:bg-status-error/20 text-text-muted hover:text-status-error text-xs transition-colors" style={{touchAction:'manipulation'}}>✕</button>
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

            <p className="text-xs text-text-muted">총 {tasks.length}개{unconfirmed.length > 0 ? ` · 검토 대기 ${unconfirmed.length}개` : ''}</p>
          </motion.div>
        </div>
      </div>
    </div>
  )
}
