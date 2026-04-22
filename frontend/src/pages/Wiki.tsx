import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { api, WikiEntry } from '@/api/client'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'

type View = 'list' | 'edit'
type EditTab = 'write' | 'preview'

function timeAgo(dateStr: string) {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000)
  if (diff < 60) return `${diff}초 전`
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`
  if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`
  return `${Math.floor(diff / 86400)}일 전`
}

export default function Wiki() {
  const [entries, setEntries] = useState<WikiEntry[]>([])
  const [loading, setLoading]   = useState(true)
  const [view, setView]         = useState<View>('list')
  const [current, setCurrent]   = useState<WikiEntry | null>(null)
  const [editTopic, setEditTopic]   = useState('')
  const [editContent, setEditContent] = useState('')
  const [tab, setTab]           = useState<EditTab>('write')
  const [saving, setSaving]     = useState(false)
  const [reprocessing, setReprocessing] = useState(false)
  const [dirty, setDirty]       = useState(false)

  useEffect(() => {
    api.listWiki().then(setEntries).finally(() => setLoading(false))
  }, [])

  const openEdit = (entry: WikiEntry) => {
    setCurrent(entry)
    setEditTopic(entry.topic)
    setEditContent(entry.content)
    setDirty(false)
    setTab('write')
    setView('edit')
  }

  const handleSave = async () => {
    if (!current) return
    setSaving(true)
    try {
      const updated = await api.updateWiki(current.id, editTopic, editContent)
      setCurrent(updated)
      setEntries(prev => prev.map(e => e.id === updated.id ? { ...e, topic: updated.topic, updated_at: updated.updated_at } : e))
      setDirty(false)
    } finally {
      setSaving(false)
    }
  }

  const handleReprocess = async () => {
    if (!current) return
    // 먼저 저장
    if (dirty) await handleSave()
    setReprocessing(true)
    try {
      const updated = await api.reprocessWiki(current.id)
      setCurrent(updated)
      setEditContent(updated.content)
      setEntries(prev => prev.map(e => e.id === updated.id ? { ...e, topic: updated.topic, updated_at: updated.updated_at } : e))
      setDirty(false)
    } finally {
      setReprocessing(false)
    }
  }

  const handleBack = () => {
    if (dirty && !confirm('저장하지 않은 변경사항이 있습니다. 나가시겠습니까?')) return
    setView('list')
    setCurrent(null)
  }

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">

      {/* 목록 뷰 */}
      <AnimatePresence mode="wait">
        {view === 'list' && (
          <motion.div key="list" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-semibold text-text-primary">위키</h1>
                <p className="text-sm text-text-muted mt-1">수집된 문서에서 생성된 지식 항목</p>
              </div>
              <span className="text-xs text-text-muted bg-neutral-bg3 px-3 py-1.5 rounded-full">
                {entries.length}개 항목
              </span>
            </div>

            {loading ? (
              <div className="grid grid-cols-2 gap-4">
                {[0, 1, 2, 3].map(i => (
                  <div key={i} className="glass-card p-5 h-36 animate-pulse bg-neutral-bg3" />
                ))}
              </div>
            ) : entries.length === 0 ? (
              <Card>
                <p className="text-sm text-text-muted text-center py-12">
                  위키 항목이 없습니다. 수집 페이지에서 문서를 처리하면 자동으로 생성됩니다.
                </p>
              </Card>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                {entries.map(entry => (
                  <motion.div key={entry.id} whileHover={{ y: -2 }} transition={{ type: 'spring', stiffness: 400, damping: 20 }}
                    onClick={() => openEdit(entry)}
                    className="glass-card p-5 cursor-pointer hover:bg-white/8 transition-colors border border-border-subtle hover:border-border group">
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <h3 className="text-sm font-semibold text-text-primary group-hover:text-brand-light transition-colors line-clamp-1">
                        {entry.topic}
                      </h3>
                      <span className="text-xs text-text-muted shrink-0">{timeAgo(entry.updated_at)}</span>
                    </div>
                    <p className="text-xs text-text-secondary line-clamp-3 leading-relaxed">
                      {entry.preview?.replace(/[#*`>-]/g, '').trim()}
                    </p>
                    <p className="text-xs text-brand mt-3 opacity-0 group-hover:opacity-100 transition-opacity">
                      클릭하여 편집 →
                    </p>
                  </motion.div>
                ))}
              </div>
            )}
          </motion.div>
        )}

        {/* 편집 뷰 */}
        {view === 'edit' && current && (
          <motion.div key="edit" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} className="space-y-4">

            {/* 헤더 */}
            <div className="flex items-center gap-3">
              <button onClick={handleBack}
                className="flex items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary transition-colors">
                ← 목록
              </button>
              <span className="text-border">|</span>
              <input
                value={editTopic}
                onChange={e => { setEditTopic(e.target.value); setDirty(true) }}
                className="flex-1 bg-transparent text-xl font-semibold text-text-primary outline-none border-b border-transparent hover:border-border-subtle focus:border-brand transition-colors pb-0.5"
                placeholder="주제 제목"
              />
              <div className="flex gap-2 shrink-0">
                <Button variant="secondary" size="sm" onClick={handleSave} loading={saving}
                  disabled={!dirty}>
                  {dirty ? '저장' : '저장됨'}
                </Button>
                <Button size="sm" onClick={handleReprocess} loading={reprocessing}>
                  {reprocessing ? 'LLM 분석 중...' : '✦ LLM 재분석'}
                </Button>
              </div>
            </div>

            {/* 탭 */}
            <div className="flex gap-1 bg-neutral-bg3 p-1 rounded-lg w-fit">
              {(['write', 'preview'] as EditTab[]).map(t => (
                <button key={t} onClick={() => setTab(t)}
                  className={`px-4 py-1.5 rounded-md text-xs font-medium transition-colors ${tab === t ? 'bg-neutral-bg6 text-text-primary' : 'text-text-secondary hover:text-text-primary'}`}>
                  {t === 'write' ? '✏️ 편집' : '👁 미리보기'}
                </button>
              ))}
            </div>

            {/* 편집 / 미리보기 영역 */}
            {tab === 'write' ? (
              <textarea
                value={editContent}
                onChange={e => { setEditContent(e.target.value); setDirty(true) }}
                className="w-full min-h-[calc(100vh-280px)] bg-neutral-bg2 border border-border-subtle hover:border-border focus:border-brand rounded-xl p-5 text-sm text-text-primary font-mono leading-relaxed resize-none outline-none transition-colors"
                placeholder="마크다운으로 작성하세요..."
                spellCheck={false}
              />
            ) : (
              <div className="w-full min-h-[calc(100vh-280px)] bg-neutral-bg2 border border-border-subtle rounded-xl p-5 overflow-auto">
                <div className="prose prose-invert prose-sm max-w-none
                  prose-headings:text-text-primary prose-headings:font-semibold
                  prose-p:text-text-secondary prose-p:leading-relaxed
                  prose-a:text-brand-light prose-a:no-underline hover:prose-a:underline
                  prose-strong:text-text-primary
                  prose-code:text-brand-light prose-code:bg-neutral-bg4 prose-code:px-1 prose-code:rounded
                  prose-pre:bg-neutral-bg3 prose-pre:border prose-pre:border-border-subtle
                  prose-blockquote:border-l-brand prose-blockquote:text-text-muted
                  prose-li:text-text-secondary
                  prose-hr:border-border-subtle
                  prose-table:text-text-secondary
                  prose-th:text-text-primary prose-th:border-border
                  prose-td:border-border-subtle">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {editContent || '*내용이 없습니다.*'}
                  </ReactMarkdown>
                </div>
              </div>
            )}

            {/* 하단 메타 */}
            <p className="text-xs text-text-muted">
              마지막 수정: {timeAgo(current.updated_at)} •
              {dirty && <span className="text-status-warning ml-1">저장되지 않은 변경사항</span>}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
