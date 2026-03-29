import React, { useState, useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { MapPin, Navigation, Truck, Plus } from 'lucide-react'

// ─── Types ───────────────────────────────────────────────────────────────────

interface RouteStop {
  stop_id: string
  sequence: number
  lat: number
  lng: number
  status: string
  notes?: string
  recorded_at?: number
}

interface Route {
  id: string
  driver_did?: string
  status: string
  total_stops: number
  completed_stops: number
  created_at: number
  completed_at?: number
}

interface OptimizedStop {
  stop_id: string
  sequence: number
  lat: number
  lng: number
  demand: number
  cumulative_distance_km: number
  eta_minutes: number
}

interface RouteMetrics {
  total_distance_km: number
  estimated_hours: number
  avg_stop_time_min: number
}

// ─── Status Color Mapping ────────────────────────────────────────────────────

function getRouteStatusColor(status: string): string {
  switch (status.toUpperCase()) {
    case 'PLANNED':
      return 'bg-gray-600 text-gray-100'
    case 'ACTIVE':
      return 'bg-blue-600 text-white'
    case 'COMPLETED':
      return 'bg-emerald-600 text-white'
    default:
      return 'bg-gray-700 text-gray-100'
  }
}

function getStopStatusColor(status: string): string {
  switch (status.toUpperCase()) {
    case 'COMPLETED':
      return 'bg-emerald-500'
    case 'IN_PROGRESS':
      return 'bg-blue-500'
    default:
      return 'bg-gray-500'
  }
}

// ─── Route List ──────────────────────────────────────────────────────────────

function RouteListView({ routes }: { routes: Route[] }) {
  return (
    <div className="rounded-lg border border-gray-700 overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-gray-800 border-b border-gray-700">
          <tr>
            <th className="px-4 py-3 text-left font-semibold text-gray-300">Route ID</th>
            <th className="px-4 py-3 text-left font-semibold text-gray-300">Driver</th>
            <th className="px-4 py-3 text-left font-semibold text-gray-300">Status</th>
            <th className="px-4 py-3 text-left font-semibold text-gray-300">Progress</th>
            <th className="px-4 py-3 text-left font-semibold text-gray-300">Stops</th>
          </tr>
        </thead>
        <tbody>
          {routes.length === 0 ? (
            <tr>
              <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                No routes yet
              </td>
            </tr>
          ) : (
            routes.map((route) => {
              const progress = route.total_stops > 0
                ? (route.completed_stops / route.total_stops) * 100
                : 0
              return (
                <tr
                  key={route.id}
                  className="border-t border-gray-700 hover:bg-gray-800/50 transition"
                >
                  <td className="px-4 py-3 text-gray-300 font-mono">{route.id}</td>
                  <td className="px-4 py-3 text-gray-400 text-xs">
                    {route.driver_did || '—'}
                  </td>
                  <td className="px-4 py-3">
                    <Badge className={getRouteStatusColor(route.status)}>
                      {route.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 flex-1 pr-4">
                    <div className="flex items-center gap-2">
                      <Progress value={progress} className="h-1.5" />
                      <span className="text-xs text-gray-500 w-10">
                        {Math.round(progress)}%
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-300 text-xs">
                    {route.completed_stops}/{route.total_stops}
                  </td>
                </tr>
              )
            })
          )}
        </tbody>
      </table>
    </div>
  )
}

// ─── Route Detail View ───────────────────────────────────────────────────────

function RouteDetailView({
  route,
  stops,
  metrics
}: {
  route: Route
  stops: OptimizedStop[]
  metrics: RouteMetrics
}) {
  return (
    <div className="space-y-4">
      {/* Metrics Cards */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="bg-gray-800 border-gray-700">
          <CardContent className="pt-4">
            <div className="text-xs text-gray-400 mb-1">Total Distance</div>
            <div className="text-lg font-bold text-teal-400">
              {metrics.total_distance_km.toFixed(1)} km
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gray-800 border-gray-700">
          <CardContent className="pt-4">
            <div className="text-xs text-gray-400 mb-1">Est. Time</div>
            <div className="text-lg font-bold text-blue-400">
              {metrics.estimated_hours.toFixed(1)}h
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gray-800 border-gray-700">
          <CardContent className="pt-4">
            <div className="text-xs text-gray-400 mb-1">Avg Stop Time</div>
            <div className="text-lg font-bold text-amber-400">
              {metrics.avg_stop_time_min.toFixed(0)}m
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Ordered Stop List */}
      <Card className="bg-gray-800 border-gray-700">
        <CardHeader>
          <CardTitle className="text-sm text-gray-100">Optimized Sequence</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {stops.length === 0 ? (
              <div className="text-center py-4 text-gray-500 text-sm">
                No stops in route
              </div>
            ) : (
              stops.map((stop, idx) => (
                <div
                  key={`${stop.stop_id}-${idx}`}
                  className="flex items-center gap-3 p-3 bg-gray-700/30 rounded-lg"
                >
                  <div className="flex items-center justify-center w-7 h-7 rounded-full font-semibold text-xs
                                bg-gray-700 text-gray-300">
                    {stop.sequence + 1}
                  </div>
                  <div className={`w-2.5 h-2.5 rounded-full ${getStopStatusColor(stop.status === 'COMPLETED' ? 'COMPLETED' : 'PENDING')}`} />
                  <div className="flex-1">
                    <div className="text-sm font-mono text-gray-200">
                      {stop.stop_id}
                    </div>
                    <div className="text-xs text-gray-500">
                      Coords: {stop.lat.toFixed(4)}, {stop.lng.toFixed(4)}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs font-semibold text-teal-400">
                      {stop.cumulative_distance_km.toFixed(1)} km
                    </div>
                    <div className="text-xs text-gray-500">
                      ETA {stop.eta_minutes}m
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// ─── New Route Dialog ────────────────────────────────────────────────────────

function NewRouteDialog() {
  const [stops, setStops] = useState<string>('')
  const [loading, setLoading] = useState(false)

  const handleCreateRoute = async () => {
    setLoading(true)
    try {
      // Parse stops from input (simplified format)
      // TODO: implement full create_route flow
      console.log('Creating route with stops:', stops)
      setStops('')
    } catch (err) {
      console.error('Failed to create route:', err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button className="bg-teal-700 hover:bg-teal-600 text-white">
          <Plus className="w-4 h-4 mr-2" />
          New Route
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-gray-900 border-gray-700">
        <DialogHeader>
          <DialogTitle className="text-gray-100">Create Delivery Route</DialogTitle>
          <DialogDescription className="text-gray-400">
            Add stops and optimize route with VRP solver
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-gray-300 block mb-2">
              Stops (JSON array)
            </label>
            <textarea
              value={stops}
              onChange={(e) => setStops(e.target.value)}
              placeholder={`[{"location_id":"A","lat":0.0,"lng":0.0,"demand":5}]`}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-gray-100
                         text-xs font-mono
                         focus:border-teal-600 focus:ring-1 focus:ring-teal-600"
              rows={4}
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
              onClick={handleCreateRoute}
              disabled={loading || !stops.trim()}
              className="bg-teal-700 hover:bg-teal-600 text-white"
            >
              {loading ? 'Creating...' : 'Create & Optimize'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function RoutesScreen() {
  const [routes, setRoutes] = useState<Route[]>([])
  const [selectedRoute, setSelectedRoute] = useState<Route | null>(null)
  const [stops, setStops] = useState<OptimizedStop[]>([])
  const [metrics, setMetrics] = useState<RouteMetrics>({
    total_distance_km: 0,
    estimated_hours: 0,
    avg_stop_time_min: 0,
  })
  const [loading, setLoading] = useState(true)

  const loadRoutes = async () => {
    try {
      const routeList = await invoke<Route[]>('list_routes', {})
      setRoutes(routeList)
    } catch (err) {
      console.error('Failed to load routes:', err)
    }
  }

  const loadRouteDetail = async (routeId: string) => {
    try {
      const detail = await invoke<any>('get_route_detail', { route_id: routeId })
      setSelectedRoute(detail.route)
      setStops(detail.stops)
      setMetrics({
        total_distance_km: detail.metrics.total_distance_km,
        estimated_hours: detail.metrics.estimated_hours,
        avg_stop_time_min: detail.metrics.avg_stop_time_min,
      })
    } catch (err) {
      console.error('Failed to load route detail:', err)
    }
  }

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      await loadRoutes()
      setLoading(false)
    }
    load()
  }, [])

  return (
    <div className="p-6 space-y-6 bg-gray-900 min-h-screen">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <Truck className="w-6 h-6 text-teal-400" />
          <h1 className="text-2xl font-semibold text-gray-100">Logistics & Routes</h1>
        </div>
        <p className="text-sm text-gray-500">Route optimization, delivery tracking, proof of delivery</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-gray-800 border-gray-700">
          <CardContent className="pt-6">
            <div className="text-xs text-gray-400 mb-1">Active Routes</div>
            <div className="text-2xl font-bold text-teal-400">
              {routes.filter((r) => r.status === 'ACTIVE').length}
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gray-800 border-gray-700">
          <CardContent className="pt-6">
            <div className="text-xs text-gray-400 mb-1">Completed Today</div>
            <div className="text-2xl font-bold text-emerald-400">
              {routes.filter((r) => r.status === 'COMPLETED').length}
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gray-800 border-gray-700">
          <CardContent className="pt-6">
            <div className="text-xs text-gray-400 mb-1">Total Stops</div>
            <div className="text-2xl font-bold text-blue-400">
              {routes.reduce((sum, r) => sum + r.total_stops, 0)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Route List / Detail */}
      {selectedRoute === null ? (
        <Card className="bg-gray-800 border-gray-700">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-gray-100 flex items-center gap-2">
                <Navigation className="w-5 h-5 text-teal-400" />
                Routes
              </CardTitle>
              <CardDescription className="text-gray-500">
                All delivery routes with real-time tracking
              </CardDescription>
            </div>
            <NewRouteDialog />
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-8 text-gray-500">Loading routes...</div>
            ) : (
              <RouteListView routes={routes} />
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          <Button
            variant="outline"
            onClick={() => setSelectedRoute(null)}
            className="border-gray-700 text-gray-300 hover:bg-gray-800"
          >
            ← Back to Routes
          </Button>
          <Card className="bg-gray-800 border-gray-700">
            <CardHeader>
              <CardTitle className="text-gray-100">
                <MapPin className="w-5 h-5 inline mr-2 text-teal-400" />
                Route {selectedRoute.id}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <RouteDetailView route={selectedRoute} stops={stops} metrics={metrics} />
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
