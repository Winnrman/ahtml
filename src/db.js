'use strict'

const path = require('path')
const fs = require('fs')

/**
 * Provisions a SQLite database from the <db> schema block.
 *
 * Uses sql.js (pure JS, no native binaries).
 * Persists to a .db file next to the .ahtml file.
 * Returns a `db` object injected into the <server> block.
 *
 * db API:
 *   db.query(sql, params?)   → array of row objects  (SELECT)
 *   db.run(sql, params?)     → { changes, lastInsertRowid }
 *   db.get(sql, params?)     → single row object or null
 *   db.exec(sql)             → run multiple statements (schema init)
 *   db.save()                → flush in-memory db to disk
 */

function createDb(schemaSQL, ahtmlPath, dbFilename) {
  const initSql = require('sql.js')

  const dbPath = dbFilename
    ? path.resolve(path.dirname(ahtmlPath), dbFilename)
    : path.resolve(path.dirname(ahtmlPath), path.basename(ahtmlPath, '.ahtml') + '.db')

  return initSql().then(SQL => {
    let sqlDb

    // Load existing db from disk or create fresh
    if (fs.existsSync(dbPath)) {
      const fileBuffer = fs.readFileSync(dbPath)
      sqlDb = new SQL.Database(fileBuffer)
    } else {
      sqlDb = new SQL.Database()
    }

    // Run the schema (idempotent — uses IF NOT EXISTS)
    if (schemaSQL && schemaSQL.trim()) {
      sqlDb.run(schemaSQL)
    }

    // Flush to disk
    function save() {
      const data = sqlDb.export()
      fs.writeFileSync(dbPath, Buffer.from(data))
    }

    // Save immediately after schema init
    save()

    // Build the db object exposed to <server> code
    const db = {
      // Returns array of plain objects
      query(sql, params = []) {
        const stmt = sqlDb.prepare(sql)
        stmt.bind(params)
        const rows = []
        while (stmt.step()) {
          rows.push(stmt.getAsObject())
        }
        stmt.free()
        return rows
      },

      // Returns first row or null
      get(sql, params = []) {
        const rows = db.query(sql, params)
        return rows[0] || null
      },

      // Runs INSERT/UPDATE/DELETE, auto-saves, returns meta
      run(sql, params = []) {
        sqlDb.run(sql, params)
        const changes = sqlDb.getRowsModified()
        // Get last insert rowid via a quick query
        const row = db.get('SELECT last_insert_rowid() as id')
        save()
        return {
          changes,
          lastInsertRowid: row ? row.id : null,
        }
      },

      // Run raw multi-statement SQL (for migrations etc)
      exec(sql) {
        sqlDb.run(sql)
        save()
      },

      // Explicit save (normally auto-called after run())
      save,

      // Expose the raw sql.js instance for power users
      _raw: sqlDb,
      _path: dbPath,
    }

    console.log(`[ahtml] db → ${path.basename(dbPath)}`)
    return db
  })
}

module.exports = { createDb }