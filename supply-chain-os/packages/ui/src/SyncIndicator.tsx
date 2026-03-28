import clsx from 'clsx'

type SyncStatus = 'synced' | 'syncing' | 'offline'

interface SyncIndicatorProps {
  status: SyncStatus
  showLabel?: boolean
  className?: string
}

/// Node sync status indicator — always visible in the desktop top bar.
///
/// ● teal   = synced (CRDT up-to-date, P2P peers active)
/// ◌ yellow = syncing (Automerge merge in progress)
/// ✕ gray   = offline (no active P2P connections)
///
/// Design spec: SUPPLY-CHAIN-DESIGN.md §Cross-cutting UX Patterns
export function SyncIndicator({ status, showLabel = false, className }: SyncIndicatorProps) {
  const dotClass = clsx(
    'w-2 h-2 rounded-full flex-shrink-0',
    status === 'synced'  && 'bg-teal-400',
    status === 'syncing' && 'bg-yellow-400 animate-pulse',
    status === 'offline' && 'bg-gray-600'
  )
  const labels: Record<SyncStatus, string> = {
    synced:  'Synced',
    syncing: 'Syncing…',
    offline: 'Offline',
  }
  return (
    <span className={clsx('flex items-center gap-1.5', className)}>
      <span className={dotClass} />
      {showLabel && (
        <span className={clsx(
          'text-xs',
          status === 'synced'  && 'text-teal-400',
          status === 'syncing' && 'text-yellow-400',
          status === 'offline' && 'text-gray-500',
        )}>
          {labels[status]}
        </span>
      )}
    </span>
  )
}
