import { getExercises } from '../services/exerciseService.js'

function normalizeName(value) {
  return `${value ?? ''}`
    .toLowerCase()
    .replace(/\((.*?)\)/g, ' $1 ')
    .replace(/\bdb\b/g, 'dumbbell')
    .replace(/\bez\b/g, 'ez')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function tokenize(value) {
  return normalizeName(value)
    .split(/\s+/)
    .filter(Boolean)
}

function scoreMatch(sourceName, targetName) {
  const sourceTokens = tokenize(sourceName)
  const targetTokens = tokenize(targetName)
  const sourceSet = new Set(sourceTokens)
  const targetSet = new Set(targetTokens)
  const sharedTokens = sourceTokens.filter((token) => targetSet.has(token)).length
  const unionSize = new Set([...sourceTokens, ...targetTokens]).size || 1
  const exactBonus = normalizeName(sourceName) === normalizeName(targetName) ? 1 : 0
  const containmentBonus =
    normalizeName(targetName).includes(normalizeName(sourceName)) ||
    normalizeName(sourceName).includes(normalizeName(targetName))
      ? 0.2
      : 0

  return sharedTokens / unionSize + exactBonus + containmentBonus + sourceSet.size * 0.0001
}

function collectProgramExerciseNames(program) {
  return Array.from(
    new Set(
      (program?.phases ?? []).flatMap((phase) =>
        (phase.days ?? []).flatMap((day) =>
          (day.exercises ?? [])
            .map((exercise) => exercise?.name)
            .filter(Boolean),
        ),
      ),
    ),
  )
}

export function findBestExerciseMatch(programExerciseName, exercises = []) {
  return exercises
    .map((exercise) => ({
      exercise,
      score: scoreMatch(programExerciseName, exercise.name),
    }))
    .sort((left, right) => right.score - left.score)[0] ?? null
}

export async function mapProgramExercises(program) {
  const exerciseNames = collectProgramExerciseNames(program)
  const exercises = await getExercises()

  return exerciseNames.reduce((mapping, exerciseName) => {
    const bestMatch = findBestExerciseMatch(exerciseName, exercises)

    mapping[exerciseName] = bestMatch?.score >= 0.5 ? bestMatch.exercise.id : null
    return mapping
  }, {})
}

export default {
  mapProgramExercises,
  findBestExerciseMatch,
}
