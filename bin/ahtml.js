#!/usr/bin/env node
'use strict'

const path = require('path')
const fs = require('fs')
const { run } = require('../src/runtime')

const args = process.argv.slice(2)
const flags = new Set(args.filter(a => a.startsWith('--')))
const files = args.filter(a => !a.startsWith('--'))

if (flags.has('--help') || flags.has('-h') || files.length === 0) {
  console.log(`
  ahtml — the self-launching web app runtime

  Usage:
    ahtml <file.ahtml>          run a .ahtml file
    ahtml <file.ahtml> --no-open  don't auto-open browser
    ahtml <file.ahtml> --no-watch  don't watch for changes
    ahtml --version             print version
    ahtml --help                show this help

  File format:
    <server lang="node">
      // your Node.js server code
      // use: app.get('/api/...', (req, res) => { ... })
    </server>

    <client>
      <!-- your HTML -->
    </client>

    <env>
      KEY=value
    </env>

    <style>
      /* CSS auto-injected into your client */
    </style>
`)
  process.exit(0)
}

if (flags.has('--version')) {
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8'))
  console.log(`ahtml v${pkg.version}`)
  process.exit(0)
}

const target = files[0]
if (!fs.existsSync(target)) {
  console.error(`[ahtml] file not found: ${target}`)
  process.exit(1)
}

if (!target.endsWith('.ahtml')) {
  console.warn(`[ahtml] warning: file doesn't have .ahtml extension`)
}

run(target, {
  open: !flags.has('--no-open'),
  watch: !flags.has('--no-watch'),
})
