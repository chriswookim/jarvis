import { useEffect, useState, useCallback, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { api, WikiEntry } from '@/api/client'
import Button from '@/components/ui/Button'

const DEFAULT_FOLDERS = ['이메일', '웹', '문서', '일반']
const STALE_DAYS = 30

type RelatedEntry = { id: number; topic: string; folder: string; updated_at: string }

function timeAgo(dateStr: string) {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000)
  if (diff < 60) return `${diff}초 전`
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`
  if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`
  return `${Math.floor(diff / 86400)}일 전`
}

function isStale(dateStr: string) {
  return (Date.now() - new Date(dateStr).getTime()) / 86400000 > STALE_DAYS
}

function folderIcon(folder: string) {
  if (folder === '이메일') return '📧'
  if (folder === '웹') return '🌐'
  if (folder === '문서') return '📄'
  return '📁'
}

export default function Wiki() {
  const [entries, setEntries]               = useState<WikiEntry[]>([])
  const [selected, setSelected]             = useState<WikiEntry | null>(null)
  const [related, setRelated]               = useState<RelatedEntry[]>([])
  const [loading, setLoading]               = useState(true)
  const [loadingEntry, setLoadingEntry]     = useState(false)
  const [linting, setLinting]               = useState(false)
  const [lintDone, setLintDone]             = useState(false)
  const [searchParams, setSearchParams]     = useSearchParams()
  const search      = searchParams.get('q') ?? ''
  const folderFilter = searchParams.get('folder')
  const setSearch = (v: string) =>
    setSearchParams(p => { if (v) p.set('q', v); else p.delete('q'); return p }, { replace: true })
  const setFolderFilter = (v: string | null) =>
    setSearchParams(p => { if (v) p.set('folder', v); else p.delete('folder'); return p }, { replace: true })
  const [editing, setEditing]               = useState(false)
  const [editTopic, setEditTopic]           = useState('')
  const [editContent, setEditContent]       = useState('')
  const [dirty, setDirty]                   = useState(false)
  const [saving, setSaving]                 = useState(false)
  const [reprocessing, setReprocessing]     = useState(false)
  const [deleting, setDeleting]             = useState(false)
  const [movingFolder, setMovingFolder]     = useState(false)
  const [showFolderInput, setShowFolderInput] = useState(false)
  const [newFolderName, setNewFolderName]   = useState('')
  const [mobilePanel, setMobilePanel]       = useState<'list' | 'detail'>('list')
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const loadEntries = useCallback((q?: string) => {
    api.listWiki(q || undefined).then(setEntries).finally(() => setLoading(false))
  }, [])

  useEffect(() => { loadEntries() }, [loadEntries])

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current)
    if (search) {
      searchTimer.current = setTimeout(() => loadEntries(search), 300)
    } else {
      loadEntries()
    }
  }, [search, loadEntries])

  const allFolders = Array.from(new Set([
    ...DEFAULT_FOLDERS,
    ...entries.map(e => e.folder || '일반'),
  ])).filter(f => entries.some(e => (e.folder || '일반') === f))

  const filtered = entries.filter(e => !folderFilter || (e.folder || '일반') === folderFilter)

  const selectEntry = useCallback(async (entry: WikiEntry) => {
    if (editing && dirty && !window.confirm('저장하지 않은 변경사항이 있습니다. 나가시겠습니까?')) return
    setEditing(false); setDirty(false); setShowFolderInput(false); setRelated([])
    setMobilePanel('detail')
    setLoadingEntry(true)
    try {
      const full = await api.getWiki(entry.id)
      setSelected(full)
      api.getRelatedWiki(entry.id).then(setRelated).catch(() => {})
    } finally { setLoadingEntry(false) }
  }, [editing, dirty])

  const handleBackToList = () => {
    if (editing && dirty && !window.confirm('변경사항을 버리시겠습니까?')) return
    setMobilePanel('list')
    setEditing(false); setDirty(false)
  }

  const startEdit = () => {
    if (!selected) return
    setEditTopic(selected.topic)
    setEditContent(selected.content)
    setDirty(false); setEditing(true)
  }

  const cancelEdit = () => {
    if (dirty && !window.confirm('변경사항을 버리시겠습니까?')) return
    setEditing(false); setDirty(false)
  }

  const handleSave = async () => {
    if (!selected) return
    setSaving(true)
    try {
      const updated = await api.updateWiki(selected.id, editTopic, editContent)
      const next = { ...selected, topic: updated.topic, content: editContent, updated_at: updated.updated_at }
      setSelected(next)
      setEntries(prev => prev.map(e => e.id === updated.id
        ? { ...e, topic: updated.topic, updated_at: updated.updated_at } : e))
      setDirty(false); setEditing(false)
    } finally { setSaving(false) }
  }

  const handleReprocess = async () => {
    if (!selected) return
    if (editing && dirty) await handleSave()
    setReprocessing(true)
    try {
      const updated = await api.reprocessWiki(selected.id)
      setSelected(updated)
      setEntries(prev => prev.map(e => e.id === updated.id
        ? { ...e, topic: updated.topic, updated_at: updated.updated_at } : e))
      setEditing(false); setDirty(false)
    } finally { setReprocessing(false) }
  }

  const handleDelete = async () => {
    if (!selected) return
    if (!window.confirm(`"${selected.topic}" 항목을 삭제하시겠습니까?`)) return
    setDeleting(true)
    try {
      await api.deleteWiki(selected.id)
      setEntries(prev => prev.filter(e => e.id !== selected.id))
      setSelected(null); setRelated([])
      setMobilePanel('list')
    } finally { setDeleting(false) }
  }

  const handleLint = async () => {
    setLinting(true)
    try {
      await api.triggerWikiLint()
      setLintDone(true)
      setTimeout(() => setLintDone(false), 3000)
    } finally { setLinting(false) }
  }

  const handleMoveFolder = async (folder: string) => {
    if (!selected) return
    setMovingFolder(true)
    try {
      await api.updateWikiFolder(selected.id, folder)
      const next = { ...selected, folder }
      setSelected(next)
      setEntries(prev => prev.map(e => e.id === selected.id ? { ...e, folder } : e))
      setShowFolderInput(false)
    } finally { setMovingFolder(false) }
  }

  const handleNewFolder = async () => {
    const name = newFolderName.trim()
    if (!name) return
    await handleMoveFolder(name)
    setNewFolderName('')
  }

  // 사이드바 콘텐츠
  const SidebarContent = () => (
    <>
      <div className="px-4 pt-5 pb-3 border-b border-border-subtle shrink-0">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-text-primary">위키</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={handleLint}
              disabled={linting}
              title="위키 Lint 실행"
              className={`text-xs px-2 py-0.5 rounded transition-colors ${
                lintDone ? 'text-status-success bg-status-success/10'
                : 'text-text-muted hover:text-text-primary hover:bg-neutral-bg4'
              }`}
            >
              {linting ? '분석중…' : lintDone ? '✓ 완료' : '◎ Lint'}
            </button>
            <span className="text-xs text-text-muted bg-neutral-bg4 px-2 py-0.5 rounded-full">{entries.length}</span>
          </div>
        </div>
        <div className="relative">
          <input
            name="q"
            aria-label="위키 본문 검색"
            autoComplete="off"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="본문 검색..."
            className="glass-input w-full pl-3 pr-8 py-2 text-sm rounded-lg"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary text-xs px-1"
              aria-label="검색 지우기"
            >✕</button>
          )}
        </div>
        {search && (
          <p className="text-xs text-text-muted mt-1.5 px-1">{filtered.length}건 검색됨</p>
        )}
      </div>

      {/* 폴더 필터 */}
      {allFolders.length > 0 && (
        <div className="px-3 py-2 border-b border-border-subtle shrink-0">
          <button
            onClick={() => setFolderFilter(null)}
            className={`w-full text-left px-2 py-2 rounded-lg text-sm transition-colors flex items-center justify-between ${
              !folderFilter ? 'text-brand-light bg-brand-subtle' : 'text-text-muted hover:text-text-secondary hover:bg-neutral-bg3'
            }`}
          >
            <span>📂 전체</span>
            <span className="text-xs text-text-muted">{entries.length}</span>
          </button>
          {allFolders.map(folder => {
            const count = entries.filter(e => (e.folder || '일반') === folder).length
            return (
              <button key={folder}
                onClick={() => setFolderFilter(folder === folderFilter ? null : folder)}
                className={`w-full text-left px-2 py-2 rounded-lg text-sm transition-colors flex items-center justify-between ${
                  folderFilter === folder ? 'text-brand-light bg-brand-subtle' : 'text-text-muted hover:text-text-secondary hover:bg-neutral-bg3'
                }`}
              >
                <span>{folderIcon(folder)} {folder}</span>
                <span className="text-xs">{count}</span>
              </button>
            )
          })}
        </div>
      )}

      {/* 항목 목록 */}
      <div className="flex-1 overflow-y-auto py-2">
        {loading ? (
          <div className="space-y-1 px-2 py-2">
            {[0,1,2,3,4].map(i => <div key={i} className="h-14 bg-neutral-bg3 rounded-lg animate-pulse" />)}
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-text-muted text-center py-12 px-4">
            {search || folderFilter ? '검색 결과 없음' : '항목이 없습니다'}
          </p>
        ) : (
          <ul className="px-2 space-y-0.5">
            {filtered.map(entry => {
              const stale = isStale(entry.updated_at)
              const isActive = selected?.id === entry.id
              return (
                <li key={entry.id}>
                  <button
                    onClick={() => selectEntry(entry)}
                    className={`w-full text-left px-3 py-3 rounded-lg transition-colors ${
                      isActive ? 'bg-brand-subtle text-brand-light' : 'hover:bg-neutral-bg3 text-text-secondary hover:text-text-primary'
                    }`}
                  >
                    <p className="text-sm font-medium truncate leading-tight">{entry.topic}</p>
                    {entry.preview && (
                      <p className="text-xs text-text-muted truncate mt-0.5 leading-snug">{entry.preview}</p>
                    )}
                    <div className="flex items-center gap-1.5 mt-1">
                      <span className={`text-xs ${isActive ? 'text-brand-light/70' : 'text-text-muted'}`}>
                        {folderIcon(entry.folder || '일반')} {timeAgo(entry.updated_at)}
                      </span>
                      {stale && (
                        <span className="text-xs text-status-warning/80">· 오래됨</span>
                      )}
                    </div>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </>
  )

  const RelatedPanel = () => (
    <div className="space-y-1.5">
      {related.map(r => (
        <button
          key={r.id}
          onClick={() => {
            const entry = entries.find(e => e.id === r.id)
            if (entry) selectEntry(entry)
          }}
          className="w-full text-left p-3 bg-neutral-bg3 hover:bg-neutral-bg4 rounded-lg transition-colors group"
        >
          <p className="text-xs font-medium text-text-primary truncate group-hover:text-brand-light transition-colors">
            {r.topic}
          </p>
          <p className="text-xs text-text-muted mt-0.5">
            {folderIcon(r.folder)} {r.folder} · {timeAgo(r.updated_at)}
          </p>
        </button>
      ))}
    </div>
  )

  return (
    <div className="flex flex-1 overflow-hidden">

      {/* ── 사이드바 ── */}
      <aside className={`
        flex-col border-r border-border-subtle bg-neutral-bg2
        w-full lg:w-72 xl:w-80 lg:shrink-0
        ${mobilePanel === 'detail' ? 'hidden lg:flex' : 'flex'}
      `}>
        <SidebarContent />
      </aside>

      {/* ── 메인 + 우측 패널 ── */}
      <div className={`
        flex-1 flex flex-col overflow-hidden
        ${mobilePanel === 'detail' ? 'flex' : 'hidden lg:flex'}
      `}>
        {/* 모바일 전용 상단바 */}
        <div className="lg:hidden flex items-center gap-3 px-4 py-3 border-b border-border-subtle bg-neutral-bg2 shrink-0">
          <button
            onClick={handleBackToList}
            className="text-sm text-brand-light flex items-center gap-1 shrink-0"
          >
            ← 목록
          </button>
          {selected && (
            <span className="text-sm font-medium text-text-primary truncate">{selected.topic}</span>
          )}
        </div>

        {/* 콘텐츠 영역 */}
        <div className="flex flex-1 overflow-hidden">
          <main className="flex-1 flex flex-col overflow-hidden bg-neutral-bg1">
            <AnimatePresence mode="wait">
              {!selected ? (
                <motion.div key="empty"
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  className="flex-1 overflow-y-auto">
                  <div className="max-w-3xl mx-auto px-6 lg:px-10 py-8">
                    <p className="text-xs text-text-muted uppercase tracking-wide font-semibold mb-4">최근 항목</p>
                    {loading ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {[0,1,2,3,4,5].map(i => <div key={i} className="h-20 bg-neutral-bg3 rounded-lg animate-pulse" />)}
                      </div>
                    ) : entries.length === 0 ? (
                      <div className="text-center py-20">
                        <p className="text-4xl mb-3 opacity-20">◈</p>
                        <p className="text-sm text-text-secondary">문서를 수집하면 위키 항목이 자동 생성됩니다</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {entries.slice(0, 9).map(entry => (
                          <button key={entry.id} onClick={() => selectEntry(entry)}
                            className="p-4 bg-neutral-bg2 hover:bg-neutral-bg3 border border-border-subtle hover:border-brand/30 rounded-xl text-left transition-all group">
                            <p className="text-sm font-medium text-text-primary truncate group-hover:text-brand-light transition-colors">
                              {entry.topic}
                            </p>
                            {entry.preview && (
                              <p className="text-xs text-text-muted mt-1 line-clamp-2 leading-snug">{entry.preview}</p>
                            )}
                            <p className="text-xs text-text-muted mt-2">
                              {folderIcon(entry.folder || '일반')} {entry.folder || '일반'} · {timeAgo(entry.updated_at)}
                            </p>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </motion.div>

              ) : loadingEntry ? (
                <motion.div key="spinner"
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  className="flex-1 flex items-center justify-center">
                  <div className="w-6 h-6 border-2 border-brand border-t-transparent rounded-full animate-spin" />
                </motion.div>

              ) : editing ? (
                <motion.div key="edit"
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  className="flex-1 flex flex-col overflow-hidden">
                  {/* 편집 헤더 */}
                  <div className="flex items-center gap-3 px-4 lg:px-6 py-3 border-b border-border-subtle shrink-0 bg-neutral-bg2 flex-wrap gap-y-2">
                    <button onClick={cancelEdit}
                      className="text-xs text-text-secondary hover:text-text-primary transition-colors shrink-0">
                      ← 취소
                    </button>
                    <div className="w-px h-4 bg-border-subtle shrink-0" />
                    <input
                      value={editTopic}
                      onChange={e => { setEditTopic(e.target.value); setDirty(true) }}
                      className="flex-1 min-w-0 bg-transparent text-base font-semibold text-text-primary outline-none border-b border-transparent hover:border-border-subtle focus-visible:border-brand transition-colors pb-0.5"
                      placeholder="주제 제목"
                    />
                    <div className="flex gap-2 shrink-0">
                      {dirty && <span className="text-xs text-status-warning self-center">● 미저장</span>}
                      <Button variant="secondary" size="sm" onClick={cancelEdit} className="hidden sm:flex">취소</Button>
                      <Button size="sm" onClick={handleSave} loading={saving} disabled={!dirty && !saving}>저장</Button>
                      <Button variant="secondary" size="sm" onClick={handleReprocess} loading={reprocessing} className="hidden sm:flex">
                        ✦ LLM 재분석
                      </Button>
                    </div>
                  </div>
                  <textarea
                    value={editContent}
                    onChange={e => { setEditContent(e.target.value); setDirty(true) }}
                    className="flex-1 bg-neutral-bg1 px-4 lg:px-8 py-6 text-sm text-text-primary font-mono leading-relaxed resize-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand"
                    placeholder="마크다운으로 작성하세요..."
                    spellCheck={false}
                  />
                </motion.div>

              ) : (
                <motion.div key={`read-${selected.id}`}
                  initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}
                  className="flex-1 flex flex-col overflow-hidden">

                  {/* 읽기 헤더 */}
                  <div className="flex items-center justify-between px-4 lg:px-8 py-3 border-b border-border-subtle shrink-0 bg-neutral-bg2 gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 min-w-0">
                        <h1 title={selected.topic}
                          className="text-base font-semibold text-text-primary truncate">
                          {selected.topic}
                        </h1>
                        {isStale(selected.updated_at) && (
                          <span className="text-xs text-status-warning bg-status-warning/10 px-2 py-0.5 rounded-full shrink-0">
                            오래됨
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <p className="text-xs text-text-muted">수정 {timeAgo(selected.updated_at)}</p>
                        <span className="text-text-muted text-xs">·</span>
                        {/* 폴더 이동 */}
                        <div className="relative">
                          <button
                            onClick={() => setShowFolderInput(v => !v)}
                            className="text-xs text-text-muted hover:text-text-secondary bg-neutral-bg4 hover:bg-neutral-bg5 px-2 py-0.5 rounded transition-colors flex items-center gap-1"
                          >
                            {folderIcon(selected.folder || '일반')}
                            {selected.folder || '일반'}
                            <span className="opacity-50">▾</span>
                          </button>
                          {showFolderInput && (
                            <div className="absolute top-7 left-0 z-20 bg-neutral-bg3 border border-border-subtle rounded-lg shadow-lg py-1 min-w-[140px]">
                              {[...DEFAULT_FOLDERS, ...allFolders.filter(f => !DEFAULT_FOLDERS.includes(f))].map(f => (
                                <button key={f}
                                  onClick={() => handleMoveFolder(f)}
                                  disabled={movingFolder}
                                  className={`w-full text-left px-3 py-1.5 text-xs transition-colors hover:bg-neutral-bg4 ${
                                    selected.folder === f ? 'text-brand-light' : 'text-text-secondary'
                                  }`}
                                >
                                  {folderIcon(f)} {f}
                                </button>
                              ))}
                              <div className="border-t border-border-subtle mt-1 pt-1 px-2">
                                <div className="flex gap-1">
                                  <input
                                    name="folder"
                                    autoComplete="off"
                                    value={newFolderName}
                                    onChange={e => setNewFolderName(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && handleNewFolder()}
                                    placeholder="새 폴더..."
                                    className="flex-1 bg-neutral-bg4 text-xs px-2 py-1 rounded outline-none text-text-primary placeholder:text-text-muted focus-visible:ring-1 focus-visible:ring-brand"
                                    autoFocus
                                  />
                                  <button onClick={handleNewFolder} aria-label="폴더 만들기"
                                    className="text-xs px-2 py-1 bg-brand text-white rounded hover:bg-brand/80 transition-colors">+</button>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* 액션 버튼 — xl에서는 우측 패널이 담당하므로 숨김 */}
                    <div className="flex gap-1.5 shrink-0 xl:hidden">
                      <button
                        onClick={handleDelete}
                        disabled={deleting}
                        className="text-xs px-2.5 py-1.5 rounded text-text-muted hover:text-status-error hover:bg-status-error/10 transition-colors"
                      >
                        삭제
                      </button>
                      <Button variant="secondary" size="sm" onClick={startEdit}>✏️ 편집</Button>
                      <Button size="sm" onClick={handleReprocess} loading={reprocessing} className="hidden sm:flex">
                        ✦ LLM 재분석
                      </Button>
                    </div>
                  </div>

                  {/* 본문 */}
                  <div className="flex-1 overflow-y-auto px-4 lg:px-8 xl:px-10 py-6 lg:py-8">
                    <div className="max-w-3xl mx-auto">
                      <div className="prose prose-invert prose-sm
                        prose-headings:text-text-primary prose-headings:font-semibold prose-headings:mb-3
                        prose-h2:text-base prose-h2:mt-8 prose-h2:border-b prose-h2:border-border-subtle prose-h2:pb-2
                        prose-h3:text-sm prose-h3:mt-6
                        prose-p:text-text-secondary prose-p:leading-relaxed prose-p:my-2
                        prose-a:text-brand-light prose-a:no-underline hover:prose-a:underline
                        prose-strong:text-text-primary
                        prose-code:text-brand-light prose-code:bg-neutral-bg4 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-xs
                        prose-pre:bg-neutral-bg3 prose-pre:border prose-pre:border-border-subtle prose-pre:rounded-lg
                        prose-blockquote:border-l-2 prose-blockquote:border-brand prose-blockquote:text-text-muted prose-blockquote:pl-4
                        prose-li:text-text-secondary prose-li:my-0.5
                        prose-ul:my-2 prose-ol:my-2
                        prose-hr:border-border-subtle prose-hr:my-6
                        prose-table:text-text-secondary prose-table:text-sm
                        prose-th:text-text-primary prose-th:border prose-th:border-border prose-th:px-3 prose-th:py-1.5
                        prose-td:border prose-td:border-border-subtle prose-td:px-3 prose-td:py-1.5">
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm]}
                          components={{
                            h1: ({ node, children, ...props }) => {
                              // 첫 H1은 헤더 제목과 중복 → 건너뜀
                              const text = String(children ?? '')
                              if (node?.position?.start.line === 1 || text === selected.topic) return null
                              return <h1 {...props}>{children}</h1>
                            },
                          }}
                        >
                          {selected.content || '*내용이 없습니다.*'}
                        </ReactMarkdown>
                      </div>

                      {/* 관련 항목 - xl이 아닐 때만 본문 하단에 표시 */}
                      {related.length > 0 && (
                        <div className="xl:hidden mt-10 pt-6 border-t border-border-subtle max-w-3xl mx-auto">
                          <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-3">관련 항목</h3>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <RelatedPanel />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </main>

          {/* ── 우측 패널 (xl+, 항목 선택 시) ── */}
          {selected && !editing && (
            <aside className="hidden xl:flex xl:w-56 flex-col border-l border-border-subtle bg-neutral-bg2 shrink-0 overflow-y-auto">
              <div className="p-4 border-b border-border-subtle">
                <p className="text-xs font-semibold text-text-muted uppercase tracking-wide">정보</p>
                <div className="mt-2 space-y-1.5">
                  <div className="flex items-center gap-1.5 text-xs text-text-muted">
                    <span>{folderIcon(selected.folder || '일반')}</span>
                    <span>{selected.folder || '일반'}</span>
                  </div>
                  <div className="text-xs text-text-muted">
                    수정 {timeAgo(selected.updated_at)}
                  </div>
                  {isStale(selected.updated_at) && (
                    <div className="text-xs text-status-warning">{STALE_DAYS}일+ 미수정</div>
                  )}
                </div>
              </div>
              <div className="p-4 border-b border-border-subtle">
                <p className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">작업</p>
                <div className="space-y-1">
                  <button onClick={startEdit}
                    className="w-full text-left text-xs px-3 py-2 rounded-lg text-text-secondary hover:bg-neutral-bg3 hover:text-text-primary transition-colors">
                    ✏️ 편집
                  </button>
                  <button onClick={handleReprocess} disabled={reprocessing}
                    className="w-full text-left text-xs px-3 py-2 rounded-lg text-text-secondary hover:bg-neutral-bg3 hover:text-text-primary transition-colors">
                    {reprocessing ? '처리중…' : '✦ LLM 재분석'}
                  </button>
                  <button onClick={handleDelete} disabled={deleting}
                    className="w-full text-left text-xs px-3 py-2 rounded-lg text-text-muted hover:bg-status-error/10 hover:text-status-error transition-colors">
                    {deleting ? '삭제중…' : '🗑 삭제'}
                  </button>
                </div>
              </div>
              {related.length > 0 && (
                <div className="p-4 flex-1 overflow-y-auto">
                  <p className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-3">관련 항목</p>
                  <RelatedPanel />
                </div>
              )}
            </aside>
          )}
        </div>
      </div>
    </div>
  )
}
