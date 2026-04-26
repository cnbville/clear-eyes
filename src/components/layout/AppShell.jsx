function AppShell({
  children,
  sidebar = null,
  mobileNav = null,
  showChrome = true,
  headerSlot = null,
}) {
  return (
    <div className="min-h-screen overflow-x-hidden bg-[#060606] font-sans text-zinc-50">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_top_left,rgba(201,162,39,0.12),transparent_28%),radial-gradient(circle_at_top_right,rgba(255,255,255,0.03),transparent_22%),linear-gradient(180deg,#09090b_0%,#060606_42%,#050505_100%)]" />
      <div className="pointer-events-none fixed inset-0 opacity-40 [background-image:linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] [background-size:140px_140px]" />

      <div className="relative mx-auto w-full max-w-[1600px] px-0 pb-[calc(env(safe-area-inset-bottom)+6.5rem)] pt-0 sm:px-4 sm:pt-3 lg:px-8 lg:pb-24 lg:pt-6">
        {showChrome ? (
          <div className="lg:grid lg:grid-cols-[290px_minmax(0,1fr)] lg:gap-6">
            <div className="hidden lg:block">{sidebar}</div>

            <main className="min-h-screen px-4 pb-6 pt-[max(1rem,env(safe-area-inset-top))] sm:px-5 lg:min-h-[calc(100vh-3rem)] lg:rounded-[32px] lg:border lg:border-white/[0.06] lg:bg-[linear-gradient(180deg,rgba(18,18,20,0.94),rgba(10,10,11,0.92))] lg:px-6 lg:py-6 lg:shadow-[0_40px_120px_rgba(0,0,0,0.48)] lg:backdrop-blur-xl">
              <div className="hidden lg:block">{headerSlot}</div>
              {children}
            </main>
          </div>
        ) : (
          <main>
            {headerSlot}
            {children}
          </main>
        )}

        {showChrome ? <div className="lg:hidden">{mobileNav}</div> : null}
      </div>
    </div>
  )
}

export default AppShell
