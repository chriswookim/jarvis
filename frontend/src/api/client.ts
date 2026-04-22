const BASE = '/api'

async function req<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export const api = {
  stats: () => req<{ doc_count: number; knowledge_count: number; task_count: number }>('/stats'),

  activity: (limit = 30) =>
    req<{ id: number; level: string; action: string; message: string; created_at: string }[]>(`/activity?limit=${limit}`),


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

  getTasks: (status = 'all') =>
    req<{ id: number; title: string; priority: string; assignee: string; status: string }[]>(`/tasks?status=${status}`),

  updateTask: (id: number, status: string) =>
    req<{ id: number; status: string }>(`/tasks/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
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
