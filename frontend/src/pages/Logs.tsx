import { useEffect, useState, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { api } from '@/api/client'

type Log = { id: number; level: string; action: string; message: string; created_at: string }

const LEVEL_STYLE: Record<string, string> = {
  success: 'text-status-success bg-status-success/10 border-status-success/20',
  error:   'text-status-error   bg-status-error/10   border-status-error/20',
  info:    'text-text-muted     bg-neutral-bg3        border-border-subtle',
}
const LEVEL_DOT: Record<string, string> = {
  success: 'bg-status-success',
  error:   'bg-status-error',
  info:    'bg-neutral-bg6',
}
const LEVEL_LABEL: Record<string, string> = {
  success: '성공', error: '오류', info: '정보',
}

const ACTION_LABELS: Record<string, string> = {
  ingest_file:    '파일 수집',
  ingest_url:     'URL 수집',
  ingest_email:   '메일 수집',
  auto_process:   '자동 처리',
  task_extract:   '할일 추출',
  process:        '지식 처리',
  wiki_edit:      '위키 편집',
  wiki_reprocess: '위키 재분석',
  task_update:    '할 일 변경',
  memory:         '메모리',
  report:         '보고서',
}

function timeAgo(dateStr: string) {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000)
  if (diff < 0) return '방금'
  if (diff < 60) return `${diff}초 전`
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`
  if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`
  return `${Math.floor(diff / 86400)}일 전`
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleString('ko-KR', {
    month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    timeZone: 'Asia/Seoul',
  })
}

