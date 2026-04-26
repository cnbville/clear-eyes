import { useEffect, useRef, useState } from 'react'
import { getStoredPreferences } from '../../lib/preferences.js'

function formatSeconds(totalSeconds) {
  const normalizedSeconds = Math.max(Number(totalSeconds) || 0, 0)
  const minutes = Math.floor(normalizedSeconds / 60)
  const seconds = normalizedSeconds % 60

  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

function vibrateOnComplete() {
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    navigator.vibrate([120, 60, 160])
  }
}

function getTimerTone(elapsed, prescribedSeconds) {
  if (!prescribedSeconds || prescribedSeconds <= 0) {
    return {
      textClassName: 'text-zinc-100',
      barClassName: 'bg-zinc-100',
    }
  }

  const completionRatio = elapsed / prescribedSeconds

  if (completionRatio >= 1.5) {
    return {
      textClassName: 'text-coral',
      barClassName: 'bg-coral',
    }
  }

  if (completionRatio >= 1) {
    return {
      textClassName: 'text-amber-400',
      barClassName: 'bg-amber-400',
    }
  }

  return {
    textClassName: 'text-zinc-100',
    barClassName: 'bg-zinc-100',
  }
}

function RestTimer({
  label = 'Rest',
  prescribedSeconds = 0,
  baselineSeconds = 0,
  targetSource = 'program',
  rationale = '',
  isRunning = false,
  elapsed = 0,
  timerStartedAt = null,
  phaseColor = '#c9a227',
  onSkip,
  onAdjust,
}) {
  const tickIntervalMs = getStoredPreferences().lowMemoryMode === false ? 1000 : 5000
  const [now, setNow] = useState(() => Date.now())
  const hasVibratedRef = useRef(false)
  const displayElapsed =
    isRunning && timerStartedAt
      ? Math.max(Math.floor((now - timerStartedAt) / 1000), 0)
      : Math.max(Number(elapsed) || 0, 0)
  const overrun = prescribedSeconds > 0 ? Math.max(displayElapsed - prescribedSeconds, 0) : 0
  const tone = getTimerTone(displayElapsed, prescribedSeconds)
  const resolvedBaselineSeconds = baselineSeconds || prescribedSeconds
  const progressPercentage = prescribedSeconds
    ? Math.min((displayElapsed / prescribedSeconds) * 100, 100)
    : 0

  useEffect(() => {
    if (!isRunning) {
      return undefined
    }

    const intervalId = window.setInterval(() => {
      setNow(Date.now())
    }, tickIntervalMs)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [isRunning, tickIntervalMs])

  useEffect(() => {
    if (!isRunning || prescribedSeconds <= 0 || displayElapsed < prescribedSeconds) {
      return
    }

    if (!hasVibratedRef.current) {
      hasVibratedRef.current = true
      vibrateOnComplete()
    }
  }, [displayElapsed, isRunning, prescribedSeconds])

  useEffect(() => {
    hasVibratedRef.current = false
  }, [prescribedSeconds, timerStartedAt])

  return (
    <section
      className="mt-3 rounded-2xl border border-white/[0.04] bg-iron-800 p-4"
      style={isRunning ? { boxShadow: `inset 0 0 0 1px ${phaseColor}12` } : undefined}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-zinc-500">
            {label}
          </p>
          {resolvedBaselineSeconds ? (
            <p className="mt-1 text-[12px] text-zinc-500">
              Base {formatSeconds(resolvedBaselineSeconds)}
              {targetSource?.startsWith('smart') ? ' · adjusted live' : ''}
            </p>
          ) : null}
        </div>

        {onAdjust ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="rounded-full border border-white/[0.06] bg-iron-900 px-2.5 py-1 text-[11px] text-zinc-400 transition hover:border-gold/30 hover:text-zinc-100"
              onClick={() => onAdjust?.(-15)}
            >
              -15s
            </button>
            <button
              type="button"
              className="rounded-full border border-white/[0.06] bg-iron-900 px-2.5 py-1 text-[11px] text-zinc-400 transition hover:border-gold/30 hover:text-zinc-100"
              onClick={() => onAdjust?.(15)}
            >
              +15s
            </button>
          </div>
        ) : null}
      </div>

      <div className="mt-3 flex items-end justify-between gap-4">
        <p className={`font-mono text-[32px] font-bold ${tone.textClassName}`}>
          {formatSeconds(displayElapsed)}
        </p>
        <p className="font-mono text-[13px] text-zinc-500">
          / {formatSeconds(prescribedSeconds)}
        </p>
      </div>

      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-iron-900">
        <div
          className={`h-full rounded-full transition-all duration-500 ${tone.barClassName}`}
          style={{ width: `${progressPercentage}%` }}
        />
      </div>

      {overrun > 0 ? (
        <p className="mt-2 text-[12px] text-coral">+{overrun}s over</p>
      ) : null}

      {rationale ? <p className="mt-2 text-[12px] leading-5 text-zinc-500">{rationale}</p> : null}

      <button
        type="button"
        className="mt-3 block w-full text-center text-[13px] text-zinc-600 transition hover:text-zinc-300"
        onClick={onSkip}
      >
        Skip rest →
      </button>
    </section>
  )
}

export default RestTimer
