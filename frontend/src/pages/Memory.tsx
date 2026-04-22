import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { api } from '@/api/client'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'

export default function Memory() {
  const [query, setQuery] = useState('')
  const [summary, setSummary] = useState('')
  const [results, setResults] = useState<{ memory: string; score?: number }[]>([])
  const [newMemory, setNewMemory] = useState('')
  const [searching, setSearching] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    api.memorySummary().then(r => setSummary(r.summary)).catch(() => {})
  }, [])

  const handleSearch = async () => {
    if (!query.trim()) return
    setSearching(true)
    try {
      const r = await api.recall(query)
      setResults(r.results)
    } catch { setResults([]) }
    finally { setSearching(false) }
  }

  const handleSave = async () => {
    if (!newMemory.trim()) return
    setSaving(true)
    try {
      await api.remember(newMemory)
      setNewMemory('')
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
      const r = await api.memorySummary()
      setSummary(r.summary)
    } catch {}
    finally { setSaving(false) }
  }

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <h1 className="text-2xl font-semibold text-text-primary">메모리</h1>

      {/* 요약 */}
      <Card title="저장된 메모리 요약">
        <p className="text-sm text-text-secondary whitespace-pre-line leading-relaxed">
          {summary || '아직 저장된 메모리가 없습니다.'}
        </p>
      </Card>

      {/* 검색 */}
      <Card title="메모리 검색">
        <div className="flex gap-2">
          <input
            className="glass-input flex-1"
            placeholder="검색어를 입력하세요..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
          />
          <Button onClick={handleSearch} loading={searching}>검색</Button>
        </div>

        <AnimatePresence>
          {results.length > 0 && (
            <motion.ul
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="mt-4 space-y-2"
            >
              {results.map((r, i) => (
                <motion.li
                  key={i}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="flex items-start gap-3 p-3 bg-neutral-bg3 rounded-lg"
                >
                  <span className="text-brand mt-0.5 shrink-0">◎</span>
                  <p className="text-sm text-text-secondary">{r.memory}</p>
                  {r.score !== undefined && (
                    <span className="text-xs text-text-muted shrink-0 ml-auto">
                      {Math.round(r.score * 100)}%
                    </span>
                  )}
                </motion.li>
              ))}
            </motion.ul>
          )}
          {results.length === 0 && query && !searching && (
            <p className="text-sm text-text-muted mt-3">검색 결과가 없습니다.</p>
          )}
        </AnimatePresence>
      </Card>

      {/* 메모리 추가 */}
      <Card title="메모리 추가">
        <div className="space-y-3">
          <textarea
            className="glass-input w-full resize-none"
            rows={3}
            placeholder="기억할 내용을 입력하세요 (예: 회장님은 보고서를 간결하게 선호하십니다)"
            value={newMemory}
            onChange={e => setNewMemory(e.target.value)}
          />
          <Button
            onClick={handleSave}
            loading={saving}
            variant={saved ? 'secondary' : 'primary'}
          >
            {saved ? '✓ 저장됨' : '저장'}
          </Button>
        </div>
      </Card>
    </motion.div>
  )
}
