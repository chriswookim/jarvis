import { NavLink } from 'react-router-dom'
import { motion } from 'framer-motion'
import { LayoutDashboard, Upload, CheckSquare, BookOpen, Brain, ScrollText } from 'lucide-react'
import clsx from 'clsx'

const NAV = [
  { to: '/',        icon: LayoutDashboard, label: '홈' },
  { to: '/ingest',  icon: Upload,          label: '수집' },
  { to: '/tasks',   icon: CheckSquare,     label: '할 일' },
  { to: '/wiki',    icon: BookOpen,        label: '위키' },
  { to: '/memory',  icon: Brain,           label: '메모리' },
  { to: '/logs',    icon: ScrollText,      label: '로그' },
]

interface Props {
  onClose?: () => void
}

export default function Sidebar({ onClose }: Props) {
  return (
    <aside className="w-56 shrink-0 h-screen flex flex-col border-r border-border-subtle bg-neutral-bg2">
      <div className="px-5 py-6 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-brand flex items-center justify-center shadow-glow">
            <span className="text-white text-xs font-bold">J</span>
          </div>
          <span className="font-semibold text-text-primary tracking-tight">Jarvis</span>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            aria-label="메뉴 닫기"
            className="md:hidden text-text-muted hover:text-text-primary w-6 h-6 flex items-center justify-center rounded transition-colors"
          >
            ✕
          </button>
        )}
      </div>

      <nav className="flex-1 px-3 space-y-1">
        {NAV.map(({ to, icon: Icon, label }) => (
          <NavLink key={to} to={to} end={to === '/'} onClick={onClose}>
            {({ isActive }) => (
              <motion.div
                whileHover={{ x: 2 }}
                whileTap={{ scale: 0.97 }}
                className={clsx(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors cursor-pointer',
                  isActive
                    ? 'bg-brand-subtle text-brand-light font-medium'
                    : 'text-text-secondary hover:text-text-primary hover:bg-neutral-bg4'
                )}
              >
                <Icon size={16} className="shrink-0" aria-hidden="true" />
                {label}
              </motion.div>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="px-5 py-4 border-t border-border-subtle">
        <p className="text-xs text-text-muted">기획홍보팀 · DS720+</p>
      </div>
    </aside>
  )
}
