function Kbd({ children, className = '' }) {
  return (
    <kbd
      className={`inline-flex min-h-[1.55rem] items-center justify-center rounded-[12px] border border-[var(--border)] bg-[rgba(6,6,8,0.72)] px-2.5 py-1 font-mono text-[0.64rem] font-semibold uppercase tracking-[0.12em] text-[var(--muted-2)] ${className}`}
    >
      {children}
    </kbd>
  )
}

export default Kbd
