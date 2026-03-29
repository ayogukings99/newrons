import { useState, useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { Card } from '@scos/ui'
import { Button } from '@scos/ui'
import { StatusPill } from '@scos/ui'
import { DualSigBadge } from '@scos/ui'
import { OnChainBadge } from '@scos/ui'
import { Badge } from '@scos/ui'

interface PurchaseOrder {
  id: string
  supplier_did: string
  status: string
  total_value: number
  currency: string
  expected_delivery: number | null
  confirmed_at: number | null
  shipped_at: number | null
  received_at: number | null
  created_at: number
  our_sig?: string
  their_sig?: string | null
  dht_anchor?: string | null
}

interface LineItem {
  id: string
  po_id: string
  sku_id: string
  qty_ordered: number
  unit_price: number
  qty_received: number
}

interface PoDetail {
  po: PurchaseOrder
  line_items: LineItem[]
  status_timeline: StatusTransition[]
}

interface StatusTransition {
  event_id: string
  event_type: string
  status: string
  timestamp: number
  is_dual_signed: boolean
}

interface SupplierScorecard {
  supplier_did: string
  po_count: number
  on_time_pct: number
  fill_rate_pct: number
  avg_lead_days: number
  quality_tier: string
}

const STATUSES = ['ISSUED', 'CONFIRMED', 'SHIPPED', 'RECEIVED', 'CANCELLED']

const statusColor = (status: string) => {
  switch (status) {
    case 'ISSUED':
      return 'bg-blue-900/60 text-blue-300'
    case 'CONFIRMED':
      return 'bg-teal-900/60 text-teal-300'
    case 'SHIPPED':
      return 'bg-yellow-900/60 text-yellow-300'
    case 'RECEIVED':
      return 'bg-green-900/60 text-green-300'
    case 'CANCELLED':
      return 'bg-red-900/60 text-red-300'
    default:
      return 'bg-gray-800 text-gray-400'
  }
}

const tierColor = (tier: string) => {
  switch (tier) {
    case 'A':
      return 'bg-green-900/60 text-green-300'
    case 'B':
      return 'bg-blue-900/60 text-blue-300'
    case 'C':
      return 'bg-yellow-900/60 text-yellow-300'
    case 'D':
      return 'bg-orange-900/60 text-orange-300'
    case 'F':
      return 'bg-red-900/60 text-red-300'
    default:
      return 'bg-gray-800 text-gray-400'
  }
}

function NewPoModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [supplierDid, setSupplierDid] = useState('')
  const [items, setItems] = useState([{ sku_id: '', qty: 1, unit_price: 0 }])
  const [expectedDelivery, setExpectedDelivery] = useState<string>('')
  const [currency, setCurrency] = useState('USD')
  const [loading, setLoading] = useState(false)

  const addItem = () => {
    setItems([...items, { sku_id: '', qty: 1, unit_price: 0 }])
  }

  const removeItem = (idx: number) => {
    setItems(items.filter((_, i) => i !== idx))
  }

  const updateItem = (idx: number, field: string, value: any) => {
    const newItems = [...items]
    newItems[idx] = { ...newItems[idx], [field]: value }
    setItems(newItems)
  }

  const handleCreate = async () => {
    if (!supplierDid || items.length === 0) {
      alert('Supplier DID and at least one item required')
      return
    }

    setLoading(true)
    try {
      const response = await invoke('create_purchase_order', {
        input: {
          supplier_did: supplierDid,
          line_items: items.map((li) => ({
            sku_id: li.sku_id,
            qty: Math.floor(li.qty),
            unit_price: parseFloat(String(li.unit_price)),
          })),
          expected_delivery: expectedDelivery
            ? new Date(expectedDelivery).getTime()
            : null,
          currency,
        },
      })

      if (response.success) {
        onSuccess()
        onClose()
      } else {
        alert('Error: ' + (response.error || 'Unknown error'))
      }
    } catch (e) {
      alert('Error: ' + String(e))
    } finally {
      setLoading(false)
    }
  }

  const totalValue = items.reduce((sum, item) => sum + item.qty * item.unit_price, 0)

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-700 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-100">Create Purchase Order</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-300 text-2xl leading-none"
          >
            ×
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <label className="text-sm text-gray-400 font-semibold">Supplier DID</label>
            <input
              type="text"
              value={supplierDid}
              onChange={(e) => setSupplierDid(e.target.value)}
              className="w-full mt-2 px-3 py-2 bg-gray-900 text-gray-100 border border-gray-700 rounded font-mono text-xs"
              placeholder="did:scn:..."
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-gray-400 font-semibold">Expected Delivery</label>
              <input
                type="datetime-local"
                value={expectedDelivery}
                onChange={(e) => setExpectedDelivery(e.target.value)}
                className="w-full mt-2 px-3 py-2 bg-gray-900 text-gray-100 border border-gray-700 rounded text-sm"
              />
            </div>
            <div>
              <label className="text-sm text-gray-400 font-semibold">Currency</label>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="w-full mt-2 px-3 py-2 bg-gray-900 text-gray-100 border border-gray-700 rounded text-sm"
              >
                <option>USD</option>
                <option>EUR</option>
                <option>GBP</option>
                <option>JPY</option>
              </select>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="text-sm text-gray-400 font-semibold">Line Items</label>
              <Button
                onClick={addItem}
                variant="secondary"
                size="sm"
                className="text-xs"
              >
                + Add Item
              </Button>
            </div>

            <div className="space-y-2 bg-gray-900/50 p-3 rounded border border-gray-700">
              {items.map((item, idx) => (
                <div key={idx} className="grid grid-cols-4 gap-2 items-end">
                  <input
                    type="text"
                    value={item.sku_id}
                    onChange={(e) => updateItem(idx, 'sku_id', e.target.value)}
                    className="px-2 py-1 bg-gray-800 text-gray-100 border border-gray-600 rounded text-xs font-mono"
                    placeholder="SKU"
                  />
                  <input
                    type="number"
                    value={item.qty}
                    onChange={(e) => updateItem(idx, 'qty', parseInt(e.target.value) || 0)}
                    className="px-2 py-1 bg-gray-800 text-gray-100 border border-gray-600 rounded text-xs"
                    placeholder="Qty"
                    min="1"
                  />
                  <input
                    type="number"
                    value={item.unit_price}
                    onChange={(e) => updateItem(idx, 'unit_price', parseFloat(e.target.value) || 0)}
                    className="px-2 py-1 bg-gray-800 text-gray-100 border border-gray-600 rounded text-xs"
                    placeholder="Price"
                    step="0.01"
                  />
                  <button
                    onClick={() => removeItem(idx)}
                    className="px-2 py-1 bg-red-900/40 text-red-300 border border-red-800/50 rounded text-xs hover:bg-red-900/60"
                  >
                    Remove
                  </button>
                </div>
              ))}

              <div className="pt-2 border-t border-gray-600 text-right">
                <span className="text-sm text-teal-300 font-semibold">
                  Total: {currency} {totalValue.toFixed(2)}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="p-6 border-t border-gray-700 flex gap-3 justify-end">
          <Button
            onClick={onClose}
            variant="secondary"
            disabled={loading}
          >
            Cancel
          </Button>
          <Button
            onClick={handleCreate}
            disabled={loading || !supplierDid || items.length === 0}
          >
            {loading ? 'Creating...' : 'Create PO'}
          </Button>
        </div>
      </Card>
    </div>
  )
}

