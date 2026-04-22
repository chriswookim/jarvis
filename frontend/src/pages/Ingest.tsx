import { useState, useRef, DragEvent } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { api } from '@/api/client'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'

interface IngestResult {
  id: number
  title: string
  processed?: boolean
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
    try {
      const r = await api.processDoc(id)
      setResults(prev => prev.map(d => d.id === id ? { ...d, processed: true, tasks_created: r.tasks_created } : d))
    } catch { setError('처리에 실패했습니다.') }
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
            }`}
          >
            <p className="text-2xl mb-2">📂</p>
            <p className="text-sm text-text-secondary">파일을 드래그하거나 클릭하세요</p>
            <p className="text-xs text-text-muted mt-1">PDF · MD · TXT 지원</p>
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
            />
            <Button onClick={handleUrl} loading={loading} className="w-full">
              수집하기
            </Button>
          </div>
        </Card>
      </div>

      {error && <p className="text-sm text-status-error">{error}</p>}

      {/* 수집된 문서 목록 */}
      <AnimatePresence>
        {results.length > 0 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <Card title="수집된 문서">
              <ul className="space-y-2">
                {results.map(r => (
                  <motion.li
                    key={r.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="flex items-center justify-between py-2.5 border-b border-border-subtle last:border-0"
                  >
                    <div>
                      <p className="text-sm text-text-primary">{r.title}</p>
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
