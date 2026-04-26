import { useCallback, useState } from 'react'

export function useRestTimer() {
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [prescribedSeconds, setPrescribedSeconds] = useState(0)
  const [isRunning, setIsRunning] = useState(false)
  const [timerStartedAt, setTimerStartedAt] = useState(null)

  const getSeconds = useCallback(() => {
    if (!isRunning || !timerStartedAt) {
      return elapsedSeconds
    }

    return Math.max(Math.floor((Date.now() - timerStartedAt) / 1000), 0)
  }, [elapsedSeconds, isRunning, timerStartedAt])

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
      setIsRunning(true)
    },
    [],
  )

  const start = useCallback((nextPrescribedSeconds = 0) => {
    resume(nextPrescribedSeconds, 0)
  }, [resume])

  const setTarget = useCallback((nextPrescribedSeconds = 0) => {
    const normalizedPrescribedSeconds = Math.max(Number(nextPrescribedSeconds) || 0, 0)
    setPrescribedSeconds(normalizedPrescribedSeconds)
  }, [])

  const adjustTarget = useCallback((deltaSeconds = 0) => {
    setPrescribedSeconds((currentSeconds) => {
      const nextSeconds = Math.max(currentSeconds + (Number(deltaSeconds) || 0), 0)
      return nextSeconds
    })
  }, [])

  const stop = useCallback(() => {
    setElapsedSeconds(getSeconds())
    setIsRunning(false)
  }, [getSeconds])

  const reset = useCallback(() => {
    setElapsedSeconds(0)
    setPrescribedSeconds(0)
    setIsRunning(false)
    setTimerStartedAt(null)
  }, [])

  const overrunSeconds =
    prescribedSeconds > 0 ? Math.max(getSeconds() - prescribedSeconds, 0) : 0

  return {
    seconds: getSeconds(),
    getSeconds,
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
