import clsx from 'clsx'
interface StatusPillProps { status: string; className?: string }
const map: Record<string, string> = {
  ISSUED: 'bg-blue-900/60 text-blue-300', CONFIRMED: 'bg-teal-900/60 text-teal-300',
  PENDING: 'bg-gray-800 text-gray-400', COMPLETED: 'bg-green-900/60 text-green-300',
  FAILED: 'bg-red-900/60 text-red-300', PASS: 'bg-teal-900/60 text-teal-300',
  FAIL: 'bg-red-900/60 text-red-300', TRADING: 'bg-teal-900/60 text-teal-300',
}
export function StatusPill({ status, className }: StatusPillProps) {
  return <span className={clsx('px-2 py-0.5 rounded text-xs font-semibold', map[status] ?? 'bg-gray-800 text-gray-400', className)}>{status}</span>
}
