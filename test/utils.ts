import db, { sqlFile } from '../src/db'

export async function resetDb(): Promise<void> {
  await db.any(`
    drop schema public cascade;
    create schema public;
  `)

  await db.none(sqlFile('tables.sql'))
}
