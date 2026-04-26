import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

const { Client } = pg
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '..')
const defaultEnvPath = path.join(projectRoot, '.env.db.local')

function normalizeEnvValue(value) {
  const trimmedValue = value.trim()

  if (
    (trimmedValue.startsWith('"') && trimmedValue.endsWith('"')) ||
    (trimmedValue.startsWith("'") && trimmedValue.endsWith("'"))
  ) {
    return trimmedValue.slice(1, -1)
  }

  return trimmedValue
}

async function loadEnvFile(envPath) {
  try {
    const fileContents = await fs.readFile(envPath, 'utf8')

    fileContents.split(/\r?\n/).forEach((line) => {
      const trimmedLine = line.trim()

      if (!trimmedLine || trimmedLine.startsWith('#')) {
        return
      }

      const separatorIndex = trimmedLine.indexOf('=')

      if (separatorIndex === -1) {
        return
      }

      const key = trimmedLine.slice(0, separatorIndex).trim()
      const value = trimmedLine.slice(separatorIndex + 1)

      if (!process.env[key]) {
        process.env[key] = normalizeEnvValue(value)
      }
    })
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      throw error
    }
  }
}

function getSslConfig(databaseUrl) {
  if (
    databaseUrl.includes('localhost') ||
    databaseUrl.includes('127.0.0.1') ||
    databaseUrl.includes('sslmode=disable')
  ) {
    return false
  }

  return {
    rejectUnauthorized: false,
  }
}

function estimateOneRepMax(weight, reps) {
  const normalizedWeight = Number(weight) || 0
  const normalizedReps = Number(reps) || 0

  if (normalizedWeight <= 0 || normalizedReps <= 0) {
    return 0
  }

  if (normalizedReps === 1) {
    return Math.round(normalizedWeight * 10) / 10
  }

  if (normalizedReps <= 10) {
    return Math.round(normalizedWeight * (36 / (37 - normalizedReps)) * 10) / 10
  }

  return Math.round(normalizedWeight * (1 + normalizedReps / 30) * 10) / 10
}

function buildRepMaxType(reps) {
  return `rep_max_${reps}`
}

function buildRecordsFromSets(loggedSets = []) {
  const recordMap = new Map()

  loggedSets.forEach((set) => {
    if ((set?.set_type ?? 'working') !== 'working') {
      return
    }

    const exerciseId = set.exercise_id
    const weight = Number(set.weight) || 0
    const reps = Number(set.reps) || 0
    const sessionId = set.session_id
    const achievedAt = set.achieved_at

    if (!exerciseId || weight <= 0 || reps <= 0) {
      return
    }

    const keys = [
      {
        prType: 'heaviest_weight',
        value: weight,
        weight,
        reps,
      },
      {
        prType: 'estimated_1rm',
        value: estimateOneRepMax(weight, reps),
        weight,
        reps,
      },
      {
        prType: buildRepMaxType(reps),
        value: weight,
        weight,
        reps,
      },
    ]

    keys.forEach((entry) => {
      const mapKey = `${exerciseId}:${entry.prType}`
      const current = recordMap.get(mapKey)

      if (!current || entry.value > current.value) {
        recordMap.set(mapKey, {
          exercise_id: exerciseId,
          pr_type: entry.prType,
          value: entry.value,
          weight: entry.weight,
          reps: entry.reps,
          session_id: sessionId,
          achieved_at: achievedAt,
        })
      }
    })
  })

  const sessionVolumeMap = new Map()

  loggedSets.forEach((set) => {
    if ((set?.set_type ?? 'working') !== 'working') {
      return
    }

    const exerciseId = set.exercise_id
    const sessionId = set.session_id
    const achievedAt = set.achieved_at
    const volume = (Number(set.weight) || 0) * (Number(set.reps) || 0)

    if (!exerciseId || !sessionId || volume <= 0) {
      return
    }

    const key = `${exerciseId}:${sessionId}`
    const current = sessionVolumeMap.get(key) ?? {
      exercise_id: exerciseId,
      session_id: sessionId,
      achieved_at: achievedAt,
      value: 0,
    }

    current.value += volume
    sessionVolumeMap.set(key, current)
  })

  Array.from(sessionVolumeMap.values()).forEach((entry) => {
    const mapKey = `${entry.exercise_id}:session_volume`
    const current = recordMap.get(mapKey)

    if (!current || entry.value > current.value) {
      recordMap.set(mapKey, {
        exercise_id: entry.exercise_id,
        pr_type: 'session_volume',
        value: Math.round(entry.value * 10) / 10,
        weight: null,
        reps: null,
        session_id: entry.session_id,
        achieved_at: entry.achieved_at,
      })
    }
  })

  return Array.from(recordMap.values())
}

async function main() {
  await loadEnvFile(defaultEnvPath)

  const databaseUrl = process.env.DATABASE_URL

  if (!databaseUrl) {
    throw new Error(
      'DATABASE_URL is missing. Add it to .env.db.local or export it in your shell.',
    )
  }

  const client = new Client({
    connectionString: databaseUrl,
    ssl: getSslConfig(databaseUrl),
  })

  await client.connect()

  try {
    const { rows } = await client.query(`
      select
        ls.session_id,
        ls.exercise_id,
        ls.set_type,
        ls.weight,
        ls.reps,
        coalesce(ws.completed_at::date, ws.date) as achieved_at
      from logged_sets ls
      join workout_sessions ws on ws.id = ls.session_id
      where ws.status = 'completed'
      order by coalesce(ws.completed_at, ws.created_at) asc, ls.logged_at asc
    `)

    const records = buildRecordsFromSets(rows)

    await client.query('begin')
    await client.query('delete from personal_records')

    for (const record of records) {
      await client.query(
        `
          insert into personal_records (
            exercise_id,
            pr_type,
            value,
            weight,
            reps,
            session_id,
            achieved_at
          )
          values ($1, $2, $3, $4, $5, $6, $7)
        `,
        [
          record.exercise_id,
          record.pr_type,
          record.value,
          record.weight,
          record.reps,
          record.session_id,
          record.achieved_at,
        ],
      )
    }

    await client.query('commit')
    console.log(`Rebuilt ${records.length} personal record rows.`)
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    await client.end()
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
