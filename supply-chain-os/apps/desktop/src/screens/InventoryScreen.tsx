import { useEffect, useState } from 'react'
import clsx from 'clsx'
import {
  listSkus,
  getStockLevels,
  getStockHistory,
  createSku,
  adjustStock,
  receiveStock,
  transferStock,
  checkReorderAlerts,
  batchStockCount,
  ReorderAlert,
  CountResult,
} from '../lib/tauri'
import type { Sku, StockLevel, StockEvent } from '@scos/shared-types'

type Mode = 'overview' | 'detail' | 'count'
type AdjustReason = 'SALE' | 'DAMAGE' | 'COUNT' | 'TRANSFER' | 'MANUAL'

interface SelectedSku {
  sku: Sku
  levels: StockLevel[]
  history: StockEvent[]
}

interface CreateSkuFormState {
  id: string
  name: string
  description: string
  unitOfMeasure: string
  reorderPoint: string
  economicOrderQty: string
  safetyStock: string
}

interface AdjustFormState {
  skuId: string
  locationId: string
  delta: string
  reason: AdjustReason
}

interface CountState {
  counts: Map<string, Map<string, number>>
  results: CountResult[] | null
}

export function InventoryScreen() {
  const [mode, setMode] = useState<Mode>('overview')
  const [skus, setSkus] = useState<Sku[]>([])
  const [reorderAlerts, setReorderAlerts] = useState<ReorderAlert[]>([])
  const [selectedSku, setSelectedSku] = useState<SelectedSku | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Create SKU modal state
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [createForm, setCreateForm] = useState<CreateSkuFormState>({
    id: '',
    name: '',
    description: '',
    unitOfMeasure: 'EACH',
    reorderPoint: '0',
    economicOrderQty: '0',
    safetyStock: '0',
  })
  const [creatingSkuLoading, setCreatingSkuLoading] = useState(false)

  // Adjust stock modal state
  const [showAdjustModal, setShowAdjustModal] = useState(false)
  const [adjustForm, setAdjustForm] = useState<AdjustFormState>({
    skuId: '',
    locationId: '',
    delta: '',
    reason: 'MANUAL',
  })
  const [adjustingLoading, setAdjustingLoading] = useState(false)

  // Count mode state
  const [countState, setCountState] = useState<CountState>({
    counts: new Map(),
    results: null,
  })

  // Load SKUs and alerts on mount
  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)
    setError(null)
    try {
      const skusResp = await listSkus()
      setSkus(skusResp.skus)
      const alertsResp = await checkReorderAlerts()
      setReorderAlerts(alertsResp.alerts)
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }

  async function loadSkuDetail(sku: Sku) {
    try {
      const levelsResp = await getStockLevels(sku.id)
      const historyResp = await getStockHistory(sku.id, 50)
      setSelectedSku({
        sku,
        levels: levelsResp.levels,
        history: historyResp.history,
      })
      setMode('detail')
    } catch (err) {
      setError(String(err))
    }
  }

  async function handleCreateSku() {
    setCreatingSkuLoading(true)
    try {
      await createSku({
        id: createForm.id,
        name: createForm.name,
        description: createForm.description || undefined,
        unit_of_measure: createForm.unitOfMeasure,
        reorder_point: parseInt(createForm.reorderPoint) || 0,
        economic_order_qty: parseInt(createForm.economicOrderQty) || 0,
        safety_stock: parseInt(createForm.safetyStock) || 0,
        created_at: Date.now(),
      })
      setShowCreateModal(false)
      setCreateForm({
        id: '',
        name: '',
        description: '',
        unitOfMeasure: 'EACH',
        reorderPoint: '0',
        economicOrderQty: '0',
        safetyStock: '0',
      })
      await loadData()
    } catch (err) {
      setError(String(err))
    } finally {
      setCreatingSkuLoading(false)
    }
  }

  async function handleAdjustStock() {
    setAdjustingLoading(true)
    try {
      await adjustStock({
        skuId: adjustForm.skuId,
        locationId: adjustForm.locationId,
        delta: parseInt(adjustForm.delta),
        reason: adjustForm.reason,
      })
      setShowAdjustModal(false)
      setAdjustForm({
        skuId: '',
        locationId: '',
        delta: '',
        reason: 'MANUAL',
      })
      await loadData()
      if (selectedSku) {
        await loadSkuDetail(selectedSku.sku)
      }
    } catch (err) {
      setError(String(err))
    } finally {
      setAdjustingLoading(false)
    }
  }

  async function handleSubmitCount() {
    const countInputs: Array<{ sku_id: string; location_id: string; counted_qty: number }> = []
    countState.counts.forEach((locationMap, skuId) => {
      locationMap.forEach((qty, locationId) => {
        countInputs.push({ sku_id: skuId, location_id: locationId, counted_qty: qty })
      })
    })

    try {
      const resp = await batchStockCount(countInputs)
      setCountState({ ...countState, results: resp.results })
    } catch (err) {
      setError(String(err))
    }
  }

  function getStockStatus(level: StockLevel, sku: Sku): 'green' | 'amber' | 'red' {
    if (level.qty_on_hand > sku.reorder_point + sku.safety_stock) return 'green'
    if (level.qty_on_hand > sku.reorder_point) return 'amber'
    return 'red'
  }

  const statusColor = {
    green: 'bg-emerald-900 text-emerald-100 border-emerald-800',
    amber: 'bg-yellow-900 text-yellow-100 border-yellow-800',
    red: 'bg-red-900 text-red-100 border-red-800',
  }

  if (mode === 'overview') {
    return (
      <div className="p-6 space-y-6 font-mono">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-gray-100">Inventory</h1>
            <p className="text-gray-500 text-xs mt-0.5">SKU tracking, stock levels, and cycle counts</p>
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-3 py-1.5 bg-teal-600 hover:bg-teal-700 text-gray-100 text-xs font-semibold rounded"
          >
            New SKU
          </button>
        </div>

        {/* Reorder alerts banner */}
        {reorderAlerts.length > 0 && (
          <div className="bg-yellow-900 border border-yellow-800 rounded-lg p-4">
            <div className="text-xs font-semibold text-yellow-100 uppercase tracking-widest mb-2">
              Reorder Alerts
            </div>
            <div className="space-y-1 text-xs text-yellow-200">
              {reorderAlerts.map((alert, i) => (
                <div key={i}>
                  {alert.sku_name} @ {alert.location_id}: {alert.qty_on_hand} on hand, {alert.reorder_point} threshold
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Error state */}
        {error && (
          <div className="bg-red-900 border border-red-800 rounded-lg p-3">
            <div className="text-xs text-red-100">{error}</div>
          </div>
        )}

        {/* SKU table */}
        {loading ? (
          <div className="text-gray-500 text-xs py-8 text-center">Loading...</div>
        ) : skus.length === 0 ? (
          <div className="bg-gray-900 rounded-lg border border-gray-800 p-8 text-center">
            <p className="text-gray-500 text-xs">No SKUs created yet. Click "New SKU" to get started.</p>
          </div>
        ) : (
          <div className="bg-gray-900 rounded-lg border border-gray-800 overflow-hidden">
            <table className="w-full text-xs">
              <thead className="border-b border-gray-800 bg-gray-800">
                <tr>
                  <th className="text-left px-4 py-2 font-semibold text-gray-300">SKU ID</th>
                  <th className="text-left px-4 py-2 font-semibold text-gray-300">Name</th>
                  <th className="text-center px-4 py-2 font-semibold text-gray-300">On Hand</th>
                  <th className="text-center px-4 py-2 font-semibold text-gray-300">Reserved</th>
                  <th className="text-center px-4 py-2 font-semibold text-gray-300">Status</th>
                  <th className="text-center px-4 py-2 font-semibold text-gray-300">UoM</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {skus.map(sku => {
                  const totalOnHand = selectedSku?.levels.reduce((sum, l) => sum + l.qty_on_hand, 0) ?? 0
                  const totalReserved = selectedSku?.levels.reduce((sum, l) => sum + l.qty_reserved, 0) ?? 0
                  const status = selectedSku
                    ? getStockStatus(
                        { sku_id: sku.id, location_id: '', qty_on_hand: totalOnHand, qty_reserved: totalReserved, updated_at: 0 },
                        sku
                      )
                    : 'green'

                  return (
                    <tr
                      key={sku.id}
                      onClick={() => loadSkuDetail(sku)}
                      className="hover:bg-gray-800 cursor-pointer"
                    >
                      <td className="px-4 py-2 text-gray-300 font-semibold">{sku.id}</td>
                      <td className="px-4 py-2 text-gray-400">{sku.name}</td>
                      <td className="px-4 py-2 text-center text-gray-300">—</td>
                      <td className="px-4 py-2 text-center text-gray-300">—</td>
                      <td className="px-4 py-2 text-center">
                        <span
                          className={clsx(
                            'inline-block px-2 py-1 rounded text-xs font-semibold border',
                            statusColor[status]
                          )}
                        >
                          {status.toUpperCase()}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-center text-gray-400">{sku.unit_of_measure}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Mode buttons */}
        <div className="flex gap-2">
          <button
            onClick={() => setMode('count')}
            className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-100 text-xs font-semibold rounded border border-gray-700"
          >
            Stock Count
          </button>
        </div>

        {/* Create SKU Modal */}
        {showCreateModal && (
          <Modal onClose={() => setShowCreateModal(false)}>
            <h2 className="text-sm font-semibold text-gray-100 mb-4">Create SKU</h2>
            <div className="space-y-3">
              <input
                type="text"
                placeholder="SKU ID"
                value={createForm.id}
                onChange={e => setCreateForm({ ...createForm, id: e.target.value })}
                className="w-full px-2 py-1 bg-gray-800 border border-gray-700 rounded text-xs text-gray-100 placeholder-gray-500"
              />
              <input
                type="text"
                placeholder="Name"
                value={createForm.name}
                onChange={e => setCreateForm({ ...createForm, name: e.target.value })}
                className="w-full px-2 py-1 bg-gray-800 border border-gray-700 rounded text-xs text-gray-100 placeholder-gray-500"
              />
              <textarea
                placeholder="Description"
                value={createForm.description}
                onChange={e => setCreateForm({ ...createForm, description: e.target.value })}
                className="w-full px-2 py-1 bg-gray-800 border border-gray-700 rounded text-xs text-gray-100 placeholder-gray-500"
                rows={2}
              />
              <select
                value={createForm.unitOfMeasure}
                onChange={e => setCreateForm({ ...createForm, unitOfMeasure: e.target.value })}
                className="w-full px-2 py-1 bg-gray-800 border border-gray-700 rounded text-xs text-gray-100"
              >
                <option>EACH</option>
                <option>BOX</option>
                <option>CASE</option>
                <option>KG</option>
                <option>L</option>
              </select>
              <input
                type="number"
                placeholder="Reorder Point"
                value={createForm.reorderPoint}
                onChange={e => setCreateForm({ ...createForm, reorderPoint: e.target.value })}
                className="w-full px-2 py-1 bg-gray-800 border border-gray-700 rounded text-xs text-gray-100 placeholder-gray-500"
              />
              <input
                type="number"
                placeholder="Economic Order Qty"
                value={createForm.economicOrderQty}
                onChange={e => setCreateForm({ ...createForm, economicOrderQty: e.target.value })}
                className="w-full px-2 py-1 bg-gray-800 border border-gray-700 rounded text-xs text-gray-100 placeholder-gray-500"
              />
              <input
                type="number"
                placeholder="Safety Stock"
                value={createForm.safetyStock}
                onChange={e => setCreateForm({ ...createForm, safetyStock: e.target.value })}
                className="w-full px-2 py-1 bg-gray-800 border border-gray-700 rounded text-xs text-gray-100 placeholder-gray-500"
              />
            </div>
            <div className="mt-6 flex gap-2 justify-end">
              <button
                onClick={() => setShowCreateModal(false)}
                className="px-3 py-1 bg-gray-800 hover:bg-gray-700 text-gray-100 text-xs font-semibold rounded"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateSku}
                disabled={creatingSkuLoading || !createForm.id || !createForm.name}
                className="px-3 py-1 bg-teal-600 hover:bg-teal-700 disabled:bg-gray-700 text-gray-100 text-xs font-semibold rounded"
              >
                {creatingSkuLoading ? 'Creating...' : 'Create'}
              </button>
            </div>
          </Modal>
        )}
      </div>
    )
  }

  if (mode === 'detail' && selectedSku) {
    return (
      <div className="p-6 space-y-6 font-mono">
        {/* Header with back button */}
        <div className="flex items-center gap-4">
          <button
            onClick={() => {
              setMode('overview')
              setSelectedSku(null)
            }}
            className="px-2 py-1 text-gray-400 hover:text-gray-100 text-xs"
          >
            ← Back
          </button>
          <div>
            <h1 className="text-lg font-semibold text-gray-100">{selectedSku.sku.name}</h1>
            <p className="text-gray-500 text-xs mt-0.5">{selectedSku.sku.id}</p>
          </div>
          <button
            onClick={() => {
              setAdjustForm({
                skuId: selectedSku.sku.id,
                locationId: selectedSku.levels[0]?.location_id || '',
                delta: '',
                reason: 'MANUAL',
              })
              setShowAdjustModal(true)
            }}
            className="ml-auto px-3 py-1.5 bg-orange-600 hover:bg-orange-700 text-gray-100 text-xs font-semibold rounded"
          >
            Adjust Stock
          </button>
        </div>

        {/* Stock levels by location */}
        <section>
          <h2 className="text-gray-400 text-xs font-semibold uppercase tracking-widest mb-3">
            Stock by Location
          </h2>
          <div className="bg-gray-900 rounded-lg border border-gray-800 overflow-hidden">
            {selectedSku.levels.length === 0 ? (
              <div className="px-4 py-8 text-center text-gray-600 text-xs">
                No stock levels yet. Receive stock to populate.
              </div>
            ) : (
              <table className="w-full text-xs">
                <thead className="border-b border-gray-800 bg-gray-800">
                  <tr>
                    <th className="text-left px-4 py-2 font-semibold text-gray-300">Location</th>
                    <th className="text-center px-4 py-2 font-semibold text-gray-300">On Hand</th>
                    <th className="text-center px-4 py-2 font-semibold text-gray-300">Reserved</th>
                    <th className="text-center px-4 py-2 font-semibold text-gray-300">Available</th>
                    <th className="text-center px-4 py-2 font-semibold text-gray-300">Updated</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {selectedSku.levels.map(level => (
                    <tr key={`${level.sku_id}-${level.location_id}`} className="hover:bg-gray-800">
                      <td className="px-4 py-2 text-gray-300 font-semibold">{level.location_id}</td>
                      <td className="px-4 py-2 text-center text-gray-100 font-semibold">
                        {level.qty_on_hand}
                      </td>
                      <td className="px-4 py-2 text-center text-gray-400">{level.qty_reserved}</td>
                      <td className="px-4 py-2 text-center text-gray-400">
                        {level.qty_on_hand - level.qty_reserved}
                      </td>
                      <td className="px-4 py-2 text-center text-gray-500 text-xs">
                        {new Date(level.updated_at).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>

        {/* Event history timeline */}
        <section>
          <h2 className="text-gray-400 text-xs font-semibold uppercase tracking-widest mb-3">
            Event History
          </h2>
          <div className="bg-gray-900 rounded-lg border border-gray-800 overflow-hidden">
            {selectedSku.history.length === 0 ? (
              <div className="px-4 py-8 text-center text-gray-600 text-xs">
                No events yet.
              </div>
            ) : (
              <div className="divide-y divide-gray-800">
                {selectedSku.history.map(evt => (
                  <div key={evt.id} className="px-4 py-3 hover:bg-gray-800">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="text-xs font-semibold text-gray-300 mb-1">
                          {evt.reason}
                          {evt.delta > 0 ? (
                            <span className="text-emerald-400 ml-2">+{evt.delta}</span>
                          ) : (
                            <span className="text-red-400 ml-2">{evt.delta}</span>
                          )}
                        </div>
                        <div className="text-xs text-gray-500">
                          {evt.location_id} • {new Date(evt.recorded_at).toLocaleString()}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Adjust Stock Modal */}
        {showAdjustModal && (
          <Modal onClose={() => setShowAdjustModal(false)}>
            <h2 className="text-sm font-semibold text-gray-100 mb-4">Adjust Stock</h2>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-400 block mb-1">Location</label>
                <select
                  value={adjustForm.locationId}
                  onChange={e => setAdjustForm({ ...adjustForm, locationId: e.target.value })}
                  className="w-full px-2 py-1 bg-gray-800 border border-gray-700 rounded text-xs text-gray-100"
                >
                  <option value="">Select Location</option>
                  {selectedSku.levels.map(level => (
                    <option key={level.location_id} value={level.location_id}>
                      {level.location_id} ({level.qty_on_hand})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">Delta (+ or -)</label>
                <input
                  type="number"
                  value={adjustForm.delta}
                  onChange={e => setAdjustForm({ ...adjustForm, delta: e.target.value })}
                  className="w-full px-2 py-1 bg-gray-800 border border-gray-700 rounded text-xs text-gray-100 placeholder-gray-500"
                  placeholder="e.g., -5 or 10"
                />
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">Reason</label>
                <select
                  value={adjustForm.reason}
                  onChange={e => setAdjustForm({ ...adjustForm, reason: e.target.value as AdjustReason })}
                  className="w-full px-2 py-1 bg-gray-800 border border-gray-700 rounded text-xs text-gray-100"
                >
                  <option value="SALE">Sale</option>
                  <option value="DAMAGE">Damage</option>
                  <option value="COUNT">Count</option>
                  <option value="TRANSFER">Transfer</option>
                  <option value="MANUAL">Manual</option>
                </select>
              </div>
            </div>
            <div className="mt-6 flex gap-2 justify-end">
              <button
                onClick={() => setShowAdjustModal(false)}
                className="px-3 py-1 bg-gray-800 hover:bg-gray-700 text-gray-100 text-xs font-semibold rounded"
              >
                Cancel
              </button>
              <button
                onClick={handleAdjustStock}
                disabled={adjustingLoading || !adjustForm.locationId || !adjustForm.delta}
                className="px-3 py-1 bg-orange-600 hover:bg-orange-700 disabled:bg-gray-700 text-gray-100 text-xs font-semibold rounded"
              >
                {adjustingLoading ? 'Adjusting...' : 'Adjust'}
              </button>
            </div>
          </Modal>
        )}
      </div>
    )
  }

  if (mode === 'count') {
    return (
      <div className="p-6 space-y-6 font-mono">
        {/* Header */}
        <div className="flex items-center gap-4">
          <button
            onClick={() => {
              setMode('overview')
              setCountState({ counts: new Map(), results: null })
            }}
            className="px-2 py-1 text-gray-400 hover:text-gray-100 text-xs"
          >
            ← Back
          </button>
          <h1 className="text-lg font-semibold text-gray-100">Stock Count</h1>
          <div className="ml-auto text-xs text-gray-500">
            {countState.counts.size} SKUs entered
          </div>
        </div>

        {/* Count entry table */}
        <section>
          <h2 className="text-gray-400 text-xs font-semibold uppercase tracking-widest mb-3">
            Count Inventory
          </h2>
          <div className="bg-gray-900 rounded-lg border border-gray-800 overflow-hidden">
            <table className="w-full text-xs">
              <thead className="border-b border-gray-800 bg-gray-800">
                <tr>
                  <th className="text-left px-4 py-2 font-semibold text-gray-300">SKU ID</th>
                  <th className="text-left px-4 py-2 font-semibold text-gray-300">Name</th>
                  <th className="text-left px-4 py-2 font-semibold text-gray-300">Location</th>
                  <th className="text-center px-4 py-2 font-semibold text-gray-300">System Qty</th>
                  <th className="text-center px-4 py-2 font-semibold text-gray-300">Counted Qty</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {skus.flatMap(sku =>
                  (selectedSku?.levels || []).map(level => {
                    if (level.sku_id !== sku.id) return null
                    const key = `${sku.id}:${level.location_id}`
                    const counted = countState.counts.get(sku.id)?.get(level.location_id) ?? ''

                    return (
                      <tr key={key}>
                        <td className="px-4 py-2 text-gray-300 font-semibold">{sku.id}</td>
                        <td className="px-4 py-2 text-gray-400">{sku.name}</td>
                        <td className="px-4 py-2 text-gray-400">{level.location_id}</td>
                        <td className="px-4 py-2 text-center text-gray-300">{level.qty_on_hand}</td>
                        <td className="px-4 py-2 text-center">
                          <input
                            type="number"
                            value={counted}
                            onChange={e => {
                              const newCounts = new Map(countState.counts)
                              let locationMap = newCounts.get(sku.id)
                              if (!locationMap) {
                                locationMap = new Map()
                                newCounts.set(sku.id, locationMap)
                              }
                              if (e.target.value) {
                                locationMap.set(level.location_id, parseInt(e.target.value))
                              } else {
                                locationMap.delete(level.location_id)
                              }
                              setCountState({ ...countState, counts: newCounts })
                            }}
                            className="w-16 px-2 py-1 bg-gray-800 border border-gray-700 rounded text-xs text-gray-100 text-center"
                            placeholder="0"
                          />
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* Results */}
        {countState.results && (
          <section>
            <h2 className="text-gray-400 text-xs font-semibold uppercase tracking-widest mb-3">
              Count Results
            </h2>
            <div className="bg-gray-900 rounded-lg border border-gray-800 overflow-hidden">
              <table className="w-full text-xs">
                <thead className="border-b border-gray-800 bg-gray-800">
                  <tr>
                    <th className="text-left px-4 py-2 font-semibold text-gray-300">SKU</th>
                    <th className="text-left px-4 py-2 font-semibold text-gray-300">Location</th>
                    <th className="text-center px-4 py-2 font-semibold text-gray-300">Expected</th>
                    <th className="text-center px-4 py-2 font-semibold text-gray-300">Counted</th>
                    <th className="text-center px-4 py-2 font-semibold text-gray-300">Variance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {countState.results.map(result => (
                    <tr
                      key={`${result.sku_id}-${result.location_id}`}
                      className={result.delta === 0 ? 'bg-gray-800' : ''}
                    >
                      <td className="px-4 py-2 text-gray-300 font-semibold">{result.sku_id}</td>
                      <td className="px-4 py-2 text-gray-400">{result.location_id}</td>
                      <td className="px-4 py-2 text-center text-gray-300">{result.expected_qty}</td>
                      <td className="px-4 py-2 text-center text-gray-300">{result.counted_qty}</td>
                      <td className="px-4 py-2 text-center">
                        {result.delta === 0 ? (
                          <span className="text-emerald-400 font-semibold">OK</span>
                        ) : (
                          <span className={result.delta > 0 ? 'text-orange-400' : 'text-red-400'}>
                            {result.delta > 0 ? '+' : ''}{result.delta} ({result.variance_pct.toFixed(1)}%)
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* Actions */}
        <div className="flex gap-2 justify-end">
          {countState.results ? (
            <button
              onClick={() => setCountState({ counts: new Map(), results: null })}
              className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-100 text-xs font-semibold rounded"
            >
              New Count
            </button>
          ) : (
            <>
              <button
                onClick={() => {
                  setMode('overview')
                  setCountState({ counts: new Map(), results: null })
                }}
                className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-100 text-xs font-semibold rounded"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmitCount}
                disabled={countState.counts.size === 0}
                className="px-3 py-1.5 bg-teal-600 hover:bg-teal-700 disabled:bg-gray-700 text-gray-100 text-xs font-semibold rounded"
              >
                Submit Count
              </button>
            </>
          )}
        </div>
      </div>
    )
  }

  return null
}

function Modal({
  onClose,
  children,
}: {
  onClose: () => void
  children: React.ReactNode
}) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-gray-900 border border-gray-800 rounded-lg shadow-2xl w-full max-w-md p-6 font-mono"
        onClick={e => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  )
}
