import clsx from 'clsx'

interface OnChainBadgeProps {
  anchored?: boolean
  className?: string
}

/// The ● on-chain badge — appears on any event that has been anchored
/// to the DHT (dual-signed cross-node events like PO_CONFIRMED,
/// DELIVERY_CONFIRMED, PEER_CONNECTED).
///
/// Design spec: SUPPLY-CHAIN-DESIGN.md §Cross-cutting UX Patterns
export function OnChainBadge({ anchored = true, className }: OnChainBadgeProps) {
  if (!anchored) return null
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold',
        'bg-teal-900/60 text-teal-300 border border-teal-800/50',
        className
      )}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-teal-400 inline-block" />
      on-chain
    </span>
  )
}
