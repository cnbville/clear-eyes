import { getGlossaryEntry } from '../../lib/glossary.js'

function GlossaryTerm({
  term,
  children = null,
  className = '',
  tooltipAlign = 'left',
  indicatorClassName = '',
}) {
  const entry = getGlossaryEntry(term)

  if (!entry) {
    return children ? <span className={className}>{children}</span> : null
  }

  const tooltipPositionClassName =
    tooltipAlign === 'right'
      ? 'right-0'
      : tooltipAlign === 'center'
        ? 'left-1/2 -translate-x-1/2'
        : 'left-0'

  return (
    <span className={`group relative inline-flex items-center gap-1 align-middle ${className}`}>
      <span>{children ?? entry.label}</span>

      <span
        tabIndex={0}
        className={`inline-flex h-4 min-w-4 items-center justify-center rounded-full border border-white/[0.08] bg-iron-900/80 px-1 text-[9px] font-bold uppercase tracking-[0.08em] text-zinc-500 transition group-hover:border-gold/30 group-hover:text-gold group-focus-within:border-gold/30 group-focus-within:text-gold ${indicatorClassName}`}
        aria-label={`${entry.label}: ${entry.short}`}
      >
        i
      </span>

      <span
        role="tooltip"
        className={`pointer-events-none absolute top-full z-[60] mt-2 w-[280px] rounded-2xl border border-white/[0.08] bg-[linear-gradient(180deg,rgba(20,20,22,0.98),rgba(10,10,11,0.96))] p-3 text-left normal-case opacity-0 shadow-[0_20px_50px_rgba(0,0,0,0.45)] transition duration-200 group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:translate-y-0 group-focus-within:opacity-100 ${tooltipPositionClassName} translate-y-2`}
      >
        <span className="flex items-start justify-between gap-3">
          <span className="block text-[10px] font-semibold uppercase tracking-[0.18em] text-gold">
            {entry.label}
          </span>
          <span className="rounded-full border border-white/[0.06] bg-iron-900/80 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
            {entry.category}
          </span>
        </span>

        <span className="mt-2 block text-[12px] font-medium leading-5 text-zinc-200">
          {entry.short}
        </span>

        {entry.detail ? (
          <span className="mt-2 block text-[12px] leading-5 text-zinc-500">{entry.detail}</span>
        ) : null}

        {entry.aliases?.length ? (
          <span className="mt-3 block text-[11px] leading-5 text-zinc-500">
            Also known as: <span className="text-zinc-400">{entry.aliases.join(', ')}</span>
          </span>
        ) : null}

        {entry.sourceSection ? (
          <span className="mt-2 block text-[11px] leading-5 text-zinc-600">
            Source: <span className="text-zinc-500">{entry.sourceSection}</span>
          </span>
        ) : null}
      </span>
    </span>
  )
}

export default GlossaryTerm
