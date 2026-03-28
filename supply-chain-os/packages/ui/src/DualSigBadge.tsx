import clsx from 'clsx'

interface DualSigBadgeProps {
  ourSig: boolean
  theirSig: boolean
  ourLabel?: string
  theirLabel?: string
  className?: string
}

/// Visual representation of the dual-signature requirement for cross-node events.
///
/// A PO is only "confirmed" when BOTH the buyer's sig AND supplier's sig are present.
/// This badge makes that state visible in the UI.
///
/// Design spec: SUPPLY-CHAIN-DESIGN.md §Cross-cutting UX Patterns
export function DualSigBadge({
  ourSig,
  theirSig,
  ourLabel = 'You',
  theirLabel = 'Supplier',
  className,
}: DualSigBadgeProps) {
  return (
    <div className={clsx('flex items-center gap-2 text-xs font-mono', className)}>
      <SigDot signed={ourSig} label={ourLabel} />
      <span className="text-gray-700">+</span>
      <SigDot signed={theirSig} label={theirLabel} />
    </div>
  )
}

function SigDot({ signed, label }: { signed: boolean; label: string }) {
  return (
    <span
      className={clsx(
        'flex items-center gap-1 px-2 py-0.5 rounded border',
        signed
          ? 'bg-teal-900/40 text-teal-300 border-teal-800/50'
          : 'bg-gray-800/40 text-gray-500 border-gray-700/50'
      )}
    >
      <span
        className={clsx(
          'w-1.5 h-1.5 rounded-full',
          signed ? 'bg-teal-400' : 'bg-gray-600'
        )}
      />
      {signed ? '✓' : '…'} {label}
    </span>
  )
}
