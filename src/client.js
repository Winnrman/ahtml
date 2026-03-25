'use strict'

/**
 * Takes the raw <client> HTML and prepares it for serving.
 * - Injects <style> block content if present
 * - Injects the hot-reload polling script
 * - Injects a <base> tag so relative API paths resolve to the server port
 */

function prepareClient(html, { style, port, reloadToken }) {
  let out = html

  // Inject scoped <style> block before </head> or at top
  if (style) {
    const styleTag = `<style>\n${style}\n</style>`
    if (out.includes('</head>')) {
      out = out.replace('</head>', `${styleTag}\n</head>`)
    } else {
      out = styleTag + '\n' + out
    }
  }

  // Hot reload: poll /--ahtml-reload every 1.5s
  // If the token changes (file was saved), do a full refresh
  const reloadScript = `
<script>
(function() {
  var token = ${JSON.stringify(reloadToken)};
  setInterval(function() {
    fetch('/--ahtml-reload')
      .then(function(r) { return r.json(); })
      .then(function(d) { if (d.token !== token) location.reload(); })
      .catch(function() {});
  }, 1500);
})();
</script>`

  if (out.includes('</body>')) {
    out = out.replace('</body>', `${reloadScript}\n</body>`)
  } else {
    out = out + '\n' + reloadScript
  }

  return out
}

module.exports = { prepareClient }
