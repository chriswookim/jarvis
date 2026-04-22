import clsx from 'clsx'

interface BadgeProps {
  value: string
  type?: 'priority' | 'assignee' | 'source'
}

const PRIORITY: Record<string, string> = {
  high:   'bg-status-error/15 text-status-error border-status-error/25',
  medium: 'bg-status-warning/15 text-status-warning border-status-warning/25',
  low:    'bg-status-success/15 text-status-success border-status-success/25',
}

const PRIORITY_LABEL: Record<string, string> = {
  high: '높음', medium: '보통', low: '낮음',
}

export default function Badge({ value, type = 'assignee' }: BadgeProps) {
  const isPriority = type === 'priority'
  return (
    <span className={clsx(
      'inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border',
      isPriority
        ? PRIORITY[value] ?? 'bg-neutral-bg4 text-text-muted border-border'
        : 'bg-brand-subtle text-brand-light border-brand/20'
    )}>
      {isPriority ? PRIORITY_LABEL[value] ?? value : value}
    </span>
  )
}
