import { useEffect, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { api, WikiEntry } from '@/api/client'
import Button from '@/components/ui/Button'

function timeAgo(dateStr: string) {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000)
  if (diff < 60) return `${diff}초 전`
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`
  if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`
  return `${Math.floor(diff / 86400)}일 전`
}

export default function Wiki() {
  const [entries, setEntries]         = useState<WikiEntry[]>([])
  const [selected, setSelected]       = useState<WikiEntry | null>(null)
  const [loading, setLoading]         = useState(true)
  const [loadingEntry, setLoadingEntry] = useState(false)
  const [search, setSearch]           = useState('')
  const [editing, setEditing]         = useState(false)
  const [editTopic, setEditTopic]     = useState('')
  const [editContent, setEditContent] = useState('')
  const [dirty, setDirty]             = useState(false)
  const [saving, setSaving]           = useState(false)
  const [reprocessing, setReprocessing] = useState(false)

  useEffect(() => {
    api.listWiki().then(setEntries).finally(() => setLoading(false))
  }, [])

  const selectEntry = useCallback(async (entry: WikiEntry) => {
    if (editing && dirty && !window.confirm('저장하지 않은 변경사항이 있습니다. 나가시겠습니까?')) return
    setEditing(false)
    setDirty(false)
    setLoadingEntry(true)
    try {
      const full = await api.getWiki(entry.id)
      setSelected(full)
    } finally {
      setLoadingEntry(false)
    }
  }, [editing, dirty])

  const startEdit = () => {
    if (!selected) return
    setEditTopic(selected.topic)
    setEditContent(selected.content)
    setDirty(false)
    setEditing(true)
  }

  const cancelEdit = () => {
    if (dirty && !window.confirm('변경사항을 버리시겠습니까?')) return
    setEditing(false)
    setDirty(false)
  }

  const handleSave = async () => {
    if (!selected) return
    setSaving(true)
    try {
      const updated = await api.updateWiki(selected.id, editTopic, editContent)
      const next = { ...selected, topic: updated.topic, content: editContent, updated_at: updated.updated_at }
      setSelected(next)
      setEntries(prev => prev.map(e => e.id === updated.id
        ? { ...e, topic: updated.topic, updated_at: updated.updated_at }
        : e
      ))
      setDirty(false)
      setEditing(false)
    } finally {
      setSaving(false)
    }
  }

  const handleReprocess = async () => {
    if (!selected) return
    if (editing && dirty) await handleSave()
    setReprocessing(true)
    try {
      const updated = await api.reprocessWiki(selected.id)
      setSelected(updated)
      setEntries(prev => prev.map(e => e.id === updated.id
        ? { ...e, topic: updated.topic, updated_at: updated.updated_at }
        : e
      ))
      setEditing(false)
      setDirty(false)
    } finally {
      setReprocessing(false)
    }
  }

  const filtered = entries.filter(e =>
    !search || e.topic.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="flex flex-1 overflow-hidden">

      {/* ── 사이드바 ─────────────────────────── */}
      <aside className="w-64 shrink-0 flex flex-col border-r border-border-subtle bg-neutral-bg2">
        <div className="px-4 pt-6 pb-3 border-b border-border-subtle shrink-0">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-text-primary">위키</h2>
            <span className="text-xs text-text-muted bg-neutral-bg4 px-2 py-0.5 rounded-full">
              {entries.length}
            </span>
          </div>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="검색..."
            className="glass-input w-full px-3 py-2 text-xs rounded-lg outline-none"
          />
        </div>

        <div className="flex-1 overflow-y-auto py-2">
          {loading ? (
            <div className="space-y-1 px-2 py-2">
              {[0, 1, 2, 3, 4].map(i => (
                <div key={i} className="h-10 bg-neutral-bg3 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-xs text-text-muted text-center py-10">
              {search ? '검색 결과 없음' : '항목이 없습니다\n문서를 수집하면 자동 생성됩니다'}
            </p>
          ) : (
            <ul className="px-2 space-y-0.5">
              {filtered.map(entry => (
                <li key={entry.id}>
                  <button
                    onClick={() => selectEntry(entry)}
                    className={`w-full text-left px-3 py-2.5 rounded-lg transition-colors ${
                      selected?.id === entry.id
                        ? 'bg-brand-subtle text-brand-light'
                        : 'hover:bg-neutral-bg3 text-text-secondary hover:text-text-primary'
                    }`}
                  >
                    <p className="text-xs font-medium truncate leading-tight">{entry.topic}</p>
                    <p className="text-xs text-text-muted mt-0.5">{timeAgo(entry.updated_at)}</p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>

      {/* ── 메인 콘텐츠 ─────────────────────── */}
      <main className="flex-1 flex flex-col overflow-hidden bg-neutral-bg1">
        <AnimatePresence mode="wait">
          {!selected ? (
            <motion.div key="empty"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <p className="text-5xl mb-4 opacity-20">◈</p>
                <p className="text-sm text-text-secondary">왼쪽 목록에서 항목을 선택하세요</p>
                <p className="text-xs text-text-muted mt-1">
                  문서를 수집하면 위키 항목이 자동 생성됩니다
                </p>
              </div>
            </motion.div>
          ) : loadingEntry ? (
            <motion.div key="spinner"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="flex-1 flex items-center justify-center">
              <div className="w-6 h-6 border-2 border-brand border-t-transparent rounded-full animate-spin" />
            </motion.div>
          ) : editing ? (
            /* ── 편집 모드 ── */
            <motion.div key="edit"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="flex-1 flex flex-col overflow-hidden">
              {/* 편집 툴바 */}
              <div className="flex items-center gap-3 px-6 py-3 border-b border-border-subtle shrink-0 bg-neutral-bg2">
                <button onClick={cancelEdit}
                  className="text-xs text-text-secondary hover:text-text-primary transition-colors flex items-center gap-1">
                  ← 취소
                </button>
                <div className="w-px h-4 bg-border-subtle" />
                <input
                  value={editTopic}
                  onChange={e => { setEditTopic(e.target.value); setDirty(true) }}
                  className="flex-1 bg-transparent text-base font-semibold text-text-primary outline-none border-b border-transparent hover:border-border-subtle focus:border-brand transition-colors pb-0.5"
                  placeholder="주제 제목"
                />
                <div className="flex gap-2 shrink-0">
                  {dirty && (
                    <span className="text-xs text-status-warning self-center">● 미저장</span>
                  )}
                  <Button variant="secondary" size="sm" onClick={cancelEdit}>취소</Button>
                  <Button size="sm" onClick={handleSave} loading={saving}
                    disabled={!dirty && !saving}>
                    저장
                  </Button>
                  <Button variant="secondary" size="sm" onClick={handleReprocess} loading={reprocessing}>
                    ✦ LLM 재분석
                  </Button>
                </div>
              </div>
              {/* 편집 영역 */}
              <textarea
                value={editContent}
                onChange={e => { setEditContent(e.target.value); setDirty(true) }}
                className="flex-1 bg-neutral-bg1 px-8 py-6 text-sm text-text-primary font-mono leading-relaxed resize-none outline-none"
                placeholder="마크다운으로 작성하세요..."
                spellCheck={false}
              />
            </motion.div>
          ) : (
            /* ── 읽기 모드 ── */
            <motion.div key={`read-${selected.id}`}
              initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}
              className="flex-1 flex flex-col overflow-hidden">
              {/* 헤더 */}
              <div className="flex items-start justify-between px-8 py-5 border-b border-border-subtle shrink-0 bg-neutral-bg2">
                <div>
                  <h1 className="text-xl font-semibold text-text-primary">{selected.topic}</h1>
                  <p className="text-xs text-text-muted mt-1">마지막 수정 {timeAgo(selected.updated_at)}</p>
                </div>
                <div className="flex gap-2 shrink-0 mt-0.5">
                  <Button variant="secondary" size="sm" onClick={startEdit}>
                    ✏️ 편집
                  </Button>
                  <Button size="sm" onClick={handleReprocess} loading={reprocessing}>
                    ✦ LLM 재분석
                  </Button>
                </div>
              </div>
              {/* 본문 */}
              <div className="flex-1 overflow-y-auto px-8 py-8">
                <div className="max-w-3xl prose prose-invert prose-sm
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
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {selected.content || '*내용이 없습니다.*'}
                  </ReactMarkdown>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  )
}
