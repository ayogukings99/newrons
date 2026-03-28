import clsx from 'clsx'
import type { ChainEvent } from '@scos/shared-types'
import { OnChainBadge } from './OnChainBadge'

interface ChainEventRowProps {
  event: ChainEvent
  isHead?: boolean
}

const CROSS_NODE_EVENTS = new Set([
  'PO_ISSUED', 'PO_CONFIRMED', 'SHIPMENT_SENT', 'SHIPMENT_RECEIVED',
  'DELIVERY_CONFIRMED', 'NCR_RAISED', 'NCR_RESOLVED', 'PEER_CONNECTED',
])

/// A single row in the Chain Event Log Inspector.
///
/// Shows: event type, timestamp, shortened event ID, and on-chain badge
/// for events that are DHT-anchored.
export function ChainEventRow({ event, isHead = false }: ChainEventRowProps) {
  const isOnChain = Boolean(event.dht_anchor) || CROSS_NODE_EVENTS.has(event.event_type)
  const ts = new Date(event.timestamp).toLocaleTimeString()

  return (
    <div
      className={clsx(
        'flex items-center gap-3 px-4 py-3 text-xs font-mono',
        'hover:bg-gray-800/40 transition-colors',
        isHead && 'border-l-2 border-teal-500'
      )}
    >
      {/* Sequence dot */}
      <span className={clsx('w-1.5 h-1.5 rounded-full flex-shrink-0', isOnChain ? 'bg-teal-400' : 'bg-gray-600')} />

      {/* Event type */}
      <span className="text-gray-200 flex-1 min-w-0 truncate">{event.event_type}</span>

      {/* On-chain badge */}
      {isOnChain && <OnChainBadge />}

      {/* Timestamp */}
      <span className="text-gray-600 flex-shrink-0">{ts}</span>

      {/* Short ID */}
      <span className="text-gray-700 flex-shrink-0">{event.id.slice(0, 8)}</span>
    </div>
  )
}
