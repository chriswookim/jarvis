import { Routes, Route } from 'react-router-dom'
import { AnimatePresence } from 'framer-motion'
import AppShell from '@/components/layout/AppShell'
import Home from '@/pages/Home'
import Ingest from '@/pages/Ingest'
import Tasks from '@/pages/Tasks'
import Wiki from '@/pages/Wiki'
import Memory from '@/pages/Memory'
import Logs from '@/pages/Logs'

export default function App() {
  return (
    <AppShell>
      <AnimatePresence mode="wait">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/ingest" element={<Ingest />} />
          <Route path="/tasks" element={<Tasks />} />
          <Route path="/wiki" element={<Wiki />} />
          <Route path="/memory" element={<Memory />} />
          <Route path="/logs" element={<Logs />} />
        </Routes>
      </AnimatePresence>
    </AppShell>
  )
}
