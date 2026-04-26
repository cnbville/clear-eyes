import { useCallback, useEffect, useRef, useState } from 'react'

function vibrateOnComplete() {
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    navigator.vibrate([120, 60, 160])
  }
}

export function useRestTimer() {
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [prescribedSeconds, setPrescribedSeconds] = useState(0)
  const [isRunning, setIsRunning] = useState(false)
  const [timerStartedAt, setTimerStartedAt] = useState(null)
  const [nowTick, setNowTick] = useState(() => Date.now())
  const hasVibratedRef = useRef(false)

  const seconds = isRunning && timerStartedAt
    ? Math.max(Math.floor((nowTick - timerStartedAt) / 1000), 0)
    : elapsedSeconds

  useEffect(() => {
    if (!isRunning) {
      return undefined
    }

    const intervalId = window.setInterval(() => {
      setNowTick(Date.now())
    }, 1000)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [isRunning])

  useEffect(() => {
    if (
      !isRunning ||
      prescribedSeconds <= 0 ||
      hasVibratedRef.current ||
      seconds < prescribedSeconds
    ) {
      return
    }

    hasVibratedRef.current = true
    vibrateOnComplete()
  }, [isRunning, prescribedSeconds, seconds])

  const resume = useCallback(
    (nextPrescribedSeconds = 0, nextElapsedSeconds = 0, nextTimerStartedAt = null) => {
    const normalizedPrescribedSeconds = Math.max(Number(nextPrescribedSeconds) || 0, 0)
    const normalizedElapsedSeconds = Math.max(Number(nextElapsedSeconds) || 0, 0)
    const normalizedTimerStartedAt = Number(nextTimerStartedAt)
    const resolvedTimerStartedAt = Number.isFinite(normalizedTimerStartedAt)
      ? normalizedTimerStartedAt
      : Date.now() - normalizedElapsedSeconds * 1000

    setPrescribedSeconds(normalizedPrescribedSeconds)
    setElapsedSeconds(normalizedElapsedSeconds)
    setTimerStartedAt(resolvedTimerStartedAt)
    setNowTick(Date.now())
    setIsRunning(true)
    hasVibratedRef.current = normalizedElapsedSeconds >= normalizedPrescribedSeconds
    },
    [],
  )

  const start = useCallback((nextPrescribedSeconds = 0) => {
    resume(nextPrescribedSeconds, 0)
  }, [resume])

  const setTarget = useCallback((nextPrescribedSeconds = 0) => {
    const normalizedPrescribedSeconds = Math.max(Number(nextPrescribedSeconds) || 0, 0)
    setPrescribedSeconds(normalizedPrescribedSeconds)
    hasVibratedRef.current = seconds >= normalizedPrescribedSeconds
  }, [seconds])

  const adjustTarget = useCallback((deltaSeconds = 0) => {
    setPrescribedSeconds((currentSeconds) => {
      const nextSeconds = Math.max(currentSeconds + (Number(deltaSeconds) || 0), 0)
      hasVibratedRef.current = seconds >= nextSeconds
      return nextSeconds
    })
  }, [seconds])

  const stop = useCallback(() => {
    setElapsedSeconds(seconds)
    setIsRunning(false)
  }, [seconds])

  const reset = useCallback(() => {
    setElapsedSeconds(0)
    setPrescribedSeconds(0)
    setIsRunning(false)
    setTimerStartedAt(null)
    setNowTick(Date.now())
    hasVibratedRef.current = false
  }, [])

  const overrunSeconds =
    prescribedSeconds > 0 ? Math.max(seconds - prescribedSeconds, 0) : 0

  return {
    seconds,
    isRunning,
    start,
    resume,
    setTarget,
    adjustTarget,
    stop,
    reset,
    overrunSeconds,
    prescribedSeconds,
    timerStartedAt,
  }
}

export default useRestTimer
