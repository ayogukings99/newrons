import { Outlet, NavLink, useLocation } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { getOrCreateIdentity, getChainHead } from '../lib/tauri'
import clsx from 'clsx'

const NAV_ITEMS = [
  { path: '/',           label: 'Dashboard',    icon: '⬡' },
  { path: '/inventory',  label: 'Inventory',    icon: '📦' },
  { path: '/forecasting',label: 'Forecasting',  icon: '📈' },
  { path: '/procurement',label: 'Procurement',  icon: '🤝' },
  { path: '/warehouse',  label: 'Warehouse',    icon: '🏭' },
  { path: '/routes',     label: 'Routes',       icon: '🗺️' },
  { path: '/quality',    label: 'Quality',      icon: '✅' },
  { path: '/peers',      label: 'Peers',        icon: '⬡⬡' },
  { path: '/chain',      label: 'Chain',        icon: '🔗' },
]

export function AppShell() {
  const [did, setDid] = useState<string | null>(null)
  const [chainLength, setChainLength] = useState<number>(0)
  const [syncStatus, setSyncStatus] = useState<'synced' | 'syncing' | 'offline'>('offline')

  useEffect(() => {
    getOrCreateIdentity()
      .then(r => setDid(r.did))
      .catch(console.error)

    getChainHead()
      .then(h => setChainLength(h.length))
      .catch(console.error)

    // Stub: update sync status after 2s
    setTimeout(() => setSyncStatus('synced'), 2000)
  }, [])

  const shortDid = did ? `${did.slice(0, 18)}…` : '…'

  return (
    <div className="flex h-screen bg-gray-950 text-gray-100 font-mono text-sm overflow-hidden">
      {/* ── Sidebar ── */}
      <aside className="w-52 flex-shrink-0 bg-gray-900 border-r border-gray-800 flex flex-col">
        {/* Node identity header */}
        <div className="px-4 py-4 border-b border-gray-800">
          <div className="text-xs text-teal-400 font-semibold tracking-widest uppercase mb-1">
            Sovereign Node
          </div>
          <div className="text-gray-400 text-xs truncate" title={did ?? ''}>
            {shortDid}
          </div>
          <div className="flex items-center gap-1.5 mt-2">
            <SyncIndicator status={syncStatus} />
            <span className="text-gray-500 text-xs">
              {syncStatus === 'synced' ? 'Synced' : syncStatus === 'syncing' ? 'Syncing…' : 'Offline'}
            </span>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-2 overflow-y-auto">
          {NAV_ITEMS.map(item => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === '/'}
              className={({ isActive }) =>
                clsx(
                  'flex items-center gap-3 px-4 py-2.5 text-sm transition-colors',
                  isActive
                    ? 'bg-teal-900/40 text-teal-300 border-r-2 border-teal-400'
                    : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/60'
                )
              }
            >
              <span className="text-base leading-none">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>

        {/* Chain footer */}
        <div className="px-4 py-3 border-t border-gray-800 text-xs text-gray-600">
          ● {chainLength} events on-chain
        </div>
      </aside>

      {/* ── Main content ── */}
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  )
}

function SyncIndicator({ status }: { status: 'synced' | 'syncing' | 'offline' }) {
  return (
    <span
      className={clsx(
        'w-2 h-2 rounded-full inline-block',
        status === 'synced'  && 'bg-teal-400',
        status === 'syncing' && 'bg-yellow-400 animate-pulse',
        status === 'offline' && 'bg-gray-600',
      )}
    />
  )
}
