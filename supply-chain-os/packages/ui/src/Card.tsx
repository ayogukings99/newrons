import clsx from 'clsx'
interface CardProps { children: React.ReactNode; className?: string; title?: string }
export function Card({ children, className, title }: CardProps) {
  return (
    <div className={clsx('bg-gray-900 rounded-lg border border-gray-800', className)}>
      {title && <div className="px-4 py-3 border-b border-gray-800 text-xs font-semibold text-gray-400 uppercase tracking-widest">{title}</div>}
      {children}
    </div>
  )
}
