'use strict'

const fs = require('fs')
const path = require('path')

/**
 * Takes the raw <client> HTML and prepares it for serving.
 * - Injects <style> block content if present
 * - Injects the ahtml client runtime (router) from router.js
 * - Injects the hot-reload polling script
 *
 * Global API available in every <client> block:
 *
 *   page(path, fn)     — register a route. fn receives { params, query }
 *                        and returns an HTML string, a Node, or a Promise.
 *   navigate(path)     — programmatically navigate to a path
 *   link(path, label)  — returns an <a> string
 *   router.params      — current route params e.g. { id: '42' }
 *   router.query       — current query string as object
 *   router.path        — current pathname
 */

const ROUTER_SRC = fs.readFileSync(path.join(__dirname, 'router.js'), 'utf8')

function inject(html, target, content) {
  if (html.includes(target)) {
    return html.replace(target, function() { return content + '\n' + target })
  }
  return content + '\n' + html
}

function prepareClient(html, { style, reloadToken }) {
  let out = html

  // Inject <style> block before </head>
  if (style) {
    out = inject(out, '</head>', '<style>\n' + style + '\n</style>')
  }

  // Inject the ahtml router runtime before </head>
  out = inject(out, '</head>', '<script>\n' + ROUTER_SRC + '\n</script>')

  // Hot reload: poll /--ahtml-reload every 1.5s
  const reloadScript = [
    '<script>',
    '(function() {',
    '  var token = "' + reloadToken + '";',
    '  setInterval(function() {',
    '    fetch("/--ahtml-reload")',
    '      .then(function(r) { return r.json(); })',
    '      .then(function(d) { if (d.token !== token) location.reload(); })',
    '      .catch(function() {});',
    '  }, 1500);',
    '})();',
    '</script>',
  ].join('\n')

  out = inject(out, '</body>', reloadScript)

  return out
}

module.exports = { prepareClient }