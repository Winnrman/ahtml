'use strict'

const http = require('http')
const fs = require('fs')
const path = require('path')
const { execSync, spawn } = require('child_process')
const os = require('os')

const { parse, validate } = require('./parser')
const { findFreePort } = require('./ports')
const { prepareClient } = require('./client')
const { createDb } = require('./db')

// We run the user's <server> block as a temp file so it has full Node access.
// We inject a tiny shim at the top that wires up the raw http server to handle
// routes the user defines via a simple router API.

const SERVER_SHIM = `
'use strict';
const http = require('http');
const __routes = [];

const app = {
  get(path, handler)    { __routes.push({ method: 'GET',    path, handler }) },
  post(path, handler)   { __routes.push({ method: 'POST',   path, handler }) },
  put(path, handler)    { __routes.push({ method: 'PUT',    path, handler }) },
  delete(path, handler) { __routes.push({ method: 'DELETE', path, handler }) },
};

// db is injected below if a <db> block exists
let db = null;

// Simple res helpers (Express-compatible surface)
function buildRes(res) {
  return {
    json(data)         { res.writeHead(200, {'Content-Type':'application/json'}); res.end(JSON.stringify(data)); },
    send(text)         { res.writeHead(200, {'Content-Type':'text/plain'});       res.end(String(text)); },
    html(text)         { res.writeHead(200, {'Content-Type':'text/html'});        res.end(String(text)); },
    status(code)       { res.statusCode = code; return this; },
    set(k, v)          { res.setHeader(k, v); return this; },
  };
}

function buildReq(req, body) {
  const url = new URL(req.url, 'http://localhost');
  return {
    method: req.method,
    path: url.pathname,
    url: req.url,
    headers: req.headers,
    query: Object.fromEntries(url.searchParams),
    body,
  };
}

// User code runs here — sets up routes via app.get/post/etc
// ---- USER SERVER CODE ----
`

const SERVER_SHIM_FOOTER = `
// ---- END USER CODE ----

const __port = parseInt(process.env.__AHTML_API_PORT, 10);

function __startServer() {
  http.createServer((req, res) => {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      try { body = JSON.parse(body); } catch(_) {}
      const request = buildReq(req, body);
      const response = buildRes(res);
      for (const route of __routes) {
        if (route.method === req.method) {
          const pattern = route.path.replace(/:[^/]+/g, '([^/]+)');
          const m = request.path.match(new RegExp('^' + pattern + '$'));
          if (m) {
            route.handler(request, response);
            return;
          }
        }
      }
      res.writeHead(404, {'Content-Type':'application/json'});
      res.end(JSON.stringify({ error: 'not found', path: request.path }));
    });
  }).listen(__port, () => {
    process.send && process.send({ ready: true, port: __port });
  });
}

// If a db was provisioned, wire it up then start — otherwise start immediately
if (process.env.__AHTML_DB_PATH) {
  const __sqlJsPath = process.env.__AHTML_SQLJS_PATH;
  const initSql = require(__sqlJsPath);
  const __fs = require('fs');
  const __dbPath = process.env.__AHTML_DB_PATH;
  const __schema = process.env.__AHTML_DB_SCHEMA ? Buffer.from(process.env.__AHTML_DB_SCHEMA, 'base64').toString('utf8') : '';

  initSql().then(SQL => {
    let sqlDb;
    if (__fs.existsSync(__dbPath)) {
      sqlDb = new SQL.Database(__fs.readFileSync(__dbPath));
    } else {
      sqlDb = new SQL.Database();
    }
    if (__schema.trim()) sqlDb.run(__schema);
    function __save() {
      __fs.writeFileSync(__dbPath, Buffer.from(sqlDb.export()));
    }
    __save();

    db = {
      query(sql, params = []) {
        const stmt = sqlDb.prepare(sql);
        stmt.bind(params);
        const rows = [];
        while (stmt.step()) rows.push(stmt.getAsObject());
        stmt.free();
        return rows;
      },
      get(sql, params = []) { return db.query(sql, params)[0] || null; },
      run(sql, params = []) {
        sqlDb.run(sql, params);
        const changes = sqlDb.getRowsModified();
        const row = db.get('SELECT last_insert_rowid() as id');
        __save();
        return { changes, lastInsertRowid: row ? row.id : null };
      },
      exec(sql) { sqlDb.run(sql); __save(); },
      save: __save,
      _raw: sqlDb,
      _path: __dbPath,
    };

    __startServer();
  });
} else {
  __startServer();
}
`

