import { ChevronRight } from 'lucide-react'
import { formatLabel, formatRelativeTime, getFocusColor } from '../../lib/customWorkouts.js'

function TemplateCard({ template, onClick, dimmed = false }) {
  const focusColor = template?.focus_color ?? getFocusColor(template?.focus)
  const usageLabel =
    Number(template?.times_used) > 0
      ? `Used ${template.times_used}x${template?.last_used_at ? ` · Last: ${formatRelativeTime(template.last_used_at)}` : ''}`
      : 'Never used'

  return (
    <button
      type="button"
      className={`flex w-full items-center justify-between gap-4 rounded-xl border border-white/[0.04] bg-iron-900 p-4 text-left transition hover:border-gold/20 hover:bg-iron-900/80 ${
        dimmed ? 'opacity-50' : ''
      }`}
      onClick={() => onClick?.(template)}
    >
      <div className="min-w-0">
        <div className="flex items-center gap-3">
          <span
            className="h-2 w-2 shrink-0 rounded-full"
            style={{ backgroundColor: focusColor }}
          />
          <p className="truncate text-[16px] font-bold text-zinc-100">{template?.name}</p>
        </div>
        <p className="mt-2 text-[12px] text-zinc-400">
          {formatLabel(template?.focus)} · {template?.total_sets ?? 0} sets · ~
          {template?.estimated_duration ?? 0} min
        </p>
        <p className="mt-1 text-[12px] italic text-zinc-500">{usageLabel}</p>
      </div>

      <ChevronRight className="h-4 w-4 shrink-0 text-zinc-500" strokeWidth={1.8} />
    </button>
  )
}

export default TemplateCard
