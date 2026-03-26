# ahtml ✦

**One file. Full stack. Double-click to run.**

`ahtml` is a new file format for developers. A single `.ahtml` file contains your database schema, server logic, frontend HTML, and styles — and launches itself when you run it. No config. No folder structure. No `npm install` before you can see anything.

```html
<db type="sqlite">
  CREATE TABLE IF NOT EXISTS notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    body TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
</db>

<server lang="node">
  app.get('/api/notes', (req, res) => {
    res.json(db.query('SELECT * FROM notes ORDER BY created_at DESC'));
  });

  app.post('/api/notes', (req, res) => {
    const result = db.run('INSERT INTO notes (body) VALUES (?)', [req.body.text]);
    res.json(db.get('SELECT * FROM notes WHERE id = ?', [result.lastInsertRowid]));
  });
</server>

<client>
  <!DOCTYPE html>
  <html>
    <body>
      <ul id="list"></ul>
      <input id="inp" placeholder="new note..." />
      <button onclick="add()">add</button>
      <script>
        const load = () => fetch('/api/notes').then(r => r.json()).then(notes => {
          document.getElementById('list').innerHTML = notes.map(n => `<li>${n.body}</li>`).join('');
        });
        const add = () => {
          const inp = document.getElementById('inp');
          fetch('/api/notes', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ text: inp.value }) })
            .then(() => { inp.value = ''; load(); });
        };
        load();
      </script>
    </body>
  </html>
</client>

<style>
  body { font-family: system-ui; max-width: 600px; margin: 60px auto; }
</style>
```

That's a full-stack persistent notes app. **One file.**

---

## Why does this exist?

Every web project starts the same way:

```
mkdir my-app
cd my-app
npm init -y
npm install express
touch server.js index.html
```

And you haven't written a single line of your actual idea yet.

`ahtml` collapses the entire stack into a format that gets out of your way. Write your idea. Run it. The file *is* the app.

It's what PHP got right in 1995 — one file, server + frontend together — but with modern JavaScript, a clean block-based structure, and a real persistent database.

---

## Install

```bash
npm install -g ahtml
```

> **Note**: There's an existing unrelated package on npm also named `ahtml`. Until we publish under a unique name, install directly from this repo:
> ```bash
> git clone https://github.com/your-username/ahtml
> cd ahtml
> npm install
> node bin/ahtml.js your-file.ahtml
> ```

---

## Usage

```bash
ahtml init                      # scaffold a new project interactively
ahtml init my-project           # scaffold with a name
ahtml my-app.ahtml              # run and open browser automatically
ahtml my-app.ahtml --no-open    # run without opening browser
ahtml my-app.ahtml --no-watch   # run without file watching
ahtml --help
```

## Quick start

```bash
git clone https://github.com/Winnrman/ahtml
cd ahtml
npm install
node bin/ahtml.js init my-project
cd my-project
node ../bin/ahtml.js my-project.ahtml
```

`ahtml init` asks you one question — minimal or with database — then scaffolds a ready-to-run project. Pick your template, `cd` in, and you're writing your actual idea within 30 seconds.

---

## `ahtml init`

Scaffolds a new project interactively:

```
$ node bin/ahtml.js init my-project

  ✦  ahtml init

  Template:

  ● Minimal       — server + client, no database
  ○ With database — server + client + SQLite db

  Enter number [1]: 2

  ✦  created my-project/

     my-project/
     └── my-project.ahtml

  To get started:

     cd my-project
     node ../bin/ahtml.js my-project.ahtml
```

Two templates are available:

**Minimal** — a `<server>` with a working `/api/hello` route and a `<client>` that calls it. The simplest possible starting point.

**With database** — a full CRUD list app with a `<db>` block, three API routes, and a clean frontend. A real starting point for any data-driven app.

---

An `.ahtml` file is made up of up to four blocks. Two are required, two are optional.

### `<server lang="node">` *(required)*

Your Node.js backend. Define routes using the built-in `app` object — an Express-compatible surface backed by the raw `http` module. Zero dependencies.

```html
<server lang="node">
  app.get('/api/users', (req, res) => {
    const users = db.query('SELECT * FROM users');
    res.json(users);
  });

  app.post('/api/users', (req, res) => {
    const { name, email } = req.body;
    const result = db.run('INSERT INTO users (name, email) VALUES (?, ?)', [name, email]);
    res.json({ id: result.lastInsertRowid, name, email });
  });
</server>
```

**`app` methods**: `app.get`, `app.post`, `app.put`, `app.delete`

**`req` object**:
| property | description |
|---|---|
| `req.method` | HTTP method |
| `req.path` | pathname (e.g. `/api/users`) |
| `req.query` | parsed query string as object |
| `req.headers` | request headers |
| `req.body` | parsed JSON body (or raw string) |

**`res` object**:
| method | description |
|---|---|
| `res.json(data)` | respond with JSON |
| `res.send(text)` | respond with plain text |
| `res.html(text)` | respond with HTML |
| `res.status(code)` | set status code (chainable) |
| `res.set(key, val)` | set response header (chainable) |

---

### `<client>` *(required)*

