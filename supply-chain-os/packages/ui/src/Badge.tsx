import clsx from 'clsx'
type BadgeVariant = 'default' | 'success' | 'warning' | 'danger' | 'info'
interface BadgeProps { children: React.ReactNode; variant?: BadgeVariant; className?: string }
const variants: Record<BadgeVariant, string> = {
  default: 'bg-gray-800 text-gray-400',
  success: 'bg-teal-900/60 text-teal-300',
  warning: 'bg-yellow-900/60 text-yellow-300',
  danger:  'bg-red-900/60 text-red-300',
  info:    'bg-blue-900/60 text-blue-300',
}
export function Badge({ children, variant = 'default', className }: BadgeProps) {
  return <span className={clsx('px-2 py-0.5 rounded text-xs font-semibold', variants[variant], className)}>{children}</span>
}