async function run(ahtmlPath, options = {}) {
  const { watch = true, open: openBrowser = true } = options

  const absPath = path.resolve(ahtmlPath)
  let source = fs.readFileSync(absPath, 'utf8')
  let parsed = parse(source)

  const errors = validate(parsed)
  if (errors.length) {
    for (const e of errors) console.error(`[ahtml] error: ${e}`)
    process.exit(1)
  }

  // Determine ports
  const apiPort = parsed.meta.serverPort || await findFreePort(3001)
  const clientPort = await findFreePort(apiPort === 3000 ? 3001 : 3000)

  // Inject env vars
  if (parsed.env) {
    for (const [k, v] of Object.entries(parsed.env)) {
      process.env[k] = v
    }
  }

  let reloadToken = Date.now().toString()
  let apiProcess = null

  function startApiServer(serverCode) {
    const tmpFile = path.join(os.tmpdir(), `ahtml-server-${Date.now()}.js`)
    const full = SERVER_SHIM + serverCode + SERVER_SHIM_FOOTER
    fs.writeFileSync(tmpFile, full)

    // Build db env vars if a <db> block exists
    const dbEnv = {}
    if (parsed.db) {
      const dbFilename = parsed.meta.dbFile || path.basename(absPath, '.ahtml') + '.db'
      const dbPath = path.resolve(path.dirname(absPath), dbFilename)
      const sqlJsPath = require.resolve('sql.js')
      dbEnv.__AHTML_DB_PATH = dbPath
      dbEnv.__AHTML_SQLJS_PATH = sqlJsPath
      dbEnv.__AHTML_DB_SCHEMA = Buffer.from(parsed.db).toString('base64')
    }

    const child = spawn(process.execPath, [tmpFile], {
      env: { ...process.env, __AHTML_API_PORT: String(apiPort), ...dbEnv },
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    })

    child.stdout.on('data', d => process.stdout.write(`[server] ${d}`))
    child.stderr.on('data', d => process.stderr.write(`[server] ${d}`))
    child.on('exit', (code) => {
      if (code !== 0 && code !== null) {
        console.error(`[ahtml] server process exited with code ${code}`)
      }
      try { fs.unlinkSync(tmpFile) } catch (_) {}
    })

    return child
  }

  function restartApiServer(serverCode) {
    if (apiProcess) {
      apiProcess.kill()
      apiProcess = null
    }
    apiProcess = startApiServer(serverCode)
  }

  restartApiServer(parsed.server)

  // Client HTTP server — serves HTML and proxies /api/* to the API server
  const clientServer = http.createServer((req, res) => {
    // Reload token endpoint
    if (req.url === '/--ahtml-reload') {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
      res.end(JSON.stringify({ token: reloadToken }))
      return
    }

    // Proxy everything except / to the API server
    if (req.url !== '/' && req.url !== '/index.html') {
      const proxyReq = http.request({
        host: '127.0.0.1',
        port: apiPort,
        path: req.url,
        method: req.method,
        headers: req.headers,
      }, (proxyRes) => {
        res.writeHead(proxyRes.statusCode, proxyRes.headers)
        proxyRes.pipe(res)
      })
      proxyReq.on('error', () => {
        res.writeHead(502, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'API server not ready' }))
      })
      req.pipe(proxyReq)
      return
    }

    // Serve client HTML
    const html = prepareClient(parsed.client, {
      style: parsed.style,
      port: clientPort,
      reloadToken,
    })
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(html)
  })

  clientServer.listen(clientPort, '127.0.0.1', () => {
    const url = `http://localhost:${clientPort}`
    console.log(`\n  ✦  ahtml running`)
    console.log(`     client  →  ${url}`)
    console.log(`     api     →  http://localhost:${apiPort}`)
    console.log(`     file    →  ${absPath}`)
    console.log(`\n  watching for changes... (ctrl+c to stop)\n`)

    if (openBrowser) {
      try {
        const cmd = process.platform === 'darwin' ? 'open'
                  : process.platform === 'win32'  ? 'start'
                  : 'xdg-open'
        execSync(`${cmd} ${url}`)
      } catch (_) {}
    }
  })

  // File watcher — on change, re-parse and hot reload
  if (watch) {
    fs.watch(absPath, () => {
      try {
        const newSource = fs.readFileSync(absPath, 'utf8')
        const newParsed = parse(newSource)
        const newErrors = validate(newParsed)
        if (newErrors.length) {
          console.error('[ahtml] parse error on reload:', newErrors)
          return
        }
        parsed = newParsed
        reloadToken = Date.now().toString()
        restartApiServer(parsed.server)
        console.log('[ahtml] reloaded')
      } catch (e) {
        console.error('[ahtml] reload error:', e.message)
      }
    })
  }

  // Cleanup on exit
  process.on('SIGINT', () => {
    console.log('\n[ahtml] shutting down')
    if (apiProcess) apiProcess.kill()
    clientServer.close()
    process.exit(0)
  })
}

module.exports = { run }