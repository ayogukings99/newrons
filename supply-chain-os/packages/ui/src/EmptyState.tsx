interface EmptyStateProps { message: string; icon?: string }
export function EmptyState({ message, icon = '—' }: EmptyStateProps) {
  return (
    <div className="px-4 py-10 text-center">
      <div className="text-3xl mb-3 text-gray-700">{icon}</div>
      <p className="text-gray-600 text-sm">{message}</p>
    </div>
  )
}