export default function Logs() {
  const [logs, setLogs]       = useState<Log[]>([])
  const [total, setTotal]     = useState(0)
  const [loading, setLoading] = useState(true)
  const [levelFilter, setLevelFilter] = useState('')
  const [actionFilter, setActionFilter] = useState('')
  const [search, setSearch]   = useState('')
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [limit, setLimit]     = useState(100)
  const [expanded, setExpanded] = useState<number | null>(null)
  const searchRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const fetchLogs = useCallback((q?: string) => {
    api.activity({ limit, level: levelFilter, action: actionFilter, q: q ?? search })
      .then(r => { setLogs(r.logs); setTotal(r.total) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [limit, levelFilter, actionFilter, search])

  useEffect(() => { fetchLogs() }, [fetchLogs])

  useEffect(() => {
    if (!autoRefresh) return
    const t = setInterval(() => fetchLogs(), 4000)
    return () => clearInterval(t)
  }, [autoRefresh, fetchLogs])

  const handleSearch = (v: string) => {
    setSearch(v)
    if (searchRef.current) clearTimeout(searchRef.current)
    searchRef.current = setTimeout(() => fetchLogs(v), 400)
  }

  const actions = Array.from(new Set(logs.map(l => l.action)))

  const toggleExpand = (id: number) =>
    setExpanded(prev => (prev === id ? null : id))

  // 오류/추출 관련 메시지 하이라이트
  const isImportant = (log: Log) =>
    log.level === 'error' || log.action === 'task_extract' || log.action === 'auto_process'

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">

      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">활동 로그</h1>
          <p className="text-sm text-text-muted mt-1">전체 {total}건</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => fetchLogs()}
            className="text-xs text-text-muted hover:text-text-primary bg-neutral-bg3 hover:bg-neutral-bg4 px-3 py-1.5 rounded-lg border border-border-subtle transition-colors"
          >
            ↻ 새로고침
          </button>
          <button
            onClick={() => setAutoRefresh(v => !v)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
              autoRefresh
                ? 'bg-status-success/10 border-status-success/20 text-status-success'
                : 'bg-neutral-bg3 border-border-subtle text-text-muted'
            }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${autoRefresh ? 'bg-status-success animate-pulse' : 'bg-neutral-bg6'}`} />
            {autoRefresh ? '실시간 갱신 중' : '갱신 중지됨'}
          </button>
        </div>
      </div>

      {/* 필터 바 */}
      <div className="flex flex-wrap gap-2">
        <input
          name="q"
          aria-label="로그 검색"
          value={search}
          onChange={e => handleSearch(e.target.value)}
          placeholder="메시지 검색..."
          className="glass-input px-3 py-1.5 text-sm w-56"
        />

        <div className="flex gap-1 bg-neutral-bg3 p-1 rounded-lg">
          {(['', 'success', 'error', 'info'] as const).map(l => (
            <button key={l} onClick={() => setLevelFilter(l)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                levelFilter === l ? 'bg-brand text-white' : 'text-text-secondary hover:text-text-primary'
              }`}>
              {l === '' ? '전체' : LEVEL_LABEL[l] ?? l}
            </button>
          ))}
        </div>

        <select
          name="action"
          aria-label="작업 필터"
          value={actionFilter}
          onChange={e => setActionFilter(e.target.value)}
          className="glass-input px-3 py-1.5 text-xs text-text-secondary bg-neutral-bg3 rounded-lg border border-border-subtle cursor-pointer"
        >
          <option value="">전체 작업</option>
          {actions.map(a => (
            <option key={a} value={a}>{ACTION_LABELS[a] ?? a}</option>
          ))}
        </select>

        <select
          name="limit"
          aria-label="표시 건수"
          value={limit}
          onChange={e => setLimit(Number(e.target.value))}
          className="glass-input px-3 py-1.5 text-xs text-text-secondary bg-neutral-bg3 rounded-lg border border-border-subtle cursor-pointer"
        >
          {[50, 100, 200, 500].map(n => (
            <option key={n} value={n}>최근 {n}건</option>
          ))}
        </select>
      </div>

      {/* 로그 테이블 */}
      <div className="glass-card overflow-hidden">
        {loading ? (
          <div className="space-y-2 p-4">
            {[0,1,2,3,4].map(i => <div key={i} className="h-10 bg-neutral-bg3 rounded animate-pulse" />)}
          </div>
        ) : logs.length === 0 ? (
          <p className="text-sm text-text-muted text-center py-12">로그가 없습니다</p>
        ) : (
          <div className="divide-y divide-border-subtle max-h-[calc(100vh-300px)] overflow-y-auto">
            {logs.map(log => (
              <div key={log.id}>
                {/* 요약 행 */}
                <div
                  onClick={() => toggleExpand(log.id)}
                  className={`flex items-start gap-3 px-4 py-3 transition-colors cursor-pointer ${
                    expanded === log.id ? 'bg-neutral-bg3' : 'hover:bg-neutral-bg3'
                  }`}
                >
                  {/* 레벨 점 */}
                  <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${LEVEL_DOT[log.level] ?? 'bg-neutral-bg6'}`} />

                  {/* 레벨 배지 */}
                  <span className={`shrink-0 text-xs font-medium px-1.5 py-0.5 rounded border ${LEVEL_STYLE[log.level] ?? LEVEL_STYLE.info}`}>
                    {LEVEL_LABEL[log.level] ?? log.level}
                  </span>

                  {/* 액션 배지 */}
                  <span className={`shrink-0 text-xs px-2 py-0.5 rounded hidden sm:inline ${
                    isImportant(log)
                      ? 'bg-brand-subtle text-brand-light'
                      : 'text-text-muted bg-neutral-bg4'
                  }`}>
                    {ACTION_LABELS[log.action] ?? log.action}
                  </span>

                  {/* 메시지 (요약) */}
                  <p className={`flex-1 text-sm min-w-0 ${expanded === log.id ? 'whitespace-pre-wrap break-all' : 'truncate'} ${
                    log.level === 'error' ? 'text-status-error' : 'text-text-secondary'
                  }`}>
                    {log.message}
                  </p>

                  {/* 시간 */}
                  <span className="text-xs text-text-muted shrink-0 tabular-nums" title={formatDate(log.created_at)}>
                    {timeAgo(log.created_at)}
                  </span>
                </div>

                {/* 확장된 상세 내용 */}
                <AnimatePresence>
                  {expanded === log.id && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="bg-neutral-bg2 border-t border-border-subtle overflow-hidden"
                    >
                      <div className="px-14 py-3 space-y-2">
                        <p className="text-xs font-mono text-text-secondary whitespace-pre-wrap break-all leading-relaxed">
                          {log.message}
                        </p>
                        <div className="flex gap-4 text-xs text-text-muted mt-2">
                          <span>ID: {log.id}</span>
                          <span>액션: {log.action}</span>
                          <span>시각: {formatDate(log.created_at)}</span>
                          <button
                            onClick={e => { e.stopPropagation(); navigator.clipboard?.writeText(log.message) }}
                            className="text-brand-light hover:underline ml-auto"
                          >
                            복사
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ))}
          </div>
        )}
      </div>

      <p className="text-xs text-text-muted">
        {logs.length}건 표시 / 전체 {total}건
        {total > limit && <span className="ml-1 text-status-warning"> — 표시 건수를 늘려 더 보기</span>}
      </p>
    </motion.div>
  )
}
