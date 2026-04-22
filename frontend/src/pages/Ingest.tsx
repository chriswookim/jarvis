import { useState, useRef, DragEvent } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { api } from '@/api/client'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'

interface IngestResult {
  id: number
  title: string
  processed?: boolean
  processing?: boolean
  tasks_created?: number
}

export default function Ingest() {
  const [url, setUrl] = useState('')
  const [dragging, setDragging] = useState(false)
  const [loading, setLoading] = useState(false)
  const [mailLoading, setMailLoading] = useState(false)
  const [results, setResults] = useState<IngestResult[]>([])
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const handleFile = async (file: File) => {
    setLoading(true); setError('')
    try {
      const r = await api.ingestFile(file)
      setResults(prev => [{ ...r, processed: false }, ...prev])
    } catch { setError('파일 업로드에 실패했습니다.') }
    finally { setLoading(false) }
  }

  const handleUrl = async () => {
    if (!url.trim()) return
    setLoading(true); setError('')
    try {
      const r = await api.ingestUrl(url.trim())
      setResults(prev => [{ ...r, processed: false }, ...prev])
      setUrl('')
    } catch { setError('URL 수집에 실패했습니다.') }
    finally { setLoading(false) }
  }

  const handleProcess = async (id: number) => {
    setResults(prev => prev.map(d => d.id === id ? { ...d, processing: true } : d))
    setError('')
    try {
      const r = await api.processDoc(id)
      setResults(prev => prev.map(d =>
        d.id === id ? { ...d, processing: false, processed: true, tasks_created: r.tasks_created } : d
      ))
    } catch {
      setResults(prev => prev.map(d => d.id === id ? { ...d, processing: false } : d))
      setError('처리에 실패했습니다. 활동 로그를 확인해주세요.')
    }
  }

  const handleEmail = async () => {
    setMailLoading(true); setError('')
    try {
      const r = await api.ingestEmail(20)
      if (r.ingested === 0) {
        setError(r.message ?? '읽지 않은 메일이 없습니다.')
      } else {
        const newDocs = (r.doc_ids ?? []).map((id, i) => ({ id, title: `메일 ${i + 1}`, processed: false }))
        setResults(prev => [...newDocs, ...prev])
      }
    } catch { setError('메일 수집에 실패했습니다.') }
    finally { setMailLoading(false) }
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault(); setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <h1 className="text-2xl font-semibold text-text-primary">데이터 수집</h1>

      {/* 메일 수집 */}
      <Card title="메일 수집 (NAS 메일 서버)">
        <div className="flex items-center justify-between">
          <p className="text-sm text-text-secondary">읽지 않은 메일을 최대 20개 가져옵니다.</p>
          <Button onClick={handleEmail} loading={mailLoading}>받은메일 가져오기</Button>
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-4">
        {/* 파일 업로드 */}
        <Card title="파일 업로드">
          <div
            onDragOver={e => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            onClick={() => fileRef.current?.click()}
            className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
              dragging ? 'border-brand bg-brand-subtle' : 'border-border hover:border-border-strong'
            } ${loading ? 'pointer-events-none opacity-50' : ''}`}
          >
            {loading ? (
              <>
                <div className="w-6 h-6 border-2 border-brand border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                <p className="text-sm text-text-secondary">업로드 중...</p>
              </>
            ) : (
              <>
                <p className="text-2xl mb-2">📂</p>
                <p className="text-sm text-text-secondary">파일을 드래그하거나 클릭하세요</p>
                <p className="text-xs text-text-muted mt-1">PDF · MD · TXT 지원</p>
              </>
            )}
          </div>
          <input ref={fileRef} type="file" accept=".pdf,.md,.txt" className="hidden"
            onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />
        </Card>

        {/* URL 수집 */}
        <Card title="URL 수집">
          <div className="space-y-3">
            <input
              className="glass-input w-full"
              placeholder="https://..."
              value={url}
              onChange={e => setUrl(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleUrl()}
              disabled={loading}
            />
            <Button onClick={handleUrl} loading={loading} className="w-full">
              수집하기
            </Button>
          </div>
        </Card>
      </div>

      {error && (
        <motion.p
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-sm text-status-error bg-status-error/10 border border-status-error/20 rounded-lg px-4 py-2.5"
        >
          {error}
        </motion.p>
      )}

      {/* 수집된 문서 목록 */}
      <AnimatePresence>
        {results.length > 0 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <Card title="수집된 문서">
              <ul className="space-y-0 divide-y divide-border-subtle">
                {results.map(r => (
                  <motion.li
                    key={r.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="py-3"
                  >
                    {r.processing ? (
                      <div className="flex items-center gap-3 bg-brand-subtle border border-brand/20 rounded-lg px-4 py-3">
                        <div className="w-4 h-4 border-2 border-brand border-t-transparent rounded-full animate-spin shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-text-primary font-medium truncate">{r.title}</p>
                          <p className="text-xs text-brand mt-0.5">LLM이 문서를 분석 중입니다... (10~30초 소요)</p>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between">
                        <div className="min-w-0 mr-3">
                          <p className="text-sm text-text-primary truncate">{r.title}</p>
                          {r.processed && (
                            <p className="text-xs text-status-success mt-0.5">
                              처리 완료 · 할 일 {r.tasks_created}개 생성됨
                            </p>
                          )}
                        </div>
                        {!r.processed && (
                          <Button size="sm" variant="secondary" onClick={() => handleProcess(r.id)}>
                            지식 처리
                          </Button>
                        )}
                        {r.processed && (
                          <span className="text-xs text-status-success shrink-0">✓ 완료</span>
                        )}
                      </div>
                    )}
                  </motion.li>
                ))}
              </ul>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
