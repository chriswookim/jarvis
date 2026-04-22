const BASE = '/api'

async function req<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export type CoS = 'expedite' | 'fixed_date' | 'standard' | 'intangible'
export type TaskStatus = 'pending' | 'in_progress' | 'done'

export interface Task {
  id: number
  title: string
  class_of_service: CoS
  team: string
  assignee: string
  due_date: string | null
  status: TaskStatus
}

export interface WikiEntry {
  id: number
  topic: string
  content: string
  preview?: string
  updated_at: string
}

export const api = {
  stats: () => req<{ doc_count: number; knowledge_count: number; task_count: number }>('/stats'),

  activity: (params?: { limit?: number; level?: string; action?: string; q?: string }) => {
    const p = new URLSearchParams()
    if (params?.limit)  p.set('limit',  String(params.limit))
    if (params?.level)  p.set('level',  params.level)
    if (params?.action) p.set('action', params.action)
    if (params?.q)      p.set('q',      params.q)
    return req<{ total: number; logs: { id: number; level: string; action: string; message: string; created_at: string }[] }>(
      `/activity${p.toString() ? '?' + p.toString() : ''}`
    )
  },

  ingestFile: (file: File) => {
    const form = new FormData()
    form.append('file', file)
    return req<{ id: number; title: string }>('/ingest/file', {
      method: 'POST',
      headers: {},
      body: form,
    })
  },

  ingestEmail: (limit = 10) =>
    req<{ ingested: number; doc_ids: number[]; message?: string }>(`/ingest/email?limit=${limit}`, {
      method: 'POST',
    }),

  ingestUrl: (url: string) =>
    req<{ id: number; title: string }>('/ingest/url', {
      method: 'POST',
      body: JSON.stringify({ url }),
    }),

  processDoc: (id: number) =>
    req<{ knowledge_id: number; tasks_created: number }>(`/knowledge/process/${id}`, {
      method: 'POST',
    }),

  // 위키
  listWiki: () => req<WikiEntry[]>('/wiki'),
  getWiki: (id: number) => req<WikiEntry>(`/wiki/${id}`),
  updateWiki: (id: number, topic: string, content: string) =>
    req<WikiEntry>(`/wiki/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ topic, content }),
    }),
  reprocessWiki: (id: number) =>
    req<WikiEntry>(`/wiki/${id}/reprocess`, { method: 'POST' }),

  // 할 일
  getTasks: (status = 'all') => req<Task[]>(`/tasks?status=${status}`),

  updateTask: (id: number, patch: { status?: string; class_of_service?: string; team?: string }) =>
    req<{ id: number; status: string; class_of_service: string; team: string }>(`/tasks/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),

  sendReport: () => req<{ sent: boolean; task_count: number }>('/tasks/report', { method: 'POST' }),

  remember: (content: string) =>
    req<{ status: string }>('/memory/remember', { method: 'POST', body: JSON.stringify({ content }) }),

  recall: (query: string) =>
    req<{ results: { memory: string; score?: number }[] }>('/memory/recall', {
      method: 'POST',
      body: JSON.stringify({ query }),
    }),

  memorySummary: () => req<{ summary: string }>('/memory/summary'),
}
