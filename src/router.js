(function() {
  var __routes = [];

  window.page = function(pattern, handler) {
    var rx = pattern.replace(/:([a-zA-Z_][a-zA-Z0-9_]*)/g, '([^/]+)');
    __routes.push({ pattern: new RegExp('^' + rx + '(\\?.*)?$'), handler: handler, keys: (pattern.match(/:([a-zA-Z_][a-zA-Z0-9_]*)/g) || []).map(function(k){ return k.slice(1); }) });
  };

  window.router = { params: {}, query: {}, path: '/' };

  function resolve(path) {
    var qs = path.indexOf('?') !== -1 ? path.slice(path.indexOf('?') + 1) : '';
    var pathname = path.indexOf('?') !== -1 ? path.slice(0, path.indexOf('?')) : path;
    var query = {};
    if (qs) qs.split('&').forEach(function(p) {
      var kv = p.split('=');
      query[decodeURIComponent(kv[0])] = decodeURIComponent(kv[1] || '');
    });

    for (var i = 0; i < __routes.length; i++) {
      var m = pathname.match(__routes[i].pattern);
      if (m) {
        var params = {};
        __routes[i].keys.forEach(function(key, idx) { params[key] = m[idx + 1]; });
        window.router.params = params;
        window.router.query  = query;
        window.router.path   = pathname;
        var result = __routes[i].handler({ params: params, query: query });
        if (result == null) return;
        if (typeof result.then === 'function') {
          result.then(function(html) { render(html, pathname); });
        } else {
          render(result, pathname);
        }
        return;
      }
    }
    render('<div style="padding:40px;text-align:center;color:#999;font-family:system-ui"><h2>404</h2><p>No route matched: ' + pathname + '</p></div>', pathname);
  }

  function render(result, pathname) {
    var app = document.getElementById('app');
    if (!app) {
      console.warn('[ahtml] router: no #app element found. Add <div id="app"></div> to your <client>.');
      return;
    }
    if (typeof result === 'string') {
      app.innerHTML = result;
    } else if (result instanceof Node) {
      app.innerHTML = '';
      app.appendChild(result);
    }
    window.scrollTo(0, 0);
    document.querySelectorAll('a[href]').forEach(function(a) {
      a.classList.toggle('active', a.getAttribute('href') === pathname);
    });
  }

  window.navigate = function(path) {
    history.pushState({}, '', path);
    resolve(path);
  };

  window.link = function(path, label) {
    return '<a href="' + path + '">' + label + '</a>';
  };

  document.addEventListener('click', function(e) {
    var a = e.target.closest('a[href]');
    if (!a) return;
    var href = a.getAttribute('href');
    if (!href || href.startsWith('http') || href.startsWith('//') || href.startsWith('mailto:') || href.startsWith('#')) return;
    e.preventDefault();
    window.navigate(href);
  });

  window.addEventListener('popstate', function() {
    resolve(location.pathname + location.search);
  });

  // Run after user's page() calls are registered
  setTimeout(function() { resolve(location.pathname + location.search); }, 0);
})();