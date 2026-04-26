const BASE = '/api'

function getToken() { return localStorage.getItem('jarvis_token') ?? '' }
export function clearToken() { localStorage.removeItem('jarvis_token') }

async function req<T>(path: string, options?: RequestInit): Promise<T> {
  const isFormData = options?.body instanceof FormData
  const baseHeaders: Record<string, string> = isFormData ? {} : { 'Content-Type': 'application/json' }
  const token = getToken()
  if (token) baseHeaders['Authorization'] = `Bearer ${token}`

  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: { ...baseHeaders, ...(options?.headers as Record<string, string> ?? {}) },
  })

  if (res.status === 401) {
    clearToken()
    window.location.href = '/'
    throw new Error('인증이 만료되었습니다')
  }
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
  project: string | null
  status: TaskStatus
  confirmed: boolean
  completed_at: string | null
  created_at: string
}

export interface WikiEntry {
  id: number
  topic: string
  content: string
  folder: string
  preview?: string
  updated_at: string
}

export const api = {
  login: (password: string) =>
    req<{ token: string }>('/login', { method: 'POST', body: JSON.stringify({ password }) }),

  stats: () => req<{ doc_count: number; knowledge_count: number; task_count: number; pending_review: number }>('/stats'),

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
    return req<{ id: number; title: string }>('/ingest/file', { method: 'POST', body: form })
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
  listWiki: (q?: string) => req<WikiEntry[]>(q ? `/wiki?q=${encodeURIComponent(q)}` : '/wiki'),
  getWiki: (id: number) => req<WikiEntry>(`/wiki/${id}`),
  updateWiki: (id: number, topic: string, content: string) =>
    req<WikiEntry>(`/wiki/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ topic, content }),
    }),
  updateWikiFolder: (id: number, folder: string) =>
    req<{ id: number; folder: string }>(`/wiki/${id}/folder`, {
      method: 'PUT',
      body: JSON.stringify({ folder }),
    }),
  reprocessWiki: (id: number) =>
    req<WikiEntry>(`/wiki/${id}/reprocess`, { method: 'POST' }),
  deleteWiki: (id: number) =>
    req<{ deleted: number }>(`/wiki/${id}`, { method: 'DELETE' }),
  getRelatedWiki: (id: number) =>
    req<{ id: number; topic: string; folder: string; updated_at: string }[]>(`/wiki/${id}/related`),
  triggerWikiLint: () =>
    req<{ status: string }>('/wiki/lint', { method: 'POST' }),

  // 할 일
  getTasks: (status = 'all') => req<Task[]>(`/tasks?status=${status}`),
  getUnconfirmedTasks: () => req<Task[]>('/tasks/unconfirmed'),
  confirmTask: (id: number) => req<Task>(`/tasks/${id}/confirm`, { method: 'POST' }),
  confirmAllTasks: () => req<{ confirmed: number }>('/tasks/confirm-all', { method: 'POST' }),

  createTask: (data: { title: string; class_of_service: string; team: string; assignee?: string; due_date?: string; project?: string }) =>
    req<Task>('/tasks', { method: 'POST', body: JSON.stringify(data) }),

  updateTask: (id: number, patch: Partial<{ status: string; class_of_service: string; team: string; title: string; assignee: string; due_date: string; project: string }>) =>
    req<Task>(`/tasks/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),

  deleteTask: (id: number) =>
    req<{ deleted: number }>(`/tasks/${id}`, { method: 'DELETE' }),

  bulkConfirmTasks: (ids: number[]) =>
    req<{ confirmed: number; tasks: Task[] }>('/tasks/bulk-confirm', {
      method: 'POST', body: JSON.stringify({ ids }),
    }),

  bulkDeleteTasks: (ids: number[]) =>
    req<{ deleted: number }>('/tasks/bulk-delete', {
      method: 'POST', body: JSON.stringify({ ids }),
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