function PoDetailModal({
  poId,
  onClose,
}: {
  poId: string
  onClose: () => void
}) {
  const [detail, setDetail] = useState<PoDetail | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      try {
        const response = await invoke('get_purchase_order', { po_id: poId })
        if (response.success) {
          setDetail(response.data)
        }
      } catch (e) {
        console.error(e)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [poId])

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
        <Card className="p-6">
          <p className="text-gray-400">Loading...</p>
        </Card>
      </div>
    )
  }

  if (!detail) {
    return (
      <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
        <Card className="p-6">
          <p className="text-red-300">PO not found</p>
          <Button onClick={onClose} className="mt-4">
            Close
          </Button>
        </Card>
      </div>
    )
  }

  const po = detail.po
  const liMap = detail.line_items

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 overflow-y-auto">
      <Card className="w-full max-w-3xl my-8">
        <div className="p-6 border-b border-gray-700 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-100">{po.id}</h2>
            <p className="text-xs text-gray-500 font-mono mt-1">{po.supplier_did}</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-300 text-2xl leading-none"
          >
            ×
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Header Info */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-gray-500">Status</p>
              <div className="mt-2">
                <StatusPill status={po.status} />
              </div>
            </div>
            <div>
              <p className="text-xs text-gray-500">Total Value</p>
              <p className="mt-1 text-xl font-semibold text-teal-300">
                {po.currency} {po.total_value.toFixed(2)}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Expected Delivery</p>
              <p className="mt-1 text-sm text-gray-300">
                {po.expected_delivery
                  ? new Date(po.expected_delivery).toLocaleDateString()
                  : 'Not set'}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Created</p>
              <p className="mt-1 text-sm text-gray-300">
                {new Date(po.created_at).toLocaleDateString()}
              </p>
            </div>
          </div>

          {/* Dual Sig Status */}
          <div className="bg-gray-900/50 p-4 rounded border border-gray-700">
            <p className="text-xs text-gray-500 mb-3">Signatures</p>
            <DualSigBadge
              ourSig={!!po.our_sig}
              theirSig={!!po.their_sig}
              ourLabel="Buyer"
              theirLabel="Supplier"
            />
            {po.dht_anchor && (
              <div className="mt-3">
                <OnChainBadge anchored={true} />
                <p className="text-xs text-gray-500 mt-2 font-mono">{po.dht_anchor}</p>
              </div>
            )}
          </div>

          {/* Line Items */}
          <div>
            <h3 className="text-sm font-semibold text-gray-300 mb-3">Line Items</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-700">
                    <th className="text-left py-2 px-3 text-xs text-gray-500 font-mono">SKU</th>
                    <th className="text-right py-2 px-3 text-xs text-gray-500">Qty Ordered</th>
                    <th className="text-right py-2 px-3 text-xs text-gray-500">Unit Price</th>
                    <th className="text-right py-2 px-3 text-xs text-gray-500">Qty Received</th>
                    <th className="text-right py-2 px-3 text-xs text-gray-500">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {liMap.map((li) => (
                    <tr key={li.id} className="border-b border-gray-800">
                      <td className="py-3 px-3 font-mono text-xs">{li.sku_id}</td>
                      <td className="text-right py-3 px-3">{li.qty_ordered}</td>
                      <td className="text-right py-3 px-3">{li.unit_price.toFixed(2)}</td>
                      <td className="text-right py-3 px-3 text-teal-300">{li.qty_received}</td>
                      <td className="text-right py-3 px-3">
                        {(li.qty_ordered * li.unit_price).toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Status Timeline */}
          <div>
            <h3 className="text-sm font-semibold text-gray-300 mb-3">Status History</h3>
            <div className="space-y-2">
              {detail.status_timeline.map((st, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-3 py-2 px-3 bg-gray-900/50 rounded border border-gray-700"
                >
                  <div className="flex-shrink-0">
                    <div className="w-2 h-2 rounded-full bg-teal-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-300">{st.event_type}</p>
                    <p className="text-xs text-gray-500">
                      {new Date(st.timestamp).toLocaleString()}
                    </p>
                  </div>
                  {st.is_dual_signed && (
                    <OnChainBadge anchored={true} />
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="p-6 border-t border-gray-700">
          <Button onClick={onClose} className="w-full">
            Close
          </Button>
        </div>
      </Card>
    </div>
  )
}

function SupplierScorecardCard({ supplier_did }: { supplier_did: string }) {
  const [scorecard, setScorecard] = useState<SupplierScorecard | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      try {
        const response = await invoke('get_supplier_scorecard', { supplier_did })
        if (response.success && response.data) {
          setScorecard(response.data)
        }
      } catch (e) {
        console.error(e)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [supplier_did])

  if (loading) {
    return (
      <Card className="p-4">
        <p className="text-gray-500 text-xs">Loading...</p>
      </Card>
    )
  }

  if (!scorecard) {
    return null
  }

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between mb-4">
        <div>
          <p className="text-xs text-gray-500 font-mono truncate">{scorecard.supplier_did}</p>
          <p className="text-lg font-semibold text-gray-100 mt-1">{scorecard.po_count} POs</p>
        </div>
        <Badge className={tierColor(scorecard.quality_tier)}>
          Tier {scorecard.quality_tier}
        </Badge>
      </div>

      <div className="grid grid-cols-3 gap-3 text-center">
        <div>
          <p className="text-xs text-gray-500">On-Time %</p>
          <p className="text-lg font-semibold text-teal-300 mt-1">
            {scorecard.on_time_pct.toFixed(0)}%
          </p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Fill Rate %</p>
          <p className="text-lg font-semibold text-teal-300 mt-1">
            {scorecard.fill_rate_pct.toFixed(0)}%
          </p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Avg Lead (days)</p>
          <p className="text-lg font-semibold text-teal-300 mt-1">
            {scorecard.avg_lead_days.toFixed(1)}
          </p>
        </div>
      </div>
    </Card>
  )
}

export function ProcurementScreen() {
  const [pos, setPos] = useState<PurchaseOrder[]>([])
  const [selectedPoId, setSelectedPoId] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<string | null>(null)
  const [showNewPoModal, setShowNewPoModal] = useState(false)
  const [loading, setLoading] = useState(true)

  const loadPos = async () => {
    setLoading(true)
    try {
      const response = await invoke('list_purchase_orders', {
        status_filter: statusFilter,
      })
      if (response.success) {
        setPos(response.data || [])
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadPos()
  }, [statusFilter])

  const supplierDids = Array.from(new Set(pos.map((po) => po.supplier_did)))

  return (
    <div className="h-full overflow-auto">
      <div className="p-6 border-b border-gray-700">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-gray-100">Procurement</h1>
            <p className="text-xs text-gray-500 mt-1">
              Manage purchase orders and supplier relationships
            </p>
          </div>
          <Button onClick={() => setShowNewPoModal(true)}>+ New PO</Button>
        </div>
      </div>

      <div className="p-6 space-y-6">
        {/* Status Filter */}
        <div className="flex gap-2 items-center flex-wrap">
          <button
            onClick={() => setStatusFilter(null)}
            className={`px-3 py-1 text-xs rounded font-semibold transition-colors ${
              statusFilter === null
                ? 'bg-teal-900/60 text-teal-300'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
            }`}
          >
            All
          </button>
          {STATUSES.map((status) => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`px-3 py-1 text-xs rounded font-semibold transition-colors ${
                statusFilter === status
                  ? `${statusColor(status)} opacity-100`
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              }`}
            >
              {status}
            </button>
          ))}
        </div>

        {/* PO Table */}
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-700">
                  <th className="text-left py-3 px-4 text-xs text-gray-500 font-semibold">
                    PO ID
                  </th>
                  <th className="text-left py-3 px-4 text-xs text-gray-500 font-semibold">
                    Supplier
                  </th>
                  <th className="text-left py-3 px-4 text-xs text-gray-500 font-semibold">
                    Status
                  </th>
                  <th className="text-right py-3 px-4 text-xs text-gray-500 font-semibold">
                    Total Value
                  </th>
                  <th className="text-left py-3 px-4 text-xs text-gray-500 font-semibold">
                    Created
                  </th>
                  <th className="text-left py-3 px-4 text-xs text-gray-500 font-semibold">
                    Expected Delivery
                  </th>
                  <th className="text-center py-3 px-4 text-xs text-gray-500 font-semibold">
                    Signatures
                  </th>
                  <th className="text-left py-3 px-4"></th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-gray-500">
                      Loading...
                    </td>
                  </tr>
                ) : pos.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-gray-500">
                      No purchase orders yet
                    </td>
                  </tr>
                ) : (
                  pos.map((po) => (
                    <tr key={po.id} className="border-b border-gray-800 hover:bg-gray-900/50">
                      <td className="py-3 px-4 font-mono text-xs text-teal-300">{po.id}</td>
                      <td className="py-3 px-4 font-mono text-xs text-gray-400 max-w-[200px] truncate">
                        {po.supplier_did}
                      </td>
                      <td className="py-3 px-4">
                        <StatusPill status={po.status} />
                      </td>
                      <td className="py-3 px-4 text-right font-semibold text-gray-100">
                        {po.currency} {po.total_value.toFixed(2)}
                      </td>
                      <td className="py-3 px-4 text-xs text-gray-400">
                        {new Date(po.created_at).toLocaleDateString()}
                      </td>
                      <td className="py-3 px-4 text-xs text-gray-400">
                        {po.expected_delivery
                          ? new Date(po.expected_delivery).toLocaleDateString()
                          : '-'}
                      </td>
                      <td className="py-3 px-4 flex justify-center">
                        <DualSigBadge
                          ourSig={!!po.our_sig}
                          theirSig={!!po.their_sig}
                          ourLabel="B"
                          theirLabel="S"
                        />
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => setSelectedPoId(po.id)}
                          className="text-xs px-2 py-1 bg-gray-800 text-gray-300 hover:bg-gray-700 rounded"
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Supplier Scorecards */}
        {supplierDids.length > 0 && (
          <div>
            <h2 className="text-lg font-semibold text-gray-100 mb-4">Supplier Scorecards</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {supplierDids.map((did) => (
                <SupplierScorecardCard key={did} supplier_did={did} />
              ))}
            </div>
          </div>
        )}
      </div>

      {showNewPoModal && (
        <NewPoModal onClose={() => setShowNewPoModal(false)} onSuccess={loadPos} />
      )}

      {selectedPoId && (
        <PoDetailModal poId={selectedPoId} onClose={() => setSelectedPoId(null)} />
      )}
    </div>
  )
}
