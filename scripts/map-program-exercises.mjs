import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

const { Client } = pg
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '..')
const envPath = path.join(projectRoot, '.env.db.local')

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

async function loadEnvFile() {
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

async function main() {
  await loadEnvFile()

  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is missing. Add it to .env.db.local or export it in your shell.')
  }

  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: getSslConfig(process.env.DATABASE_URL),
  })

  await client.connect()

  try {
    const { rowCount } = await client.query(`
      update logged_sets
      set exercise_id = prescribed_exercises.exercise_id
      from prescribed_exercises
      where logged_sets.prescribed_exercise_id = prescribed_exercises.id
        and logged_sets.exercise_id is null
        and prescribed_exercises.exercise_id is not null;
    `)

    const { rows: unresolvedRows } = await client.query(`
      select
        logged_sets.id,
        logged_sets.session_id,
        logged_sets.prescribed_exercise_id
      from logged_sets
      where logged_sets.exercise_id is null
      order by logged_sets.logged_at desc nulls last
      limit 25;
    `)

    console.log(`Backfilled ${rowCount} logged set rows from prescribed exercise mappings.`)

    if (unresolvedRows.length) {
      console.log('Rows still missing exercise_id (manual review needed):')
      unresolvedRows.forEach((row) => {
        console.log(`- logged_sets.id=${row.id} session=${row.session_id} prescribed=${row.prescribed_exercise_id}`)
      })
    } else {
      console.log('No unresolved logged_set exercise mappings remain.')
    }
  } finally {
    await client.end()
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
