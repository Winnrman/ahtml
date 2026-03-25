'use strict'

/**
 * Parses an .ahtml file into its constituent blocks.
 *
 * Supported top-level tags:
 *   <server lang="node">  — server-side JS (required)
 *   <client>              — HTML served at / (required)
 *   <env>                 — KEY=VALUE pairs injected into process.env
 *   <style>               — scoped CSS auto-injected into <client>
 *   <db type="sqlite">    — SQL schema, auto-provisioned on first run
 *
 * Returns: { server, client, env, style, db, meta }
 */

const BLOCK_RE = /<(server|client|env|style|db)((?:\s+[^>]*)?)\s*>([\s\S]*?)<\/\1>/gi

function parseAttrs(attrStr) {
  const attrs = {}
  const re = /(\w+)(?:=["']([^"']*)["'])?/g
  let m
  while ((m = re.exec(attrStr)) !== null) {
    attrs[m[1]] = m[2] ?? true
  }
  return attrs
}

function parse(source) {
  const blocks = { server: null, client: null, env: null, style: null, db: null }
  const meta = {}

  let match
  BLOCK_RE.lastIndex = 0

  while ((match = BLOCK_RE.exec(source)) !== null) {
    const [, tag, attrStr, content] = match
    const attrs = parseAttrs(attrStr)

    switch (tag) {
      case 'server':
        blocks.server = content.trim()
        meta.serverLang = attrs.lang || 'node'
        meta.serverPort = attrs.port ? parseInt(attrs.port, 10) : null
        break
      case 'client':
        blocks.client = content.trim()
        meta.clientFramework = attrs.framework || 'html'
        break
      case 'db':
        blocks.db = content.trim()
        meta.dbType = attrs.type || 'sqlite'
        meta.dbFile = attrs.file || null
        break
        blocks.env = parseEnvBlock(content)
        break
      case 'style':
        blocks.style = content.trim()
        break
    }
  }

  return { ...blocks, meta }
}

function parseEnvBlock(content) {
  const env = {}
  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    const val = trimmed.slice(eq + 1).trim()
    env[key] = val
  }
  return env
}

function validate(parsed) {
  const errors = []
  if (!parsed.server) errors.push('Missing required <server> block')
  if (!parsed.client) errors.push('Missing required <client> block')
  if (parsed.meta.serverLang !== 'node') {
    errors.push(`Unsupported server lang "${parsed.meta.serverLang}" — only "node" is supported in v0.1`)
  }
  return errors
}

module.exports = { parse, validate }