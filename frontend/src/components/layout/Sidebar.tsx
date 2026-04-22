import { NavLink } from 'react-router-dom'
import { motion } from 'framer-motion'
import clsx from 'clsx'

const NAV = [
  { to: '/',        icon: '⌂', label: '홈' },
  { to: '/ingest',  icon: '↑', label: '수집' },
  { to: '/tasks',   icon: '✓', label: '할 일' },
  { to: '/wiki',    icon: '◈', label: '위키' },
  { to: '/memory',  icon: '◎', label: '메모리' },
]

export default function Sidebar() {
  return (
    <aside className="w-56 shrink-0 h-screen sticky top-0 flex flex-col border-r border-border-subtle bg-neutral-bg2">
      <div className="px-5 py-6">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-brand flex items-center justify-center shadow-glow">
            <span className="text-white text-xs font-bold">J</span>
          </div>
          <span className="font-semibold text-text-primary tracking-tight">Jarvis</span>
        </div>
      </div>

      <nav className="flex-1 px-3 space-y-1">
        {NAV.map(({ to, icon, label }) => (
          <NavLink key={to} to={to} end={to === '/'}>
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
                <span className="text-base w-5 text-center">{icon}</span>
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
