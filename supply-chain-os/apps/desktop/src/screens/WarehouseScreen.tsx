import React, { useState, useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Package, Warehouse, BarChart3 } from 'lucide-react'

// ─── Types ───────────────────────────────────────────────────────────────────

interface Task {
  id: string
  task_type: string
  sku_id?: string
  from_bin?: string
  to_bin?: string
  qty: number
  status: string
  assigned_to?: string
  created_at: number
  completed_at?: number
}

interface BinSummary {
  bin_id: string
  total_items: number
  fill_level: string // 'empty', 'partial', 'full'
  sku_count: number
}

interface BinContent {
  bin_id: string
  sku_id: string
  qty: number
  updated_at: number
}

// ─── Status Badge Color Mapping ──────────────────────────────────────────────

function getStatusColor(status: string): string {
  switch (status.toUpperCase()) {
    case 'PENDING':
      return 'bg-gray-600 text-gray-100'
    case 'IN_PROGRESS':
      return 'bg-blue-600 text-white'
    case 'COMPLETED':
      return 'bg-emerald-600 text-white'
    default:
      return 'bg-gray-700 text-gray-100'
  }
}

function getTaskTypeColor(type: string): string {
  switch (type.toUpperCase()) {
    case 'RECEIVE':
      return 'bg-purple-900/30 text-purple-300'
    case 'PICK':
      return 'bg-blue-900/30 text-blue-300'
    case 'PUT':
      return 'bg-teal-900/30 text-teal-300'
    case 'TRANSFER':
      return 'bg-amber-900/30 text-amber-300'
    case 'COUNT':
      return 'bg-indigo-900/30 text-indigo-300'
    default:
      return 'bg-gray-800/30 text-gray-300'
  }
}

function getBinFillColor(fillLevel: string): string {
  switch (fillLevel.toLowerCase()) {
    case 'empty':
      return 'bg-gray-700 hover:bg-gray-600'
    case 'partial':
      return 'bg-teal-700 hover:bg-teal-600'
    case 'full':
      return 'bg-emerald-700 hover:bg-emerald-600'
    default:
      return 'bg-gray-700 hover:bg-gray-600'
  }
}

// ─── Task Queue Table ────────────────────────────────────────────────────────

