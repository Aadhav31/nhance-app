import { cn } from '../../lib/utils'

export default function EmptyState({ icon: Icon, title, description, action, className }) {
  return (
    <div className={cn('flex flex-col items-center justify-center py-16 text-center', className)}>
      {Icon && (
        <div className="w-14 h-14 rounded-2xl bg-dark-700 flex items-center justify-center mb-4">
          <Icon className="w-7 h-7 text-slate-500" />
        </div>
      )}
      <h3 className="text-sm font-semibold text-slate-300 mb-1">{title}</h3>
      {description && (
        <p className="text-xs text-slate-500 max-w-xs mb-4">{description}</p>
      )}
      {action}
    </div>
  )
}
