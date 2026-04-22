import { useEffect, useState, useCallback, useRef } from 'react'
import { motion } from 'framer-motion'
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
  ingest_file:   '파일 수집',
  ingest_url:    'URL 수집',
  ingest_email:  '메일 수집',
  auto_process:  '자동 처리',
  process:       '지식 처리',
  wiki_edit:     '위키 편집',
  wiki_reprocess:'위키 재분석',
  task_update:   '할 일 변경',
  memory:        '메모리',
  report:        '보고서',
}

function timeAgo(dateStr: string) {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000)
  if (diff < 60) return `${diff}초 전`
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`
  if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`
  return `${Math.floor(diff / 86400)}일 전`
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleString('ko-KR', {
    month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
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
  const searchRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const fetch = useCallback((q?: string) => {
    api.activity({ limit, level: levelFilter, action: actionFilter, q: q ?? search })
      .then(r => { setLogs(r.logs); setTotal(r.total) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [limit, levelFilter, actionFilter, search])

  useEffect(() => { fetch() }, [fetch])

  useEffect(() => {
    if (!autoRefresh) return
    const t = setInterval(() => fetch(), 4000)
    return () => clearInterval(t)
  }, [autoRefresh, fetch])

  const handleSearch = (v: string) => {
    setSearch(v)
    if (searchRef.current) clearTimeout(searchRef.current)
    searchRef.current = setTimeout(() => fetch(v), 400)
  }

  const actions = Array.from(new Set(logs.map(l => l.action)))

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">

      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">활동 로그</h1>
          <p className="text-sm text-text-muted mt-1">전체 {total}건</p>
        </div>
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

      {/* 필터 바 */}
      <div className="flex flex-wrap gap-2">
        {/* 검색 */}
        <input
          value={search}
          onChange={e => handleSearch(e.target.value)}
          placeholder="메시지 검색..."
          className="glass-input px-3 py-1.5 text-sm w-56"
        />

        {/* 레벨 필터 */}
        <div className="flex gap-1 bg-neutral-bg3 p-1 rounded-lg">
          {['', 'success', 'error', 'info'].map(l => (
            <button key={l} onClick={() => setLevelFilter(l)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                levelFilter === l ? 'bg-brand text-white' : 'text-text-secondary hover:text-text-primary'
              }`}>
              {l === '' ? '전체' : LEVEL_LABEL[l]}
            </button>
          ))}
        </div>

        {/* 액션 필터 */}
        <select
          value={actionFilter}
          onChange={e => setActionFilter(e.target.value)}
          className="glass-input px-3 py-1.5 text-xs text-text-secondary bg-neutral-bg3 rounded-lg border border-border-subtle cursor-pointer"
        >
          <option value="">전체 작업</option>
          {actions.map(a => (
            <option key={a} value={a}>{ACTION_LABELS[a] ?? a}</option>
          ))}
        </select>

        {/* 표시 건수 */}
        <select
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
          <div className="divide-y divide-border-subtle max-h-[calc(100vh-280px)] overflow-y-auto">
            {logs.map(log => (
              <div key={log.id} className="flex items-start gap-3 px-4 py-3 hover:bg-neutral-bg3 transition-colors">
                {/* 레벨 점 */}
                <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${LEVEL_DOT[log.level] ?? 'bg-neutral-bg6'}`} />

                {/* 레벨 배지 */}
                <span className={`shrink-0 text-xs font-medium px-1.5 py-0.5 rounded border ${LEVEL_STYLE[log.level] ?? LEVEL_STYLE.info}`}>
                  {LEVEL_LABEL[log.level] ?? log.level}
                </span>

                {/* 작업 배지 */}
                <span className="shrink-0 text-xs text-text-muted bg-neutral-bg4 px-2 py-0.5 rounded hidden sm:inline">
                  {ACTION_LABELS[log.action] ?? log.action}
                </span>

                {/* 메시지 */}
                <p className="flex-1 text-sm text-text-secondary min-w-0 truncate" title={log.message}>
                  {log.message}
                </p>

                {/* 시간 */}
                <span className="text-xs text-text-muted shrink-0 tabular-nums" title={formatDate(log.created_at)}>
                  {timeAgo(log.created_at)}
                </span>
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
