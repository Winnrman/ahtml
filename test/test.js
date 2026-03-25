'use strict'

const { parse, validate } = require('../src/parser')
const fs = require('fs')
const path = require('path')

let passed = 0
let failed = 0

function assert(label, condition, detail = '') {
  if (condition) {
    console.log(`  ✓ ${label}`)
    passed++
  } else {
    console.error(`  ✗ ${label}${detail ? ': ' + detail : ''}`)
    failed++
  }
}

console.log('\n── parser tests ──\n')

// Basic parse
const simple = `
<server lang="node">
app.get('/api/hi', (req, res) => res.json({ hi: true }));
</server>
<client>
<h1>hello</h1>
</client>
`
const p = parse(simple)
assert('finds server block', p.server !== null)
assert('finds client block', p.client !== null)
assert('server lang attr', p.meta.serverLang === 'node')
assert('server content correct', p.server.includes("app.get('/api/hi'"))
assert('client content correct', p.client.includes('<h1>hello</h1>'))

// Env block
const withEnv = simple + `<env>\nFOO=bar\nBAZ=qux\n</env>`
const pe = parse(withEnv)
assert('parses env block', pe.env !== null)
assert('env key FOO', pe.env.FOO === 'bar')
assert('env key BAZ', pe.env.BAZ === 'qux')

// Style block
const withStyle = simple + `<style>\nbody { color: red; }\n</style>`
const ps = parse(withStyle)
assert('parses style block', ps.style !== null)
assert('style content', ps.style.includes('body { color: red; }'))

// Validation
const valid = validate(p)
assert('valid file passes', valid.length === 0)

const noServer = parse(`<client><h1>hi</h1></client>`)
const errNoServer = validate(noServer)
assert('missing server caught', errNoServer.some(e => e.includes('server')))

const noClient = parse(`<server lang="node">app.get('/', () => {});</server>`)
const errNoClient = validate(noClient)
assert('missing client caught', errNoClient.some(e => e.includes('client')))

// Real file
console.log('\n── todo.ahtml parse test ──\n')
const todoSrc = fs.readFileSync(path.join(__dirname, 'todo.ahtml'), 'utf8')
const todo = parse(todoSrc)
const todoErrs = validate(todo)
assert('todo.ahtml parses', todo.server && todo.client)
assert('todo.ahtml validates', todoErrs.length === 0)
assert('todo.ahtml has style', todo.style !== null)
assert('todo.ahtml has env', todo.env !== null)
assert('todo env APP_NAME', todo.env.APP_NAME === 'ahtml-todo')

console.log(`\n── ${passed + failed} tests: ${passed} passed, ${failed} failed ──\n`)
process.exit(failed > 0 ? 1 : 0)
