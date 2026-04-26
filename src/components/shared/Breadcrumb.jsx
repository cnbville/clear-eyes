import { useCommandRegistry } from '../../hooks/useCommandRegistry.js'

function Breadcrumb({ floating = false, topClassName = '' }) {
  const { breadcrumbSegments } = useCommandRegistry()

  if (!breadcrumbSegments?.length) {
    return null
  }

  if (floating) {
    return (
      <div className={`fixed inset-x-0 z-20 ${topClassName}`}>
        <div className="mx-auto w-full max-w-[1500px] px-4 sm:px-6 lg:px-8">
          <div className="inline-flex rounded-full border border-[var(--border)] bg-[rgba(9,9,11,0.78)] px-3 py-1.5 backdrop-blur-lg">
            <p className="text-[0.72rem] tracking-[0.06em] text-[var(--muted-2)]">
              {breadcrumbSegments.join(' / ')}
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="sticky top-0 z-20 mb-4 border-b border-transparent bg-[linear-gradient(180deg,rgba(18,18,20,0.92),rgba(18,18,20,0.6),transparent)] py-1">
      <p className="text-[0.72rem] tracking-[0.06em] text-[var(--muted-2)]">
        {breadcrumbSegments.join(' / ')}
      </p>
    </div>
  )
}

export default Breadcrumb
