import { ReactNode, useState } from 'react'
import { useLocation } from 'react-router-dom'
import Sidebar from './Sidebar'

const FLUID_ROUTES = ['/wiki', '/tasks']

export default function AppShell({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()
  const fluid = FLUID_ROUTES.includes(pathname)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="flex min-h-dvh bg-neutral-bg1">
      {/* Skip link */}
      <a
        href="#main-content"
        className="sr-only focus-visible:not-sr-only focus-visible:fixed focus-visible:top-2 focus-visible:left-2 focus-visible:z-[9999] focus-visible:px-4 focus-visible:py-2 focus-visible:bg-brand focus-visible:text-white focus-visible:rounded-lg focus-visible:text-sm focus-visible:font-medium"
      >
        본문으로 건너뛰기
      </a>
      {/* 모바일 오버레이 */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* 사이드바 */}
      <div className={`
        fixed md:relative z-50 md:z-auto h-full md:h-auto
        transition-transform duration-200
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
      `}>
        <Sidebar onClose={() => setSidebarOpen(false)} />
      </div>

      {/* 메인 */}
      {fluid ? (
        <main id="main-content" className="flex-1 flex flex-col overflow-hidden min-h-dvh">
          {/* 모바일 헤더 */}
          <div className="md:hidden flex items-center gap-3 px-4 py-3 border-b border-border-subtle bg-neutral-bg2 shrink-0">
            <button
              onClick={() => setSidebarOpen(true)}
              aria-label="메뉴 열기"
              style={{ touchAction: 'manipulation' }}
              className="text-text-secondary hover:text-text-primary text-lg w-10 h-10 flex items-center justify-center rounded-lg hover:bg-neutral-bg4 transition-colors"
            >
              ☰
            </button>
            <span className="text-sm font-semibold text-text-primary">Jarvis</span>
          </div>
          <div className="flex-1 flex overflow-hidden">
            {children}
          </div>
        </main>
      ) : (
        <main id="main-content" className="flex-1 overflow-auto min-w-0">
          {/* 모바일 헤더 */}
          <div className="md:hidden flex items-center gap-3 px-4 py-3 border-b border-border-subtle bg-neutral-bg2 sticky top-0 z-10">
            <button
              onClick={() => setSidebarOpen(true)}
              aria-label="메뉴 열기"
              style={{ touchAction: 'manipulation' }}
              className="text-text-secondary hover:text-text-primary text-lg w-10 h-10 flex items-center justify-center rounded-lg hover:bg-neutral-bg4 transition-colors"
            >
              ☰
            </button>
            <span className="text-sm font-semibold text-text-primary">Jarvis</span>
          </div>
          <div className="max-w-screen-xl mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-8">
            {children}
          </div>
        </main>
      )}
    </div>
  )
}
