import { useMemo, useState } from 'react'
import { BookOpenText, Search } from 'lucide-react'
import { groupGlossaryEntries } from '../lib/glossary.js'

function GlossaryPage() {
  const [query, setQuery] = useState('')

  const groups = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()

    return groupGlossaryEntries()
      .map((group) => ({
        ...group,
        entries: group.entries.filter((entry) => {
          if (!normalizedQuery) {
            return true
          }

          return [entry.label, entry.short, entry.detail, entry.category]
            .concat(entry.aliases ?? [])
            .concat(entry.relatedTerms ?? [])
            .concat(entry.sourceSection ?? [])
            .join(' ')
            .toLowerCase()
            .includes(normalizedQuery)
        }),
      }))
      .filter((group) => group.entries.length)
  }, [query])

  const resultCount = groups.reduce((sum, group) => sum + group.entries.length, 0)

  return (
    <section className="space-y-6 py-2 lg:py-1">
      <header className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.34em] text-gold">
            Glossary
          </p>
          <h1 className="mt-3 text-[34px] font-black tracking-[-0.06em] text-zinc-50 sm:text-[42px]">
            Internal language, translated.
          </h1>
          <p className="mt-3 max-w-3xl text-[14px] leading-7 text-zinc-400">
            Hover chips across the app for quick definitions, or come here for the full reference.
            This page keeps training terms clear without flattening the feel of the interface.
          </p>
        </div>

        <div className="rounded-[24px] border border-white/[0.05] bg-iron-950/70 px-4 py-4">
          <p className="text-[10px] uppercase tracking-[0.18em] text-zinc-600">Indexed Terms</p>
          <p className="mt-2 text-[24px] font-bold tracking-[-0.04em] text-zinc-50">
            {resultCount}
          </p>
        </div>
      </header>

      <section className="rounded-[28px] border border-white/[0.04] bg-[linear-gradient(180deg,rgba(20,20,22,0.94),rgba(10,10,11,0.92))] p-5">
        <div className="relative max-w-xl">
          <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-zinc-600" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search terms like phase, PR, RPE, or volume"
            className="w-full rounded-2xl border border-iron-600 bg-iron-900 py-3 pl-10 pr-4 text-[13px] text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-gold"
          />
        </div>
      </section>

      {groups.length ? (
        <div className="space-y-5">
          {groups.map((group) => (
            <section
              key={group.category}
              className="rounded-[28px] border border-white/[0.04] bg-iron-900/75 p-5"
            >
              <div className="flex items-center gap-3">
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-white/[0.05] bg-iron-950/80 text-gold">
                  <BookOpenText className="h-[18px] w-[18px]" strokeWidth={1.8} />
                </span>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-500">
                    Category
                  </p>
                  <h2 className="mt-1 text-[20px] font-semibold tracking-[-0.03em] text-zinc-100">
                    {group.category}
                  </h2>
                </div>
              </div>

              <div className="mt-5 grid gap-4 xl:grid-cols-2">
                {group.entries.map((entry) => (
                  <article
                    key={entry.id}
                    className="rounded-[24px] border border-white/[0.04] bg-iron-950/65 p-4"
                  >
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gold">
                      {entry.label}
                    </p>
                    <p className="mt-3 text-[14px] font-medium text-zinc-200">{entry.short}</p>
                    {entry.detail ? (
                      <p className="mt-3 text-[13px] leading-6 text-zinc-500">{entry.detail}</p>
                    ) : null}

                    {entry.aliases?.length ? (
                      <div className="mt-4">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-600">
                          Also Known As
                        </p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {entry.aliases.map((alias) => (
                            <span
                              key={alias}
                              className="rounded-full border border-white/[0.06] bg-iron-900 px-2.5 py-1 text-[11px] text-zinc-400"
                            >
                              {alias}
                            </span>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    {entry.relatedTerms?.length ? (
                      <div className="mt-4">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-600">
                          Related Terms
                        </p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {entry.relatedTerms.map((relatedTerm) => (
                            <span
                              key={relatedTerm}
                              className="rounded-full border border-gold/15 bg-gold/10 px-2.5 py-1 text-[11px] text-gold/85"
                            >
                              {relatedTerm}
                            </span>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    {entry.sourceSection ? (
                      <div className="mt-4 rounded-2xl border border-white/[0.04] bg-iron-900 px-3 py-2">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-600">
                          Source
                        </p>
                        <p className="mt-1 text-[12px] text-zinc-400">{entry.sourceSection}</p>
                      </div>
                    ) : null}
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <section className="rounded-[28px] border border-white/[0.04] bg-iron-900/75 p-6 text-[13px] text-zinc-500">
          No glossary terms matched that search.
        </section>
      )}
    </section>
  )
}

export default GlossaryPage
