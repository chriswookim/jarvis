export interface Stats {
  doc_count: number
  knowledge_count: number
  task_count: number
}

export interface Document {
  id: number
  title: string
  source: string
  created_at: string
}

export interface Task {
  id: number
  title: string
  priority: 'high' | 'medium' | 'low'
  assignee: string
  status: string
}

export interface MemoryResult {
  memory: string
  score?: number
}
