import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

const { Client } = pg
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '..')
const defaultEnvPath = path.join(projectRoot, '.env.db.local')
const defaultMigrationPath = path.join(
  projectRoot,
  'supabase',
  'migrations',
  '001_initial_schema.sql',
)

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

function resolveMigrationPath() {
  const inputPath = process.argv[2]

  if (!inputPath) {
    return defaultMigrationPath
  }

  return path.isAbsolute(inputPath) ? inputPath : path.resolve(projectRoot, inputPath)
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
  await loadEnvFile(defaultEnvPath)

  const databaseUrl = process.env.DATABASE_URL

  if (!databaseUrl) {
    throw new Error(
      'DATABASE_URL is missing. Add it to .env.db.local or export it in your shell.',
    )
  }

  const migrationPath = resolveMigrationPath()
  const sql = await fs.readFile(migrationPath, 'utf8')

  if (!sql.trim()) {
    throw new Error(`Migration file is empty: ${migrationPath}`)
  }

  const client = new Client({
    connectionString: databaseUrl,
    ssl: getSslConfig(databaseUrl),
  })

  await client.connect()

  try {
    await client.query(sql)
    console.log(`Applied migration: ${path.relative(projectRoot, migrationPath)}`)
  } finally {
    await client.end()
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
