import { Routes, Route } from 'react-router-dom'
import { AnimatePresence } from 'framer-motion'
import AppShell from '@/components/layout/AppShell'
import Home from '@/pages/Home'
import Ingest from '@/pages/Ingest'
import Tasks from '@/pages/Tasks'
import Memory from '@/pages/Memory'

export default function App() {
  return (
    <AppShell>
      <AnimatePresence mode="wait">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/ingest" element={<Ingest />} />
          <Route path="/tasks" element={<Tasks />} />
          <Route path="/memory" element={<Memory />} />
        </Routes>
      </AnimatePresence>
    </AppShell>
  )
}
