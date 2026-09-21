import { ArrowRight, Waypoints } from 'lucide-react'

export default function CanonicalWorkspaceNotice({
  eyebrow = 'Single source of truth',
  title,
  description,
  actionLabel,
  onAction,
  children,
}) {
  return (
    <section className="rounded-2xl border border-primary-500/25 bg-gradient-to-br from-primary-500/10 via-dark-800 to-dark-800 p-4 md:p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-primary-500/25 bg-primary-500/10">
            <Waypoints className="h-5 w-5 text-primary-400" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary-400">{eyebrow}</p>
            <h2 className="mt-1 text-base font-bold text-slate-100">{title}</h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-400">{description}</p>
          </div>
        </div>
        {onAction && actionLabel && (
          <button type="button" onClick={onAction} className="btn-primary shrink-0 justify-center text-sm">
            {actionLabel}
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>
      {children && <div className="mt-4 border-t border-dark-600/70 pt-4">{children}</div>}
    </section>
  )
}