Your frontend HTML. Served at `/`. All `fetch('/api/...')` calls are automatically proxied to your server block — no CORS, no port management, it just works.

```html
<client>
  <!DOCTYPE html>
  <html lang="en">
    <head><meta charset="UTF-8"><title>my app</title></head>
    <body>
      <h1>hello world</h1>
      <script>
        fetch('/api/hello').then(r => r.json()).then(console.log);
      </script>
    </body>
  </html>
</client>
```

---

### `<db type="sqlite">` *(optional)*

Your database schema as SQL. The runtime runs it once on first launch (idempotent — use `IF NOT EXISTS`), then automatically provisions a `.db` file next to your `.ahtml` file and injects a `db` object into your server block.

```html
<db type="sqlite">
  CREATE TABLE IF NOT EXISTS posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    published INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
</db>
```

**`db` API** (available in your `<server>` block):

| method | description |
|---|---|
| `db.query(sql, params?)` | returns array of row objects |
| `db.get(sql, params?)` | returns first row or `null` |
| `db.run(sql, params?)` | returns `{ changes, lastInsertRowid }` |
| `db.exec(sql)` | runs multi-statement SQL (migrations) |
| `db.save()` | manually flush to disk (auto-called after `run`) |

Data persists to `your-app.db` next to `your-app.ahtml`. Stop the server, restart it, data is still there.

---

### `<style>` *(optional)*

CSS that gets automatically injected into your `<client>` before it's served. Keeps your styles colocated without cluttering the HTML.

```html
<style>
  *, *::before, *::after { box-sizing: border-box; }
  body { font-family: system-ui, sans-serif; max-width: 860px; margin: 0 auto; padding: 40px 20px; }
  button { background: #0f6e56; color: white; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; }
</style>
```

---

### `<env>` *(optional)*

Key-value pairs injected into `process.env` before your server starts. Keeps secrets out of your server code.

```html
<env>
  API_KEY=your-dev-key-here
  PORT=3000
</env>
```

---

## How it works

When you run `ahtml my-app.ahtml`, the runtime:

1. **Parses** the file into its blocks
2. **Boots two servers** — a client server that serves your HTML, and an API server that runs your server block in a child process
3. **Proxies** all non-root requests from the client server to the API server — so `fetch('/api/...')` just works with no configuration
4. **Provisions the database** if a `<db>` block exists, running the schema and injecting the `db` object
5. **Opens your browser** to the client URL
6. **Watches the file** for changes and hot-reloads on save

```
your-app.ahtml
      │
      ▼
  ahtml runtime
      │
      ├── client server :3000  ──→  serves <client> HTML
      │         │
      │    (proxy /api/*)
      │         │
      └── api server :3001  ──→  runs <server> code + db
```

---

## Setting up double-click to launch

### macOS

Create a `.command` file next to your `.ahtml`:

```bash
#!/bin/bash
cd "$(dirname "$0")"
ahtml my-app.ahtml
```

`chmod +x launch.command` — now double-clickable from Finder.

### Windows

Create a `launch.bat` next to your `.ahtml`:

```bat
@echo off
ahtml my-app.ahtml
pause
```

For a system-wide file association (double-clicking any `.ahtml` file launches it), run `register-ahtml.reg` from the `extras/windows/` folder in this repo.

---

## Example apps

The `test/` folder includes two working examples:

**`todo.ahtml`** — a classic todo app. In-memory only, no `<db>` block. Good for understanding the basic format.

**`notes.ahtml`** — a persistent notes app with a full sidebar UI. Uses the `<db>` block — notes survive server restarts. A good starting template for any data-driven app.

---

## Project structure

```
ahtml/
  bin/
    ahtml.js          ← CLI entry point
  src/
    parser.js         ← splits .ahtml into blocks
    runtime.js        ← boots servers, proxy, watcher
    client.js         ← injects style + hot reload script
    db.js             ← provisions SQLite via sql.js
    ports.js          ← finds free ports
    init.js           ← scaffolds new projects
  test/
    test.js           ← parser test suite (18/18 passing)
    todo.ahtml        ← example: in-memory todo app
    notes.ahtml       ← example: persistent notes app
```

---

## Roadmap

- [x] `ahtml init` — scaffold a new project interactively
- [ ] `lang="python"` and `lang="bun"` server targets
- [ ] `<client framework="react">` — JSX transpiled on the fly
- [ ] `ahtml build` — bundle into a standalone executable (no Node required)
- [ ] WebSocket support
- [ ] VS Code extension — per-block syntax highlighting
- [ ] npm publish under a unique package name

---

## Philosophy

> *The best tool is the one that gets out of the way.*

Modern web development has a configuration problem. Before you write a line of code you're already managing `package.json`, `.env`, `webpack.config.js`, a `src/` folder, a `public/` folder, and a `nodemon` script. For a lot of problems — internal tools, prototypes, personal projects, quick scripts with a UI — that overhead is simply not worth it.

`ahtml` is not trying to replace React or Express for large production applications. It's trying to give you the 10-minute version of a full-stack app, and make that version actually enjoyable to write.

One file. Run it. Ship it.

---

## License

MIT