function TaskQueueTable({ tasks }: { tasks: Task[] }) {
  return (
    <div className="rounded-lg border border-gray-700 overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-gray-800 border-b border-gray-700">
          <tr>
            <th className="px-4 py-3 text-left font-semibold text-gray-300">Type</th>
            <th className="px-4 py-3 text-left font-semibold text-gray-300">SKU</th>
            <th className="px-4 py-3 text-left font-semibold text-gray-300">From → To</th>
            <th className="px-4 py-3 text-left font-semibold text-gray-300">Qty</th>
            <th className="px-4 py-3 text-left font-semibold text-gray-300">Assignee</th>
            <th className="px-4 py-3 text-left font-semibold text-gray-300">Status</th>
          </tr>
        </thead>
        <tbody>
          {tasks.length === 0 ? (
            <tr>
              <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                No tasks yet
              </td>
            </tr>
          ) : (
            tasks.map((task) => (
              <tr
                key={task.id}
                className="border-t border-gray-700 hover:bg-gray-800/50 transition"
              >
                <td className="px-4 py-3">
                  <Badge className={`${getTaskTypeColor(task.task_type)} font-mono text-xs`}>
                    {task.task_type}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-gray-300 font-mono">
                  {task.sku_id || '—'}
                </td>
                <td className="px-4 py-3 text-gray-400 text-xs">
                  {task.from_bin && task.to_bin ? (
                    <>
                      <span className="font-mono">{task.from_bin}</span>
                      <span className="mx-2">→</span>
                      <span className="font-mono">{task.to_bin}</span>
                    </>
                  ) : (
                    '—'
                  )}
                </td>
                <td className="px-4 py-3 text-gray-300 font-semibold">{task.qty}</td>
                <td className="px-4 py-3 text-gray-400 text-xs">
                  {task.assigned_to || '—'}
                </td>
                <td className="px-4 py-3">
                  <Badge className={getStatusColor(task.status)}>
                    {task.status}
                  </Badge>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}

// ─── Bin Grid Visualization ──────────────────────────────────────────────────

function BinGridView({ bins }: { bins: BinSummary[] }) {
  const [selectedBin, setSelectedBin] = useState<BinSummary | null>(null)
  const [binContents, setBinContents] = useState<BinContent[]>([])

  const loadBinContents = async (bin: BinSummary) => {
    try {
      const contents = await invoke<BinContent[]>('get_bin_contents', {
        bin_id: bin.bin_id,
      })
      setBinContents(contents)
      setSelectedBin(bin)
    } catch (err) {
      console.error('Failed to load bin contents:', err)
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        {bins.length === 0 ? (
          <p className="text-gray-500 col-span-full text-center py-8">
            No bins yet. Receive inventory to populate bins.
          </p>
        ) : (
          bins.map((bin) => (
            <Popover key={bin.bin_id}>
              <PopoverTrigger asChild>
                <button
                  onClick={() => loadBinContents(bin)}
                  className={`p-4 rounded-lg text-left transition cursor-pointer ${getBinFillColor(
                    bin.fill_level
                  )}`}
                >
                  <div className="font-mono font-semibold text-sm mb-2">
                    {bin.bin_id}
                  </div>
                  <div className="text-xs text-gray-300">
                    {bin.total_items} items
                  </div>
                  <div className="text-xs text-gray-400 capitalize">
                    {bin.fill_level}
                  </div>
                </button>
              </PopoverTrigger>
              <PopoverContent className="bg-gray-800 border-gray-700 p-3 text-sm">
                <div className="space-y-2">
                  <div className="font-semibold text-gray-200">Bin {bin.bin_id}</div>
                  <div className="text-xs text-gray-400">
                    {bin.total_items} total items • {bin.sku_count} SKUs
                  </div>
                  <div className="pt-2 border-t border-gray-700">
                    {binContents.filter((c) => c.bin_id === bin.bin_id).length === 0 ? (
                      <div className="text-xs text-gray-500">Empty</div>
                    ) : (
                      <ul className="text-xs space-y-1">
                        {binContents
                          .filter((c) => c.bin_id === bin.bin_id)
                          .map((content) => (
                            <li
                              key={`${content.bin_id}-${content.sku_id}`}
                              className="flex justify-between"
                            >
                              <span className="font-mono text-gray-300">
                                {content.sku_id}
                              </span>
                              <span className="text-gray-400">×{content.qty}</span>
                            </li>
                          ))}
                      </ul>
                    )}
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          ))
        )}
      </div>

      <div className="flex gap-2 text-xs">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded bg-gray-700" />
          <span className="text-gray-400">Empty</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded bg-teal-700" />
          <span className="text-gray-400">Partial</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded bg-emerald-700" />
          <span className="text-gray-400">Full</span>
        </div>
      </div>
    </div>
  )
}

// ─── Cycle Count Dialog ──────────────────────────────────────────────────────

function CycleCountDialog() {
  const [zonePrefix, setZonePrefix] = useState('A')
  const [loading, setLoading] = useState(false)

  const handleStartCycleCount = async () => {
    setLoading(true)
    try {
      await invoke('start_cycle_count', { zone_prefix: zonePrefix })
      // Refresh task list, show success toast
      setZonePrefix('A')
    } catch (err) {
      console.error('Failed to start cycle count:', err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          className="bg-teal-900/20 border-teal-700 text-teal-300 hover:bg-teal-900/30"
        >
          <BarChart3 className="w-4 h-4 mr-2" />
          Start Cycle Count
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-gray-900 border-gray-700">
        <DialogHeader>
          <DialogTitle className="text-gray-100">Start Inventory Cycle Count</DialogTitle>
          <DialogDescription className="text-gray-400">
            Generate COUNT tasks for bins matching a zone prefix
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-gray-300 block mb-2">
              Zone Prefix (e.g., A, B, C)
            </label>
            <input
              type="text"
              maxLength={2}
              value={zonePrefix}
              onChange={(e) => setZonePrefix(e.target.value.toUpperCase())}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-gray-100
                         focus:border-teal-600 focus:ring-1 focus:ring-teal-600"
            />
          </div>
          <div className="flex gap-2 justify-end">
            <Button
              variant="outline"
              className="border-gray-700 text-gray-300 hover:bg-gray-800"
            >
              Cancel
            </Button>
            <Button
              onClick={handleStartCycleCount}
              disabled={loading}
              className="bg-teal-700 hover:bg-teal-600 text-white"
            >
              {loading ? 'Starting...' : 'Start Count'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function WarehouseScreen() {
  const [allTasks, setAllTasks] = useState<Task[]>([])
  const [bins, setBins] = useState<BinSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedStatus, setSelectedStatus] = useState<string | null>(null)

  const loadTasks = async (status?: string) => {
    try {
      const tasks = await invoke<Task[]>('list_tasks', { status })
      setAllTasks(tasks)
    } catch (err) {
      console.error('Failed to load tasks:', err)
    }
  }

  const loadBins = async () => {
    try {
      const binData = await invoke<BinSummary[]>('get_bin_map', {})
      setBins(binData)
    } catch (err) {
      console.error('Failed to load bin map:', err)
    }
  }

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      await Promise.all([loadTasks(selectedStatus || undefined), loadBins()])
      setLoading(false)
    }
    load()
  }, [selectedStatus])

  const displayTasks = selectedStatus ? allTasks.filter((t) => t.status === selectedStatus) : allTasks

  return (
    <div className="p-6 space-y-6 bg-gray-900 min-h-screen">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <Warehouse className="w-6 h-6 text-teal-400" />
          <h1 className="text-2xl font-semibold text-gray-100">Warehouse Management</h1>
        </div>
        <p className="text-sm text-gray-500">Task scheduling, bin allocation, inventory counting</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-gray-800 border-gray-700">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-300">Pending Tasks</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-teal-400">
              {allTasks.filter((t) => t.status === 'PENDING').length}
            </div>
            <p className="text-xs text-gray-500 mt-1">Ready to assign</p>
          </CardContent>
        </Card>

        <Card className="bg-gray-800 border-gray-700">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-300">In Progress</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-400">
              {allTasks.filter((t) => t.status === 'IN_PROGRESS').length}
            </div>
            <p className="text-xs text-gray-500 mt-1">Assigned workers</p>
          </CardContent>
        </Card>

        <Card className="bg-gray-800 border-gray-700">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-300">Total Bins</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-400">{bins.length}</div>
            <p className="text-xs text-gray-500 mt-1">
              {bins.reduce((sum, b) => sum + b.total_items, 0)} items
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Bin Map */}
      <Card className="bg-gray-800 border-gray-700">
        <CardHeader>
          <CardTitle className="text-gray-100 flex items-center gap-2">
            <Package className="w-5 h-5 text-teal-400" />
            Bin Map
          </CardTitle>
          <CardDescription className="text-gray-500">
            Tap a bin to view SKU contents
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-gray-500">Loading bins...</div>
          ) : (
            <BinGridView bins={bins} />
          )}
        </CardContent>
      </Card>

      {/* Task Queue */}
      <Card className="bg-gray-800 border-gray-700">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-gray-100">Task Queue</CardTitle>
            <CardDescription className="text-gray-500">
              Sorted by priority: RECEIVE → PICK → PUT → TRANSFER → COUNT
            </CardDescription>
          </div>
          <CycleCountDialog />
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="all" className="space-y-4">
            <TabsList className="bg-gray-700 border-gray-600">
              <TabsTrigger
                value="all"
                onClick={() => setSelectedStatus(null)}
                className="data-[state=active]:bg-teal-700 data-[state=active]:text-white"
              >
                All
              </TabsTrigger>
              <TabsTrigger
                value="pending"
                onClick={() => setSelectedStatus('PENDING')}
                className="data-[state=active]:bg-teal-700 data-[state=active]:text-white"
              >
                Pending
              </TabsTrigger>
              <TabsTrigger
                value="in_progress"
                onClick={() => setSelectedStatus('IN_PROGRESS')}
                className="data-[state=active]:bg-teal-700 data-[state=active]:text-white"
              >
                In Progress
              </TabsTrigger>
              <TabsTrigger
                value="completed"
                onClick={() => setSelectedStatus('COMPLETED')}
                className="data-[state=active]:bg-teal-700 data-[state=active]:text-white"
              >
                Completed
              </TabsTrigger>
            </TabsList>

            <TabsContent value="all">
              {loading ? (
                <div className="text-center py-8 text-gray-500">Loading tasks...</div>
              ) : (
                <TaskQueueTable tasks={displayTasks} />
              )}
            </TabsContent>
            <TabsContent value="pending">
              {loading ? (
                <div className="text-center py-8 text-gray-500">Loading...</div>
              ) : (
                <TaskQueueTable tasks={displayTasks} />
              )}
            </TabsContent>
            <TabsContent value="in_progress">
              {loading ? (
                <div className="text-center py-8 text-gray-500">Loading...</div>
              ) : (
                <TaskQueueTable tasks={displayTasks} />
              )}
            </TabsContent>
            <TabsContent value="completed">
              {loading ? (
                <div className="text-center py-8 text-gray-500">Loading...</div>
              ) : (
                <TaskQueueTable tasks={displayTasks} />
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  )
}
