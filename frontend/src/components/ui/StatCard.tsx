import { motion } from 'framer-motion'

interface StatCardProps {
  label: string
  value: number | string
  icon: string
  color?: string
}

export default function StatCard({ label, value, icon, color = 'text-brand' }: StatCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-card p-5 flex items-center gap-4"
    >
      <div className="w-10 h-10 rounded-lg bg-neutral-bg4 flex items-center justify-center shrink-0">
        <span className={`text-lg ${color}`}>{icon}</span>
      </div>
      <div>
        <p className="text-2xl font-semibold text-text-primary tabular-nums">{value}</p>
        <p className="text-xs text-text-muted mt-0.5">{label}</p>
      </div>
    </motion.div>
  )
}
