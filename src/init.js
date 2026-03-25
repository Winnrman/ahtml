'use strict'

const fs = require('fs')
const path = require('path')
const readline = require('readline')

// Templates ──────────────────────────────────────────────────────────────────

const TEMPLATES = {
  minimal: (name) => `<server lang="node">
  app.get('/api/hello', (req, res) => {
    res.json({ message: 'Hello from ${name}!' });
  });
</server>

<client>
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${name}</title>
</head>
<body>
  <div class="container">
    <h1>${name}</h1>
    <p id="msg">Loading...</p>
  </div>
  <script>
    fetch('/api/hello')
      .then(r => r.json())
      .then(d => document.getElementById('msg').textContent = d.message);
  </script>
</body>
</html>
</client>

<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: system-ui, sans-serif;
    background: #f5f5f0;
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .container {
    text-align: center;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  h1 { font-size: 2rem; color: #1a1a1a; }
  p { color: #666; font-size: 1rem; }
</style>
`,

  database: (name) => `<db type="sqlite">
  CREATE TABLE IF NOT EXISTS items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    text TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
</db>

<server lang="node">
  app.get('/api/items', (req, res) => {
    const items = db.query('SELECT * FROM items ORDER BY created_at DESC');
    res.json(items);
  });

  app.post('/api/items', (req, res) => {
    if (!req.body.text) {
      res.status(400).json({ error: 'text is required' });
      return;
    }
    const result = db.run(
      'INSERT INTO items (text) VALUES (?)',
      [req.body.text]
    );
    res.json(db.get('SELECT * FROM items WHERE id = ?', [result.lastInsertRowid]));
  });

  app.delete('/api/items', (req, res) => {
    db.run('DELETE FROM items WHERE id = ?', [req.body.id]);
    res.json({ ok: true });
  });
</server>

<client>
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${name}</title>
</head>
<body>
  <div class="container">
    <h1>${name}</h1>
    <div class="input-row">
      <input id="inp" type="text" placeholder="Add an item...">
      <button onclick="addItem()">Add</button>
    </div>
    <ul id="list"></ul>
  </div>

  <script>
    async function load() {
      const items = await fetch('/api/items').then(r => r.json());
      document.getElementById('list').innerHTML = items.length
        ? items.map(i => \`
            <li>
              <span>\${i.text}</span>
              <button class="del" onclick="remove(\${i.id})">×</button>
            </li>
          \`).join('')
        : '<li class="empty">Nothing here yet.</li>';
    }

    async function addItem() {
      const inp = document.getElementById('inp');
      if (!inp.value.trim()) return;
      await fetch('/api/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: inp.value.trim() })
      });
      inp.value = '';
      load();
    }

    async function remove(id) {
      await fetch('/api/items', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
      });
      load();
    }

    document.getElementById('inp').addEventListener('keydown', e => {
      if (e.key === 'Enter') addItem();
    });

    load();
  </script>
</body>
</html>
</client>

<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: system-ui, sans-serif; background: #f5f5f0; min-height: 100vh; display: flex; align-items: flex-start; justify-content: center; padding: 60px 20px; }
  .container { width: 100%; max-width: 520px; display: flex; flex-direction: column; gap: 20px; }
  h1 { font-size: 2rem; color: #1a1a1a; }
  .input-row { display: flex; gap: 8px; }
  input { flex: 1; padding: 10px 14px; border: 1.5px solid #ddd; border-radius: 8px; font-size: 1rem; outline: none; background: white; }
  input:focus { border-color: #0f6e56; }
  button { padding: 10px 18px; background: #0f6e56; color: white; border: none; border-radius: 8px; font-size: 1rem; cursor: pointer; }
  button:hover { background: #085041; }
  ul { list-style: none; display: flex; flex-direction: column; gap: 8px; }
  li { background: white; padding: 12px 16px; border-radius: 10px; border: 1.5px solid #eee; display: flex; align-items: center; justify-content: space-between; }
  li span { color: #1a1a1a; font-size: 0.95rem; }
  li.empty { color: #aaa; justify-content: center; font-size: 0.9rem; border-style: dashed; }
  .del { background: none; border: none; color: #ccc; font-size: 1.1rem; padding: 0 4px; border-radius: 4px; }
  .del:hover { background: #fee; color: #e24b4a; }
</style>
`,
}

// Prompt helper ──────────────────────────────────────────────────────────────

function prompt(rl, question) {
  return new Promise(resolve => rl.question(question, resolve))
}

function choice(rl, question, options, defaultIndex = 0) {
  const labels = options.map((o, i) => `${i === defaultIndex ? '●' : '○'} ${o.label}`).join('\n  ')
  return new Promise(resolve => {
    rl.question(`${question}\n\n  ${labels}\n\n  Enter number [${defaultIndex + 1}]: `, answer => {
      const n = parseInt(answer.trim(), 10)
      const idx = isNaN(n) ? defaultIndex : Math.max(0, Math.min(options.length - 1, n - 1))
      resolve(options[idx].value)
    })
  })
}

// Main ───────────────────────────────────────────────────────────────────────

async function init(nameArg) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })

  console.log('\n  ✦  ahtml init\n')

  // Project name
  let name = nameArg
  if (!name) {
    name = await prompt(rl, '  Project name: ')
    name = name.trim()
  }
  if (!name) {
    console.error('  error: project name is required')
    rl.close()
    process.exit(1)
  }

  // Sanitise name for use as filename
  const slug = name.toLowerCase().replace(/[^a-z0-9-_]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')

  // Template choice
  const template = await choice(rl, '  Template:', [
    { label: 'Minimal       — server + client, no database', value: 'minimal' },
    { label: 'With database — server + client + SQLite db',  value: 'database' },
  ])

  // Destination
  const destDir = path.resolve(process.cwd(), slug)
  const destFile = path.join(destDir, `${slug}.ahtml`)

  rl.close()

  // Check for conflicts
  if (fs.existsSync(destDir)) {
    console.error(`\n  error: folder already exists: ${destDir}`)
    process.exit(1)
  }

  // Scaffold
  fs.mkdirSync(destDir, { recursive: true })
  fs.writeFileSync(destFile, TEMPLATES[template](name))

  // Done
  console.log(`
  ✦  created ${slug}/

     ${slug}/
     └── ${slug}.ahtml

  To get started:

     cd ${slug}
     node ${path.relative(destDir, path.resolve(__dirname, '../bin/ahtml.js'))} ${slug}.ahtml

  `)
}

module.exports = { init }