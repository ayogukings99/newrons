import { useEffect, useState } from 'react'
import { getStockLevels, listPurchaseOrders, getChainHead } from '../lib/tauri'

interface KpiCard {
  label: string
  value: string | number
  sub?: string
  accent?: boolean
}

export function DashboardScreen() {
  const [chainLength, setChainLength] = useState(0)

  useEffect(() => {
    getChainHead().then(h => setChainLength(h.length)).catch(console.error)
  }, [])

  const kpis: KpiCard[] = [
    { label: 'SKUs', value: '—', sub: 'total tracked' },
    { label: 'Stock Locations', value: '—', sub: 'warehouses + stores' },
    { label: 'Open POs', value: '—', sub: 'pending confirmation' },
    { label: 'Chain Events', value: chainLength, sub: 'immutable log', accent: true },
    { label: 'Active Peers', value: '—', sub: 'connected nodes' },
    { label: 'Tasks Today', value: '—', sub: 'warehouse floor' },
  ]

  return (
    <div className="p-6 space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-xl font-semibold text-gray-100">Dashboard</h1>
        <p className="text-gray-500 text-xs mt-0.5">Your sovereign node — local state overview</p>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-3 gap-4">
        {kpis.map(kpi => (
          <KpiCard key={kpi.label} {...kpi} />
        ))}
      </div>

      {/* Recent chain events placeholder */}
      <section>
        <h2 className="text-gray-400 text-xs font-semibold uppercase tracking-widest mb-3">
          Recent Chain Events
        </h2>
        <div className="bg-gray-900 rounded-lg border border-gray-800 divide-y divide-gray-800">
          <EmptyState message="No events yet. Create a SKU or connect a peer to get started." />
        </div>
      </section>

      {/* Open POs placeholder */}
      <section>
        <h2 className="text-gray-400 text-xs font-semibold uppercase tracking-widest mb-3">
          Open Purchase Orders
        </h2>
        <div className="bg-gray-900 rounded-lg border border-gray-800">
          <EmptyState message="No open purchase orders." />
        </div>
      </section>
    </div>
  )
}

function KpiCard({ label, value, sub, accent }: KpiCard) {
  return (
    <div className="bg-gray-900 rounded-lg border border-gray-800 p-4">
      <div className="text-xs text-gray-500 uppercase tracking-widest mb-1">{label}</div>
      <div className={`text-2xl font-bold ${accent ? 'text-teal-400' : 'text-gray-100'}`}>
        {value}
      </div>
      {sub && <div className="text-xs text-gray-600 mt-0.5">{sub}</div>}
    </div>
  )
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="px-4 py-8 text-center text-gray-600 text-sm">
      {message}
    </div>
  )
}
