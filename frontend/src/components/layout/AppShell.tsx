import { ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import Sidebar from './Sidebar'

const FLUID_ROUTES = ['/wiki']

export default function AppShell({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()
  const fluid = FLUID_ROUTES.includes(pathname)

  return (
    <div className="flex min-h-screen bg-neutral-bg1">
      <Sidebar />
      {fluid ? (
        <main className="flex-1 flex overflow-hidden h-screen">
          {children}
        </main>
      ) : (
        <main className="flex-1 overflow-auto">
          <div className="max-w-4xl mx-auto px-8 py-8">
            {children}
          </div>
        </main>
      )}
    </div>
  )
}
