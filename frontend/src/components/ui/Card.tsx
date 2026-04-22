import { ReactNode } from 'react'
import clsx from 'clsx'

interface CardProps {
  children: ReactNode
  className?: string
  title?: string
}

export default function Card({ children, className, title }: CardProps) {
  return (
    <div className={clsx('glass-card p-5', className)}>
      {title && <h3 className="text-sm font-medium text-text-secondary mb-4">{title}</h3>}
      {children}
    </div>
  )
}
