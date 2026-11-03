/* core.js: the shared front-end engine (window.UI). Same in every app made from APP_MAKER/template;
   app-specific things live in web/app.js (brand, nav, footer) and web/pages/*.html (the pages).

   Pages:   UI.page(name, {title, nav, icon, auth, order, chrome}, mount)
              auth: null (anyone) | 'guest' (signed-out only) | 'user' | 'admin'
              nav: label for the header / phone tab bar (omit to keep it out of the menus)
              mount(view, ctx) draws into `view`; ctx = {args, me, go, api}. Return a Promise (the page
              is "ready" when it resolves) or {ready, destroy}. URLs are #name/arg1/arg2.
   Server:  UI.api(fn, ...args) -> Promise of the server function's return value. A reply of
              {ok: false, error} rejects with that message (shown as a toast unless you .catch it).
            UI.apiQuiet(fn, ...args) is the same without Anvil's loading spinner.
   Auth:    UI.auth('login'|'signup'|'reset'|'logout', {...}) -> Promise of {ok, me, message}
   Helpers: UI.esc, UI.icon, UI.toast, UI.modal, UI.confirm, UI.busy, UI.formData, UI.fmtDate, UI.ago,
            UI.store, UI.setTheme, UI.feedback, UI.go, UI.refresh
   Tests:   window.UI_READY is true when the current page has finished loading. */
(function () {
  'use strict';
  if (window.UI && window.UI.__v) return;
  var UI = window.UI = { __v: 1, pages: {}, me: null, config: { name: 'App', key: 'app', home: 'home', landing: 'landing' } };
  window.UI_READY = false;

  UI.configure = function (cfg) { Object.keys(cfg).forEach(function (k) { UI.config[k] = cfg[k]; }); };

  /* ------------------------------------------------------------------ small helpers */
  UI.esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  UI.plural = function (n, one, many) { return n + ' ' + (n === 1 ? one : (many || one + 's')); };
  UI.initials = function (name) {
    var p = String(name || '?').trim().split(/\s+/);
    return ((p[0] || '?')[0] + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase();
  };
  UI.fmtDate = function (iso, opts) {
    if (!iso) return '';
    var d = iso.length <= 10 ? new Date(iso + 'T12:00:00') : new Date(iso);
    return d.toLocaleDateString(undefined, opts || { day: 'numeric', month: 'short', year: 'numeric' });
  };
  UI.fmtDateTime = function (iso) {
    return iso ? new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
  };
  UI.ago = function (iso) {
    if (!iso) return '';
    var s = (Date.now() - new Date(iso).getTime()) / 1000;
    if (s < 60) return 'just now';
    var steps = [[60, 'minute'], [24, 'hour'], [7, 'day'], [4.35, 'week'], [12, 'month'], [Infinity, 'year']], n = s / 60;
    for (var i = 0; i < steps.length; i++) {
      if (n < steps[i][0]) { n = Math.floor(n); return UI.plural(n, steps[i][1]) + ' ago'; }
      n = n / steps[i][0];
    }
    return '';
  };
  UI.store = {
    get: function (k, dflt) { try { var v = localStorage.getItem(UI.config.key + '.' + k); return v == null ? dflt : JSON.parse(v); } catch (e) { return dflt; } },
    set: function (k, v) { try { localStorage.setItem(UI.config.key + '.' + k, JSON.stringify(v)); } catch (e) {} }
  };
  UI.formData = function (form) {
    var out = {};
    Array.prototype.forEach.call(form.elements, function (el) {
      if (!el.name || el.disabled) return;
      if (el.type === 'checkbox') out[el.name] = el.checked;
      else if (el.type === 'radio') { if (el.checked) out[el.name] = el.value; }
      else out[el.name] = el.value;
    });
    return out;
  };
  /* Disable a button while a Promise runs; returns the Promise. */
  UI.busy = function (btn, promise) {
    if (!btn) return promise;
    btn.disabled = true; btn.classList.add('is-busy');
    var done = function () { btn.disabled = false; btn.classList.remove('is-busy'); };
    promise.then(done, done);
    return promise;
  };

  var ICONS = {
    home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.5 3-5.5 6.5-5.5s6.5 2 6.5 5.5"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7"/><path d="M18 14.7c2.2.6 3.5 2.4 3.5 5.3"/>',
    sliders: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
    shield: '<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    trash: '<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M6 6l1 14h10l1-14"/>',
    edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    chat: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-4.9A8 8 0 1 1 21 12z"/>',
    bell: '<path d="M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8"/><path d="M10 20a2 2 0 0 0 4 0"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    back: '<path d="M19 12H5M11 18l-6-6 6-6"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
    bug: '<rect x="7" y="8" width="10" height="12" rx="5"/><path d="M12 8V5M9 5.5 7.5 4M15 5.5 16.5 4M7 13H3M21 13h-4M7.5 18l-3 2M16.5 18l3 2M7.5 9.5l-3-2M16.5 9.5l3-2"/>',
    bulb: '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/>',
    star: '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>',
    heart: '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    chevron: '<path d="m6 9 6 6 6-6"/>',
    external: '<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
    lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
    inbox: '<path d="M3 13h5l1.5 3h5L16 13h5"/><path d="M5 5h14l2 8v6H3v-6z"/>',
    grid: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
    sparkle: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/>',
    database: '<ellipse cx="12" cy="5.5" rx="7.5" ry="2.5"/><path d="M4.5 5.5v13c0 1.4 3.4 2.5 7.5 2.5s7.5-1.1 7.5-2.5v-13"/><path d="M4.5 12c0 1.4 3.4 2.5 7.5 2.5s7.5-1.1 7.5-2.5"/>',
    refresh: '<path d="M20 11a8 8 0 0 0-14.3-4.9L4 8"/><path d="M4 4v4h4"/><path d="M4 13a8 8 0 0 0 14.3 4.9L20 16"/><path d="M20 20v-4h-4"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    map: '<path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2z"/><path d="M9 4v14M15 6v14"/>',
    pin: '<path d="M12 21s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12z"/><circle cx="12" cy="9" r="2.5"/>',
    camera: '<path d="M4 8h3l2-3h6l2 3h3v12H4z"/><circle cx="12" cy="13.5" r="3.5"/>',
    image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 9"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3z"/>',
    copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
    filter: '<path d="M4 5h16l-6 7.5V19l-4 1.5v-8z"/>',
    more: '<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>'
  };
  UI.ICONS = ICONS;
  UI.icon = function (name, cls) {
    return '<svg class="ui-ic ' + (cls || '') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" ' +
      'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICONS[name] || ICONS.sparkle) + '</svg>';
  };

  /* ------------------------------------------------------------------ toasts, modals */
  UI.toast = function (msg, kind) {
    var box = document.querySelector('.ui-toasts');
    if (!box) { box = document.createElement('div'); box.className = 'ui ui-toasts'; box.setAttribute('aria-live', 'polite'); document.body.appendChild(box); }
    var t = document.createElement('div');
    t.className = 'ui-toast' + (kind ? ' ' + kind : '');
    t.innerHTML = (kind === 'error' ? UI.icon('info') : kind === 'ok' ? UI.icon('check') : '') + '<span>' + UI.esc(msg) + '</span>';
    box.appendChild(t);
    setTimeout(function () { t.classList.add('out'); setTimeout(function () { t.remove(); }, 300); }, kind === 'error' ? 6500 : 3200);
  };
  UI.modal = function (html, opts) {
    opts = opts || {};
    var prev = document.activeElement;
    var wrap = document.createElement('div');
    wrap.className = 'ui ui-modal-wrap';
    wrap.innerHTML = '<div class="ui-modal' + (opts.wide ? ' wide' : '') + '" role="dialog" aria-modal="true">' +
      '<button class="ui-btn ghost icon ui-modal-x" data-close aria-label="Close">' + UI.icon('x') + '</button>' + html + '</div>';
    document.body.appendChild(wrap);
    document.documentElement.classList.add('ui-modal-open');
    function key(e) { if (e.key === 'Escape') close(); }
    function close() {
      if (!wrap.parentNode) return;
      wrap.remove(); document.removeEventListener('keydown', key);
      if (!document.querySelector('.ui-modal-wrap')) document.documentElement.classList.remove('ui-modal-open');
      if (opts.onclose) opts.onclose();
      if (prev && prev.focus) prev.focus();
    }
    document.addEventListener('keydown', key);
    wrap.addEventListener('mousedown', function (e) { if (e.target === wrap) close(); });
    wrap.addEventListener('click', function (e) { if (e.target.closest('[data-close]')) close(); });
    var first = wrap.querySelector('input, textarea, select');
    setTimeout(function () { (first || wrap.querySelector('.ui-modal')).focus && (first || wrap.querySelector('.ui-modal')).focus(); }, 30);
    return { el: wrap.querySelector('.ui-modal'), close: close };
  };
  UI.confirm = function (o) {
    o = typeof o === 'string' ? { title: o } : (o || {});
    return new Promise(function (resolve) {
      var answered = false;
      var m = UI.modal('<h2>' + UI.esc(o.title || 'Are you sure?') + '</h2>' + (o.text ? '<p class="muted">' + UI.esc(o.text) + '</p>' : '') +
        '<div class="ui-row end" style="margin-top:20px"><button class="ui-btn ghost" data-close>' + UI.esc(o.cancel || 'Cancel') + '</button>' +
        '<button class="ui-btn ' + (o.danger ? 'danger solid' : 'primary') + '" data-ok>' + UI.esc(o.ok || 'OK') + '</button></div>',
      { onclose: function () { if (!answered) resolve(false); } });
      m.el.querySelector('[data-ok]').onclick = function () { answered = true; m.close(); resolve(true); };
    });
  };

  /* ------------------------------------------------------------------ theme */
  UI.theme = function () { return UI.store.get('theme', 'auto'); };
  UI.applyTheme = function (t) {
    if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
    else document.documentElement.removeAttribute('data-theme');
    var dark = t === 'dark' || (t !== 'light' && window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.classList.toggle('ui-dark', !!dark);
  };
  UI.setTheme = function (t) { UI.store.set('theme', t); UI.applyTheme(t); };
  UI.applyTheme(UI.theme());
  if (window.matchMedia) {
    try { matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function () { UI.applyTheme(UI.theme()); }); } catch (e) {}
  }

  /* ------------------------------------------------------------------ server bridge */
  var bridge = null;
  function send(kind, payload) {
    if (!bridge) return Promise.reject(new Error('The app is still starting.'));
    var out;
    try { out = bridge(kind, JSON.stringify(payload || {})); } catch (e) { return Promise.reject(e); }
    return Promise.resolve(out).then(function (r) {
      r = typeof r === 'string' ? JSON.parse(r) : (r || {});
      if (r.error) {
        var err = new Error(r.error); err.uiApi = true; err.denied = !!r.denied;
        if (r.detail) console.error(kind, payload && payload.fn, r.detail);
        if (r.reload) setTimeout(function () { location.reload(); }, 2500);
        throw err;
      }
      return r.result;
    });
  }
  function apiCall(quiet, fn, args) {
    return send('call', { fn: fn, args: args, quiet: quiet }).then(function (res) {
      if (res && typeof res === 'object' && res.ok === false) {
        var err = new Error(res.error || 'That didn\'t work.'); err.uiApi = true; err.expected = true; err.result = res;
        throw err;
      }
      return res;
    });
  }
  UI.api = function (fn) { return apiCall(false, fn, Array.prototype.slice.call(arguments, 1)); };
  UI.apiQuiet = function (fn) { return apiCall(true, fn, Array.prototype.slice.call(arguments, 1)); };
  /* Errors nobody caught become a toast, so a failed action is never silent. */
  window.addEventListener('unhandledrejection', function (e) {
    if (e.reason && e.reason.uiApi) { e.preventDefault(); UI.toast(e.reason.message, 'error'); }
  });

  /* Sign in / up / out. On success it navigates: to where the visitor was heading (UI.after) or home
     after signing in, to the landing page after signing out. */
  UI.auth = function (kind, payload) {
    return send(kind, payload || {}).then(function (r) {
      if (r && r.ok === false) { var err = new Error(r.error); err.uiApi = true; err.expected = true; throw err; }
      if (r && 'me' in r && (r.me || kind === 'logout')) {
        UI.me = r.me || null;
        var target = r.me ? (UI.after || '#' + UI.config.home) : '#' + UI.config.landing;
        UI.after = null;
        if (location.hash === target) route(); else location.hash = target;
      }
      return r;
    });
  };
  /* Update the signed-in user's details (e.g. a new name) and redraw the header, without reloading the page. */
  UI.setMe = function (me) {
    UI.me = me || null;
    if (shellRoot) renderChrome(current.name);
  };

  /* ------------------------------------------------------------------ pages and routing */
  UI.page = function (name, opts, mount) {
    if (typeof opts === 'function') { mount = opts; opts = {}; }
    opts.name = name; opts.mount = mount;
    UI.pages[name] = opts;
  };
  UI.allowed = function (p) {
    if (!p) return false;
    if (p.auth === 'user') return !!UI.me;
    if (p.auth === 'admin') return !!(UI.me && UI.me.is_admin);
    if (p.auth === 'guest') return !UI.me;
    return true;
  };
  UI.navPages = function () {
    return Object.keys(UI.pages).map(function (k) { return UI.pages[k]; })
      .filter(function (p) { return p.nav && UI.allowed(p) && (!p.when || p.when()); })
      .sort(function (a, b) { return (a.order || 50) - (b.order || 50); });
  };
  UI.parseHash = function () {
    var h = (location.hash || '').replace(/^#!?\/?/, '');
    var parts = h.split('?')[0].split('/').filter(function (x) { return x !== ''; }).map(decodeURIComponent);
    return { name: parts[0] || '', args: parts.slice(1) };
  };
  UI.hashFor = function (name) {
    var args = Array.prototype.slice.call(arguments, 1).filter(function (a) { return a != null && a !== ''; });
    return '#' + [name].concat(args.map(encodeURIComponent)).join('/');
  };
  UI.go = function (name) {
    var h = UI.hashFor.apply(null, arguments);
    if (location.hash === h) route(); else location.hash = h;
  };
  UI.refresh = function () { route(); };
  UI.after = null;  // where to go after signing in

  var shellRoot = null, view = null, current = { name: null, destroy: null }, routeSeq = 0;

  function defaultPage() { return UI.me ? UI.config.home : UI.config.landing; }

  function route() {
    var r = UI.parseHash(), name = r.name || defaultPage(), p = UI.pages[name];
    if (!p) { name = defaultPage(); p = UI.pages[name]; r.args = []; }
    if (p.auth === 'guest' && UI.me) { p = UI.pages[UI.config.home]; name = UI.config.home; r.args = []; }
    if ((p.auth === 'user' || p.auth === 'admin') && !UI.me) {
      UI.after = location.hash && location.hash !== '#' ? location.hash : null;
      p = UI.pages.auth; name = 'auth'; r.args = [];
    }
    if (p.auth === 'admin' && !(UI.me && UI.me.is_admin)) {
      UI.toast('That page is for admins only.', 'error');
      p = UI.pages[UI.config.home]; name = UI.config.home; r.args = [];
    }
    var seq = ++routeSeq;
    window.UI_READY = false;
    if (current.destroy) { try { current.destroy(); } catch (e) { console.error(e); } }
    current = { name: name, args: r.args, destroy: null };
    if (shellRoot) {
      shellRoot.className = 'ui ui-shell page-' + name + (UI.me ? ' signed-in' : ' signed-out') + (p.chrome === false ? ' no-chrome' : '');
      renderChrome(name);
    }
    // A fresh element for every page, so listeners a page adds to `view` never pile up.
    var fresh = view.cloneNode(false);
    view.parentNode.replaceChild(fresh, view);
    view = fresh;
    window.scrollTo(0, 0);
    document.title = (p.title ? (typeof p.title === 'function' ? p.title(r.args) : p.title) + ' · ' : '') + UI.config.name;
    var ctx = { name: name, args: r.args, me: UI.me, go: UI.go, api: UI.api, page: p };
    var out;
    try { out = p.mount(view, ctx); } catch (e) { console.error(e); out = Promise.reject(e); }
    var ready = out && typeof out.then === 'function' ? out : (out && out.ready) || Promise.resolve();
    if (out && out.destroy) current.destroy = out.destroy;
    Promise.resolve(ready).then(function () { if (seq === routeSeq) window.UI_READY = true; },
      function (e) {
        if (seq !== routeSeq) return;
        console.error(e);
        if (!view.innerHTML) view.innerHTML = '<div class="ui-wrap"><div class="ui-empty">' + UI.icon('info') +
          '<h3>This page didn\'t load</h3><p class="muted">' + UI.esc(e && e.message || 'Something went wrong.') + '</p>' +
          '<button class="ui-btn" onclick="UI.refresh()">Try again</button></div></div>';
        window.UI_READY = true;
      });
  }
  UI.current = function () { return current; };

  /* The shell's parts come from web/app.js: UI.shell = {header(me, active), footer(me), tabbar(me, active)} */
  function renderChrome(active) {
    var S = UI.shell || {};
    var hd = shellRoot.querySelector('[data-ui-header]'), ft = shellRoot.querySelector('[data-ui-footer]'), tb = shellRoot.querySelector('[data-ui-tabbar]');
    if (hd) hd.innerHTML = S.header ? S.header(UI.me, active) : '';
    if (ft) ft.innerHTML = S.footer ? S.footer(UI.me, active) : '';
    if (tb) tb.innerHTML = S.tabbar ? S.tabbar(UI.me, active) : '';
  }
  UI.renderChrome = function () { if (shellRoot) renderChrome(current.name); };

  /* Called by client_code/Main.py (and by the local harness) once the page is up. */
  UI.start = function (node, bridgeFn, bootJson) {
    bridge = bridgeFn;
    var boot = typeof bootJson === 'string' ? JSON.parse(bootJson || '{}') : (bootJson || {});
    UI.me = boot.me || null;
    var host = node && node.matches && node.matches('[data-ui-app]') ? node : (node && node.querySelector('[data-ui-app]')) || node || document.body;
    host.innerHTML = '<div class="ui ui-shell">' +
      '<header class="ui-header" data-ui-header></header>' +
      '<main class="ui-main" data-ui-view></main>' +
      '<footer class="ui-footer" data-ui-footer></footer>' +
      '<nav class="ui-tabbar" data-ui-tabbar aria-label="Main"></nav></div>';
    shellRoot = host.firstChild;
    view = host.querySelector('[data-ui-view]');
    if (UI.shell && UI.shell.wire) UI.shell.wire(shellRoot);
    window.addEventListener('hashchange', route);
    route();
  };

  /* ------------------------------------------------------------------ feedback (footer + menu)
     All feedback goes to Prepsto. The widget tag in head.html (data-prepsto="CODE") slides its panel in;
     any [data-feedback] or [data-prepsto-open] element opens it. If the widget hasn't loaded, the panel opens in a new tab.
     There is no in-app feedback form any more: Admin -> Feedback only lists older messages (and app requests). */
  UI.feedback = function () {
    if (window.Prepsto && window.Prepsto.open) { window.Prepsto.open(); return; }
    var tag = document.querySelector('script[data-prepsto]');
    var code = tag && tag.getAttribute('data-prepsto');
    if (code && code.indexOf('__') !== 0) window.open('https://prepsto.com/#f/' + encodeURIComponent(code), '_blank', 'noopener');
    else UI.toast('Feedback is not set up yet.', 'error');
  };

  /* Shared clicks: [data-go="page/arg"], [data-feedback], [data-theme-set] anywhere in the app. */
  document.addEventListener('click', function (e) {
    var el = e.target.closest && e.target.closest('[data-go],[data-feedback],[data-theme-set]');
    if (!el) return;
    if (el.hasAttribute('data-go')) { e.preventDefault(); UI.go.apply(null, el.getAttribute('data-go').split('/')); }
    else if (el.hasAttribute('data-feedback')) { e.preventDefault(); UI.feedback(el.getAttribute('data-feedback') || null); }
    else if (el.hasAttribute('data-theme-set')) { e.preventDefault(); UI.setTheme(el.getAttribute('data-theme-set')); if (UI.shell && UI.shell.onTheme) UI.shell.onTheme(); }
  });
})();


/* app.js: Brain Mechanic's identity and frame: name, header (with the disclaimer plaque and Emergency brake),
   footer, phone tab bar. Pages live in web/pages/*.html; the shared layer is web/pages/_bm.html.
   The manual, checks and toolbox are public: the nav and tab bar work without an account. */
(function () {
  'use strict';
  UI.configure({
    name: 'Brain Mechanic',
    key: 'brainmechanic',          // prefix for this app's browser storage
    tagline: 'The owner’s manual for your mind. Pull up a chair.',
    home: 'garage',              // first page after signing in
    landing: 'landing'           // first page for visitors who aren't signed in
  });

  var esc = UI.esc;

  function brand() {
    return '<a class="ui-brand" href="#" data-go="' + (UI.me ? UI.config.home : UI.config.landing) + '" aria-label="' + esc(UI.config.name) + ' home">' +
      '<img src="_/theme/icon.svg" alt="" width="32" height="32"><span>Brain <b>Mechanic</b></span></a>';
  }

  function themeSwitch() {
    var t = UI.theme();
    return '<div class="ui-seg" role="group" aria-label="Appearance">' + [['auto', 'Auto'], ['light', 'Day'], ['dark', 'Evening']].map(function (o) {
      return '<button type="button" data-theme-set="' + o[0] + '" class="' + (t === o[0] ? 'on' : '') + '">' + o[1] + '</button>';
    }).join('') + '</div>';
  }

  function userMenu(me) {
    return '<div class="ui-menu" data-menu hidden>' +
      '<div class="ui-menu-head"><strong>' + esc(me.name) + '</strong><span class="muted small">' + esc(me.email) + '</span></div>' +
      '<a href="#garage" data-go="garage">' + UI.icon('dash') + 'My garage</a>' +
      '<a href="#workorder" data-go="workorder">' + UI.icon('clipboard') + 'Work order for a pro</a>' +
      '<a href="#profile" data-go="profile">' + UI.icon('user') + 'Your profile</a>' +
      (me.is_admin ? '<a href="#admin" data-go="admin">' + UI.icon('shield') + 'Admin</a>' : '') +
      '<div class="ui-menu-block"><span class="small muted">Lighting</span>' + themeSwitch() + '</div>' +
      '<button type="button" data-feedback>' + UI.icon('chat') + 'Submit feedback</button>' +
      '<button type="button" data-lk-open="overview">' + UI.icon('lock') + 'Privacy &amp; Terms</button>' +
      '<button type="button" data-signout>' + UI.icon('logout') + 'Sign out</button></div>';
  }

  /* Phone tab bar: four main pages + More. Members get their Garage first. */
  function mainTabs(me) {
    var order = me ? ['garage', 'manual', 'diagnose', 'toolbox'] : ['manual', 'diagnose', 'factory', 'toolbox'];
    return order.map(function (n) { return UI.pages[n]; }).filter(Boolean);
  }
  function moreSheet(me, main) {
    var names = main.map(function (p) { return p.name; });
    var rest = UI.navPages().filter(function (p) { return names.indexOf(p.name) < 0; });
    return '<div class="bm-sheet" data-sheet hidden>' +
      rest.map(function (p) { return '<a href="#' + p.name + '" data-go="' + p.name + '">' + UI.icon(p.icon) + esc(p.nav) + '</a>'; }).join('') +
      '<a href="#workorder" data-go="workorder">' + UI.icon('clipboard') + 'Work order for a pro</a>' +
      '<a href="#landing" data-go="landing">' + UI.icon('chair') + 'About Brain Mechanic</a>' +
      (me ? '<a href="#profile" data-go="profile">' + UI.icon('user') + 'Your profile</a>' + (me.is_admin ? '<a href="#admin" data-go="admin">' + UI.icon('shield') + 'Admin</a>' : '')
          : '<a href="#auth" data-go="auth">' + UI.icon('user') + 'Sign in or keep a logbook</a>') +
      '<button type="button" data-brake>' + UI.icon('brake') + 'Emergency brake: help now</button>' +
      '<button type="button" data-feedback>' + UI.icon('chat') + 'Submit feedback</button>' +
      '<button type="button" data-lk-open="overview">' + UI.icon('lock') + 'Privacy &amp; Terms</button>' +
      themeSwitch() + '</div>';
  }

  UI.shell = {
    header: function (me, active) {
      var nav = UI.navPages();
      return '<div class="ui-header-in">' + brand() +
        '<nav class="ui-nav" aria-label="Main">' + nav.map(function (p) {
          return '<a href="#' + p.name + '" class="' + (p.name === active ? 'on' : '') + '">' + UI.icon(p.icon) + '<span>' + esc(p.nav) + '</span></a>';
        }).join('') + '</nav>' +
        '<div class="ui-header-right">' +
        (me ? '<button type="button" class="ui-avatar-btn" data-menu-toggle aria-label="Your account" aria-haspopup="true">' + esc(UI.initials(me.name)) + '</button>' + userMenu(me)
          : (active === 'auth' ? '' : '<a class="ui-btn ghost" href="#auth" data-go="auth">Sign in</a><a class="ui-btn primary" href="#auth/signup" data-go="auth/signup">Keep a logbook</a>')) +
        '</div></div>' + BM.plaque();
    },
    footer: function () {
      var link = function (go, label) { return '<a href="#' + go + '" data-go="' + go + '">' + label + '</a>'; };
      return '<div class="ui-footer-in"><div class="ui-footer-brand">' + brand() + '<p class="muted small">' + esc(UI.config.tagline) + '</p></div>' +
        '<div class="ui-footer-links">' +
        link('manual', 'Repair manual') + link('diagnose', 'Diagnose') + link('factory', 'Upbringing') + link('toolbox', 'Toolbox') + link('help', 'Find a pro') +
        link('workorder', 'Work order') + link('landing', 'About') +
        '<a href="https://prepsto.com/#f/kb84jdb" target="_blank" rel="noopener" data-prepsto-open>Submit feedback</a>' +
        '<button type="button" data-lk-open="overview">Privacy &amp; Terms</button>' +
        '</div><p class="bm-fine"><b>Nobody here is a doctor.</b> Brain Mechanic is for entertainment and self-reflection only. It is in no way medical advice, ' +
        'diagnosis or treatment, and it doesn’t replace a qualified professional. In a crisis, call your local emergency number or use the Emergency brake at the top of every page.</p>' +
        '<p class="ui-footer-legal small muted">© ' + new Date().getFullYear() + ' Brain Mechanic · Facts checked against the sources named on each page, November 2026.</p></div>';
    },
    tabbar: function (me, active) {
      var main = mainTabs(me);
      if (!main.length) return '';
      var inMore = main.every(function (p) { return p.name !== active; }) && active !== 'landing';
      return main.map(function (p) {
        return '<a href="#' + p.name + '" class="' + (p.name === active ? 'on' : '') + '">' + UI.icon(p.icon) + '<span>' + esc(p.nav) + '</span></a>';
      }).join('') + '<a href="#" class="more' + (inMore ? ' on' : '') + '" data-more aria-haspopup="true">' + UI.icon('menu') + '<span>More</span></a>' + moreSheet(me, main);
    },
    wire: function (root) {
      root.addEventListener('click', function (e) {
        var t = e.target.closest('[data-menu-toggle]');
        var menu = root.querySelector('[data-menu]'), sheet = root.querySelector('[data-sheet]');
        if (t && menu) { menu.hidden = !menu.hidden; t.setAttribute('aria-expanded', String(!menu.hidden)); return; }
        if (e.target.closest('[data-more]')) { e.preventDefault(); if (sheet) sheet.hidden = !sheet.hidden; return; }
        if (e.target.closest('[data-signout]')) { UI.auth('logout').then(function () { UI.toast('Signed out. The chair will be here.'); }); }
        if (menu && !menu.hidden && !e.target.closest('[data-menu] .ui-seg')) menu.hidden = true;
        if (sheet && !sheet.hidden && !e.target.closest('[data-sheet] .ui-seg')) sheet.hidden = true;
      });
      document.addEventListener('keydown', function (e) {
        if (e.key !== 'Escape') return;
        var menu = root.querySelector('[data-menu]'), sheet = root.querySelector('[data-sheet]');
        if (menu) menu.hidden = true;
        if (sheet) sheet.hidden = true;
      });
    },
    onTheme: function () {  // redraw the theme buttons and keep the menu or sheet open
      var menu = document.querySelector('[data-menu]'), open = menu && !menu.hidden;
      var sheet = document.querySelector('[data-sheet]'), sopen = sheet && !sheet.hidden;
      UI.renderChrome();
      if (open) document.querySelector('[data-menu]').hidden = false;
      if (sopen) document.querySelector('[data-sheet]').hidden = false;
    }
  };
})();


/* ===== _bm.html ===== */
(function () {
  var BM = window.BM = window.BM || {};
  var esc = UI.esc;

  /* ---------------------------------------------------------------- icons */
  var I = UI.ICONS;
  I.steer = '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="2.5"/><path d="M12 14.5V21M9.6 11.3 3.3 9.6M14.4 11.3l6.3-1.7"/>';
  I.alarm = '<path d="M6 16v-5a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 21h4M3 7.5 5 9M21 7.5 19 9M12 2v2"/>';
  I.engine = '<rect x="4" y="8" width="13" height="10" rx="1.5"/><path d="M8 8V5h5v3M17 11h3v4h-3M2 11v4"/><path d="M11 10l-2 3h3l-2 3"/>';
  I.wiring = '<path d="M9 3v4M15 3v4M7 7h10v4a5 5 0 0 1-10 0z"/><path d="M12 16v5"/>';
  I.fuel = '<rect x="4" y="4" width="9" height="16" rx="1.5"/><path d="M4 10h9M13 8l3 2v7a1.5 1.5 0 0 0 3 0V9l-2.5-3"/>';
  I.exhaust = '<path d="M3 15h6M5 19h8"/><path d="M14 17a3.5 3.5 0 1 0-.5-7 4.5 4.5 0 0 0-8.1 1"/>';
  I.chassis = '<path d="M3 14l2-5h14l2 5v3H3z"/><circle cx="7.5" cy="17.5" r="1.8"/><circle cx="16.5" cy="17.5" r="1.8"/><path d="M7.5 9 9 6h6l1.5 3"/>';
  I.cabin = I.users;
  I.dash = '<path d="M4 17a8 8 0 1 1 16 0"/><path d="M12 17l4-5"/><path d="M6.5 13.5l1 .6M12 9v1M17.5 13.5l-1 .6"/>';
  I.factory = '<path d="M3 21V10l5 3v-3l5 3V6h4l1 5h3v10z"/><path d="M7 17h2M12 17h2M17 17h1"/>';
  I.chair = '<path d="M6 11V7a3 3 0 0 1 3-3h6a3 3 0 0 1 3 3v4"/><path d="M4 11a2 2 0 0 1 2 2v2h12v-2a2 2 0 1 1 2 2v3H4v-3a2 2 0 0 1 0-4z"/><path d="M6 18v2M18 18v2"/>';
  I.wrench = '<path d="M14.5 6.5a4 4 0 0 0-5.3 5.2L3.5 17.4a1.4 1.4 0 0 0 2 2l5.7-5.7a4 4 0 0 0 5.2-5.3l-2.4 2.4-2-2z"/>';
  I.book = '<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 19V5M8 7h7"/>';
  I.brake = '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><path d="M12 9.5v3M12 14.5h.01"/>';
  I.clipboard = '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3h6v1M9 10h6M9 14h6M9 18h3"/>';
  I.phone = '<rect x="7" y="2.5" width="10" height="19" rx="2"/><path d="M11 18h2"/>';
  I.save = '<path d="M6 3h12v18l-6-4-6 4z"/>';
  I.print = '<path d="M7 9V3h10v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M7 14h10v7H7z"/>';
  I.download = '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>';
  I.play = '<path d="M7 5v14l11-7z"/>';
  I.pause = '<path d="M8 5v14M16 5v14"/>';
  I.wind = '<path d="M3 8h10a3 3 0 1 0-3-3M3 12h15a3 3 0 1 1-3 3M3 16h7"/>';
  I.scan = '<path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3"/><path d="M4 12h16"/>';
  I.lamp = '<path d="M7 3h10l-2 7H9z"/><path d="M12 10v8M8 21h8"/>';

  BM.sysIcon = function (sys) { return UI.icon((BM.systemById[sys] || {}).icon || 'sparkle'); };

  /* ---------------------------------------------------------------- crisis: the emergency brake */
  BM.CRISIS = [
    ['US', 'Call or text <a href="tel:988">988</a> (Suicide & Crisis Lifeline) · text HOME to <a href="sms:741741">741741</a>'],
    ['Canada', 'Call or text <a href="tel:988">988</a> · Québec: <a href="tel:18662773553">1-866-APPELLE</a> (277-3553) · young people: Kids Help Phone <a href="tel:18006686868">1-800-668-6868</a>'],
    ['UK & Ireland', 'Samaritans <a href="tel:116123">116 123</a> (free, 24/7) · UK: text SHOUT to <a href="sms:85258">85258</a>'],
    ['Australia', 'Lifeline <a href="tel:131114">13 11 14</a>'],
    ['New Zealand', 'Call or text <a href="tel:1737">1737</a>'],
    ['France', '<a href="tel:3114">3114</a> (numéro national de prévention du suicide)'],
    ['Anywhere', '<a href="https://findahelpline.com" target="_blank" rel="noopener">findahelpline.com</a> lists free helplines in over 130 countries']
  ];
  BM.crisisHtml = function () {
    return '<div class="bm-crisis"><h2>' + UI.icon('brake') + 'Emergency brake</h2>' +
      '<p>If you might act on thoughts of suicide or self-harm, or someone is in danger, <b>call your emergency number now</b>: 911 (US, Canada), 999 (UK), 112 (EU), 000 (Australia), 111 (NZ).</p>' +
      '<div class="bm-urgent">You don’t have to be “bad enough” to call. Crisis lines are free, confidential, and there for exactly this moment.</div>' +
      '<div class="bm-lines">' + BM.CRISIS.map(function (l) { return '<div class="bm-line"><b>' + l[0] + '</b><span>' + l[1] + '</span></div>'; }).join('') + '</div>' +
      '<p class="small muted">Living with abuse? US <a href="tel:18007997233">1-800-799-7233</a> · UK <a href="tel:08082000247">0808 2000 247</a> · Canada <a href="https://sheltersafe.ca" target="_blank" rel="noopener">sheltersafe.ca</a></p>' +
      '<div class="ui-row"><a class="ui-btn" href="#toolbox/safety_plan" data-go="toolbox/safety_plan" data-close>' + UI.icon('clipboard') + 'Make a safety plan</a>' +
      '<a class="ui-btn" href="#toolbox/breath_sigh" data-go="toolbox/breath_sigh" data-close>' + UI.icon('wind') + 'Breathe with me</a></div></div>';
  };
  BM.crisis = function () { return UI.modal(BM.crisisHtml(), { wide: true }); };
  document.addEventListener('click', function (e) {
    if (e.target.closest && e.target.closest('[data-brake]')) { e.preventDefault(); BM.crisis(); }
  });

  BM.plaque = function () {
    return '<div class="bm-plaque"><div class="bm-plaque-in">' + UI.icon('info') +
      '<span class="long"><b>Not a doctor’s office.</b> Nobody here is a doctor. For fun and self-reflection only, never medical advice.</span>' +
      '<span class="short"><b>Not a doctor.</b> Not medical advice.</span><span class="sp"></span>' +
      '<button type="button" class="bm-brake" data-brake>' + UI.icon('brake') + '<span class="long">Emergency brake</span><span class="short">Need help now?</span></button></div></div>';
  };

  BM.note = function (text) {
    return '<div class="bm-note">' + UI.icon('info') + '<p>' + (text || '<b>Nobody here is a doctor.</b> This is for fun and self-reflection, and is in no way medical advice, a diagnosis or treatment. Only a qualified professional who meets you can diagnose anything.') + '</p></div>';
  };

  /* ---------------------------------------------------------------- cards */
  BM.statusBadge = function (st) {
    var s = BM.STATUS[st] || BM.STATUS.concept;
    return '<span class="bm-st ' + esc(st) + '" title="' + esc(s[1]) + '">' + esc(s[0]) + '</span>';
  };
  BM.condCard = function (c, extra) {
    return '<a class="bm-card cond" href="#manual/' + c.id + '" data-go="manual/' + c.id + '"><div class="top"><span class="sysic">' + BM.sysIcon(c.sys) + '</span>' +
      '<span class="bm-code">' + esc(c.code) + '</span>' + BM.statusBadge(c.st) + '</div><h3>' + esc(c.n) + '</h3><p>' + esc(c.line) + '</p>' +
      (extra || '') + '<div class="foot">' + esc(BM.systemById[c.sys].name) + '</div></a>';
  };
  BM.patternCard = function (p, extra) {
    var g = BM.FACTORY_GROUPS.filter(function (x) { return x.id === p.grp; })[0];
    return '<a class="bm-card pattern" href="#factory/' + p.id + '" data-go="factory/' + p.id + '"><div class="top"><span class="sysic">' + UI.icon('factory') + '</span>' +
      '<span class="bm-code">FS · ' + esc(g ? g.name : '') + '</span></div><h3>' + esc(p.n) + '</h3><p>' + esc(p.voice) + '</p>' + (extra || '') + '</a>';
  };
  BM.toolCard = function (t, extra) {
    var cat = BM.TOOL_CATS.filter(function (x) { return x.id === t.cat; })[0];
    return '<a class="bm-card tool" href="#toolbox/' + t.id + '" data-go="toolbox/' + t.id + '"><div class="top"><span class="sysic">' + UI.icon(t.w ? (t.w.indexOf('breath') === 0 ? 'wind' : t.w.indexOf('timer') === 0 ? 'clock' : t.w === 'sheet' ? 'clipboard' : 'wrench') : 'wrench') + '</span>' +
      '<span class="bm-code">' + esc(cat ? cat.name : '') + '</span><span class="bm-st">' + esc(t.time) + '</span></div><h3>' + esc(t.n) + '</h3><p>' + esc(t.line) + '</p>' + (extra || '') + '</a>';
  };
  BM.scanCard = function (s, extra) {
    var kind = s.kind === 'validated' ? '<span class="bm-st dx">Published screener</span>' : s.kind === 'pattern' ? '<span class="bm-st">Pattern check</span>' : '<span class="bm-st occ">Childhood</span>';
    var c = BM.conditionById[s.cond];
    return '<a class="bm-card scan" href="#scan/' + s.id + '" data-go="scan/' + s.id + '"><div class="top"><span class="sysic">' + UI.icon('scan') + '</span>' + kind +
      '<span class="bm-st">' + esc(s.time) + '</span></div><h3>' + esc(s.n) + '</h3><p>' + esc(c ? c.line : '') + '</p>' + (extra || '') + '</a>';
  };
  BM.existing = function (ids, byId) { return (ids || []).map(function (i) { return byId[i]; }).filter(Boolean); };

  /* ---------------------------------------------------------------- lookup engine */
  var STOP = ' i me my mine im i’m the a an and or of to in on at is am are was be been it its this that so too very with about for from just really feel feeling feels always get gets keep keeps can cant can’t dont don’t do does have has why how what when who ';
  var SYN = [
    ['parent', 'parents', 'mom', 'mum', 'mother', 'dad', 'father', 'family', 'childhood', 'upbringing', 'raised', 'mommy', 'daddy', 'stepmom', 'stepdad'],
    ['sad', 'depressed', 'depression', 'down', 'low', 'hopeless', 'empty', 'crying', 'cry'],
    ['anxious', 'anxiety', 'worry', 'worried', 'nervous', 'stress', 'stressed', 'overthinking', 'overthink'],
    ['focus', 'concentrate', 'concentration', 'distracted', 'distraction', 'attention', 'adhd', 'add'],
    ['sleep', 'insomnia', 'awake', 'sleepless', 'night'],
    ['narcissist', 'narcissistic', 'narcissism', 'selfish', 'ego', 'npd', 'narc'],
    ['panic', 'attack', 'attacks', 'heart', 'breathe', 'breathing'],
    ['angry', 'anger', 'rage', 'temper', 'irritable', 'furious', 'mad'],
    ['partner', 'boyfriend', 'girlfriend', 'husband', 'wife', 'relationship', 'spouse', 'ex', 'dating'],
    ['eat', 'eating', 'food', 'binge', 'weight', 'diet'],
    ['drink', 'drinking', 'alcohol', 'booze', 'drunk', 'wine', 'beer', 'alcoholic'],
    ['phone', 'scrolling', 'scroll', 'social', 'instagram', 'tiktok', 'screen', 'doomscrolling'],
    ['lonely', 'alone', 'isolated', 'loneliness', 'friendless'],
    ['trauma', 'traumatic', 'abuse', 'abused', 'ptsd', 'flashback', 'flashbacks'],
    ['work', 'job', 'boss', 'burnout', 'burnt', 'burned', 'career', 'overworked'],
    ['fraud', 'imposter', 'impostor', 'fake'],
    ['autism', 'autistic', 'asperger', 'aspergers', 'spectrum', 'neurodivergent'],
    ['suicide', 'suicidal', 'die', 'dead', 'kill', 'live'],
    ['tired', 'exhausted', 'fatigue', 'energy', 'drained'],
    ['procrastinate', 'procrastination', 'procrastinating', 'lazy', 'motivation', 'unmotivated', 'start'],
    ['guilt', 'guilty', 'shame', 'ashamed', 'worthless'],
    ['boundaries', 'boundary', 'no', 'pleaser', 'pleasing']
  ];
  var synOf = {};
  SYN.forEach(function (g) { g.forEach(function (w) { synOf[stem(w)] = g.map(stem); }); });

  function stem(w) {
    w = w.toLowerCase().replace(/[’']/g, '');
    if (w.length > 5 && /ing$/.test(w)) return w.slice(0, -3);
    if (w.length > 4 && /ed$/.test(w)) return w.slice(0, -2);
    if (w.length > 3 && /s$/.test(w) && !/ss$/.test(w)) return w.slice(0, -1);
    return w;
  }
  function words(s) { return String(s || '').toLowerCase().replace(/[’']/g, '').split(/[^a-z0-9à-ÿ]+/).filter(Boolean); }
  function near(a, b) {
    if (Math.abs(a.length - b.length) > 2) return false;
    var lim = a.length >= 8 ? 2 : 1, prev = [], cur, i, j;
    for (j = 0; j <= b.length; j++) prev[j] = j;
    for (i = 1; i <= a.length; i++) {
      cur = [i]; var best = i;
      for (j = 1; j <= b.length; j++) { cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); best = Math.min(best, cur[j]); }
      if (best > lim) return false;
      prev = cur;
    }
    return prev[b.length] <= lim;
  }
  var INDEX = null;
  function entry(type, id, title, aka, kw, text, obj) {
    var t = words(title).map(stem), a = words(aka + ' ' + kw).map(stem);
    return { type: type, id: id, obj: obj, title: t, aka: a, text: ' ' + words(text).map(stem).join(' ') + ' ', all: t.concat(a) };
  }
  function buildIndex() {
    INDEX = [];
    BM.CONDITIONS.forEach(function (c) {
      INDEX.push(entry('condition', c.id, c.n, (c.aka || []).join(' ') + ' ' + c.code, c.kw || '',
        [c.line, c.signs.join(' '), c.lights.map(function (l) { return (BM.lightById[l] || {}).label || ''; }).join(' '), c.under, BM.systemById[c.sys].name].join(' '), c));
    });
    BM.PATTERNS.forEach(function (p) {
      INDEX.push(entry('pattern', p.id, p.n, (p.aka || []).join(' '), 'parent childhood upbringing family',
        [p.voice, p.looked.join(' '), p.installs.join(' '), p.q].join(' '), p));
    });
    BM.TOOLS.forEach(function (t) { INDEX.push(entry('tool', t.id, t.n, '', 'tool technique exercise how to cope', [t.line, t.steps.join(' '), t.why].join(' '), t)); });
    BM.SCANS.forEach(function (s) { INDEX.push(entry('scan', s.id, s.n, 'test quiz check screen self-test assessment', '', s.intro, s)); });
  }
  /* Ranked matches for free text: [{type, id, obj, score}] */
  BM.search = function (q) {
    if (!INDEX) buildIndex();
    var toks = words(q).filter(function (w) { return STOP.indexOf(' ' + w + ' ') < 0; }).map(stem);
    if (!toks.length) return [];
    var out = [];
    INDEX.forEach(function (e) {
      var total = 0, hits = 0;
      toks.forEach(function (tk) {
        var best = 0;
        (synOf[tk] || [tk]).forEach(function (w) {
          var weight = w === tk ? 1 : 0.6, s = 0;
          if (e.title.indexOf(w) >= 0) s = 10;
          else if (e.aka.indexOf(w) >= 0) s = 7;
          else if (w.length >= 3 && e.all.some(function (x) { return x.indexOf(w) === 0 && w.length >= 4; })) s = 6;
          else if (e.text.indexOf(' ' + w) >= 0) s = 2.5;
          else if (w === tk && w.length >= 5 && e.all.some(function (x) { return x.length >= 4 && near(w, x); })) s = 6;
          best = Math.max(best, s * weight);
        });
        if (best > 0) hits++;
        total += best;
      });
      if (hits) {
        var score = total * (hits / toks.length) * (e.type === 'condition' ? 1.15 : e.type === 'scan' ? 0.8 : 1);
        out.push({ type: e.type, id: e.id, obj: e.obj, score: score });
      }
    });
    return out.sort(function (a, b) { return b.score - a.score; });
  };

  /* Warning lights -> ranked conditions: [{c, hits, of}] */
  BM.rankLights = function (on) {
    if (!on.length) return [];
    var set = {}; on.forEach(function (x) { set[x] = 1; });
    return BM.CONDITIONS.map(function (c) {
      var hits = c.lights.filter(function (l) { return set[l]; });
      return { c: c, hits: hits, of: c.lights.length, score: hits.length + hits.length / c.lights.length };
    }).filter(function (r) { return r.hits.length; }).sort(function (a, b) { return b.score - a.score; });
  };

  /* ---------------------------------------------------------------- results kept on this device (guests and members) */
  BM.local = {
    results: function () { return UI.store.get('results', []); },
    add: function (r) {
      var all = BM.local.results().filter(function (x) { return x.id !== r.id; });
      all.unshift(r); UI.store.set('results', all.slice(0, 40)); return r;
    },
    remove: function (id) { UI.store.set('results', BM.local.results().filter(function (x) { return x.id !== id; })); },
    clear: function () { UI.store.set('results', []); }
  };

  /* ---------------------------------------------------------------- repair plan (needs an account) */
  BM.askAccount = function (why) {
    UI.after = location.hash;
    var m = UI.modal('<h2>Keep a logbook</h2><p class="muted">' + esc(why || 'Your repair plan, gauge readings and saved worksheets live in your private logbook.') +
      ' A free account keeps them safe across devices. Only you see them.</p>' +
      '<div class="ui-row end" style="margin-top:18px"><button class="ui-btn ghost" data-close>Not now</button>' +
      '<a class="ui-btn ghost" href="#auth" data-go="auth" data-close>Sign in</a><a class="ui-btn primary" href="#auth/signup" data-go="auth/signup" data-close>Create a free account</a></div>');
    return m;
  };
  BM.addToPlan = function (kind, ref, btn) {
    if (!UI.me) { BM.askAccount('Add this to your repair plan to keep track of what you’re working on.'); return Promise.resolve(null); }
    return UI.busy(btn, UI.api('plan_add', kind, ref)).then(function (r) {
      UI.toast(r.existed ? 'Already in your repair plan' : 'Added to your repair plan', 'ok');
      if (btn) { btn.innerHTML = UI.icon('check') + 'In your plan'; btn.disabled = true; }
      return r;
    });
  };
  BM.planButton = function (kind, ref) {
    return '<button type="button" class="ui-btn brass" data-plan-add="' + esc(kind) + ':' + esc(ref) + '">' + UI.icon('save') + 'Add to my repair plan</button>';
  };
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-plan-add]');
    if (!b) return;
    e.preventDefault();
    var p = b.getAttribute('data-plan-add').split(':');
    BM.addToPlan(p[0], p[1], b);
  });

  /* ---------------------------------------------------------------- gauges */
  BM.gaugeSvg = function (o) {
    // o: {value, max, label, unit, invert (true = high is bad), shown}
    var max = o.max || 10, v = Math.max(0, Math.min(max, o.value == null ? 0 : o.value)), f = v / max;
    var ang = -120 + f * 240, r = 60, cx = 80, cy = 72;
    function pt(a, rr) { var t = (a - 90) * Math.PI / 180; return [cx + rr * Math.cos(t), cy + rr * Math.sin(t)]; }
    function arc(a0, a1, rr) { var p0 = pt(a0, rr), p1 = pt(a1, rr); return 'M' + p0[0].toFixed(1) + ' ' + p0[1].toFixed(1) + ' A' + rr + ' ' + rr + ' 0 ' + (a1 - a0 > 180 ? 1 : 0) + ' 1 ' + p1[0].toFixed(1) + ' ' + p1[1].toFixed(1); }
    var zones = o.invert ? ['var(--c-lamp)', 'var(--c-accent)', 'var(--c-bad)'] : ['var(--c-bad)', 'var(--c-accent)', 'var(--c-lamp)'];
    var ticks = '';
    for (var i = 0; i <= 10; i++) { var a = -120 + i * 24, p0 = pt(a, r - 10), p1 = pt(a, r - (i % 5 ? 4 : 0)); ticks += '<line x1="' + p0[0].toFixed(1) + '" y1="' + p0[1].toFixed(1) + '" x2="' + p1[0].toFixed(1) + '" y2="' + p1[1].toFixed(1) + '" stroke="var(--c-muted)" stroke-width="' + (i % 5 ? 1 : 2) + '"/>'; }
    var tip = pt(ang, r - 14);
    return '<div class="bm-gauge"><svg viewBox="0 0 160 112" role="img" aria-label="' + esc(o.label + ': ' + (o.shown || v)) + '">' +
      '<rect x="1" y="1" width="158" height="110" rx="20" fill="var(--c-surface-2)" stroke="var(--c-line)"/>' +
      '<path d="' + arc(-120, -40, r) + '" stroke="' + zones[0] + '" stroke-width="7" fill="none" opacity=".8"/>' +
      '<path d="' + arc(-40, 40, r) + '" stroke="' + zones[1] + '" stroke-width="7" fill="none" opacity=".8"/>' +
      '<path d="' + arc(40, 120, r) + '" stroke="' + zones[2] + '" stroke-width="7" fill="none" opacity=".8"/>' + ticks +
      '<line x1="80" y1="72" x2="' + tip[0].toFixed(1) + '" y2="' + tip[1].toFixed(1) + '" stroke="var(--c-brand)" stroke-width="3.5" stroke-linecap="round" class="needle"/>' +
      '<circle cx="80" cy="72" r="7" fill="var(--c-accent)" stroke="var(--c-wood)" stroke-width="2"/>' +
      '<text x="80" y="104" text-anchor="middle" font-family="JetBrains Mono, monospace" font-size="15" font-weight="700" fill="var(--c-ink)">' + esc(o.shown != null ? o.shown : v) + (o.unit ? esc(o.unit) : '') + '</text>' +
      '</svg><span class="lbl">' + esc(o.label) + '</span></div>';
  };
})();

/* ===== _bmd_conditions.html ===== */
(function () {
  var BM = window.BM = window.BM || {};

  BM.STATUS = {
    dx: ['Recognised diagnosis', 'Listed in both DSM-5-TR and ICD-11, the two manuals clinicians diagnose from.'],
    dsm: ['Recognised diagnosis', 'Listed in DSM-5-TR, the American diagnostic manual.'],
    icd: ['ICD-11 diagnosis', 'Listed in the World Health Organization’s ICD-11.'],
    occ: ['Occupational phenomenon', 'In ICD-11 as a work problem, not as a medical condition.'],
    spec: ['A pattern, not a separate diagnosis', 'Clinicians add it as a “specifier” to another diagnosis.'],
    concept: ['Popular concept', 'A useful idea from psychology or self-help, not a formal diagnosis.'],
    trait: ['Personality trait', 'A way some people are built, not a disorder.'],
    urgent: ['Needs help now', 'Don’t wait on this one: talk to someone today.']
  };

  BM.SYSTEMS = [
    { id: 'steer', code: 'ST', name: 'Steering & Focus', part: 'Attention, planning and getting things done', icon: 'steer' },
    { id: 'alarm', code: 'AL', name: 'Alarm System', part: 'Fear, worry, panic and trauma', icon: 'alarm' },
    { id: 'engine', code: 'EN', name: 'Engine & Mood', part: 'Drive, energy, low and high moods', icon: 'engine' },
    { id: 'wiring', code: 'WR', name: 'Wiring & Sensors', part: 'Neurodivergence and sensitivity', icon: 'wiring' },
    { id: 'fuel', code: 'FL', name: 'Fuel & Rest', part: 'Sleep, food and body image', icon: 'fuel' },
    { id: 'exhaust', code: 'EX', name: 'Exhaust & Leaks', part: 'Habits, compulsions and addictions', icon: 'exhaust' },
    { id: 'chassis', code: 'CH', name: 'Chassis', part: 'Personality: the long-standing frame', icon: 'chassis' },
    { id: 'cabin', code: 'CB', name: 'Cabin & Passengers', part: 'Relationships and attachment', icon: 'cabin' },
    { id: 'dash', code: 'DB', name: 'Dashboard', part: 'Self-image, anger and perception', icon: 'dash' },
    { id: 'factory', code: 'FS', name: 'Factory Settings', part: 'What childhood installed', icon: 'factory' }
  ];

  /* Warning lights: [id, label, system]. `crisis` lights open the emergency brake. */
  BM.LIGHTS = [
    ['f_distract', 'Easily distracted, even by my own thoughts', 'steer'],
    ['f_finish', 'Start lots of things, finish few', 'steer'],
    ['f_lose', 'Lose keys, phone, track of deadlines', 'steer'],
    ['f_restless', 'Restless and fidgety, can’t sit through things', 'steer'],
    ['f_impulse', 'Blurt out, interrupt, decide or buy on impulse', 'steer'],
    ['f_time', 'Time blindness: always late or underestimating', 'steer'],
    ['f_hyper', 'Hyperfocus for hours on things I find interesting', 'steer'],
    ['f_procrast', 'Put things off until panic kicks in', 'steer'],
    ['f_scroll', 'Can’t stop scrolling, even when it feels bad', 'steer'],
    ['a_worry', 'Worry that won’t switch off', 'alarm'],
    ['a_panic', 'Sudden waves of panic: racing heart, can’t breathe', 'alarm'],
    ['a_avoid', 'Avoid places or situations because of fear', 'alarm'],
    ['a_judged', 'Terrified of being judged or embarrassed', 'alarm'],
    ['a_intrusive', 'Unwanted thoughts or images that get stuck', 'alarm'],
    ['a_ritual', 'Check, count, clean or redo until it “feels right”', 'alarm'],
    ['a_flash', 'Flashbacks or nightmares about something that happened', 'alarm'],
    ['a_startle', 'Jumpy, on guard, always scanning for danger', 'alarm'],
    ['a_body', 'Convinced something is wrong with my health', 'alarm'],
    ['a_tense', 'Tight muscles, clenched jaw, tension headaches', 'alarm'],
    ['m_low', 'Low, empty or hopeless most days', 'engine'],
    ['m_joy', 'Things I used to enjoy feel flat', 'engine'],
    ['m_tired', 'Exhausted no matter how much I rest', 'engine'],
    ['m_worth', 'Feel worthless or guilty', 'engine'],
    ['m_high', 'Spells of unusual energy, little sleep, racing plans', 'engine'],
    ['m_season', 'My mood drops in the dark months', 'engine'],
    ['m_cynic', 'Cynical and detached about my work', 'engine'],
    ['m_grief', 'Can’t move on from a loss', 'engine'],
    ['m_irrit', 'Short fuse, irritable over small things', 'engine'],
    ['m_cycle', 'Mood crashes in a monthly cycle', 'engine'],
    ['m_death', 'Thoughts of death or not wanting to be here', 'engine', 'crisis'],
    ['w_social', 'Social rules feel like a foreign language', 'wiring'],
    ['w_sensory', 'Lights, sounds or textures overwhelm me', 'wiring'],
    ['w_routine', 'Changes in routine throw me off badly', 'wiring'],
    ['w_interest', 'Deep, intense special interests', 'wiring'],
    ['w_mask', 'Exhausted from “performing normal”', 'wiring'],
    ['w_deep', 'Feel everything deeply, overstimulated easily', 'wiring'],
    ['w_sounds', 'Certain sounds (chewing, sniffing) make me furious', 'wiring'],
    ['s_sleep', 'Can’t fall asleep or stay asleep', 'fuel'],
    ['s_late', 'Stay up late just to get some “me time”', 'fuel'],
    ['e_binge', 'Eat large amounts and feel out of control', 'fuel'],
    ['e_restrict', 'Restrict food or “make up for” eating', 'fuel'],
    ['e_body', 'Obsessed with a flaw in how I look', 'fuel'],
    ['h_drink', 'Drink more than I mean to', 'exhaust'],
    ['h_use', 'Use substances to cope or switch off', 'exhaust'],
    ['h_cant_stop', 'Keep doing something despite promising to stop', 'exhaust'],
    ['h_gamble', 'Chase losses or hide how much I bet', 'exhaust'],
    ['h_pick', 'Pick my skin or pull my hair', 'exhaust'],
    ['h_game', 'Gaming eats my sleep, work or people', 'exhaust'],
    ['h_sex', 'Sexual urges or porn feel out of my control', 'exhaust'],
    ['p_special', 'Need admiration; feel special or entitled', 'chassis'],
    ['p_empathy', 'Other people’s feelings feel like their problem', 'chassis'],
    ['p_abandon', 'Terrified of being abandoned', 'chassis'],
    ['p_unstable', 'Intense, stormy relationships', 'chassis'],
    ['p_empty', 'Chronic emptiness', 'chassis'],
    ['p_identity', 'Don’t really know who I am', 'chassis'],
    ['p_shy', 'Avoid people for fear of rejection', 'chassis'],
    ['p_rigid', 'Rules, order and control matter more than ease', 'chassis'],
    ['p_selfharm', 'Urges to hurt myself', 'chassis', 'crisis'],
    ['r_clingy', 'Need constant reassurance in relationships', 'cabin'],
    ['r_distant', 'Pull away when people get close', 'cabin'],
    ['r_rescue', 'My mood depends on fixing other people', 'cabin'],
    ['r_walk', 'Walk on eggshells around someone', 'cabin'],
    ['r_doubt', 'Someone makes me doubt my own memory', 'cabin'],
    ['r_cant_leave', 'Can’t leave someone who hurts me', 'cabin'],
    ['r_lonely', 'Lonely, even around people', 'cabin'],
    ['d_critic', 'A harsh inner critic', 'dash'],
    ['d_fraud', 'Feel like a fraud about to be found out', 'dash'],
    ['d_please', 'Can’t say no; everyone else’s needs come first', 'dash'],
    ['d_rage', 'Anger explodes out of proportion', 'dash'],
    ['d_unreal', 'Feel detached, like watching myself in a film', 'dash'],
    ['d_numb', 'Emotionally numb', 'dash'],
    ['d_perfect', 'Nothing I do is ever good enough', 'dash'],
    ['d_shame', 'A deep sense that something is wrong with me', 'dash'],
    ['d_voices', 'Hearing or seeing things others don’t, or feeling watched', 'dash'],
    ['d_world', 'Worry about the world (climate, news) eats at me', 'dash']
  ];

  /* The repair manual. Each entry: id, code, n (name), sys, st (status), aka, line (one-liner), lights,
     signs (how it shows up), under (under the hood), myth [myth, truth], mix (often confused with),
     pro (what professionals do), diy (self-repair), tools (toolbox ids), see (take it in when),
     stat (how common + source), scan (self-check id), kw (extra search words). */
  BM.CONDITIONS = [
    // ------------------------------------------------------------------------------------- Steering & Focus
    { id: 'adhd', code: 'ST-01', n: 'ADHD', sys: 'steer', st: 'dx', aka: ['Attention-deficit/hyperactivity disorder', 'ADD'],
      line: 'A brain whose attention and brakes are run by interest and urgency, not importance.',
      lights: ['f_distract', 'f_finish', 'f_lose', 'f_restless', 'f_impulse', 'f_time', 'f_hyper', 'f_procrast', 'm_irrit'],
      signs: ['Drifting off mid-conversation or mid-page, then rereading', 'Piles: of laundry, tabs, half-done projects', 'Being “lazy” about boring tasks but tireless on fascinating ones', 'Chronic lateness and “where did the afternoon go?”', 'Interrupting, impulse buys, quick temper that passes fast', 'An inner restlessness even when you sit still'],
      under: 'ADHD is a neurodevelopmental condition: it starts in childhood and is strongly genetic (heritability around 70–80%). The brain’s self-management system (attention, working memory, inhibition, sense of time) runs on interest, novelty, challenge and urgency. Importance alone doesn’t switch it on. That’s why the same person can hyperfocus for six hours and still miss the electricity bill.',
      myth: ['Everyone is a bit ADHD these days.', 'Everyone gets distracted. ADHD means it has been there since childhood, in more than one area of life, and it costs you: jobs, relationships, money, safety.'],
      mix: ['anxiety', 'depression', 'autism', 'insomnia', 'execdys', 'bipolar'],
      pro: 'A psychiatrist, psychologist or specialist clinic takes a detailed history (often with school reports or someone who knew you as a child) and uses rating scales. Treatment usually combines medication (stimulants such as methylphenidate or amphetamines are among the most effective treatments in psychiatry; non-stimulants exist), CBT adapted for adult ADHD, coaching and practical adjustments at work or school.',
      diy: ['Make it visible: what isn’t in front of you doesn’t exist. Use one capture list, wall calendars, alarms with labels.', 'Borrow urgency: a timer, a body double, a deadline with a real person attached.', 'Shrink the start: the first two minutes are the hard part.', 'Protect sleep and exercise: both measurably sharpen attention.', 'Forgive the backlog. Shame makes the paralysis worse, not better.'],
      tools: ['body_double', 'pomodoro', 'external_brain', 'two_minute', 'implementation', 'phone_friction'],
      see: ['It is costing you jobs, grades, money or relationships', 'You drive distracted or take risky impulsive decisions', 'You also have low mood, anxiety or substance use (very common alongside ADHD)'],
      stat: 'About 2.6% of adults worldwide have ADHD that persisted from childhood, and 6.8% have significant adult symptoms (Song et al., Journal of Global Health, 2021).',
      scan: 'adhd', kw: 'focus concentrate attention distracted hyperactive add executive forgetful late messy' },

    { id: 'execdys', code: 'ST-02', n: 'Chronic procrastination & executive dysfunction', sys: 'steer', st: 'concept', aka: ['Task paralysis', 'Wall of awful'],
      line: 'Knowing exactly what to do, wanting to do it, and still not being able to start.',
      lights: ['f_procrast', 'f_finish', 'f_time', 'd_perfect', 'd_critic'],
      signs: ['Staring at the task, then cleaning the kitchen instead', 'Last-minute all-nighters that “work” and so keep happening', 'Feeling frozen by tasks with many unclear steps', 'Guilt-scrolling instead of resting or working'],
      under: 'Procrastination is mostly an emotion-regulation problem, not a time-management one: the task carries a bad feeling (boredom, fear of failing, confusion), and avoiding it gives instant relief. Executive dysfunction is the wider picture of struggling to plan, start, switch and finish. It shows up in ADHD, autism, depression, anxiety, burnout and after poor sleep.',
      myth: ['Procrastinators are lazy.', 'Lazy people don’t feel tortured by undone tasks. Procrastinators usually care a lot, and that’s part of the jam.'],
      mix: ['adhd', 'depression', 'perfectionism', 'burnout'],
      pro: 'If it is new or severe, a professional looks for what’s underneath: ADHD, depression, anxiety, sleep problems. CBT for procrastination and ACT (acting with values while feelings are uncomfortable) both have good evidence.',
      diy: ['Name the feeling the task gives you, then make the first step smaller than the feeling.', 'Write the very next physical action (“open the doc and type the title”), not the project.', 'Use “ugly first drafts”: permission to do it badly.', 'Pair a dreaded task with something pleasant (music, a café).'],
      tools: ['two_minute', 'pomodoro', 'implementation', 'self_compassion', 'body_double'],
      see: ['It is new and came with low mood or exhaustion', 'It has gone on for years and looks like the ADHD signs'],
      stat: 'Around 20% of adults describe themselves as chronic procrastinators (Ferrari and colleagues, several studies since 2005); procrastination is tied to stress and poorer health (Sirois, 2015).',
      scan: 'adhd', kw: 'procrastinate cant start paralysis motivation lazy stuck deadline' },

    { id: 'attention', code: 'ST-03', n: 'Fragmented attention (“popcorn brain”)', sys: 'steer', st: 'concept', aka: ['Doomscrolling', 'Digital distraction'],
      line: 'An attention span trained in 40-second bursts by screens that never run out.',
      lights: ['f_scroll', 'f_distract', 's_late', 'h_cant_stop'],
      signs: ['Reaching for the phone in every pause, even at red lights', 'Reading the first paragraph of everything and the end of nothing', 'Feeling foggy and restless after long scrolling', 'Struggling to watch a film without a second screen'],
      under: 'Feeds are built on variable rewards: the next swipe might be great, so the brain keeps checking. Researcher Gloria Mark measured how long people stay on one screen before switching: about 2.5 minutes in 2004, about 47 seconds by the 2020s. Constant switching leaves “attention residue”, so the next task feels harder.',
      myth: ['My attention span is just broken now.', 'Attention is trainable. People recover deep focus within weeks when they add friction to the phone and practise single-tasking.'],
      mix: ['adhd', 'phoneuse', 'anxiety'],
      pro: 'Usually no professional is needed. If you can’t cut down despite real effort, or it hides low mood or anxiety, a therapist can help with both.',
      diy: ['Add friction: log out, move apps off the home screen, grayscale after 9 pm.', 'Single-task in short sprints, phone in another room.', 'Keep “boredom reps”: queue or walk without the phone.', 'Swap one feed for one long-form thing a day: a chapter, a podcast, a walk.'],
      tools: ['phone_friction', 'pomodoro', 'urge_surf'],
      see: ['Scrolling has replaced sleep most nights', 'You use it to avoid feelings that then come back worse'],
      stat: 'Average time on one screen before switching fell from about 150 seconds (2004) to about 47 seconds (Gloria Mark, “Attention Span”, 2023).',
      scan: 'phone', kw: 'scrolling tiktok reels phone screen attention span short' },

    // ------------------------------------------------------------------------------------- Alarm System
    { id: 'gad', code: 'AL-01', n: 'Generalised anxiety disorder', sys: 'alarm', st: 'dx', aka: ['GAD', 'Chronic worry'],
      line: 'A smoke alarm that goes off for toast, the weather, emails and everyone’s health, all day.',
      lights: ['a_worry', 'a_tense', 's_sleep', 'm_irrit', 'm_tired', 'f_distract'],
      signs: ['Worry that jumps from topic to topic', 'Feeling you must worry to stay prepared', 'Muscle tension, headaches, stomach trouble', 'Trouble sleeping because the mind won’t stop', 'Reassurance-seeking and over-planning'],
      under: 'The brain’s threat system overestimates danger and underestimates your ability to cope. Worry feels useful (“if I think about it, I’m ready”), and when nothing bad happens, the worry gets the credit. Diagnosis needs excessive, hard-to-control worry on most days for at least 6 months, with physical symptoms.',
      myth: ['Worrying helps me be prepared.', 'Problem-solving helps. Worry repeats the problem without solving it, and research finds it mostly keeps anxiety going.'],
      mix: ['panic', 'health', 'depression', 'adhd', 'ocd'],
      pro: 'CBT is the first-line treatment; applied relaxation and mindfulness-based approaches also work. SSRI or SNRI medication helps many people. A GP may check thyroid, caffeine intake and other physical causes first.',
      diy: ['Schedule worry: 15 minutes a day, same time, write it down; outside it, postpone.', 'Sort worries: “can I act on this today?” If yes, act. If no, practise letting it float.', 'Cut caffeine for two weeks and notice.', 'Move: aerobic exercise is a real anxiety treatment.', 'Practise tolerating uncertainty in small ways (send the email without rereading it five times).'],
      tools: ['worry_time', 'breath_slow', 'defusion', 'ground_54321', 'movement'],
      see: ['Worry fills most of your day for months', 'You avoid things or can’t work because of it', 'You use alcohol or pills to switch it off'],
      stat: 'About 5.7% of US adults have GAD at some point in their lives (Kessler et al., National Comorbidity Survey Replication, 2005).',
      scan: 'gad7', kw: 'anxiety anxious worry nervous overthinking tension' },

    { id: 'panic', code: 'AL-02', n: 'Panic attacks & panic disorder', sys: 'alarm', st: 'dx', aka: ['Anxiety attacks'],
      line: 'The fire alarm screams with no fire, and then you start fearing the alarm itself.',
      lights: ['a_panic', 'a_avoid', 'a_body', 'a_startle'],
      signs: ['A surge of terror that peaks within minutes', 'Pounding heart, breathlessness, dizziness, tingling, chest tightness', 'Feeling you’re dying, going crazy or losing control', 'Avoiding places where an attack happened or escape is hard (agoraphobia)'],
      under: 'A panic attack is the body’s fight-or-flight response firing at full power without a real threat. It is uncomfortable but not dangerous. Panic disorder is when attacks come out of the blue and you start fearing the next one: the fear of the sensations keeps the cycle going.',
      myth: ['A panic attack can make me faint or have a heart attack.', 'Panic raises blood pressure, which makes fainting unlikely, and it passes on its own, usually within 10 to 20 minutes. Do get new chest pain checked once by a doctor.'],
      mix: ['gad', 'health', 'ptsd', 'social'],
      pro: 'CBT for panic, including “interoceptive exposure” (deliberately bringing on harmless sensations like a fast heartbeat until they lose their scariness), has very strong evidence. SSRIs also help. A doctor rules out heart, thyroid and other causes once.',
      diy: ['Ride it out instead of fighting it: “This is panic. It peaks and passes.”', 'Slow the exhale (in for 4, out for 6–8).', 'Stop escaping: stay where you are until it fades, so the brain learns it’s safe.', 'Practise the sensations on purpose: spin in a chair, run on the spot.'],
      tools: ['breath_sigh', 'breath_slow', 'ground_54321', 'exposure_ladder'],
      see: ['You avoid shops, transport or leaving home', 'Attacks come several times a week', 'You have chest pain that hasn’t been checked by a doctor'],
      stat: 'About 4.7% of US adults have panic disorder in their lifetime; many more have an occasional panic attack (Kessler et al., 2005).',
      scan: 'panic', kw: 'panic attack heart racing cant breathe chest dizzy agoraphobia' },

    { id: 'social', code: 'AL-03', n: 'Social anxiety', sys: 'alarm', st: 'dx', aka: ['Social anxiety disorder', 'Social phobia'],
      line: 'Feeling like there’s a spotlight and a panel of judges in every room.',
      lights: ['a_judged', 'a_avoid', 'p_shy', 'd_critic', 'a_panic'],
      signs: ['Dreading parties, phone calls, meetings, eating in front of others', 'Replaying conversations for days', 'Blushing, shaking or sweating and fearing people notice', 'Safety behaviours: rehearsing, staying quiet, holding a drink to hide shaking'],
      under: 'The brain treats social judgement like a physical threat. Attention turns inward (“how do I look?”), which makes you less present and more awkward, which seems to confirm the fear. Safety behaviours feel protective but stop you learning that people mostly aren’t judging that hard.',
      myth: ['It’s just being shy.', 'Shyness is a temperament. Social anxiety disorder is fear intense enough to shrink your life: skipped classes, turned-down jobs, no dating.'],
      mix: ['avoidant', 'autism', 'panic', 'selfesteem'],
      pro: 'Cognitive therapy for social anxiety (Clark and Wells model) is one of the most effective therapies in psychology. SSRIs help too. Group CBT works well.',
      diy: ['Drop one safety behaviour at a time and see what really happens.', 'Turn attention outward: get curious about the other person.', 'Build an exposure ladder from easy (asking a shop assistant something) to hard.', 'Remember the spotlight effect: people notice us far less than we think.'],
      tools: ['exposure_ladder', 'thought_record', 'breath_slow', 'self_compassion'],
      see: ['You avoid work, study or relationships because of it', 'You drink to get through social situations'],
      stat: 'About 12% of US adults meet criteria for social anxiety disorder in their lifetime (Kessler et al., 2005).',
      scan: 'social', kw: 'shy judged embarrassed blush public speaking awkward people' },

    { id: 'phobia', code: 'AL-04', n: 'Specific phobias', sys: 'alarm', st: 'dx', aka: ['Fear of flying, heights, spiders, needles…'],
      line: 'One very specific trigger wired straight to the panic button.',
      lights: ['a_avoid', 'a_panic'],
      signs: ['Instant fear of one thing: heights, flying, needles, dogs, vomit, driving', 'Going far out of your way to avoid it', 'Knowing it’s out of proportion and still not being able to stop'],
      under: 'The brain has learnt a strong link between a thing and danger. Every avoidance strengthens the link a little more. The good news: phobias respond to exposure faster than almost anything in mental health.',
      myth: ['You’re born with phobias, so they can’t change.', 'Some people are more prone, but in studies a single 3-hour session of guided exposure clears many phobias (Öst’s one-session treatment).'],
      mix: ['panic', 'ocd', 'ptsd'],
      pro: 'Exposure therapy with a psychologist, sometimes in one long session or using virtual reality. Needle phobia with fainting uses a special “applied tension” technique.',
      diy: ['Make a ladder from slightly uncomfortable to terrifying, and climb slowly.', 'Stay with each step until the fear drops by about half.', 'Practise often: daily short exposures beat weekly long ones.'],
      tools: ['exposure_ladder', 'breath_slow', 'urge_surf'],
      see: ['It stops you getting medical care (needles, dentists)', 'It limits work or travel you need'],
      stat: 'About 12.5% of US adults have a specific phobia at some point (Kessler et al., 2005).',
      scan: null, kw: 'fear phobia flying heights spiders needles dogs vomit emetophobia' },

    { id: 'health', code: 'AL-05', n: 'Health anxiety', sys: 'alarm', st: 'dx', aka: ['Illness anxiety disorder', 'Hypochondria'],
      line: 'A check-engine light that’s permanently on, and a mechanic’s manual open on every symptom.',
      lights: ['a_body', 'a_worry', 'a_panic'],
      signs: ['Searching symptoms online and ending on the worst case', 'Checking the body: lumps, pulse, moles', 'Reassurance from doctors helps for a day, then fades', 'Or the opposite: avoiding doctors out of fear'],
      under: 'Normal body noises get read as signs of disease. Checking and reassurance bring relief, so the brain learns it needs more checking. It’s a loop, not a character flaw, and it’s very treatable.',
      myth: ['If I stop checking, I’ll miss something serious.', 'Agreed check-ups with a doctor catch real problems. Constant checking mostly finds normal variation, and pressing a lump daily can even make it sore.'],
      mix: ['gad', 'panic', 'ocd'],
      pro: 'CBT for health anxiety has strong evidence, including online versions. A GP who agrees a plan for regular, scheduled check-ups (instead of urgent visits) helps a lot.',
      diy: ['Ban symptom-searching for two weeks and notice the anxiety drop.', 'Cut checking gradually: once a day, then once a week.', 'Write down predictions (“this headache is a tumour”) and check later how often they came true.'],
      tools: ['worry_time', 'thought_record', 'urge_surf', 'defusion'],
      see: ['You have a new, persistent or severe symptom (always get it checked once)', 'Health worry fills hours of your day'],
      stat: 'Health anxiety affects roughly 1 in 20 people, and many more people visiting their doctor (several surveys; Tyrer and colleagues).',
      scan: 'gad7', kw: 'hypochondria cancer tumor symptoms googling body checking disease' },

    { id: 'ocd', code: 'AL-06', n: 'OCD', sys: 'alarm', st: 'dx', aka: ['Obsessive-compulsive disorder'],
      line: 'A doubt that hijacks the alarm, and rituals that turn it off for a minute.',
      lights: ['a_intrusive', 'a_ritual', 'a_worry', 'a_avoid'],
      signs: ['Unwanted, disturbing thoughts: harming someone, contamination, sex, religion, “what if I’m a bad person?”', 'Rituals to undo them: washing, checking, counting, praying, mentally reviewing', 'Needing things “just right”', 'Asking for reassurance again and again', 'Rituals eating an hour or more a day'],
      under: 'Everyone has odd intrusive thoughts. In OCD the brain treats them as important and dangerous, and compulsions bring short relief, which teaches the brain the thought really was a threat. The thoughts go against what the person wants (that’s why they’re so upsetting): having a harm thought doesn’t mean you want to harm.',
      myth: ['OCD means being neat and organised.', 'OCD is about fear and doubt, not tidiness. Many people with OCD aren’t tidy at all. “I’m so OCD” about a colour-coded desk isn’t it.'],
      mix: ['gad', 'ocpd', 'health', 'autism'],
      pro: 'Exposure and response prevention (ERP), a form of CBT, is the gold-standard therapy. SSRIs, often at higher doses, help too. Look for a therapist trained in ERP specifically: general talk therapy can accidentally feed the reassurance loop.',
      diy: ['Label it: “That’s an OCD thought,” not “I’m a terrible person.”', 'Delay the ritual by 5 minutes, then 10, then 20.', 'Stop asking for reassurance, and ask loved ones (kindly) to stop giving it.', 'Don’t try to push thoughts away: agree to have them.'],
      tools: ['exposure_ladder', 'defusion', 'urge_surf'],
      see: ['Rituals take over an hour a day', 'You avoid people, places or tasks because of the thoughts', 'You feel hopeless about the thoughts'],
      stat: 'About 2–3% of people have OCD in their lifetime (Ruscio et al., Molecular Psychiatry, 2010). People wait on average years before getting proper treatment.',
      scan: 'ocd', kw: 'intrusive thoughts checking washing hands contamination rituals counting pure o' },

    { id: 'ptsd', code: 'AL-07', n: 'PTSD', sys: 'alarm', st: 'dx', aka: ['Post-traumatic stress disorder'],
      line: 'The alarm got stuck on after something terrible, as if it’s still happening.',
      lights: ['a_flash', 'a_startle', 'a_avoid', 'd_numb', 's_sleep', 'm_irrit', 'd_unreal'],
      signs: ['Intrusive memories, nightmares or flashbacks', 'Avoiding reminders, places, people, even thoughts', 'Feeling on guard, jumpy, unable to relax', 'Feeling numb, cut off, guilty or ashamed', 'Starting after an event involving death, serious injury or sexual violence (experienced, witnessed or learned about)'],
      under: 'After trauma, memories can be stored as raw sensory fragments instead of a story with an ending. Reminders trigger them as if the danger is now. Avoidance keeps the memory unprocessed. Most people exposed to trauma do not develop PTSD; for those who do, it is one of the most treatable conditions with the right therapy.',
      myth: ['Only soldiers get PTSD.', 'Car crashes, assaults, medical emergencies, births and sudden losses cause PTSD too, and women are about twice as likely as men to develop it.'],
      mix: ['cptsd', 'panic', 'depression', 'dpdr'],
      pro: 'Trauma-focused therapies have the strongest evidence: Cognitive Processing Therapy (CPT), Prolonged Exposure (PE), EMDR and trauma-focused CBT. Some medications help. A good trauma therapist goes at a pace you can manage.',
      diy: ['Ground in the present when triggered: name five things you see.', 'Keep a steady routine: sleep, meals, movement.', 'Reduce alcohol: it worsens sleep and nightmares.', 'Tell one safe person what happened, if and when you’re ready.'],
      tools: ['ground_54321', 'breath_slow', 'safety_plan', 'sleep_window'],
      see: ['Symptoms last more than a month after the event', 'You’re using substances to cope', 'You have thoughts of suicide (get help today)'],
      stat: 'About 6.8% of US adults develop PTSD in their lifetime (Kessler et al., 2005).',
      scan: 'pcptsd5', kw: 'trauma flashback nightmare assault accident veteran triggered' },

    { id: 'cptsd', code: 'AL-08', n: 'Complex PTSD', sys: 'alarm', st: 'icd', aka: ['C-PTSD', 'Developmental trauma'],
      line: 'PTSD plus a rewired sense of self, after trauma that went on and on.',
      lights: ['a_flash', 'a_startle', 'd_shame', 'p_unstable', 'd_numb', 'r_cant_leave', 'd_please', 'p_identity'],
      signs: ['All the PTSD signs, plus:', 'Big emotional swings or shutting down completely', 'A deep belief that you are worthless, broken or to blame', 'Trouble trusting and staying close to people', 'Usually after long or repeated trauma: abuse in childhood, domestic violence, captivity'],
      under: 'ICD-11 added complex PTSD in 2019 (DSM-5-TR doesn’t list it separately). It describes what happens when danger came from people you couldn’t escape, often people who were meant to protect you. The nervous system learnt to stay on alert, and the self-image formed around surviving.',
      myth: ['It’s the same as borderline personality disorder.', 'They overlap, and people are sometimes misdiagnosed. Fear of abandonment and self-harm point more to BPD; a steady sense of shame and avoidance of relationships fit C-PTSD. A specialist can tell them apart.'],
      mix: ['ptsd', 'bpd', 'depression', 'cen'],
      pro: 'Trauma-focused therapies (CPT, PE, EMDR) work for complex PTSD too, sometimes with a first phase that builds stabilisation and emotion skills (e.g. STAIR). Schema therapy and compassion-focused therapy can help with shame.',
      diy: ['Learn your window of tolerance: notice when you go too high (panic) or too low (numb).', 'Practise self-compassion even when it feels fake.', 'Build safe relationships slowly: one reliable person matters a lot.'],
      tools: ['ground_54321', 'self_compassion', 'reparent', 'boundary_script', 'safety_plan'],
      see: ['You recognise long-term childhood or relationship abuse in your story', 'Dissociation, self-harm or suicidal thoughts'],
      stat: 'Population surveys find complex PTSD in about 1–8% of adults, more often than PTSD alone after childhood abuse (Cloitre and colleagues, 2019).',
      scan: 'pcptsd5', kw: 'childhood trauma abuse complex developmental shame cptsd' },

    // ------------------------------------------------------------------------------------- Engine & Mood
    { id: 'suicidal', code: 'EN-00', n: 'Thoughts of suicide', sys: 'engine', st: 'urgent', aka: ['Suicidal ideation', 'Wanting to disappear'],
      line: 'When the pain is bigger than the resources you have right now. That gap can be closed.',
      lights: ['m_death', 'm_low', 'm_worth', 'p_selfharm'],
      signs: ['Thinking people would be better off without you', 'Wishing you could fall asleep and not wake up', 'Making plans, giving things away, saying goodbyes', 'Feeling trapped, like a burden, with no way out'],
      under: 'Suicidal thoughts usually come from unbearable pain plus hopelessness, not from wanting to die as such. They rise and fall, often within hours. Crises pass, and most people who survive a suicide attempt do not go on to die by suicide. Talking about it openly does not put the idea in someone’s head: it helps.',
      myth: ['Asking someone about suicide might give them the idea.', 'Research shows asking directly does not increase risk, and often brings relief. If you’re worried about someone, ask plainly.'],
      mix: ['depression', 'bipolar', 'bpd'],
      pro: 'Crisis lines (988 in the US and Canada, 116 123 Samaritans in the UK and Ireland) are free and anonymous. A doctor, therapist or emergency department can help you stay safe and treat what’s underneath. Treatments such as CBT for suicide prevention and DBT reduce suicide attempts.',
      diy: ['Tell someone today. Use the emergency brake button at the top of this page.', 'Make the place safer: put distance between you and means (medicines, weapons).', 'Write a safety plan: warning signs, things that help, people to call.', 'Get through the next hour, not the next year.'],
      tools: ['safety_plan', 'tipp', 'ground_54321'],
      see: ['Now. If you have a plan or intent, call your emergency number (911, 999, 112, 000) or a crisis line.'],
      stat: 'In the US, about 5% of adults seriously consider suicide in a given year (SAMHSA NSDUH). It is common, and help works.',
      scan: 'phq9', kw: 'suicide suicidal kill myself end it die dont want to live better off dead' },

    { id: 'depression', code: 'EN-01', n: 'Depression', sys: 'engine', st: 'dx', aka: ['Major depressive disorder', 'Clinical depression'],
      line: 'The engine still turns over, but there’s no power, and the dashboard says everything’s your fault.',
      lights: ['m_low', 'm_joy', 'm_tired', 'm_worth', 's_sleep', 'f_distract', 'd_numb', 'm_irrit', 'm_death'],
      signs: ['Low or empty mood, or losing interest in almost everything', 'Sleeping much more or much less', 'Heavy tiredness; even showers feel like work', 'Guilt, worthlessness, harsh self-talk', 'Slowed thinking, poor concentration', 'Appetite changes', 'Thoughts of death'],
      under: 'Depression is more than sadness. It changes sleep, energy, thinking and motivation. The withdrawal it causes (cancelling plans, staying in bed) feels like rest but cuts off the things that would lift mood, so the engine winds down further. Diagnosis needs five of nine symptoms (including low mood or loss of interest) for at least two weeks.',
      myth: ['You just need to snap out of it.', 'Depression changes how the brain processes reward and effort. Nobody snaps out of it, but most people get much better with treatment.'],
      mix: ['bipolar', 'pdd', 'burnout', 'grief', 'adjustment'],
      pro: 'Talk therapies (CBT, behavioural activation, interpersonal therapy) and antidepressants all work; combining them is best for moderate to severe depression. A GP checks thyroid, anaemia and medications. If antidepressants make you agitated, sleepless or “high”, tell your doctor: it can be a sign of bipolar.',
      diy: ['Act first, feel later: schedule small, doable activities, especially ones with mastery or pleasure.', 'Get daylight and movement every day, even 10 minutes.', 'Keep a regular wake-up time.', 'Reach out to one person, even by text.', 'Notice the “depression voice” and don’t take it as fact.'],
      tools: ['behav_activation', 'movement', 'thought_record', 'self_compassion', 'social_dose'],
      see: ['Two weeks or more of these symptoms', 'You struggle with work, study or basic care', 'Any thoughts of suicide (today)'],
      stat: 'About 8% of US adults have a major depressive episode in a given year (SAMHSA NSDUH 2021: 8.3%); globally depression is a leading cause of disability (WHO).',
      scan: 'phq9', kw: 'depressed sad down hopeless empty unmotivated no energy cry' },

    { id: 'pdd', code: 'EN-02', n: 'Persistent depressive disorder', sys: 'engine', st: 'dx', aka: ['Dysthymia', 'Chronic low mood'],
      line: 'A low grey hum that has been there so long it feels like your personality.',
      lights: ['m_low', 'm_tired', 'm_worth', 'm_joy'],
      signs: ['Low mood on more days than not, for two years or more', 'Low energy, low self-esteem, hopelessness', '“I’ve always been like this”', 'Getting by, but never quite well'],
      under: 'PDD is depression that lasts. It can be milder than major depression day to day, but because it’s long, it shapes your expectations of life. People often don’t seek help because it feels normal to them.',
      myth: ['It’s just my personality.', 'Many people with persistent depression are surprised how different life feels after treatment.'],
      mix: ['depression', 'cen', 'selfesteem'],
      pro: 'Combined therapy and medication work best. CBASP (a therapy designed for chronic depression) and CBT have evidence.',
      diy: ['Track your mood for a month: patterns show what helps.', 'Treat small pleasures as medicine, not reward.', 'Question the story “this is just who I am”.'],
      tools: ['behav_activation', 'gauge_log', 'self_compassion', 'values'],
      see: ['Low mood most days for two years', 'It has deepened recently'],
      stat: 'About 3% of people have persistent depressive disorder over their lifetime (Kessler and colleagues).',
      scan: 'phq9', kw: 'dysthymia always sad grey chronic low' },

    { id: 'bipolar', code: 'EN-03', n: 'Bipolar disorder', sys: 'engine', st: 'dx', aka: ['Manic depression', 'Bipolar I', 'Bipolar II'],
      line: 'An engine that idles in the red zone for days, then stalls for weeks.',
      lights: ['m_high', 'm_low', 's_sleep', 'f_impulse', 'm_irrit', 'm_death'],
      signs: ['Periods of feeling “wired”, needing little sleep but not tired', 'Racing thoughts, talking fast, huge plans', 'Risky spending, sex, driving or business decisions', 'Then depressive episodes', 'Episodes last days to weeks, unlike moment-to-moment mood swings'],
      under: 'Bipolar disorder involves episodes of mania (bipolar I: at least a week, often severe) or hypomania (bipolar II: at least 4 days, milder) alongside depression. It is strongly genetic. Hypomania can feel great, so people often only seek help for the lows and get treated for depression alone.',
      myth: ['Bipolar means quick mood swings within a day.', 'Bipolar moods come in episodes lasting days to weeks. Fast changes within hours point more to other things (BPD, ADHD, stress).'],
      mix: ['depression', 'bpd', 'adhd', 'substances'],
      pro: 'A psychiatrist diagnoses it. Mood stabilisers (lithium has decades of evidence and lowers suicide risk), some antipsychotics, psychoeducation and regular daily rhythms (interpersonal and social rhythm therapy). Antidepressants alone can trigger mania, which is why diagnosis matters.',
      diy: ['Protect sleep like medication: lost sleep can trigger episodes.', 'Track mood and sleep daily to spot early warning signs.', 'Agree a plan with someone you trust for when you’re going high.', 'Limit alcohol and drugs.'],
      tools: ['gauge_log', 'sleep_window', 'safety_plan'],
      see: ['You’ve had days of very high energy and little sleep', 'Anyone in your family has bipolar and you’re depressed', 'You’re making risky decisions you’d normally avoid'],
      stat: 'Bipolar disorders affect about 2.4% of people over a lifetime across the spectrum (Merikangas et al., World Mental Health Survey, 2011).',
      scan: 'mood_high', kw: 'manic mania hypomania mood swings high low euphoric' },

    { id: 'seasonal', code: 'EN-04', n: 'Seasonal depression', sys: 'engine', st: 'spec', aka: ['Seasonal affective disorder', 'SAD', 'Winter blues'],
      line: 'A battery that drains as the days get shorter.',
      lights: ['m_season', 'm_low', 'm_tired', 'm_joy'],
      signs: ['Low mood that starts in autumn or winter and lifts in spring', 'Oversleeping, craving carbs, weight gain', 'Withdrawing socially (“hibernating”)'],
      under: 'Less daylight shifts the body clock and serotonin and melatonin rhythms. In DSM-5-TR it’s a “seasonal pattern” of depression or bipolar disorder rather than a separate diagnosis. It is more common further from the equator.',
      myth: ['It’s just the winter blues.', 'The milder “blues” are common. Seasonal depression is the full clinical picture, returning every year, and it responds well to treatment.'],
      mix: ['depression', 'bipolar'],
      pro: 'Bright-light therapy (a 10,000-lux light box for 20–30 minutes in the morning) is a first-line treatment, along with CBT adapted for SAD and antidepressants. Ask a doctor before light therapy if you have bipolar disorder or eye conditions.',
      diy: ['Get outside in the morning, even when it’s cloudy.', 'Keep a regular sleep schedule through winter.', 'Plan winter things to look forward to.', 'Move every day.'],
      tools: ['behav_activation', 'movement', 'gauge_log'],
      see: ['The pattern repeats every winter', 'It affects work or relationships'],
      stat: 'Estimates range from 1–2% in southern US states to around 9–10% in Alaska and northern countries (Rosen et al., 1990, and later surveys).',
      scan: 'phq9', kw: 'winter darkness seasonal sad light' },

    { id: 'burnout', code: 'EN-05', n: 'Burnout', sys: 'engine', st: 'occ', aka: ['Work burnout', 'Occupational burnout'],
      line: 'Running the engine at full throttle for so long it overheated.',
      lights: ['m_tired', 'm_cynic', 'm_irrit', 'f_distract', 's_sleep', 'm_joy'],
      signs: ['Exhaustion that a weekend doesn’t fix', 'Cynicism and distance from your job (“why bother?”)', 'Feeling ineffective even when you work hard', 'Sunday-night dread', 'Getting sick more often'],
      under: 'The World Health Organization’s ICD-11 defines burnout (code QD85) as a syndrome from chronic workplace stress that hasn’t been managed, with three parts: exhaustion, mental distance from the job, and reduced professional efficacy. It’s about work specifically. It overlaps a lot with depression, so it’s worth checking both.',
      myth: ['Burnout is solved by a vacation.', 'Rest helps, but if the conditions (workload, lack of control, unfairness, values clash) don’t change, it usually comes back within weeks.'],
      mix: ['depression', 'adjustment', 'gad'],
      pro: 'A doctor can check for depression and physical causes and may sign time off. Therapy helps with boundaries and recovery; workplace changes matter most.',
      diy: ['Name the cause: workload, control, reward, community, fairness or values (the six areas from burnout research by Maslach and Leiter).', 'Negotiate one concrete change at work.', 'Create a hard stop at the end of the day.', 'Rebuild with things that refill you, not just switch you off.'],
      tools: ['boundary_script', 'values', 'movement', 'sleep_window', 'self_compassion'],
      see: ['You can’t function at work or home', 'Low mood spreads beyond work', 'Physical symptoms: chest pain, constant illness'],
      stat: 'Burnout became an ICD-11 occupational phenomenon in 2019 (WHO). Large surveys regularly find a third or more of workers reporting high burnout symptoms.',
      scan: 'burnout', kw: 'work stress exhausted job overworked tired cynical quit' },

    { id: 'grief', code: 'EN-06', n: 'Grief & prolonged grief', sys: 'engine', st: 'dx', aka: ['Prolonged grief disorder', 'Complicated grief'],
      line: 'Grief is love with nowhere to go. Sometimes it gets stuck in park.',
      lights: ['m_grief', 'm_low', 'd_numb', 'p_identity'],
      signs: ['Intense longing or preoccupation with the person, most days', 'Feeling part of you died; not knowing who you are now', 'Disbelief, avoidance of reminders, or not being able to stop going over it', 'Life feeling meaningless more than a year after the loss'],
      under: 'Grief is not a disorder. It comes in waves, and over time most people move between facing the loss and rebuilding life (the “dual process” model). Prolonged grief disorder (added to ICD-11 and DSM-5-TR in 2022) is when intense grief stays at full strength long after the loss, 12 months in DSM-5-TR (6 in ICD-11), and gets in the way of life.',
      myth: ['There are five neat stages of grief.', 'The stages were never meant as a fixed order. Most people zig-zag, and many never go through some of them.'],
      mix: ['depression', 'ptsd', 'adjustment'],
      pro: 'Prolonged grief disorder therapy (developed by Katherine Shear) has good evidence. Grief counselling and support groups help many people.',
      diy: ['Allow both: time with the grief, and time to live.', 'Keep a connection: letters, rituals, telling their stories.', 'Expect hard days (anniversaries, holidays) and plan for them.'],
      tools: ['expressive_writing', 'self_compassion', 'social_dose', 'behav_activation'],
      see: ['Grief is still all-consuming after a year', 'You wish to die to be with them', 'You’ve stopped eating, working or caring for yourself'],
      stat: 'About 1 in 10 bereaved adults develop prolonged grief (Lundorff et al., meta-analysis, 2017).',
      scan: 'grief', kw: 'loss death bereavement mourning widow loss of parent miss' },

    { id: 'adjustment', code: 'EN-07', n: 'Adjustment disorder', sys: 'engine', st: 'dx', aka: ['Stress response'],
      line: 'A big pothole knocked the alignment out, and it hasn’t settled back yet.',
      lights: ['m_low', 'a_worry', 's_sleep', 'm_irrit'],
      signs: ['Stress or low mood that starts within three months of a big change (breakup, job loss, move, diagnosis)', 'Reaction feels bigger than you’d expect, or gets in the way of life', 'Usually improves within six months once things settle'],
      under: 'It’s one of the most common diagnoses in outpatient care, and one of the most hopeful: it’s tied to a stressor and tends to resolve. Support during the transition can stop it sliding into depression.',
      myth: ['If it’s caused by a real problem, it’s not a mental health issue.', 'Struggling with a real problem is normal, and getting support for it is sensible, not weak.'],
      mix: ['depression', 'gad', 'grief', 'burnout'],
      pro: 'Short-term therapy (problem-solving therapy, CBT, counselling). Medication is rarely the first step.',
      diy: ['Break the problem into the next small action.', 'Keep routines: meals, sleep, movement.', 'Talk it through with people you trust.'],
      tools: ['problem_solve', 'behav_activation', 'social_dose'],
      see: ['It’s getting worse, not better, after a few months', 'You have thoughts of self-harm'],
      stat: 'Adjustment disorder is diagnosed in up to around 1 in 5 people in outpatient mental health settings (Casey, 2009).',
      scan: null, kw: 'breakup divorce job loss moving change stress' },

    { id: 'perinatal', code: 'EN-08', n: 'Perinatal & postpartum depression', sys: 'engine', st: 'spec', aka: ['Postnatal depression', 'PPD'],
      line: 'Not the “baby blues”: the engine stalls when everyone expects you to be glowing.',
      lights: ['m_low', 'a_worry', 'a_intrusive', 's_sleep', 'm_worth'],
      signs: ['Low mood, anxiety or numbness during pregnancy or in the year after', 'Not feeling bonded, and guilt about it', 'Frightening intrusive thoughts about the baby being harmed', 'Can affect partners (including fathers) too'],
      under: 'Up to 80% of new mothers get the “baby blues” (tearful, overwhelmed) in the first two weeks, which pass on their own. Postpartum depression is longer and stronger. Hormone shifts, sleep loss, birth experience and support all play a part. Intrusive harm thoughts are common and usually a sign of anxiety, not danger.',
      myth: ['Having scary thoughts about the baby means I’m dangerous.', 'Unwanted harm thoughts are very common in new parents and come with horror. That’s anxiety. Do tell a professional: they hear it often and help.'],
      mix: ['depression', 'ocd', 'gad'],
      pro: 'Midwives, GPs and health visitors screen for it. Therapy, peer support and medication (some antidepressants are compatible with breastfeeding; newer drugs such as zuranolone are approved for PPD in the US) all help. Postpartum psychosis (confusion, hallucinations, very rare) is an emergency.',
      diy: ['Protect sleep in shifts with a partner or helper.', 'Tell someone how you really feel.', 'Accept practical help: meals, laundry, holding the baby.'],
      tools: ['social_dose', 'self_compassion', 'breath_slow'],
      see: ['Low mood lasting more than two weeks after birth', 'Thoughts of harming yourself', 'Confusion, hallucinations or not sleeping at all (emergency)'],
      stat: 'About 1 in 7 women experience perinatal depression (ACOG and many studies).',
      scan: 'phq9', kw: 'postpartum postnatal pregnancy baby blues new mom mother' },

    { id: 'pmdd', code: 'EN-09', n: 'PMDD', sys: 'engine', st: 'dx', aka: ['Premenstrual dysphoric disorder'],
      line: 'A monthly software update that installs rage, despair and anxiety, then uninstalls itself.',
      lights: ['m_cycle', 'm_irrit', 'm_low', 'a_worry'],
      signs: ['Strong mood symptoms in the week before a period that ease within days after it starts', 'Irritability, anger, conflict', 'Depression, anxiety, feeling out of control', 'Much stronger than ordinary PMS'],
      under: 'PMDD is thought to be an unusual brain sensitivity to normal hormone changes, not abnormal hormone levels. Tracking two cycles is part of diagnosis.',
      myth: ['It’s just bad PMS.', 'PMDD can be disabling, and it carries a raised risk of suicidal thoughts. It is a recognised diagnosis with effective treatments.'],
      mix: ['depression', 'bipolar', 'bpd'],
      pro: 'SSRIs (sometimes only in the second half of the cycle), certain hormonal contraceptives and CBT. A GP or gynaecologist can help; IAPMD.org has resources.',
      diy: ['Track mood with your cycle for two months.', 'Plan lighter weeks before your period.', 'Exercise, sleep and less alcohol/caffeine in that phase.'],
      tools: ['gauge_log', 'self_compassion', 'tipp'],
      see: ['Monthly symptoms disrupt work or relationships', 'Suicidal thoughts in that phase'],
      stat: 'PMDD affects about 3–8% of people who menstruate (several estimates; DSM-5-TR gives 1.8–5.8% for strict criteria).',
      scan: null, kw: 'period menstrual cycle pms hormones' },

    // ------------------------------------------------------------------------------------- Wiring & Sensors
    { id: 'autism', code: 'WR-01', n: 'Autism', sys: 'wiring', st: 'dx', aka: ['Autism spectrum disorder', 'ASD', 'Asperger’s'],
      line: 'A different operating system: not broken, but running in a world built for another one.',
      lights: ['w_social', 'w_sensory', 'w_routine', 'w_interest', 'w_mask', 'r_lonely', 'a_judged'],
      signs: ['Social conversation feels like guesswork; small talk exhausts you', 'Strong sensory reactions: noise, light, labels, food textures', 'Needing routine and predictability; distress at sudden change', 'Deep, focused interests', 'Masking: copying others to fit in, then crashing at home', 'Shutdowns or meltdowns when overloaded'],
      under: 'Autism is a lifelong neurodevelopmental difference in how the brain processes social information and sensory input. Many adults, especially women and people with good verbal skills, were missed as children and find out later, often after burnout from years of masking. It is a spectrum of needs, not a scale from mild to severe.',
      myth: ['Autistic people don’t feel empathy.', 'Many autistic people feel intense empathy. The difficulty is often reading signals and the “double empathy problem”: autistic and non-autistic people misread each other both ways.'],
      mix: ['adhd', 'social', 'ocd', 'hsp', 'avoidant'],
      pro: 'Adult assessment by a psychologist, psychiatrist or specialist team: developmental history, interviews and tools such as the ADOS-2. Autism isn’t treated away; support covers accommodations, sensory adjustments, occupational therapy, autism-informed therapy for anxiety or depression, and community.',
      diy: ['Map your sensory needs: earplugs, sunglasses, soft clothes are tools, not quirks.', 'Plan recovery time after social events.', 'Script tricky situations in advance.', 'Find autistic community writing and spaces: many people feel understood for the first time.'],
      tools: ['sensory_kit', 'boundary_script', 'self_compassion', 'values'],
      see: ['You recognise yourself and want clarity', 'You’re in autistic burnout: loss of skills, exhaustion', 'Anxiety or depression on top'],
      stat: 'About 1 in 31 eight-year-olds in the US were identified as autistic in 2022 (CDC ADDM, 2025); about 2.2% of US adults are estimated to be autistic (CDC, 2020).',
      scan: 'autism', kw: 'autistic asperger spectrum masking meltdown shutdown sensory social' },

    { id: 'hsp', code: 'WR-02', n: 'Highly sensitive person', sys: 'wiring', st: 'trait', aka: ['Sensory processing sensitivity', 'HSP'],
      line: 'Sensors set to high resolution: you notice more, and you fill up faster.',
      lights: ['w_deep', 'w_sensory', 'a_worry', 'm_tired'],
      signs: ['Strongly affected by noise, crowds, caffeine, violent films', 'Noticing small details and others’ moods', 'Needing time alone to recharge after busy days', 'Deep reactions to art, music, nature'],
      under: 'Psychologist Elaine Aron described this trait in 1996. Research suggests sensitive people are more affected by environments both ways: worse in harsh ones, better than average in supportive ones. It’s a temperament, not a disorder, though it overlaps with anxiety and autism.',
      myth: ['Being sensitive is a weakness.', 'Sensitivity comes with strengths: empathy, conscientiousness, depth. The issue is usually overload, which can be managed.'],
      mix: ['autism', 'gad', 'social'],
      pro: 'No diagnosis is needed. If overwhelm leads to anxiety or low mood, therapy for those helps.',
      diy: ['Schedule downtime like an appointment.', 'Reduce input: headphones, fewer tabs, quieter routes.', 'Say no to some events without guilt.'],
      tools: ['sensory_kit', 'boundary_script', 'breath_slow'],
      see: ['Overwhelm turns into persistent anxiety or low mood'],
      stat: 'Studies estimate roughly 20–30% of people are highly sensitive (Lionetti et al., 2018).',
      scan: 'hsp', kw: 'sensitive overwhelmed overstimulated empath introvert' },

    { id: 'misophonia', code: 'WR-03', n: 'Misophonia', sys: 'wiring', st: 'concept', aka: ['Sound rage'],
      line: 'Chewing noises trigger the alarm system as if someone pulled the fire handle.',
      lights: ['w_sounds', 'd_rage', 'a_avoid'],
      signs: ['Instant anger or disgust at specific sounds: chewing, breathing, sniffing, tapping', 'Avoiding meals with family', 'Feeling guilty about how strong the reaction is'],
      under: 'Misophonia isn’t a formal diagnosis yet, but experts agreed a definition in 2022 (Swedo and colleagues). Trigger sounds fire a fight-or-flight response. It often starts in late childhood.',
      myth: ['People with misophonia are just being rude.', 'The reaction is automatic and distressing for the person who has it.'],
      mix: ['autism', 'hsp', 'ocd'],
      pro: 'CBT for misophonia showed good results in a 2020 trial (Jager and colleagues). An audiologist can help with sound tools.',
      diy: ['Use background sound or noise-cancelling headphones at meals.', 'Explain it calmly to people you live with.', 'Calm the body after a trigger with a long exhale.'],
      tools: ['sensory_kit', 'breath_sigh', 'anger_timeout'],
      see: ['It is breaking relationships or keeping you at home'],
      stat: 'Surveys suggest clinically significant misophonia in roughly 5% of adults (Vitoratou et al., 2023).',
      scan: null, kw: 'chewing sounds noise rage triggered misophonia' },

    // ------------------------------------------------------------------------------------- Fuel & Rest
    { id: 'insomnia', code: 'FL-01', n: 'Insomnia', sys: 'fuel', st: 'dx', aka: ['Insomnia disorder', 'Can’t sleep'],
      line: 'The bed has become a place where the engine revs instead of idling.',
      lights: ['s_sleep', 'a_worry', 'm_tired', 'm_irrit', 'f_distract'],
      signs: ['Trouble falling asleep, staying asleep or waking too early', 'At least three nights a week for three months (chronic)', 'Lying awake watching the clock', 'Dreading bedtime'],
      under: 'Insomnia often starts with a stressful patch and then keeps itself going: you spend long hours in bed trying to sleep, and the brain learns “bed = awake and frustrated”. Trying harder to sleep makes it worse.',
      myth: ['I should stay in bed longer to catch up.', 'Long hours in bed make sleep lighter and more broken. CBT-I often starts by shortening time in bed.'],
      mix: ['gad', 'depression', 'adhd', 'bedtime'],
      pro: 'CBT for insomnia (CBT-I) is the first-line treatment recommended by the American College of Physicians, ahead of sleeping pills. Digital CBT-I programmes work too. A doctor checks for sleep apnoea, restless legs and medication effects.',
      diy: ['Get up at the same time every day, even after a bad night.', 'Only go to bed when sleepy; if awake ~20 minutes, get up and do something dull in dim light.', 'Use the bed only for sleep (and sex).', 'Cut caffeine after midday.'],
      tools: ['sleep_window', 'worry_time', 'breath_slow', 'wind_down'],
      see: ['It has gone on for three months', 'Loud snoring, gasping or daytime sleepiness (possible sleep apnoea)'],
      stat: 'About 10% of adults have chronic insomnia disorder, and about a third have some insomnia symptoms (Morin & Jarrin, 2022).',
      scan: 'insomnia', kw: 'sleep sleepless awake night tired insomnia' },

    { id: 'bedtime', code: 'FL-02', n: 'Revenge bedtime procrastination', sys: 'fuel', st: 'concept', aka: ['Staying up for me-time'],
      line: 'Stealing back the hours the day took from you, and paying for them tomorrow.',
      lights: ['s_late', 'f_scroll', 'm_tired', 'f_procrast'],
      signs: ['Knowing you should sleep but scrolling until 1 am', 'Feeling the evening is the only time that belongs to you', 'Tired every morning, repeat every night'],
      under: 'The term spread in 2020 from a Chinese expression about working long hours. When the day has no free time, late night feels like the only freedom. It’s a sign the day needs more “you” in it, not that you lack willpower.',
      myth: ['I just need more discipline.', 'The fix is usually a little guilt-free free time earlier in the day.'],
      mix: ['insomnia', 'attention', 'burnout', 'adhd'],
      pro: 'Usually not needed. If you can’t sleep even when you try, see the insomnia entry.',
      diy: ['Put 20 minutes of “mine” time into the early evening.', 'Charge the phone outside the bedroom.', 'Set a wind-down alarm an hour before bed.'],
      tools: ['wind_down', 'phone_friction', 'sleep_window'],
      see: ['Sleep loss is affecting safety (driving tired)'],
      stat: 'In one Dutch study, about three-quarters of people reported going to bed later than intended at least some of the time (Kroese et al., 2014).',
      scan: 'insomnia', kw: 'night owl scrolling late bedtime me time' },

    { id: 'binge', code: 'FL-03', n: 'Binge eating', sys: 'fuel', st: 'dx', aka: ['Binge eating disorder', 'BED', 'Emotional eating'],
      line: 'The fuel tank gets flooded in a rush, then shame drains the battery.',
      lights: ['e_binge', 'd_shame', 'm_low', 'h_cant_stop'],
      signs: ['Eating a very large amount in a short time and feeling out of control', 'Eating fast, alone, past full', 'Shame and secrecy afterwards', 'Without regular purging (that would point to bulimia)'],
      under: 'Binge eating disorder is the most common eating disorder. Strict dieting is a common trigger: restriction makes the body and brain push back hard. Emotions (stress, loneliness, boredom) also set binges off.',
      myth: ['It’s a willpower problem.', 'It’s a recognised disorder with effective treatment. More restriction usually makes it worse.'],
      mix: ['bulimia', 'depression', 'adhd'],
      pro: 'CBT for eating disorders (CBT-E) and guided self-help have strong evidence. Some medications (in the US, lisdexamfetamine is approved for BED) can help. A doctor checks physical health.',
      diy: ['Eat regularly: three meals and two or three snacks. Skipping meals sets up binges.', 'Drop the “good food / bad food” rules.', 'Have a plan for urges: delay, leave the kitchen, call someone.'],
      tools: ['urge_surf', 'halt', 'self_compassion', 'thought_record'],
      see: ['Binges happen weekly', 'Shame or secrecy around eating'],
      stat: 'Binge eating disorder affects about 2.8% of US adults over a lifetime, more than anorexia and bulimia combined (Hudson et al., 2007).',
      scan: 'eating', kw: 'binge overeating food emotional eating out of control' },

    { id: 'bulimia', code: 'FL-04', n: 'Bulimia nervosa', sys: 'fuel', st: 'dx', aka: ['Bulimia'],
      line: 'A cycle of flooding the tank and draining it, which damages the engine.',
      lights: ['e_binge', 'e_restrict', 'e_body', 'd_shame'],
      signs: ['Binges followed by making up for them: vomiting, laxatives, fasting, over-exercising', 'Self-worth tied heavily to shape and weight', 'Often at a normal weight, so hidden from others'],
      under: 'Purging upsets body chemistry (potassium, heart rhythm) and teeth. The restrict-binge-purge cycle feeds itself. Recovery is very possible.',
      myth: ['You can tell if someone has an eating disorder by their size.', 'Most people with eating disorders are not underweight.'],
      mix: ['binge', 'anorexia', 'bdd'],
      pro: 'CBT-E is first-line. Medical monitoring matters. SSRIs (fluoxetine) can help.',
      diy: ['Tell a doctor: this needs professional help.', 'Eat regular meals to break the cycle.', 'Find support (Beat in the UK, NEDIC in Canada, ANAD in the US).'],
      tools: ['urge_surf', 'self_compassion'],
      see: ['Any purging: see a doctor', 'Dizziness, palpitations or fainting (urgent)'],
      stat: 'About 1% of women and 0.5% of men have bulimia in their lifetime (Hudson et al., 2007).',
      scan: 'eating', kw: 'purging vomiting laxatives bulimia' },

    { id: 'anorexia', code: 'FL-05', n: 'Anorexia nervosa', sys: 'fuel', st: 'dx', aka: ['Anorexia'],
      line: 'Running the engine on fumes, while the fuel gauge lies about being full.',
      lights: ['e_restrict', 'e_body', 'p_rigid', 'd_perfect'],
      signs: ['Severely restricting food', 'Intense fear of gaining weight', 'Seeing yourself as larger than you are', 'Rigid food rules and rituals'],
      under: 'Anorexia has one of the highest death rates of any mental illness. Starvation itself changes thinking, making it harder to see the problem. It often starts in adolescence, and early treatment changes outcomes a lot.',
      myth: ['It’s a choice or a diet gone too far.', 'It’s a serious illness with genetic and metabolic factors (Watson et al., 2019).'],
      mix: ['bulimia', 'ocd', 'ocpd', 'autism'],
      pro: 'Specialist eating-disorder teams. Family-based treatment for teenagers; CBT-E, MANTRA and specialist supportive clinical management for adults; medical monitoring.',
      diy: ['This one needs professional care. Tell a doctor or a trusted person.', 'If you’re worried about someone: speak up gently and focus on feelings, not weight.'],
      tools: ['self_compassion', 'safety_plan'],
      see: ['Now, if you are losing weight through restriction', 'Fainting, chest pain or feeling very cold (urgent)'],
      stat: 'Anorexia affects up to about 1–4% of women over a lifetime and has one of the highest mortality rates in psychiatry (van Eeden et al., 2021).',
      scan: 'eating', kw: 'restricting not eating thin weight loss anorexia' },

    { id: 'bdd', code: 'FL-06', n: 'Body dysmorphic disorder', sys: 'fuel', st: 'dx', aka: ['BDD', 'Body dysmorphia'],
      line: 'A mirror that zooms in on one flaw until it fills the screen.',
      lights: ['e_body', 'a_ritual', 'd_shame', 'a_avoid', 'a_judged'],
      signs: ['Hours a day thinking about a perceived flaw others barely notice', 'Mirror checking or avoiding mirrors', 'Comparing, camouflaging, asking for reassurance', 'Seeking cosmetic procedures that don’t bring relief'],
      under: 'BDD is related to OCD: an obsession about appearance and repetitive behaviours to deal with it. Research shows people with BDD process faces in extra detail. Cosmetic procedures rarely help and can make it worse.',
      myth: ['It’s vanity.', 'It’s painful, and it carries a high risk of depression and suicidal thoughts.'],
      mix: ['ocd', 'social', 'anorexia'],
      pro: 'CBT with exposure and response prevention, and perceptual retraining; SSRIs.',
      diy: ['Set limits on mirror time and selfies.', 'Notice comparing and gently redirect.', 'Speak to a doctor before any cosmetic procedure.'],
      tools: ['exposure_ladder', 'defusion', 'self_compassion'],
      see: ['Appearance worries take an hour or more a day', 'You avoid going out because of them'],
      stat: 'About 2% of people have BDD (Veale et al., 2016).',
      scan: null, kw: 'appearance ugly mirror flaw dysmorphia looks' },

    // ------------------------------------------------------------------------------------- Exhaust & Leaks
    { id: 'alcohol', code: 'EX-01', n: 'Alcohol use problems', sys: 'exhaust', st: 'dx', aka: ['Alcohol use disorder', 'Drinking problem'],
      line: 'A leak you top up every night, until the leak runs the car.',
      lights: ['h_drink', 'h_cant_stop', 'h_use', 'a_worry', 's_sleep'],
      signs: ['Drinking more or longer than you meant to', 'Trying to cut down and not managing', 'Needing more for the same effect', 'Drinking to cope with stress, anxiety or sleep', 'Hangovers getting in the way of life'],
      under: 'Alcohol use disorder ranges from mild to severe (DSM-5-TR lists 11 signs; 2 or more in a year counts). Alcohol calms anxiety for an evening and increases it the next day, which sets up a loop. Many people cut down successfully, with or without labels.',
      myth: ['You’re either an alcoholic or you’re fine.', 'Drinking problems sit on a spectrum. Cutting down early is easier, and you don’t need to hit “rock bottom”.'],
      mix: ['substances', 'gad', 'depression', 'acoa'],
      pro: 'Medications (naltrexone, acamprosate, others) reduce cravings and relapse but are underused. CBT, motivational interviewing and mutual help (AA, SMART Recovery) all have evidence. Important: if you drink heavily every day, don’t stop suddenly without medical advice. Withdrawal can cause seizures.',
      diy: ['Track every drink for two weeks.', 'Set alcohol-free days.', 'Find a replacement ritual for the “first drink” moment.', 'Notice HALT: hungry, angry, lonely, tired.'],
      tools: ['urge_surf', 'halt', 'delay_distract', 'values'],
      see: ['You get shaky, sweaty or anxious when you stop (see a doctor before quitting)', 'You score 4+ (men) or 3+ (women) on the AUDIT-C'],
      stat: 'About 10% of US adults had an alcohol use disorder in the past year (SAMHSA NSDUH 2023).',
      scan: 'auditc', kw: 'drinking alcohol wine beer drunk hangover sober' },

    { id: 'substances', code: 'EX-02', n: 'Substance use', sys: 'exhaust', st: 'dx', aka: ['Drug use', 'Cannabis use disorder', 'Substance use disorder'],
      line: 'Using something to switch the dashboard off, until you can’t switch it back on without it.',
      lights: ['h_use', 'h_cant_stop', 'm_low', 'a_worry'],
      signs: ['Using more often or in larger amounts', 'Cravings, failed attempts to cut down', 'Giving up activities for it', 'Using in risky situations'],
      under: 'Substances hijack the brain’s reward system. Cannabis is often seen as harmless, but about 3 in 10 people who use it have some degree of cannabis use disorder (CDC), and high-potency use in young people is linked to psychosis. Opioids carry overdose risk: carry naloxone if anyone around you uses.',
      myth: ['Addiction is a moral failure.', 'It’s a health condition shaped by genes, stress and environment, and treatment works as well as for other chronic illnesses.'],
      mix: ['alcohol', 'adhd', 'ptsd', 'depression'],
      pro: 'Medications for opioid use disorder (buprenorphine, methadone) cut deaths sharply. Motivational interviewing, CBT, contingency management and peer support help for many substances.',
      diy: ['Be honest about how much and why.', 'Change routines that lead to use.', 'Line up support before you cut down.'],
      tools: ['urge_surf', 'halt', 'delay_distract', 'social_dose'],
      see: ['You can’t cut down despite trying', 'Withdrawal symptoms', 'Overdose risk: seek help today'],
      stat: 'About 3 in 10 people who use cannabis have cannabis use disorder (CDC).',
      scan: null, kw: 'drugs weed cannabis marijuana cocaine opioids pills addiction' },

    { id: 'gambling', code: 'EX-03', n: 'Gambling problems', sys: 'exhaust', st: 'dx', aka: ['Gambling disorder', 'Sports betting'],
      line: 'A slot machine wired straight into the fuel line.',
      lights: ['h_gamble', 'h_cant_stop', 'a_worry', 'm_low'],
      signs: ['Chasing losses', 'Betting more to get the same thrill', 'Lying about how much you gamble', 'Borrowing money or missing bills', 'Restless when trying to stop'],
      under: 'Gambling uses the same reward systems as drugs: near misses and unpredictable wins are powerful. Phone betting apps put a casino in every pocket. Gambling disorder carries a raised risk of suicide, often tied to debt and shame.',
      myth: ['I can win it back.', 'The house edge means the longer you play, the more you lose. Chasing is the disorder talking.'],
      mix: ['substances', 'adhd', 'bipolar'],
      pro: 'CBT has the strongest evidence; Gamblers Anonymous and specialist services (GamCare in the UK, 1-800-GAMBLER in the US) help. Debt advice is part of recovery.',
      diy: ['Self-exclude from betting sites and use blocking software.', 'Hand over financial control temporarily to someone you trust.', 'Tell one person the real numbers.'],
      tools: ['phone_friction', 'urge_surf', 'delay_distract'],
      see: ['You’re in debt or hiding gambling', 'Thoughts of suicide linked to losses (today)'],
      stat: 'About 0.5–1% of adults have gambling disorder, and more have gambling-related harm (various national surveys).',
      scan: null, kw: 'betting casino poker slots sports bets chasing losses debt' },

    { id: 'phoneuse', code: 'EX-04', n: 'Problematic phone & social media use', sys: 'exhaust', st: 'concept', aka: ['Phone addiction', 'Social media addiction', 'Nomophobia'],
      line: 'The phone has become the steering wheel.',
      lights: ['f_scroll', 's_late', 'h_cant_stop', 'r_lonely', 'd_critic'],
      signs: ['Checking dozens of times an hour without deciding to', 'Anxious without the phone', 'Comparing your life with highlight reels', 'Using it to escape feelings'],
      under: 'Not a formal diagnosis, but a real pattern. Apps are designed to hold attention. The US Surgeon General’s 2023 advisory raised concerns about social media and young people’s mental health. The link is strongest with heavy use, sleep loss and comparison.',
      myth: ['It’s harmless because everyone does it.', 'For many people it’s fine. The test is whether it pushes out sleep, people, movement and focus.'],
      mix: ['attention', 'gad', 'depression', 'loneliness'],
      pro: 'Usually self-help works. If it hides anxiety, depression or loneliness, therapy for those helps.',
      diy: ['Turn off all non-human notifications.', 'Phone out of the bedroom.', 'Unfollow accounts that leave you feeling worse.', 'Replace, don’t just remove: what will you do with that time?'],
      tools: ['phone_friction', 'urge_surf', 'social_dose'],
      see: ['It drives low mood, self-harm content or sleep loss'],
      stat: 'The US Surgeon General’s 2023 advisory notes teens who spend more than 3 hours a day on social media face double the risk of depression and anxiety symptoms.',
      scan: 'phone', kw: 'phone instagram tiktok social media screen time addiction compare' },

    { id: 'gaming', code: 'EX-05', n: 'Gaming disorder', sys: 'exhaust', st: 'icd', aka: ['Video game addiction'],
      line: 'The game keeps saving progress while real life doesn’t.',
      lights: ['h_game', 'h_cant_stop', 's_late', 'r_lonely'],
      signs: ['Losing control over when and how long you play', 'Gaming taking priority over sleep, work, school, people', 'Carrying on despite clear harm', 'For at least 12 months (ICD-11)'],
      under: 'ICD-11 added gaming disorder in 2019 (DSM-5-TR lists it as needing more research). Most gamers are fine; the problem is loss of control and harm, not hours alone.',
      myth: ['Anyone who games a lot is addicted.', 'Lots of play with a balanced life isn’t a disorder.'],
      mix: ['adhd', 'depression', 'social', 'phoneuse'],
      pro: 'CBT and family therapy (for young people) have the best evidence.',
      diy: ['Set session lengths before you start.', 'No gaming in the hour before bed.', 'Notice what gaming helps you avoid.'],
      tools: ['phone_friction', 'implementation', 'values'],
      see: ['School, work or sleep are falling apart'],
      stat: 'About 3% of gamers meet criteria for gaming disorder (Stevens et al., meta-analysis, 2021).',
      scan: null, kw: 'games video gaming fortnite addicted console' },

    { id: 'csbd', code: 'EX-06', n: 'Compulsive sexual behaviour', sys: 'exhaust', st: 'icd', aka: ['Sex addiction', 'Porn addiction', 'CSBD'],
      line: 'Urges that keep driving when you’ve asked to stop.',
      lights: ['h_sex', 'h_cant_stop', 'd_shame'],
      signs: ['Repeated failed attempts to cut down sexual behaviour or porn', 'It takes over other parts of life', 'Continuing despite real harm'],
      under: 'ICD-11 lists compulsive sexual behaviour disorder as an impulse-control disorder. Importantly, ICD-11 says distress that comes only from moral or religious disapproval of one’s sexuality is not enough for the diagnosis.',
      myth: ['Watching porn means you’re addicted.', 'Most people who watch porn don’t have CSBD; feeling guilty about it is not the same as losing control.'],
      mix: ['adhd', 'depression', 'bipolar'],
      pro: 'CBT and ACT have evidence; some people benefit from medication (SSRIs, naltrexone).',
      diy: ['Notice triggers (boredom, stress, loneliness).', 'Add friction to devices.', 'Build other ways to cope with the trigger feelings.'],
      tools: ['urge_surf', 'halt', 'phone_friction'],
      see: ['It harms your relationships, money or job'],
      stat: 'Surveys suggest a few percent of adults report distressing, out-of-control sexual behaviour (Dickenson et al., 2018: about 8–10% with significant distress symptoms).',
      scan: null, kw: 'porn sex addiction compulsive' },

    { id: 'bfrb', code: 'EX-07', n: 'Skin picking & hair pulling', sys: 'exhaust', st: 'dx', aka: ['Body-focused repetitive behaviours', 'Trichotillomania', 'Excoriation'],
      line: 'Hands on autopilot, soothing the system and damaging the paintwork.',
      lights: ['h_pick', 'a_tense', 'd_shame', 'h_cant_stop'],
      signs: ['Pulling hair, picking skin, biting nails or cheeks repeatedly', 'Often in a trance-like state (reading, scrolling, driving)', 'Trying to stop and not managing', 'Hiding damage'],
      under: 'BFRBs are related to OCD. They often regulate under- or over-stimulation and feel soothing in the moment. They are common and not self-harm.',
      myth: ['It’s just a bad habit.', 'It’s a recognised condition, and most people need specific techniques, not willpower.'],
      mix: ['ocd', 'adhd', 'gad'],
      pro: 'Habit reversal training and the ComB model. The TLC Foundation for BFRBs lists specialists.',
      diy: ['Notice when and where it happens.', 'Use competing responses: fidget toys, gloves, plasters.', 'Make it harder: short nails, hair tied up.'],
      tools: ['habit_reversal', 'urge_surf', 'sensory_kit'],
      see: ['Infections, bald patches or hours lost'],
      stat: 'Trichotillomania affects about 1–2% of adults and skin-picking disorder about 1.4% or more (DSM-5-TR).',
      scan: null, kw: 'picking pulling hair nail biting skin trichotillomania' },

    // ------------------------------------------------------------------------------------- Chassis (personality)
    { id: 'npd', code: 'CH-01', n: 'Narcissism & narcissistic personality disorder', sys: 'chassis', st: 'dx', aka: ['NPD', 'Narcissist', 'Vulnerable narcissism', 'Covert narcissism'],
      line: 'A chassis built around a fragile core, heavily armoured with specialness.',
      lights: ['p_special', 'p_empathy', 'd_rage', 'd_shame', 'r_walk', 'r_doubt'],
      signs: ['Grandiose sense of self-importance; needing admiration', 'Entitlement: rules are for others', 'Lack of empathy; using people', 'Envy, arrogance, rage at criticism (“narcissistic injury”)', '“Vulnerable” type: hypersensitive, resentful, secretly grandiose, easily slighted'],
      under: 'Narcissism is a trait everyone has to some degree. NPD is diagnosed when the pattern is rigid, long-standing and causes harm (DSM-5-TR: 5 of 9 traits). Psychologists describe grandiose and vulnerable forms; both protect a self-image that can’t tolerate feeling ordinary or ashamed. People with NPD rarely seek help for narcissism itself, more often for depression, relationships or work problems.',
      myth: ['Everyone selfish is a narcissist.', '“Narcissist” is overused online. Only a clinician can diagnose NPD, and nobody can diagnose someone else from the outside. What you can judge: whether someone’s behaviour is harming you.'],
      mix: ['bpd', 'bipolar', 'selfesteem', 'abuse'],
      pro: 'Long-term therapy: transference-focused psychotherapy, schema therapy, mentalization-based therapy. Progress is possible when the person is motivated.',
      diy: ['If you see traits in yourself: practise noticing envy and shame without acting on them.', 'Ask for honest feedback and sit with it for a day before answering.', 'If it’s someone else: focus on boundaries and your safety, not on diagnosing them.'],
      tools: ['gray_rock', 'boundary_script', 'self_compassion', 'reality_log'],
      see: ['Your relationships keep ending the same way', 'You’re dealing with a person whose behaviour is harming you: see the emotional abuse entry'],
      stat: 'Community estimates of NPD range from 0% to 6.2% (DSM-5); many studies land around 1%.',
      scan: 'narc_self', kw: 'narcissist narcissistic ego selfish entitled arrogant covert vulnerable npd' },

    { id: 'bpd', code: 'CH-02', n: 'Borderline personality disorder', sys: 'chassis', st: 'dx', aka: ['BPD', 'Emotionally unstable personality disorder', 'EUPD'],
      line: 'Emotional suspension with no shock absorbers: every bump hits at full force.',
      lights: ['p_abandon', 'p_unstable', 'p_empty', 'p_identity', 'f_impulse', 'p_selfharm', 'd_rage', 'd_unreal'],
      signs: ['Intense fear of abandonment', 'Relationships that swing between idealising and devaluing', 'An unstable sense of self', 'Impulsivity, self-harm or suicidal behaviour', 'Emotions that are intense and change within hours', 'Chronic emptiness, intense anger, stress-related paranoia or dissociation'],
      under: 'BPD likely comes from an emotionally sensitive temperament meeting an invalidating or traumatic environment (Linehan’s biosocial theory). It is one of the most stigmatised diagnoses and one of the most hopeful: in long-term studies, most people no longer meet criteria after some years.',
      myth: ['People with BPD are manipulative and can’t get better.', 'Most people with BPD are in enormous pain. In the McLean Study of Adult Development, about 85% reached remission within 10 years.'],
      mix: ['cptsd', 'bipolar', 'adhd', 'anxattach'],
      pro: 'Dialectical behaviour therapy (DBT) has the strongest evidence; mentalization-based treatment, schema therapy and transference-focused psychotherapy also work.',
      diy: ['Learn DBT skills: they’re freely available and powerful.', 'In a crisis, change body chemistry first (cold water, intense exercise).', 'Name the emotion before acting on it.'],
      tools: ['tipp', 'opposite_action', 'radical_accept', 'dear_man', 'safety_plan'],
      see: ['Self-harm or suicidal thoughts (today)', 'Relationships repeatedly in crisis'],
      stat: 'About 1.6% of the general population, up to 5.9% in some surveys (DSM-5-TR); around 20% of psychiatric inpatients.',
      scan: 'bpd', kw: 'borderline bpd eupd abandonment emotional unstable splitting' },

    { id: 'avoidant', code: 'CH-03', n: 'Avoidant personality', sys: 'chassis', st: 'dx', aka: ['Avoidant personality disorder', 'AvPD'],
      line: 'Parked in the garage for safety, watching other cars drive past.',
      lights: ['p_shy', 'a_judged', 'd_shame', 'r_lonely', 'd_critic'],
      signs: ['Avoiding jobs or friendships for fear of criticism', 'Only getting close if sure of being liked', 'Feeling inferior or socially inept', 'Wanting connection but staying back'],
      under: 'Overlaps heavily with social anxiety disorder, but it’s more pervasive: a lifelong self-image of being inadequate. Often linked to childhood rejection or criticism.',
      myth: ['They just prefer being alone.', 'People with AvPD usually want connection. Fear stops them.'],
      mix: ['social', 'autism', 'selfesteem', 'avoidattach'],
      pro: 'CBT, schema therapy and group therapy help. SSRIs can reduce the anxiety.',
      diy: ['Take tiny social risks daily and log what happened.', 'Challenge “they’ll reject me” with evidence.', 'Join groups around an activity, not just talk.'],
      tools: ['exposure_ladder', 'thought_record', 'self_compassion', 'social_dose'],
      see: ['Isolation is affecting work and mood'],
      stat: 'About 2.4% of people (DSM-5-TR, US survey data).',
      scan: 'social', kw: 'avoidant rejection inferior isolated lonely shy' },

    { id: 'ocpd', code: 'CH-04', n: 'Obsessive-compulsive personality', sys: 'chassis', st: 'dx', aka: ['OCPD', 'Rigid perfectionism'],
      line: 'A car that won’t leave until every rule, mirror and tyre pressure is perfect.',
      lights: ['p_rigid', 'd_perfect', 'f_procrast', 'm_irrit'],
      signs: ['Preoccupation with order, lists, rules and details', 'Perfectionism that stops tasks being finished', 'Work over friends and fun', 'Rigid about morals and ways of doing things', 'Hard to delegate'],
      under: 'Unlike OCD, OCPD traits usually feel right to the person (“my way is the correct way”). It’s one of the most common personality disorders and often goes unrecognised because it looks like conscientiousness.',
      myth: ['OCPD is just a strong work ethic.', 'Conscientiousness is flexible. OCPD is rigid, and the people around the person often suffer.'],
      mix: ['ocd', 'perfectionism', 'autism'],
      pro: 'CBT and schema therapy focusing on flexibility and relationships.',
      diy: ['Practise “good enough” on purpose in low-stakes tasks.', 'Delegate one thing and don’t redo it.', 'Schedule rest that isn’t productive.'],
      tools: ['values', 'self_compassion', 'defusion'],
      see: ['Rigidity is damaging relationships'],
      stat: 'Estimates range from about 2% to nearly 8% of people (DSM-5-TR).',
      scan: 'perfection', kw: 'control rigid rules perfectionist workaholic orderly' },

    // ------------------------------------------------------------------------------------- Cabin & Passengers
    { id: 'anxattach', code: 'CB-01', n: 'Anxious attachment', sys: 'cabin', st: 'concept', aka: ['Anxious-preoccupied attachment'],
      line: 'Checking the rear-view mirror every few seconds to make sure they’re still there.',
      lights: ['r_clingy', 'p_abandon', 'a_worry', 'd_please'],
      signs: ['Needing frequent reassurance', 'Reading slow texts as rejection', 'Feeling calm only when close to your partner', 'Protest behaviours: calling repeatedly, testing, withdrawing to get attention'],
      under: 'Attachment theory (Bowlby, Ainsworth; adult research by Hazan, Shaver and others) describes how early relationships shape what we expect from closeness. Anxious attachment often grows from inconsistent care: love was there, but unpredictably. It’s a pattern, not a diagnosis, and it can change (“earned security”).',
      myth: ['Your attachment style is fixed forever.', 'Styles shift with relationships and therapy. A secure partner and practice can move you toward security.'],
      mix: ['bpd', 'codependency', 'gad'],
      pro: 'Emotionally focused therapy (EFT) for couples, schema therapy, and individual therapy focusing on relationships.',
      diy: ['Self-soothe before reaching for reassurance.', 'Communicate needs directly instead of protest behaviour.', 'Choose consistent people.'],
      tools: ['self_compassion', 'dear_man', 'breath_slow', 'reparent'],
      see: ['Relationship anxiety dominates your life'],
      stat: 'Around 15–20% of adults score as anxiously attached in large surveys (various studies of the Experiences in Close Relationships scale).',
      scan: 'attachment', kw: 'clingy needy jealous relationship anxiety reassurance texting' },

    { id: 'avoidattach', code: 'CB-02', n: 'Avoidant attachment', sys: 'cabin', st: 'concept', aka: ['Dismissive-avoidant attachment', 'Fearful-avoidant'],
      line: 'Locking the doors from the inside when someone gets too close.',
      lights: ['r_distant', 'd_numb', 'p_shy', 'r_lonely'],
      signs: ['Pulling away when relationships deepen', 'Valuing independence so much that need feels like weakness', 'Finding fault with partners as closeness grows', '“Fearful-avoidant”: wanting closeness and fearing it at once'],
      under: 'Avoidant attachment often grows when needs were met with distance or rejection. The child learns to need less. As an adult, closeness can trigger an urge to escape.',
      myth: ['Avoidant people don’t care.', 'Studies show avoidant people often have strong stress responses to separation; they’ve learnt to hide them.'],
      mix: ['avoidant', 'cen', 'autism'],
      pro: 'Individual therapy; EFT for couples.',
      diy: ['Notice the urge to withdraw and name it out loud.', 'Share one small vulnerable thing a week.', 'Stay for five minutes longer in uncomfortable closeness.'],
      tools: ['self_compassion', 'dear_man', 'values'],
      see: ['A pattern of relationships ending when they get close'],
      stat: 'Around 20–25% of adults score as avoidant in attachment surveys.',
      scan: 'attachment', kw: 'commitment distance independence pull away cold' },

    { id: 'codependency', code: 'CB-03', n: 'Codependency', sys: 'cabin', st: 'concept', aka: ['Relationship dependency', 'Rescuer'],
      line: 'Driving everyone else’s car while your own sits rusting.',
      lights: ['r_rescue', 'd_please', 'r_cant_leave', 'r_walk'],
      signs: ['Your mood depends on others’ moods', 'Rescuing, fixing, covering for people', 'Difficulty knowing what you want', 'Staying in harmful relationships out of duty or fear'],
      under: 'Codependency came out of addiction family work: partners and children of people with addictions learn to manage chaos by managing the person. It’s not a diagnosis, but the pattern is real and changeable.',
      myth: ['Codependency is just being kind.', 'Kindness is a choice. Codependency is compulsion: you feel you have no choice.'],
      mix: ['anxattach', 'pleasing', 'acoa', 'abuse'],
      pro: 'Therapy focusing on boundaries and self-worth; groups like CoDA and Al-Anon.',
      diy: ['Ask “whose problem is this?” before stepping in.', 'Let people experience the consequences of their choices.', 'Rediscover your own wants.'],
      tools: ['boundary_script', 'values', 'self_compassion', 'reparent'],
      see: ['You’re in a relationship with addiction or abuse'],
      stat: 'There are no reliable prevalence figures because it’s not a formal diagnosis.',
      scan: 'codependency', kw: 'codependent rescuer enabling fixing people pleaser' },

    { id: 'abuse', code: 'CB-04', n: 'Emotional abuse, gaslighting & coercive control', sys: 'cabin', st: 'concept', aka: ['Narcissistic abuse', 'Toxic relationship', 'Gaslighting'],
      line: 'Someone else has their hands on your steering wheel, and tells you you’re the one swerving.',
      lights: ['r_walk', 'r_doubt', 'r_cant_leave', 'd_shame', 'a_startle', 'r_lonely'],
      signs: ['Walking on eggshells', 'Being told your memory or feelings are wrong (gaslighting)', 'Isolated from friends or family; money or phone controlled', 'Cycles of cruelty and sweetness', 'Feeling you’re slowly disappearing'],
      under: 'Abuse isn’t only physical. Coercive control (a pattern of isolation, monitoring, humiliation and threats) is a crime in England and Wales since 2015 and in Scotland since 2019. Victims often doubt themselves because the pattern is gradual and mixed with affection. You don’t need to diagnose the other person to know you deserve safety.',
      myth: ['If it were that bad, I’d just leave.', 'Leaving is complicated (fear, money, children, love) and can be the most dangerous time. Advocates help plan it safely.'],
      mix: ['traumabond', 'codependency', 'cptsd'],
      pro: 'Domestic abuse advocates (US: 1-800-799-7233; UK: 0808 2000 247; Canada: sheltersafe.ca) help with safety plans. Therapy helps rebuild trust in your own perception.',
      diy: ['Keep a private, dated log of what happens.', 'Reconnect with one person outside the relationship.', 'Plan safety before confronting or leaving.'],
      tools: ['reality_log', 'gray_rock', 'boundary_script', 'safety_plan'],
      see: ['You feel afraid of your partner', 'Threats, violence or stalking (call emergency services)'],
      stat: 'About 1 in 3 women and 1 in 4 men in the US experience severe physical violence, sexual violence or stalking by a partner (CDC NISVS); emotional abuse is more common still.',
      scan: 'relationship', kw: 'abusive toxic gaslighting controlling partner narcissist manipulation' },

    { id: 'traumabond', code: 'CB-05', n: 'Trauma bonding', sys: 'cabin', st: 'concept', aka: ['Trauma bond'],
      line: 'Stuck to the person who dented the car, because they’re also the one who polishes it.',
      lights: ['r_cant_leave', 'r_walk', 'r_doubt', 'p_abandon'],
      signs: ['Strong attachment to someone who hurts you', 'Defending them to others', 'Craving the good moments', 'Feeling you can’t live without them'],
      under: 'Intermittent reinforcement (unpredictable cycles of harm and affection) creates very strong bonds (Dutton and Painter, 1981). It’s a normal brain response to an abnormal situation.',
      myth: ['If I love them, it can’t be that bad.', 'Strong attachment and harm can exist together. That’s what makes it so hard.'],
      mix: ['abuse', 'codependency', 'anxattach'],
      pro: 'Trauma-informed therapy and domestic abuse services.',
      diy: ['Write the full story of the relationship, including the bad parts.', 'No-contact or low-contact where safe.', 'Expect withdrawal-like cravings and plan for them.'],
      tools: ['reality_log', 'urge_surf', 'social_dose'],
      see: ['You’ve tried to leave several times and gone back'],
      stat: 'Not a formal diagnosis; no prevalence figures.',
      scan: 'relationship', kw: 'trauma bond cant leave go back toxic love' },

    { id: 'loneliness', code: 'CB-06', n: 'Loneliness', sys: 'cabin', st: 'concept', aka: ['Social isolation'],
      line: 'Driving alone for so long the passenger seat feels like it belongs to someone else.',
      lights: ['r_lonely', 'm_low', 'p_shy'],
      signs: ['Feeling unseen even with people', 'No one to call in a crisis', 'Weekends feel empty', 'Withdrawing because reaching out feels hard'],
      under: 'Loneliness is the gap between the connection you have and the connection you need. The US Surgeon General’s 2023 advisory warned that lacking connection carries health risks comparable to smoking up to 15 cigarettes a day. Loneliness also makes the brain more alert to rejection, which makes reaching out feel riskier.',
      myth: ['Lonely people need more people.', 'Quality matters more than numbers: one or two close, reliable connections protect most.'],
      mix: ['depression', 'social', 'avoidant'],
      pro: 'Therapy can help with what makes connection hard; social prescribing links people with groups.',
      diy: ['Make one small contact a day: a message, a chat with a neighbour.', 'Join something repeated: a class, team, volunteering.', 'Say yes to one invitation you’d usually decline.'],
      tools: ['social_dose', 'behav_activation', 'exposure_ladder'],
      see: ['Loneliness comes with hopelessness'],
      stat: 'About half of US adults report measurable loneliness (US Surgeon General advisory, 2023).',
      scan: 'lonely', kw: 'lonely alone isolated no friends' },

    // ------------------------------------------------------------------------------------- Dashboard: self-image, anger, perception
    { id: 'selfesteem', code: 'DB-01', n: 'Low self-esteem & the inner critic', sys: 'dash', st: 'concept', aka: ['Self-loathing', 'Negative self-talk'],
      line: 'A dashboard display that only shows warnings, never the mileage you’ve covered.',
      lights: ['d_critic', 'd_shame', 'm_worth', 'd_perfect'],
      signs: ['Talking to yourself in ways you’d never talk to a friend', 'Dismissing compliments, magnifying mistakes', 'Not trying for fear of failing', 'Feeling “not enough”'],
      under: 'Low self-esteem often forms from early experiences (criticism, neglect, bullying) that leave a “bottom line” belief like “I’m not good enough”. Rules develop to cope (“I must never fail”), and life gets read through them.',
      myth: ['Being hard on myself keeps me motivated.', 'Research on self-compassion (Neff and others) finds self-kindness supports motivation and resilience better than self-criticism.'],
      mix: ['depression', 'social', 'imposter', 'cen'],
      pro: 'CBT for low self-esteem (Melanie Fennell’s model) and compassion-focused therapy (Paul Gilbert).',
      diy: ['Name the critic (“there goes the Inspector”).', 'Keep a daily list of three things you did, however small.', 'Talk to yourself as you’d talk to a friend.'],
      tools: ['self_compassion', 'inner_critic', 'thought_record', 'evidence_file'],
      see: ['Self-hatred comes with self-harm or suicidal thoughts'],
      stat: 'There are no diagnostic prevalence figures; low self-esteem is a risk factor for depression in large studies (Sowislo & Orth, 2013).',
      scan: 'selfesteem', kw: 'self esteem confidence worthless critic hate myself not good enough' },

    { id: 'imposter', code: 'DB-02', n: 'Imposter syndrome', sys: 'dash', st: 'concept', aka: ['Imposter phenomenon'],
      line: 'Driving a car you earned, convinced someone will check the paperwork any minute.',
      lights: ['d_fraud', 'd_perfect', 'a_worry', 'd_critic'],
      signs: ['Believing your success is luck or a mistake', 'Fearing you’ll be “found out”', 'Over-preparing or procrastinating', 'Discounting praise'],
      under: 'Psychologists Pauline Clance and Suzanne Imes described the imposter phenomenon in 1978. It’s common among high achievers and people who are “firsts” or minorities in their field, where the doubt is sometimes reinforced by real bias.',
      myth: ['Only people who are actually frauds feel like frauds.', 'The opposite: imposter feelings are common in highly capable people.'],
      mix: ['perfectionism', 'selfesteem', 'gad'],
      pro: 'Rarely needs treatment alone; CBT helps if it’s heavy.',
      diy: ['Keep an evidence file of wins and thanks.', 'Talk about it: you’ll find many peers feel the same.', 'Separate feeling from fact.'],
      tools: ['evidence_file', 'thought_record', 'self_compassion'],
      see: ['It drives anxiety or burnout'],
      stat: 'Studies report it in 9% to 82% of people depending on the group (Bravata et al., systematic review, 2020).',
      scan: 'imposter', kw: 'fraud fake imposter found out lucky' },

    { id: 'perfectionism', code: 'DB-03', n: 'Perfectionism', sys: 'dash', st: 'concept', aka: ['Maladaptive perfectionism'],
      line: 'Polishing the car so long you never get to drive it.',
      lights: ['d_perfect', 'f_procrast', 'd_critic', 'a_worry'],
      signs: ['Standards that move every time you reach them', 'Procrastinating because it won’t be perfect', 'Self-worth tied to performance', 'Harsh self-criticism after mistakes'],
      under: 'Perfectionism has been rising for decades: a 2019 meta-analysis found young people report much more “socially prescribed” perfectionism (feeling others demand perfection) than in 1989. It’s linked to anxiety, depression, eating disorders and burnout.',
      myth: ['Perfectionists perform better.', 'High standards help; perfectionism (fear of mistakes, self-worth at stake) often hurts performance.'],
      mix: ['ocpd', 'imposter', 'execdys', 'anorexia'],
      pro: 'CBT for perfectionism (Shafran, Egan and Wade) has good evidence.',
      diy: ['Set a “good enough” bar before starting.', 'Make a deliberate small mistake and see what happens.', 'Separate who you are from what you produce.'],
      tools: ['self_compassion', 'thought_record', 'values', 'two_minute'],
      see: ['It feeds an eating disorder, anxiety or depression'],
      stat: 'Socially prescribed perfectionism in young people rose by about 33% between 1989 and 2016 (Curran & Hill, Psychological Bulletin, 2019).',
      scan: 'perfection', kw: 'perfectionist perfect standards mistakes failure' },

    { id: 'pleasing', code: 'DB-04', n: 'People-pleasing & the fawn response', sys: 'dash', st: 'concept', aka: ['Fawning', 'Can’t say no'],
      line: 'Giving everyone a lift, even when your tank is empty.',
      lights: ['d_please', 'r_rescue', 'm_tired', 'd_shame'],
      signs: ['Saying yes when you want to say no', 'Apologising constantly', 'Hiding opinions to avoid conflict', 'Resentment building up underneath'],
      under: 'Therapist Pete Walker added “fawn” to fight, flight and freeze: in a threatening environment, pleasing the threat was the safest option. As adults, people-pleasers often confuse being liked with being safe.',
      myth: ['People-pleasers are just nice.', 'Pleasing is often fear-driven. Real kindness includes honesty and limits.'],
      mix: ['codependency', 'cptsd', 'social'],
      pro: 'Therapy focusing on assertiveness and boundaries.',
      diy: ['Buy time: “Let me check and get back to you.”', 'Practise small no’s.', 'Notice resentment: it marks a boundary you skipped.'],
      tools: ['boundary_script', 'dear_man', 'values'],
      see: ['You can’t leave harmful situations'],
      stat: 'Not a diagnosis; no prevalence figures.',
      scan: 'pleaser', kw: 'people pleaser fawn cant say no boundaries yes' },

    { id: 'anger', code: 'DB-05', n: 'Anger that boils over', sys: 'dash', st: 'dx', aka: ['Intermittent explosive disorder', 'Rage', 'Anger issues'],
      line: 'The temperature gauge jumps from normal to red with nothing in between.',
      lights: ['d_rage', 'm_irrit', 'f_impulse'],
      signs: ['Outbursts out of proportion to the trigger', 'Shouting, breaking things, road rage', 'Regret and shame afterwards', 'People around you walking on eggshells'],
      under: 'Anger is a normal emotion. Intermittent explosive disorder is when outbursts are recurrent, impulsive and out of proportion. Anger also shows up in depression, ADHD, PTSD, burnout and substance use, especially in men, who are more likely to show depression as irritability.',
      myth: ['Letting it out (punching a pillow) helps.', 'Venting aggression tends to increase anger. Calming the body works better (Bushman, 2002; Kjærvik & Bushman, 2024).'],
      mix: ['adhd', 'ptsd', 'depression', 'bpd', 'misophonia'],
      pro: 'CBT for anger and anger management groups work. Some medications help for IED.',
      diy: ['Spot the early signs: heat, clenched jaw, fast breathing.', 'Take a timeout before you’re at 10.', 'Return to talk when calm.'],
      tools: ['anger_timeout', 'breath_sigh', 'tipp', 'halt'],
      see: ['Anyone has been hurt or frightened', 'Anger damages work or relationships'],
      stat: 'About 7% of US adults meet lifetime criteria for intermittent explosive disorder (Kessler et al., 2006).',
      scan: 'anger', kw: 'anger rage temper explode shouting road rage irritable' },

    { id: 'dpdr', code: 'DB-06', n: 'Depersonalisation & derealisation', sys: 'dash', st: 'dx', aka: ['Dissociation', 'Feeling unreal'],
      line: 'Watching yourself drive from the back seat.',
      lights: ['d_unreal', 'd_numb', 'a_worry', 'a_panic'],
      signs: ['Feeling detached from yourself, your body or your emotions', 'The world feels foggy, flat or like a film', 'Knowing it isn’t real (unlike psychosis)'],
      under: 'Brief episodes are very common under stress, after sleep loss or with cannabis. The brain dampens emotion to protect you. It becomes a disorder when it persists and distresses you. Fearing the feeling often keeps it going.',
      myth: ['It means I’m going crazy.', 'Knowing it feels unreal is exactly what separates it from psychosis.'],
      mix: ['panic', 'ptsd', 'psychosis'],
      pro: 'CBT for depersonalisation; treating underlying anxiety or trauma.',
      diy: ['Ground with the senses: cold water, strong tastes, naming objects.', 'Reduce anxiety about the feeling itself.', 'Avoid cannabis.'],
      tools: ['ground_54321', 'breath_slow', 'defusion'],
      see: ['It’s constant or getting worse'],
      stat: 'About 1–2% of people have depersonalisation-derealisation disorder; brief episodes are common (Hunter et al., 2004).',
      scan: null, kw: 'unreal dissociation detached foggy dream depersonalization derealization' },

    { id: 'psychosis', code: 'DB-07', n: 'Losing touch with reality (psychosis)', sys: 'dash', st: 'urgent', aka: ['Psychosis', 'Hearing voices', 'Paranoia'],
      line: 'The sensors start reporting things that aren’t there. Get to a mechanic quickly.',
      lights: ['d_voices', 's_sleep', 'a_startle'],
      signs: ['Hearing or seeing things others don’t', 'Strong beliefs others find strange (being watched, special messages)', 'Confused speech or thinking', 'Withdrawal and sleep loss beforehand'],
      under: 'Psychosis is a symptom, not a single disorder. It can come with schizophrenia, bipolar disorder, severe depression, drugs (especially high-potency cannabis and stimulants), sleep deprivation or medical conditions. Early intervention services lead to much better outcomes.',
      myth: ['Psychosis means someone is dangerous.', 'People with psychosis are far more likely to be victims of violence than to cause it.'],
      mix: ['bipolar', 'dpdr', 'substances'],
      pro: 'Early intervention in psychosis teams, antipsychotic medication, CBT for psychosis, family support.',
      diy: ['Tell a doctor or trusted person soon.', 'Stop cannabis and stimulants.', 'Protect sleep.'],
      tools: ['safety_plan', 'sleep_window'],
      see: ['As soon as possible; urgently if you feel unsafe'],
      stat: 'About 3% of people experience psychosis at some point (Perälä et al., 2007).',
      scan: null, kw: 'voices hallucinations paranoid psychosis schizophrenia watched' },

    { id: 'selfharm', code: 'DB-08', n: 'Self-harm', sys: 'dash', st: 'urgent', aka: ['Cutting', 'Self-injury'],
      line: 'Using pain to turn down a bigger pain. There are other ways to turn the dial.',
      lights: ['p_selfharm', 'd_numb', 'd_shame', 'p_empty'],
      signs: ['Hurting yourself on purpose (cutting, burning, hitting)', 'Hiding injuries', 'Feeling relief, numbness or control afterwards'],
      under: 'Self-harm is usually a way to cope with overwhelming feelings, not attention-seeking. It brings quick relief, which makes it repeat. It is a sign of distress that deserves care, and it raises suicide risk over time.',
      myth: ['People who self-harm want attention.', 'Most hide it. It’s a coping strategy, and it can be replaced with safer ones.'],
      mix: ['bpd', 'depression', 'cptsd'],
      pro: 'DBT and other therapies reduce self-harm. A GP can treat wounds and connect you to help.',
      diy: ['Use the emergency brake and talk to someone.', 'Delay: 15 minutes, then reassess.', 'Intense safe sensations (ice, cold shower) can replace the urge.'],
      tools: ['tipp', 'urge_surf', 'safety_plan'],
      see: ['Today: talk to a doctor or crisis line', 'Any wound that needs medical care (now)'],
      stat: 'About 1 in 5 young people report self-harm at some point (Gillies et al., 2018).',
      scan: null, kw: 'self harm cutting hurting myself burn' },

    { id: 'ecoanxiety', code: 'DB-09', n: 'Eco-anxiety & news overload', sys: 'dash', st: 'concept', aka: ['Climate anxiety', 'Doom fatigue'],
      line: 'Too many warning lights from outside the car.',
      lights: ['d_world', 'a_worry', 'f_scroll', 'm_low'],
      signs: ['Worry or grief about climate, war or the future', 'Doomscrolling news', 'Feeling helpless or guilty', 'Questioning plans like having children'],
      under: 'Eco-anxiety is a rational response to real threats, not a disorder. A 2021 survey of 10,000 young people in 10 countries found 59% were very or extremely worried about climate change. Action and community reduce helplessness.',
      myth: ['Caring this much means something’s wrong with me.', 'It means you care. The aim isn’t to stop caring but to carry it without being crushed.'],
      mix: ['gad', 'depression', 'attention'],
      pro: 'Rarely needed; climate-aware therapists exist if it’s overwhelming.',
      diy: ['Limit news to a set time.', 'Pick one meaningful action and a group to do it with.', 'Balance doom with stories of progress.'],
      tools: ['worry_time', 'values', 'phone_friction', 'social_dose'],
      see: ['It turns into persistent hopelessness'],
      stat: '59% of young people were very or extremely worried about climate change (Hickman et al., Lancet Planetary Health, 2021).',
      scan: 'gad7', kw: 'climate news war future doom world anxiety' },

    // ------------------------------------------------------------------------------------- Factory settings
    { id: 'cen', code: 'FS-01', n: 'Childhood emotional neglect', sys: 'factory', st: 'concept', aka: ['CEN', 'Emotional neglect'],
      line: 'The car was fuelled and washed, but nobody ever checked the engine.',
      lights: ['d_numb', 'p_empty', 'r_distant', 'd_please', 'p_identity', 'd_shame'],
      signs: ['A childhood that looked fine, but feelings weren’t noticed or talked about', 'Struggling to name what you feel or need', 'Feeling different, empty or “fatally flawed”', 'Fiercely self-reliant; hard to ask for help'],
      under: 'Psychologist Jonice Webb described childhood emotional neglect as what didn’t happen: parents failing to respond enough to a child’s emotions. Because nothing visibly bad happened, people often don’t recognise it. Children learn their feelings don’t matter, and switch them down.',
      myth: ['My parents gave me everything, so I can’t complain.', 'Material care and emotional attunement are different. Both matter. Seeing that isn’t blaming.'],
      mix: ['pdd', 'avoidattach', 'selfesteem'],
      pro: 'Therapy focusing on emotions (emotion-focused therapy, schema therapy).',
      diy: ['Name three feelings a day.', 'Ask yourself “what do I need right now?” regularly.', 'Practise asking for small help.'],
      tools: ['reparent', 'self_compassion', 'expressive_writing'],
      see: ['Emptiness or numbness is persistent'],
      stat: 'Emotional neglect is one of the most common forms of childhood adversity in large studies (Stoltenborgh et al., 2013).',
      scan: 'cen', kw: 'emotional neglect childhood parents feelings ignored empty' },

    { id: 'acoa', code: 'FS-02', n: 'Adult children of alcoholic or chaotic families', sys: 'factory', st: 'concept', aka: ['ACoA', 'ACA', 'Dysfunctional family'],
      line: 'Raised in a car with a drunk driver: you learned to watch the road for everyone.',
      lights: ['r_rescue', 'a_startle', 'd_please', 'd_perfect', 'r_walk', 'h_drink'],
      signs: ['Hypervigilance to others’ moods', 'Need for control', 'Difficulty having fun or relaxing', 'Taking responsibility for others', 'Judging yourself without mercy'],
      under: 'Janet Woititz’s 1983 book and the ACA “laundry list” described common traits in adults who grew up with addiction or chaos. Not a diagnosis, but research links growing up with parental addiction to higher risk of anxiety, depression and substance problems.',
      myth: ['It was a long time ago; it shouldn’t affect me.', 'Childhood is when the factory settings are installed. They can be updated.'],
      mix: ['codependency', 'cptsd', 'alcohol'],
      pro: 'Therapy; ACA and Al-Anon groups.',
      diy: ['Read the ACA laundry list and notice what fits.', 'Practise play and spontaneity.', 'Learn your own family’s rules (“don’t talk, don’t trust, don’t feel”).'],
      tools: ['reparent', 'boundary_script', 'self_compassion'],
      see: ['You notice your own drinking following the same path'],
      stat: 'About 1 in 8 US children live with a parent with an alcohol use disorder (SAMHSA, 2017).',
      scan: 'factory', kw: 'alcoholic parent dysfunctional family chaos addiction parent' }
  ];

  BM.conditionById = {};
  BM.CONDITIONS.forEach(function (c) { BM.conditionById[c.id] = c; });
  BM.lightById = {};
  BM.LIGHTS.forEach(function (l) { BM.lightById[l[0]] = { id: l[0], label: l[1], sys: l[2], crisis: l[3] === 'crisis' }; });
  BM.systemById = {};
  BM.SYSTEMS.forEach(function (s) { BM.systemById[s.id] = s; });
})();

/* ===== _bmd_factory.html ===== */
(function () {
  var BM = window.BM = window.BM || {};

  BM.FACTORY_GROUPS = [
    { id: 'much', name: 'Too much', line: 'Control, pressure and intrusion: the car was driven for you.' },
    { id: 'little', name: 'Too little', line: 'Absence and neglect: nobody checked the engine.' },
    { id: 'flip', name: 'Upside down', line: 'Role reversal: the child became the mechanic.' },
    { id: 'unsafe', name: 'Unsafe', line: 'Fear and chaos: the alarm was installed early.' },
    { id: 'cond', name: 'Conditional', line: 'Love with strings: approval had to be earned.' },
    { id: 'events', name: 'Life events', line: 'Things that happened to the family.' }
  ];

  /* Each: id, n, grp, aka, looked (what it looked like), installs (what it tends to install), voice (the
     inner sentence it leaves), rewire (how people update it), tools, conds (related manual entries),
     q (statement for the check), note (research, optional). */
  BM.PATTERNS = [
    // ---------------------------------------------------------------- too much
    { id: 'helicopter', n: 'The helicopter parent', grp: 'much', aka: ['Overprotective', 'Snowplough parent'],
      looked: ['Every risk removed before you met it', 'Decisions made for you, homework “helped” with', 'Worry presented as love: “text me when you get there”, at 25'],
      installs: ['Anxiety about making decisions alone', 'Low confidence in coping with problems', 'Needing reassurance before acting', 'Fear of failure: you never practised it'],
      voice: '“I can’t handle this without someone checking.”',
      rewire: ['Make small decisions without consulting anyone, and live with them', 'Let yourself fail at something small, on purpose', 'Notice the parent’s anxiety in your head and label it as theirs'],
      tools: ['exposure_ladder', 'self_compassion', 'values'], conds: ['gad', 'anxattach'],
      q: 'A parent hovered, worried and stepped in so much that I rarely solved problems myself.',
      note: 'Studies link over-controlling parenting with higher anxiety in children (McLeod et al., meta-analysis, 2007).' },
    { id: 'authoritarian', n: 'The drill sergeant', grp: 'much', aka: ['Authoritarian', 'Strict parent'],
      looked: ['Rules without reasons: “because I said so”', 'Obedience valued over feelings', 'Harsh punishment for small mistakes'],
      installs: ['Fear of authority or rebellion against it', 'Hiding mistakes', 'Trouble knowing your own wants', 'Either rigid rule-following or impulsive breaking free'],
      voice: '“Do it right or there will be consequences.”',
      rewire: ['Ask “what do I actually want here?” before following a rule', 'Practise disagreeing respectfully in low-stakes moments', 'Replace punishment with curiosity when you make mistakes'],
      tools: ['dear_man', 'self_compassion', 'values'], conds: ['social', 'perfectionism', 'anger'],
      q: 'Home ran on strict rules and obedience; my feelings and reasons didn’t count much.',
      note: 'Diana Baumrind’s research contrasted authoritarian (high control, low warmth) with authoritative parenting (high warmth and clear limits), which predicts the best outcomes.' },
    { id: 'enmeshed', n: 'The enmeshed family', grp: 'much', aka: ['Enmeshment', 'No boundaries'],
      looked: ['No privacy: doors open, diaries read, phones checked', 'Your feelings were their feelings', 'Leaving home or disagreeing was treated as betrayal'],
      installs: ['Guilt when you set limits', 'Not knowing where you end and others begin', 'Taking on others’ emotions', 'Difficulty forming your own identity'],
      voice: '“If I’m different from them, I’m disloyal.”',
      rewire: ['Write down your own opinions on things before asking family', 'Set one boundary and expect guilt (guilt isn’t proof you were wrong)', 'Build relationships outside the family system'],
      tools: ['boundary_script', 'values', 'reparent'], conds: ['codependency', 'pleasing', 'anxattach'],
      q: 'My family had few boundaries: little privacy, and being separate or different felt like betrayal.' },
    { id: 'critical', n: 'The critic', grp: 'much', aka: ['Hypercritical parent', 'Nothing was good enough'],
      looked: ['95% on a test: “what happened to the other 5?”', 'Mistakes pointed out more than successes', 'Comments on appearance, weight, how you spoke'],
      installs: ['A harsh inner critic that sounds like them', 'Perfectionism and fear of mistakes', 'Discounting praise'],
      voice: '“It’s never quite good enough.”',
      rewire: ['Notice the critic’s voice and ask whose it is', 'Collect evidence of your competence', 'Practise speaking to yourself as a supportive coach'],
      tools: ['inner_critic', 'self_compassion', 'evidence_file'], conds: ['selfesteem', 'perfectionism', 'imposter'],
      q: 'A parent was quick to criticise and slow to praise; nothing was quite good enough.' },
    { id: 'achievement', n: 'Love for the report card', grp: 'much', aka: ['Achievement-based worth', 'Tiger parenting'],
      looked: ['Praise mainly for grades, trophies and wins', 'Activities chosen to impress others', 'Rest treated as laziness'],
      installs: ['Self-worth tied to productivity', 'Burnout and inability to rest', 'Envy and constant comparison', 'Fear of being ordinary'],
      voice: '“I’m only worth something when I achieve.”',
      rewire: ['Schedule rest that produces nothing', 'Ask what you’d do if nobody would ever know', 'Spend time with people who like you, not your CV'],
      tools: ['values', 'self_compassion', 'boundary_script'], conds: ['perfectionism', 'burnout', 'imposter'],
      q: 'I felt most loved when I achieved: grades, trophies, success.',
      note: 'Research on “contingent self-worth” (Crocker and colleagues) links worth based on achievement to more stress and swings in mood.' },
    { id: 'comparison', n: 'Why can’t you be more like…', grp: 'much', aka: ['Comparison', 'Measured against siblings'],
      looked: ['Compared with a sibling, cousin or the neighbour’s kid', 'Your strengths overlooked if they weren’t valued', 'Competition encouraged within the family'],
      installs: ['Constant comparison on social media and at work', 'Envy and resentment', 'Not knowing your own strengths'],
      voice: '“Someone else is always doing it better.”',
      rewire: ['Track your progress against your past self, not others', 'Curate feeds that trigger comparison', 'Name your own strengths without qualifiers'],
      tools: ['phone_friction', 'evidence_file', 'values'], conds: ['selfesteem', 'phoneuse'],
      q: 'I was often compared with a sibling or other children and came off worse.' },
    { id: 'infantilised', n: 'Kept small', grp: 'much', aka: ['Infantilising', 'Not allowed to grow up'],
      looked: ['Treated as younger than your age', 'Not taught practical skills (money, cooking, forms)', 'Your growing independence seen as a threat'],
      installs: ['Feeling like a child among adults', 'Avoiding adult tasks', 'Dependence on partners or parents'],
      voice: '“Grown-up things are for other people.”',
      rewire: ['Learn one adult skill a month, unapologetically', 'Handle your own admin even when it’s scary', 'Find mentors who treat you as capable'],
      tools: ['two_minute', 'exposure_ladder', 'implementation'], conds: ['gad', 'execdys'],
      q: 'I was treated as younger than I was and not trusted to grow up and do things myself.' },

    // ---------------------------------------------------------------- too little
    { id: 'emoneglect', n: 'Feelings weren’t on the menu', grp: 'little', aka: ['Emotional neglect', 'CEN'],
      looked: ['Feelings rarely asked about or named', 'Upset children left to sort themselves out', 'Home was fine on paper'],
      installs: ['Not knowing what you feel or need', 'Emptiness or numbness', 'Hyper-independence: hard to ask for help', 'Feeling secretly flawed'],
      voice: '“My feelings don’t matter, so I don’t need them.”',
      rewire: ['Name three feelings a day', 'Ask “what do I need?” and act on one answer', 'Let one person see you struggle'],
      tools: ['reparent', 'expressive_writing', 'self_compassion'], conds: ['cen', 'pdd', 'avoidattach'],
      q: 'My parents rarely noticed, asked about or helped me with my feelings.' },
    { id: 'dismissive', n: '“Stop crying or I’ll give you something to cry about”', grp: 'little', aka: ['Emotion dismissing', 'Invalidation'],
      looked: ['Sadness met with “you’re fine”', 'Anger punished', 'Fear laughed at or called silly'],
      installs: ['Hiding emotions, then exploding', 'Shame about having feelings', 'Difficulty comforting yourself or others'],
      voice: '“Feelings are weakness.”',
      rewire: ['Let a feeling run its course for 90 seconds without judging it', 'Validate yourself: “it makes sense I feel this”', 'Learn the words for feelings (an emotion wheel helps)'],
      tools: ['self_compassion', 'urge_surf', 'opposite_action'], conds: ['bpd', 'anger', 'cen'],
      q: 'When I was upset I was told to stop, toughen up, or that I was overreacting.',
      note: 'Marsha Linehan’s biosocial theory puts an invalidating environment at the heart of emotional dysregulation.' },
    { id: 'immature', n: 'The emotionally immature parent', grp: 'little', aka: ['Self-involved parent', 'Child in an adult body'],
      looked: ['The parent’s moods set the weather', 'They couldn’t handle your feelings, or theirs', 'Conversations always came back to them'],
      installs: ['Taking care of others’ emotions first', 'Loneliness in relationships', 'Expecting to be unseen'],
      voice: '“I have to manage everyone’s feelings.”',
      rewire: ['Accept they may never become the parent you needed', 'Lower expectations of deep conversations with them', 'Look for emotional maturity in friends and partners'],
      tools: ['radical_accept', 'boundary_script', 'reparent'], conds: ['cen', 'codependency'],
      q: 'A parent was emotionally like a child: self-focused, easily upset, and unable to handle my feelings.',
      note: 'Psychologist Lindsay Gibson’s “Adult Children of Emotionally Immature Parents” (2015) describes this pattern.' },
    { id: 'absent', n: 'The empty driver’s seat', grp: 'little', aka: ['Absent parent', 'Workaholic parent'],
      looked: ['A parent who left, or was physically present but never there', 'Long work hours and broken promises', 'Raising yourself in the gaps'],
      installs: ['Fear of abandonment or rejection', 'Self-reliance that blocks closeness', 'Chasing unavailable people'],
      voice: '“People leave, so don’t count on them.”',
      rewire: ['Notice attraction to unavailable people', 'Let reliable people prove reliable over time', 'Grieve the parent you didn’t get'],
      tools: ['reparent', 'expressive_writing', 'self_compassion'], conds: ['anxattach', 'avoidattach'],
      q: 'A parent was absent: gone, or physically there but not really present.' },
    { id: 'permissive', n: 'No rules at all', grp: 'little', aka: ['Permissive', 'Uninvolved'],
      looked: ['No bedtime, no limits, no follow-through', 'Parents wanting to be friends, not parents', 'Little guidance on hard choices'],
      installs: ['Difficulty with structure and self-discipline', 'Feeling unprotected', 'Trouble with authority or routines'],
      voice: '“Nobody’s steering, so why should I?”',
      rewire: ['Build external structure: routines, alarms, accountability', 'See limits as care, including those you set for yourself'],
      tools: ['implementation', 'body_double', 'sleep_window'], conds: ['execdys', 'adhd'],
      q: 'There were few rules or limits; I mostly had to find my own way.' },
    { id: 'basicneglect', n: 'Basic needs not met', grp: 'little', aka: ['Physical neglect'],
      looked: ['Not enough food, hygiene or medical care', 'Unsafe or unclean home', 'Children left alone too long'],
      installs: ['Food hoarding or anxiety about scarcity', 'Shame about the past', 'Hypervigilance about money and survival'],
      voice: '“There won’t be enough.”',
      rewire: ['Build a small, visible safety net (food, savings)', 'Treat body care as kindness, not chore', 'Talk with a therapist: neglect is trauma'],
      tools: ['self_compassion', 'reparent'], conds: ['cptsd', 'binge'],
      q: 'My basic needs (food, safety, cleanliness, medical care) were not reliably met.',
      note: 'Neglect is one of the 10 Adverse Childhood Experiences in the CDC–Kaiser ACE study (Felitti et al., 1998).' },

    // ---------------------------------------------------------------- upside down
    { id: 'parentified', n: 'The little parent', grp: 'flip', aka: ['Parentification', 'Instrumental parentification'],
      looked: ['Raising siblings, cooking, paying bills as a child', 'Translating or handling adult paperwork', 'No time to just be a kid'],
      installs: ['Over-responsibility', 'Difficulty playing or resting', 'Resentment and burnout', 'Choosing people who need rescuing'],
      voice: '“If I don’t do it, nobody will.”',
      rewire: ['Let others carry their share', 'Schedule pointless play', 'Grieve the childhood you missed'],
      tools: ['boundary_script', 'reparent', 'self_compassion'], conds: ['codependency', 'burnout', 'pleasing'],
      q: 'As a child I took on adult jobs: caring for siblings, running the house, handling money or paperwork.',
      note: 'Research (Hooper and colleagues) links parentification to later depression and anxiety, and sometimes to resilience and empathy.' },
    { id: 'surrogate', n: 'Mum’s therapist, Dad’s best friend', grp: 'flip', aka: ['Emotional parentification', 'Surrogate spouse', 'Emotional incest'],
      looked: ['A parent confided adult problems: marriage, money, loneliness', 'You comforted them more than they comforted you', 'Treated as a partner or confidant'],
      installs: ['Feeling responsible for others’ happiness', 'Guilt about having your own life', 'Difficulty with romantic boundaries'],
      voice: '“My job is to hold everyone together.”',
      rewire: ['Gently decline the confidant role: “I love you, and this is something to talk about with a friend or therapist”', 'Let partners be partners, not patients', 'Work on guilt in therapy'],
      tools: ['boundary_script', 'dear_man', 'reparent'], conds: ['codependency', 'pleasing'],
      q: 'A parent leaned on me for emotional support like a partner or therapist.' },
    { id: 'triangulated', n: 'Caught in the middle', grp: 'flip', aka: ['Triangulation', 'Messenger child', 'Divorce triangulation'],
      looked: ['Passing messages between parents', 'Hearing one parent badmouth the other', 'Asked to choose sides'],
      installs: ['Peacekeeping at all costs', 'Anxiety about conflict', 'Loyalty conflicts'],
      voice: '“Keeping the peace is my job.”',
      rewire: ['Refuse messenger roles: “Please tell them yourself.”', 'Let conflict happen without fixing it', 'Allow yourself to love both parents'],
      tools: ['boundary_script', 'dear_man', 'breath_slow'], conds: ['pleasing', 'gad'],
      q: 'I was caught in the middle of my parents’ conflict, used as a messenger or asked to take sides.' },

    // ---------------------------------------------------------------- unsafe
    { id: 'volatile', n: 'The eggshell house', grp: 'unsafe', aka: ['Volatile parent', 'Explosive parent'],
      looked: ['Rages over small things', 'Reading the mood at the door', 'Siblings and you hiding or appeasing'],
      installs: ['Hypervigilance to tone and facial expressions', 'People-pleasing or fawning', 'Startle response, anxiety in conflict', 'Your own temper, or fear of any anger'],
      voice: '“Watch their face. Stay ready.”',
      rewire: ['Notice scanning and remind yourself: “I’m an adult now, I can leave”', 'Practise calm conflict in safe relationships', 'Body work: breathing and grounding for the startle response'],
      tools: ['ground_54321', 'breath_sigh', 'boundary_script'], conds: ['cptsd', 'pleasing', 'anger'],
      q: 'A parent had an explosive temper; I walked on eggshells at home.' },
    { id: 'addicted', n: 'The addicted parent', grp: 'unsafe', aka: ['Alcoholic parent', 'Parent with addiction'],
      looked: ['Unpredictable evenings', 'Secrets kept from outsiders', 'Promises broken', 'Caring for the parent'],
      installs: ['Control and hypervigilance', 'Difficulty trusting', 'Codependent relationships', 'Higher risk of your own substance use'],
      voice: '“Don’t talk, don’t trust, don’t feel.”',
      rewire: ['Learn the ACA laundry list', 'Join Al-Anon or ACA', 'Track your own use honestly'],
      tools: ['reparent', 'boundary_script', 'halt'], conds: ['acoa', 'codependency', 'alcohol'],
      q: 'A parent had a problem with alcohol or drugs.',
      note: 'Living with a household member with substance problems is one of the 10 original ACEs (Felitti et al., 1998).' },
    { id: 'mentalillness', n: 'A parent who was struggling', grp: 'unsafe', aka: ['Parent with untreated mental illness'],
      looked: ['A parent depressed, in bed for days', 'Hospital stays, or episodes nobody explained', 'You looked after them or kept quiet'],
      installs: ['Fear of becoming like them', 'Over-responsibility', 'Hiding your own struggles to avoid adding burden'],
      voice: '“My needs would be too much.”',
      rewire: ['Remember: illness was not your fault and not your job to fix', 'Get your own checks without shame: genes load the dice, they don’t decide', 'Let people support you'],
      tools: ['self_compassion', 'reparent', 'social_dose'], conds: ['depression', 'bipolar', 'codependency'],
      q: 'A parent had serious mental health struggles that weren’t well treated or explained.',
      note: 'Living with a mentally ill household member is one of the 10 original ACEs (Felitti et al., 1998). Many children of struggling parents do well, especially with one steady adult.' },
    { id: 'violence', n: 'Violence at home', grp: 'unsafe', aka: ['Domestic violence', 'Physical abuse'],
      looked: ['Seeing or hearing a parent being hurt', 'Being hit, shaken or hurt yourself', 'Living in fear'],
      installs: ['PTSD or complex PTSD symptoms', 'Hypervigilance', 'Repeating patterns or fearing closeness', 'Shame and self-blame'],
      voice: '“The world is dangerous, and it’s my fault.”',
      rewire: ['Trauma-focused therapy (very effective)', 'Learn grounding for flashbacks', 'Choose safe relationships and leave unsafe ones'],
      tools: ['ground_54321', 'safety_plan', 'self_compassion'], conds: ['ptsd', 'cptsd', 'abuse'],
      q: 'There was physical violence at home: I was hurt, or saw a parent being hurt.',
      note: 'Physical abuse and witnessing violence against a mother are both among the 10 ACEs (Felitti et al., 1998).' },
    { id: 'spanking', n: 'Hitting as discipline', grp: 'unsafe', aka: ['Corporal punishment', 'Spanking'],
      looked: ['Smacking, belts, slippers as normal punishment', '“It never did me any harm”'],
      installs: ['Fear-based compliance', 'Aggression or shame', 'Believing pain is how love corrects'],
      voice: '“Mistakes earn pain.”',
      rewire: ['Notice the urge to punish yourself after mistakes', 'Learn repair instead of punishment', 'If you’re a parent: calm-down and consequence tools'],
      tools: ['self_compassion', 'anger_timeout'], conds: ['anger', 'selfesteem'],
      q: 'I was regularly hit as punishment (smacked, spanked, belted).',
      note: 'A meta-analysis of 75 studies (Gershoff & Grogan-Kaylor, 2016) found spanking linked to more aggression and mental health problems, and no lasting benefit.' },
    { id: 'chaos', n: 'The weather changed every day', grp: 'unsafe', aka: ['Unpredictable home', 'Inconsistent parenting'],
      looked: ['Warm one day, cold the next', 'Rules that changed with mood', 'Moves, money crises, people coming and going'],
      installs: ['Anxious attachment', 'Need for control', 'Difficulty trusting good times'],
      voice: '“Enjoy it now, it won’t last.”',
      rewire: ['Build predictable routines for yourself', 'Notice catastrophising during good times', 'Choose consistent people'],
      tools: ['implementation', 'worry_time', 'breath_slow'], conds: ['anxattach', 'gad'],
      q: 'Home was unpredictable: I never knew what mood or situation I’d come home to.' },
    { id: 'sexualabuse', n: 'Sexual abuse', grp: 'unsafe', aka: ['Childhood sexual abuse'],
      looked: ['Any sexual contact or exposure by an adult or older child', 'Secrets, grooming, threats'],
      installs: ['PTSD, shame, self-blame', 'Difficulties with intimacy and trust', 'Dissociation'],
      voice: '“It was my fault.” (It never was.)',
      rewire: ['Trauma-focused therapy with a specialist', 'Support lines (RAINN 1-800-656-4673 in the US; NAPAC in the UK)', 'Go at your own pace: you choose who you tell'],
      tools: ['ground_54321', 'safety_plan', 'self_compassion'], conds: ['ptsd', 'cptsd', 'dpdr'],
      q: 'I experienced sexual abuse as a child or teenager.',
      note: 'Sexual abuse is one of the 10 ACEs. It is never the child’s fault.' },

    // ---------------------------------------------------------------- conditional
    { id: 'narcparent', n: 'The narcissistic parent', grp: 'cond', aka: ['Self-centred parent', 'Parent who needed the spotlight'],
      looked: ['Your achievements were theirs; your failures embarrassed them', 'Their needs first, always', 'Criticism or coldness when you didn’t mirror them', 'Different face in public and at home'],
      installs: ['Doubting your perceptions', 'People-pleasing or fear of outshining', 'Attraction to similar partners', 'Shame and the sense of being “too much” or “not enough”'],
      voice: '“My job is to make them look good.”',
      rewire: ['Stop explaining yourself to someone who won’t understand (gray rock)', 'Write down what really happened and trust it', 'Grieve the parent you deserved'],
      tools: ['gray_rock', 'reality_log', 'boundary_script', 'reparent'], conds: ['npd', 'abuse', 'pleasing', 'cptsd'],
      q: 'A parent was self-centred and needed admiration; I existed to make them look or feel good.',
      note: 'You can’t diagnose a parent. But you can recognise the behaviour and its effect on you, which is what matters for healing.' },
    { id: 'guilt', n: 'Guilt trips & the martyr', grp: 'cond', aka: ['Guilt-tripping', 'Martyr parent'],
      looked: ['“After everything I’ve sacrificed for you”', 'Sighs, illness or tears when you did your own thing', 'Love paid back in obligation'],
      installs: ['Chronic guilt', 'Difficulty saying no', 'Resentment'],
      voice: '“My needs hurt people.”',
      rewire: ['Separate guilt (I did wrong) from guilt-tripping (they want me to comply)', 'Say no without long explanations', 'Tolerate their disappointment'],
      tools: ['boundary_script', 'dear_man', 'self_compassion'], conds: ['pleasing', 'codependency'],
      q: 'A parent used guilt to control me, often pointing to their sacrifices.' },
    { id: 'silent', n: 'The silent treatment', grp: 'cond', aka: ['Love withdrawal', 'Stonewalling'],
      looked: ['Days of silence after you displeased them', 'Affection switched off as punishment', 'Not knowing what you did wrong'],
      installs: ['Panic when people go quiet', 'Over-apologising', 'Doing the same to others under stress'],
      voice: '“When they go quiet, I’ve lost them.”',
      rewire: ['Notice when you read silence as rejection', 'Ask directly instead of guessing', 'Communicate when you need space: “I need an hour, then I’ll talk”'],
      tools: ['dear_man', 'breath_slow', 'thought_record'], conds: ['anxattach', 'pleasing'],
      q: 'A parent withdrew love or gave me the silent treatment when I displeased them.' },
    { id: 'shame', n: 'Shame as discipline', grp: 'cond', aka: ['Shaming', 'Humiliation'],
      looked: ['Being called stupid, lazy, selfish, a disappointment', 'Mocked in front of others', '“What’s wrong with you?”'],
      installs: ['Core belief that you’re bad, not that you did something bad', 'Hiding, perfectionism, or defensiveness', 'Harsh self-talk'],
      voice: '“There’s something wrong with me.”',
      rewire: ['Separate behaviour from identity: “I made a mistake” not “I am a mistake”', 'Share shame stories with safe people (shame shrinks when spoken)', 'Compassion-focused practices'],
      tools: ['self_compassion', 'inner_critic', 'expressive_writing'], conds: ['selfesteem', 'depression'],
      q: 'I was regularly called names, mocked or humiliated by a parent.',
      note: 'Brené Brown and June Tangney’s research distinguishes guilt (healthy, about behaviour) from shame (about the self, linked to depression and aggression).' },
    { id: 'gaslit', n: '“That never happened”', grp: 'cond', aka: ['Gaslighting parent', 'Denial'],
      looked: ['Your memories contradicted or rewritten', 'Feelings called imagined or dramatic', 'Family myths you weren’t allowed to question'],
      installs: ['Doubting your memory and judgement', 'Needing outside confirmation', 'Vulnerability to manipulation later'],
      voice: '“Maybe I’m making it up.”',
      rewire: ['Write things down as they happen', 'Trust patterns over single moments', 'Talk with siblings or others who were there'],
      tools: ['reality_log', 'expressive_writing', 'boundary_script'], conds: ['abuse', 'cptsd'],
      q: 'When I described something that happened, a parent denied it or said I was imagining it.' },
    { id: 'goldenscape', n: 'Golden child & scapegoat', grp: 'cond', aka: ['Favouritism', 'Black sheep'],
      looked: ['One child could do no wrong; another was blamed for everything', 'Roles that stuck no matter what you did'],
      installs: ['Scapegoat: shame, defiance, but often clearer sight', 'Golden child: perfectionism, fear of falling from grace', 'Sibling rivalry that lasts into adulthood'],
      voice: 'Scapegoat: “I’m the problem.” Golden child: “I must stay perfect.”',
      rewire: ['See the role as a family system, not your identity', 'Rebuild sibling relationships outside the old script, if safe', 'Notice where you replay the role at work'],
      tools: ['values', 'self_compassion', 'boundary_script'], conds: ['selfesteem', 'perfectionism'],
      q: 'In my family one child was the favourite and another was blamed for everything.' },
    { id: 'rigidbelief', n: 'One right way to live', grp: 'cond', aka: ['Rigid religion or ideology', 'Purity culture'],
      looked: ['Fear of punishment for thoughts or questions', 'Identity, sexuality or doubt treated as sin', 'Leaving the belief meant losing family'],
      installs: ['Scrupulosity or religious OCD', 'Shame about body or sexuality', 'Black-and-white thinking'],
      voice: '“Thinking the wrong thing makes me bad.”',
      rewire: ['Allow questions; they’re not sins', 'Find communities with room for difference', 'Therapy for religious trauma or scrupulosity'],
      tools: ['defusion', 'self_compassion', 'values'], conds: ['ocd', 'selfesteem'],
      q: 'I grew up with rigid beliefs where questioning, doubt or being different brought fear or punishment.' },
    { id: 'bodycomments', n: 'Comments on your body and food', grp: 'cond', aka: ['Weight comments', 'Diet culture at home'],
      looked: ['Remarks about weight, size or looks', 'Parents always dieting', 'Food used as reward or punishment'],
      installs: ['Body image problems', 'Disordered eating', 'Equating worth with appearance'],
      voice: '“My body is a problem to fix.”',
      rewire: ['Unfollow diet content', 'Eat regularly without rules', 'Talk to a professional if eating feels out of control'],
      tools: ['self_compassion', 'urge_surf'], conds: ['binge', 'anorexia', 'bdd'],
      q: 'Parents commented on my weight, body or eating, or food was used as reward or punishment.' },

    // ---------------------------------------------------------------- events
    { id: 'divorce', n: 'High-conflict divorce', grp: 'events', aka: ['Messy separation'],
      looked: ['Fighting before and after separation', 'Custody battles', 'Moving between hostile homes'],
      installs: ['Anxiety about relationships ending', 'Fear of conflict', 'Distrust of commitment'],
      voice: '“Love ends in war.”',
      rewire: ['Notice “this will end badly” predictions in your relationships', 'Learn healthy conflict skills', 'Remember divorce itself matters less than conflict and stability around it'],
      tools: ['dear_man', 'thought_record', 'self_compassion'], conds: ['anxattach', 'avoidattach'],
      q: 'My parents separated with a lot of conflict that I was exposed to.',
      note: 'Research suggests ongoing parental conflict harms children more than divorce itself (Amato, 2001, and others).' },
    { id: 'loss', n: 'Losing a parent young', grp: 'events', aka: ['Childhood bereavement'],
      looked: ['A parent died or disappeared from your life', 'Grief not talked about', 'Growing up too fast'],
      installs: ['Fear of losing loved ones', 'Delayed grief at milestones', 'Over-independence'],
      voice: '“Anyone can disappear.”',
      rewire: ['Allow grief to return at milestones', 'Learn about the parent from others', 'Grief counselling, even years later'],
      tools: ['expressive_writing', 'self_compassion', 'social_dose'], conds: ['grief', 'anxattach'],
      q: 'I lost a parent in childhood through death, illness or them leaving for good.' },
    { id: 'bullied', n: 'Bullied and unsupported', grp: 'events', aka: ['Bullying', 'Peer rejection'],
      looked: ['Teased, excluded or hurt by other children', 'Adults didn’t notice or didn’t help', '“Just ignore them”'],
      installs: ['Social anxiety', 'Hypervigilance for rejection', 'Shame about who you are'],
      voice: '“People will turn on me.”',
      rewire: ['Notice old fear in new groups', 'Gather evidence of being accepted now', 'Therapy if memories still sting'],
      tools: ['exposure_ladder', 'evidence_file', 'self_compassion'], conds: ['social', 'selfesteem', 'avoidant'],
      q: 'I was bullied for a long time, and the adults around me didn’t protect me.',
      note: 'Childhood bullying predicts anxiety and depression in adulthood even decades later (Takizawa et al., 2014).' }
  ];

  BM.patternById = {};
  BM.PATTERNS.forEach(function (p) { BM.patternById[p.id] = p; });
})();

/* ===== _bmd_scans.html ===== */
(function () {
  var BM = window.BM = window.BM || {};

  var OFTEN = [['Never', 0], ['Rarely', 1], ['Sometimes', 2], ['Often', 3], ['Very often', 4]];
  var AGREE = [['Not like me', 0], ['A little', 1], ['Somewhat', 2], ['Mostly', 3], ['Very much like me', 4]];
  var TWO_WEEKS = [['Not at all', 0], ['Several days', 1], ['More than half the days', 2], ['Nearly every day', 3]];
  var YESNO = [['No', 0], ['Yes', 1]];
  BM.SCALES = { often: OFTEN, agree: AGREE };

  BM.PATTERN_BANDS = [
    { pct: 25, level: 0, label: 'Light off', text: 'Your answers don’t show much of this pattern right now.' },
    { pct: 50, level: 1, label: 'Faint flicker', text: 'A few signs. Worth keeping an eye on; the toolbox below may help.' },
    { pct: 72, level: 2, label: 'Light on', text: 'A clear pattern. Read the manual entry, try the tools, and consider talking to a professional if it’s getting in your way.' },
    { pct: 101, level: 3, label: 'Bright and steady', text: 'A strong pattern. That’s a good reason to book a proper assessment with a professional. Take your work order with you.' }
  ];

  BM.SCANS = [
    // ------------------------------------------------------------------------------ validated screeners
    { id: 'phq9', n: 'Mood check (PHQ-9)', kind: 'validated', cond: 'depression', time: '2 min',
      source: 'Patient Health Questionnaire-9, developed by Drs Robert L. Spitzer, Janet B.W. Williams, Kurt Kroenke and colleagues, with an educational grant from Pfizer Inc. No permission required to reproduce.',
      intro: 'Over the last 2 weeks, how often have you been bothered by any of the following problems?', opts: TWO_WEEKS, crisisItem: 8,
      items: ['Little interest or pleasure in doing things', 'Feeling down, depressed, or hopeless', 'Trouble falling or staying asleep, or sleeping too much', 'Feeling tired or having little energy', 'Poor appetite or overeating', 'Feeling bad about yourself, or that you are a failure or have let yourself or your family down', 'Trouble concentrating on things, such as reading the newspaper or watching television', 'Moving or speaking so slowly that other people could have noticed. Or the opposite: being so fidgety or restless that you have been moving around a lot more than usual', 'Thoughts that you would be better off dead, or of hurting yourself in some way'],
      bands: [{ max: 4, level: 0, label: 'Minimal', text: 'Scores of 0–4 suggest minimal depressive symptoms.' }, { max: 9, level: 1, label: 'Mild', text: 'Scores of 5–9 suggest mild symptoms. Keep an eye on it and look after the basics.' }, { max: 14, level: 2, label: 'Moderate', text: 'Scores of 10–14 suggest moderate symptoms. 10 is the score where clinicians usually suggest an assessment.' }, { max: 19, level: 3, label: 'Moderately severe', text: 'Scores of 15–19 suggest moderately severe symptoms. Please talk to a doctor or therapist.' }, { max: 27, level: 3, label: 'Severe', text: 'Scores of 20–27 suggest severe symptoms. Please see a doctor soon.' }],
      next: ['behav_activation', 'movement', 'social_dose'] },
    { id: 'gad7', n: 'Anxiety check (GAD-7)', kind: 'validated', cond: 'gad', time: '2 min',
      source: 'Generalized Anxiety Disorder-7, developed by Drs Robert L. Spitzer, Janet B.W. Williams, Kurt Kroenke and colleagues, with an educational grant from Pfizer Inc. No permission required to reproduce.',
      intro: 'Over the last 2 weeks, how often have you been bothered by the following problems?', opts: TWO_WEEKS,
      items: ['Feeling nervous, anxious, or on edge', 'Not being able to stop or control worrying', 'Worrying too much about different things', 'Trouble relaxing', 'Being so restless that it is hard to sit still', 'Becoming easily annoyed or irritable', 'Feeling afraid, as if something awful might happen'],
      bands: [{ max: 4, level: 0, label: 'Minimal', text: 'Scores of 0–4 suggest minimal anxiety.' }, { max: 9, level: 1, label: 'Mild', text: 'Scores of 5–9 suggest mild anxiety.' }, { max: 14, level: 2, label: 'Moderate', text: 'Scores of 10–14 suggest moderate anxiety. 10 is the usual point to get an assessment.' }, { max: 21, level: 3, label: 'Severe', text: 'Scores of 15–21 suggest severe anxiety. Please talk to a professional.' }],
      next: ['breath_slow', 'worry_time', 'movement'] },
    { id: 'pcptsd5', n: 'Trauma check (PC-PTSD-5)', kind: 'validated', cond: 'ptsd', time: '2 min',
      source: 'Primary Care PTSD Screen for DSM-5 (Prins et al., 2015), US Department of Veterans Affairs National Center for PTSD. Public domain.',
      gate: 'Sometimes things happen to people that are unusually or especially frightening, horrible, or traumatic. For example: a serious accident or fire; a physical or sexual assault or abuse; an earthquake or flood; a war; seeing someone be killed or seriously injured; having a loved one die through homicide or suicide. Have you ever experienced this kind of event?',
      intro: 'In the past month, have you…', opts: YESNO,
      items: ['had nightmares about the event(s) or thought about the event(s) when you did not want to?', 'tried hard not to think about the event(s) or went out of your way to avoid situations that reminded you of the event(s)?', 'been constantly on guard, watchful, or easily startled?', 'felt numb or detached from people, activities, or your surroundings?', 'felt guilty or unable to stop blaming yourself or others for the event(s) or any problems the event(s) may have caused?'],
      bands: [{ max: 2, level: 0, label: 'Negative screen', text: 'Fewer than 3 “yes” answers. That doesn’t rule out distress after a hard event: if it bothers you, it’s worth talking about.' }, { max: 3, level: 2, label: 'Positive screen', text: '3 “yes” answers is the cut-off the National Center for PTSD suggests (some clinics use 4). A positive screen means a fuller assessment is worthwhile, not that you have PTSD.' }, { max: 5, level: 3, label: 'Positive screen', text: '4 or 5 “yes” answers. A fuller assessment with a trauma-informed professional is a good idea. PTSD is very treatable.' }],
      next: ['ground_54321', 'breath_slow', 'safety_plan'] },
    { id: 'auditc', n: 'Drinking check (AUDIT-C)', kind: 'validated', cond: 'alcohol', time: '1 min',
      source: 'AUDIT-C (Bush et al., 1998), the first three questions of the World Health Organization’s AUDIT. A “standard drink” is about 14 g of alcohol in the US (a 355 ml beer, 150 ml wine, 45 ml spirits); 10 g in many other countries.',
      intro: 'Think about the past year.',
      items: [{ q: 'How often do you have a drink containing alcohol?', opts: [['Never', 0], ['Monthly or less', 1], ['2–4 times a month', 2], ['2–3 times a week', 3], ['4 or more times a week', 4]] },
              { q: 'How many standard drinks containing alcohol do you have on a typical day when you are drinking?', opts: [['1 or 2', 0], ['3 or 4', 1], ['5 or 6', 2], ['7 to 9', 3], ['10 or more', 4]] },
              { q: 'How often do you have six or more drinks on one occasion?', opts: [['Never', 0], ['Less than monthly', 1], ['Monthly', 2], ['Weekly', 3], ['Daily or almost daily', 4]] }],
      bands: [{ max: 2, level: 0, label: 'Lower risk', text: 'Scores of 0–2 are below the usual cut-offs.' }, { max: 3, level: 1, label: 'Positive for women', text: 'A score of 3 is a positive screen for women (the cut-off for men is 4). Worth looking at your drinking.' }, { max: 7, level: 2, label: 'Positive screen', text: 'Scores of 4 and up are a positive screen for everyone: drinking at a level that may be harming health. Talk to a doctor about cutting down.' }, { max: 12, level: 3, label: 'High', text: 'Scores of 8 and up suggest higher risk. Talk to a doctor, and don’t stop suddenly if you drink heavily every day (withdrawal can be dangerous).' }],
      next: ['urge_surf', 'halt', 'delay_distract'] },

    // ------------------------------------------------------------------------------ pattern checks (ours, not validated)
    { id: 'adhd', n: 'Focus & steering check', kind: 'pattern', cond: 'adhd', time: '3 min', opts: OFTEN,
      intro: 'Over the past 6 months, and thinking about most of your life, how often…',
      items: ['do you lose focus in conversations, reading or meetings, even when you want to pay attention?', 'do you make careless mistakes on boring or detailed work?', 'do you struggle to organise tasks, time and belongings?', 'do you avoid or delay tasks that need sustained mental effort?', 'do you lose things you need (keys, phone, papers)?', 'do you forget appointments, bills or promises?', 'do you feel restless, fidgety or driven like a motor?', 'do you interrupt, finish people’s sentences or talk over others?', 'do you act or buy on impulse and regret it?', 'do you underestimate how long things take, or run late?', 'do you hyperfocus on interesting things and lose track of time?', 'did teachers or family describe you as daydreamy, chatty, messy or “not living up to potential” as a child?'],
      note: 'Inspired by DSM-5-TR ADHD criteria. The validated adult screener is the WHO Adult ADHD Self-Report Scale (ASRS); ask a clinician to use it.',
      next: ['external_brain', 'pomodoro', 'body_double'] },
    { id: 'panic', n: 'Panic check', kind: 'pattern', cond: 'panic', time: '1 min', opts: OFTEN,
      intro: 'In the past month, how often…',
      items: ['did you have sudden surges of intense fear that peaked within minutes?', 'did your heart pound, or did you feel short of breath, dizzy or shaky during them?', 'did you fear you were dying, losing control or going crazy?', 'did you worry about having another attack?', 'did you avoid places or situations in case an attack happened?', 'did attacks come out of the blue, with no obvious trigger?'],
      next: ['breath_sigh', 'ground_54321', 'exposure_ladder'] },
    { id: 'social', n: 'Social nerves check', kind: 'pattern', cond: 'social', time: '2 min', opts: OFTEN,
      intro: 'How often…',
      items: ['do you fear being judged, embarrassed or humiliated around people?', 'do you avoid parties, meetings, calls or speaking up because of that fear?', 'do you worry for days before a social event?', 'do you replay conversations afterwards, looking for mistakes?', 'do you blush, sweat, shake or go blank and fear people notice?', 'do you use safety behaviours (rehearsing, staying quiet, drinking) to get through?', 'do you turn down opportunities (jobs, dates, classes) because of social fear?', 'has this fear been there for six months or more?'],
      next: ['exposure_ladder', 'thought_record', 'self_compassion'] },
    { id: 'ocd', n: 'Stuck thoughts & rituals check', kind: 'pattern', cond: 'ocd', time: '2 min', opts: OFTEN,
      intro: 'How often…',
      items: ['do unwanted, disturbing thoughts or images pop into your head?', 'do those thoughts feel shocking or against who you are?', 'do you check things (locks, stove, messages) repeatedly?', 'do you wash, clean, count, pray or repeat actions until it “feels right”?', 'do you mentally review, argue with or try to cancel thoughts?', 'do you ask others for reassurance about the same fear?', 'do you avoid things that trigger the thoughts?', 'do these thoughts or rituals take up more than an hour of your day?'],
      next: ['exposure_ladder', 'defusion', 'urge_surf'] },
    { id: 'burnout', n: 'Burnout check', kind: 'pattern', cond: 'burnout', time: '2 min', opts: OFTEN,
      intro: 'Thinking about your work (paid, study or caring), how often…',
      items: ['do you feel emotionally drained by it?', 'do you wake up tired at the thought of another day?', 'does a weekend or holiday fail to recharge you?', 'do you feel cynical or detached from it?', 'do you care less about the people it serves?', 'do you think “what’s the point?”', 'do you feel you aren’t accomplishing anything worthwhile?', 'do you feel less effective than you used to?', 'do you feel you have little control over your workload or how you work?'],
      note: 'Built on the three dimensions in the WHO’s ICD-11 definition: exhaustion, mental distance and reduced efficacy.',
      next: ['boundary_script', 'values', 'movement'] },
    { id: 'insomnia', n: 'Sleep check', kind: 'pattern', cond: 'insomnia', time: '1 min', opts: OFTEN,
      intro: 'In the past month, how often…',
      items: ['did it take you more than 30 minutes to fall asleep?', 'did you wake in the night and struggle to get back to sleep?', 'did you wake too early and couldn’t get back to sleep?', 'did you lie in bed worrying about not sleeping?', 'did poor sleep affect your mood, focus or energy the next day?', 'did you stay up late on purpose to get time for yourself?', 'has this happened three nights a week or more for three months?'],
      next: ['sleep_window', 'wind_down', 'worry_time'] },
    { id: 'autism', n: 'Wiring & sensors check', kind: 'pattern', cond: 'autism', time: '3 min', opts: AGREE,
      intro: 'How much is this like you, now and across your life?',
      items: ['Small talk feels pointless or exhausting.', 'I often don’t know when it’s my turn to talk or how to end a conversation.', 'People say I’m too blunt or misread my tone.', 'I prefer routines and get very unsettled by sudden changes.', 'I have intense interests I could talk about for hours.', 'Noise, light, smells or textures bother me more than most people.', 'I copy other people’s behaviour to fit in.', 'After socialising I need a lot of time alone to recover.', 'I notice details others miss.', 'I find it hard to tell what others are thinking or feeling from their faces.', 'I have had meltdowns or shutdowns when overloaded.', 'I felt different from other children growing up.'],
      note: 'Not the AQ or RAADS-R: our own items based on DSM-5-TR autism criteria and autistic adults’ accounts. Only a specialist assessment can diagnose autism.',
      next: ['sensory_kit', 'boundary_script', 'self_compassion'] },
    { id: 'narc_self', n: 'Narcissistic traits check (about yourself)', kind: 'pattern', cond: 'npd', time: '2 min', opts: AGREE,
      intro: 'Be honest: this one only works if you are. How much is this like you?',
      items: ['I’m more talented or special than most people.', 'I deserve special treatment and get annoyed when rules apply to me.', 'I need a lot of admiration to feel good.', 'Criticism makes me furious or deeply ashamed.', 'Other people’s problems often bore me.', 'I use people to get ahead, and that’s just how the world works.', 'I’m often envious of others, or think they envy me.', 'I fantasise about great success, power or recognition.', 'I feel secretly hurt and resentful when I’m not recognised.', 'Relationships tend to start brilliantly and end in disappointment with the other person.'],
      note: 'Based on the nine DSM-5-TR NPD traits and research on grandiose and vulnerable narcissism. Everyone has some narcissism; it’s about degree and harm.',
      next: ['self_compassion', 'values', 'opposite_action'] },
    { id: 'relationship', n: 'Relationship red flags check', kind: 'pattern', cond: 'abuse', time: '3 min', opts: OFTEN,
      intro: 'This is about what you experience, not about labelling the other person. Think of one person (partner, parent, boss). How often do they…',
      items: ['say things happened differently than you remember, until you doubt yourself?', 'criticise, mock or humiliate you, including as “jokes”?', 'get angry or punish you if you see friends or family?', 'check your phone, money, location or messages?', 'blame you for their moods and actions?', 'switch between cruelty and great sweetness?', 'give you the silent treatment to punish you?', 'make you feel you’re walking on eggshells?', 'threaten to leave, hurt you, themselves or your things?', 'pressure you into things you don’t want, including sex?', 'make you feel you can’t leave, or that nobody else would want you?', 'make you feel afraid?'],
      note: 'Based on research on coercive control and emotional abuse. If you feel unsafe, contact a domestic abuse service: they help with planning, not only leaving.',
      next: ['reality_log', 'boundary_script', 'safety_plan'] },
    { id: 'bpd', n: 'Emotional storms check', kind: 'pattern', cond: 'bpd', time: '2 min', opts: OFTEN,
      intro: 'Over the past few years, how often…',
      items: ['have you gone to great lengths to avoid being abandoned?', 'have your relationships swung between idealising someone and feeling they’re terrible?', 'have you felt unsure who you really are?', 'have you done impulsive things that could hurt you (spending, sex, substances, driving, bingeing)?', 'have you hurt yourself or thought of suicide when upset?', 'have your moods changed sharply within hours?', 'have you felt empty inside?', 'have you had intense anger that’s hard to control?', 'have you felt paranoid or detached under stress?'],
      note: 'Based on the nine DSM-5-TR criteria. Only a clinician can diagnose BPD, and it is very treatable (DBT).',
      next: ['tipp', 'opposite_action', 'dear_man'] },
    { id: 'pleaser', n: 'People-pleaser check', kind: 'pattern', cond: 'pleasing', time: '1 min', opts: OFTEN,
      intro: 'How often…',
      items: ['do you say yes when you want to say no?', 'do you apologise when you haven’t done anything wrong?', 'do you hide your opinion to avoid conflict?', 'do you feel responsible for other people’s feelings?', 'do you feel guilty when you put yourself first?', 'do you feel resentful after helping?', 'do you change yourself to fit what others want?', 'do you struggle to name what you want?'],
      next: ['boundary_script', 'dear_man', 'values'] },
    { id: 'imposter', n: 'Imposter check', kind: 'pattern', cond: 'imposter', time: '1 min', opts: AGREE,
      intro: 'How much is this like you?',
      items: ['I fear people will discover I’m not as capable as they think.', 'When I succeed, I think it was luck or a mistake.', 'I discount praise.', 'I over-prepare to avoid being found out.', 'I compare myself with others and feel I fall short.', 'I avoid applying for things I’m qualified for.', 'Small mistakes feel like proof I’m a fraud.', 'I feel my achievements are less than others think.'],
      next: ['evidence_file', 'thought_record', 'self_compassion'] },
    { id: 'attachment', n: 'Attachment style check', kind: 'pattern', cond: 'anxattach', time: '3 min', opts: AGREE, subscales: { anx: [0, 2, 4, 6, 8, 10], avo: [1, 3, 5, 7, 9, 11] },
      intro: 'Think about close relationships in general (partners, close friends). How much is this like you?',
      items: ['I worry that people I love will leave me.', 'I prefer not to depend on others.', 'I need a lot of reassurance that I’m loved.', 'I get uncomfortable when people want to get very close.', 'When someone doesn’t reply, I imagine the worst.', 'I keep my feelings to myself, even with partners.', 'I feel calmer when I’m close to my partner, anxious when apart.', 'I value my independence more than closeness.', 'I sometimes test people to see if they care.', 'I pull away when a relationship gets serious.', 'I fear I care more than they do.', 'I find it hard to ask for comfort.'],
      note: 'Inspired by adult attachment research (the Experiences in Close Relationships approach by Brennan, Clark and Shaver). Two dials: anxiety and avoidance. Low on both is “secure”.',
      next: ['self_compassion', 'dear_man', 'reparent'] },
    { id: 'codependency', n: 'Codependency check', kind: 'pattern', cond: 'codependency', time: '1 min', opts: OFTEN,
      intro: 'How often…',
      items: ['does your mood depend on someone else’s?', 'do you cover for or clean up after someone’s behaviour?', 'do you feel you must fix other people’s problems?', 'do you lose track of your own needs in a relationship?', 'do you stay in relationships out of guilt or fear?', 'do you feel anxious when you can’t control a situation with someone you love?', 'do you feel your worth depends on being needed?', 'do you find it hard to say no to someone close?'],
      next: ['boundary_script', 'values', 'self_compassion'] },
    { id: 'cen', n: 'Emotional neglect check', kind: 'pattern', cond: 'cen', time: '2 min', opts: AGREE,
      intro: 'How much is this like you?',
      items: ['I often don’t know what I’m feeling.', 'I feel different from other people, like something’s missing.', 'I’m very self-reliant and hate asking for help.', 'I’m harder on myself than on anyone else.', 'I feel empty or numb more than I’d like.', 'Growing up, feelings weren’t talked about at home.', 'When I was upset as a child, I mostly dealt with it alone.', 'I find it hard to know what I want or need.', 'I feel uncomfortable when people are kind or caring to me.', 'My childhood looked fine, yet something felt lacking.'],
      note: 'Inspired by Jonice Webb’s description of childhood emotional neglect. Not a validated test.',
      next: ['reparent', 'expressive_writing', 'self_compassion'] },
    { id: 'perfection', n: 'Perfectionism check', kind: 'pattern', cond: 'perfectionism', time: '1 min', opts: AGREE,
      intro: 'How much is this like you?',
      items: ['If it isn’t perfect, it’s a failure.', 'I procrastinate because I fear it won’t be good enough.', 'I feel others expect me to be perfect.', 'My worth depends on how well I perform.', 'I check and redo work many times.', 'Small mistakes ruin my day.', 'I find it hard to delegate because others won’t do it right.', 'When I reach a goal, I immediately raise the bar.'],
      next: ['self_compassion', 'two_minute', 'values'] },
    { id: 'lonely', n: 'Connection check', kind: 'pattern', cond: 'loneliness', time: '1 min', opts: OFTEN,
      intro: 'How often do you feel…',
      items: ['that you lack companionship?', 'left out?', 'isolated from others?', 'that no one really knows you well?', 'that there’s nobody you could call in a crisis?', 'lonely even when you’re with people?'],
      next: ['social_dose', 'behav_activation', 'exposure_ladder'] },
    { id: 'phone', n: 'Phone & feed check', kind: 'pattern', cond: 'phoneuse', time: '1 min', opts: OFTEN,
      intro: 'How often…',
      items: ['do you pick up your phone without deciding to?', 'do you scroll longer than you meant to?', 'do you use your phone in bed past when you meant to sleep?', 'do you feel anxious without your phone?', 'do you feel worse about yourself after social media?', 'do you check your phone during conversations or meals?', 'have you tried to cut down and not managed?', 'do you use the phone to avoid uncomfortable feelings?'],
      next: ['phone_friction', 'urge_surf', 'social_dose'] },
    { id: 'eating', n: 'Food & body check', kind: 'pattern', cond: 'binge', time: '1 min', opts: OFTEN,
      intro: 'In the past three months, how often…',
      items: ['have you eaten a large amount and felt you couldn’t stop?', 'have you skipped meals or restricted food to control your weight?', 'have you made yourself sick, used laxatives or exercised hard to “make up” for eating?', 'have thoughts about food, weight or shape filled your day?', 'has your weight or shape strongly decided how you feel about yourself?', 'have you eaten in secret or felt ashamed about eating?'],
      note: 'Eating disorders need professional care. If you answered “often” to purging or restricting, please talk to a doctor.',
      next: ['self_compassion', 'urge_surf', 'halt'] },
    { id: 'selfesteem', n: 'Self-esteem check', kind: 'pattern', cond: 'selfesteem', time: '1 min', opts: AGREE,
      intro: 'How much is this like you?',
      items: ['I’m my own harshest critic.', 'I find it hard to accept compliments.', 'I often feel I’m not good enough.', 'I compare myself unfavourably with others.', 'I avoid trying things in case I fail.', 'I feel ashamed of who I am.', 'I think others would like me less if they really knew me.', 'Mistakes feel like proof I’m worthless.'],
      next: ['self_compassion', 'inner_critic', 'evidence_file'] },
    { id: 'anger', n: 'Temper check', kind: 'pattern', cond: 'anger', time: '1 min', opts: OFTEN,
      intro: 'In the past few months, how often…',
      items: ['did you lose your temper over small things?', 'did you shout, slam doors or break things?', 'did your anger scare people around you?', 'did you regret what you said or did when angry?', 'did your anger go from 0 to 10 with little warning?', 'did anger cause problems at work, on the road or at home?'],
      next: ['anger_timeout', 'breath_sigh', 'halt'] },
    { id: 'hsp', n: 'Sensitivity check', kind: 'pattern', cond: 'hsp', time: '2 min', opts: AGREE,
      intro: 'How much is this like you?',
      items: ['Loud noises, bright lights or strong smells get to me.', 'Busy days leave me needing time alone.', 'I notice subtle details others miss.', 'Other people’s moods affect me a lot.', 'I’m deeply moved by music, art or nature.', 'I startle easily.', 'Violent films or news upset me for a long time.', 'Caffeine affects me strongly.', 'I get overwhelmed when I have a lot to do in little time.', 'I try hard to avoid mistakes and forgetting things.'],
      note: 'Inspired by Elaine Aron’s work on sensory processing sensitivity. Not the HSP Scale itself.',
      next: ['sensory_kit', 'boundary_script', 'breath_slow'] },
    { id: 'mood_high', n: 'High-mood check', kind: 'pattern', cond: 'bipolar', time: '2 min', opts: YESNO,
      intro: 'Has there ever been a period of several days when you weren’t your usual self and…',
      items: ['you felt so good or hyper that others thought you weren’t your normal self?', 'you needed much less sleep than usual and didn’t feel tired?', 'you were much more talkative or spoke much faster?', 'thoughts raced through your head?', 'you were much more confident or felt unusually important?', 'you spent money, drove or took risks in ways that got you into trouble?', 'you started lots of projects or were much more active?', 'people close to you were worried about how you were acting?'],
      note: 'Inspired by bipolar criteria. Not the Mood Disorder Questionnaire. If several are “yes”, mention them to any doctor before starting an antidepressant.',
      next: ['gauge_log', 'sleep_window', 'safety_plan'] },
    { id: 'grief', n: 'Grief check', kind: 'pattern', cond: 'grief', time: '1 min', opts: OFTEN,
      intro: 'Thinking about someone you lost more than a year ago, how often in the past month…',
      items: ['did you feel intense longing for them?', 'were you preoccupied with thoughts of them or the death?', 'did you feel part of yourself died with them?', 'did you struggle to believe they’re gone?', 'did you avoid reminders?', 'did you feel intense pain, anger or bitterness about the death?', 'did you struggle to re-engage with life or plans?', 'did life feel meaningless without them?'],
      note: 'Based on DSM-5-TR prolonged grief disorder criteria.',
      next: ['expressive_writing', 'social_dose', 'self_compassion'] },

    // ------------------------------------------------------------------------------ childhood
    { id: 'aces', n: 'Childhood adversity count (ACEs)', kind: 'aces', cond: 'cptsd', time: '2 min', opts: YESNO,
      source: 'The 10 Adverse Childhood Experiences from the CDC–Kaiser Permanente ACE Study (Felitti et al., 1998), in plain words.',
      intro: 'Before you turned 18…',
      items: ['did a parent or adult at home often swear at you, insult you, put you down or make you afraid you’d be hurt?', 'did a parent or adult at home often push, grab, slap or hit you, or hurt you so badly you had marks or injuries?', 'did an adult or someone at least 5 years older ever touch you sexually or try to make you touch them, or attempt sex?', 'did you often feel nobody in your family loved you or thought you were special, or that your family didn’t look out for each other?', 'did you often not have enough to eat, wear dirty clothes or have no one to protect you, or were your parents too drunk or high to take care of you?', 'were your parents ever separated or divorced?', 'was your mother or stepmother often pushed, grabbed, slapped, hit or threatened?', 'did you live with anyone who had a problem with drinking or used street drugs?', 'was a household member depressed, mentally ill, or did anyone attempt suicide?', 'did a household member go to prison?'],
      bands: [{ max: 0, level: 0, label: '0 ACEs', text: 'None of the 10 listed experiences. Other hard things can still matter: see the Factory Settings check.' }, { max: 3, level: 1, label: '1–3 ACEs', text: 'About two-thirds of adults in the original study had at least one. Each adds some risk; support and good relationships lower it.' }, { max: 10, level: 3, label: '4 or more ACEs', text: 'In the original study, 4 or more ACEs were linked to much higher risk of depression, addiction and physical illness. That’s a population average, not your fate: protective relationships and therapy make a big difference.' }],
      note: 'ACE scores are a research tool for populations, not a prediction for one person. Positive childhood experiences (at least one adult who cared, belonging at school) protect too (Bethell et al., 2019).',
      next: ['reparent', 'self_compassion', 'expressive_writing'] },
    { id: 'factory', n: 'Factory Settings check', kind: 'factory', cond: 'cen', time: '5 min',
      intro: 'Growing up, how true was this of your family? Answer for the adults who raised you. There are no wrong answers, and this isn’t about blame.',
      opts: [['Not at all', 0], ['A bit', 1], ['Clearly', 2]],
      next: ['reparent', 'self_compassion', 'boundary_script'] }
  ];

  BM.scanById = {};
  BM.SCANS.forEach(function (s) { BM.scanById[s.id] = s; });
})();

/* ===== _bmd_tools.html ===== */
(function () {
  var BM = window.BM = window.BM || {};

  BM.TOOL_CATS = [
    { id: 'calm', name: 'Calm the alarm', line: 'For panic, stress and overwhelm, in minutes.' },
    { id: 'crisis', name: 'Emergency kit', line: 'For the worst moments.' },
    { id: 'think', name: 'Rethink', line: 'Work with thoughts instead of obeying them.' },
    { id: 'move', name: 'Get the engine going', line: 'For low mood and stuck energy.' },
    { id: 'focus', name: 'Steering & focus', line: 'For starting, finishing and staying on track.' },
    { id: 'habits', name: 'Habits & urges', line: 'For loops you want to break.' },
    { id: 'people', name: 'People & boundaries', line: 'For relationships, families and difficult people.' },
    { id: 'self', name: 'Self-repair', line: 'For the inner critic and old wounds.' },
    { id: 'rest', name: 'Rest & recharge', line: 'For sleep and sensory overload.' }
  ];

  BM.BREATHS = {
    box: { name: 'Box breathing', steps: [['Breathe in', 4], ['Hold', 4], ['Breathe out', 4], ['Hold', 4]] },
    sigh: { name: 'Physiological sigh', steps: [['Breathe in through the nose', 2], ['Top up with a second short sniff', 1], ['Long, slow breath out through the mouth', 6]] },
    slow: { name: 'Slow exhale', steps: [['Breathe in', 4], ['Breathe out slowly', 6]] }
  };

  BM.TOOLS = [
    // --------------------------------------------------------------------------------- calm the alarm
    { id: 'breath_sigh', n: 'The physiological sigh', cat: 'calm', time: '1–5 min', w: 'breath:sigh',
      line: 'Two breaths in, one long breath out: the fastest way to take the edge off.',
      why: 'A double inhale reopens collapsed air sacs and a long exhale slows the heart through the vagus nerve. In a 2023 study (Balban et al., Cell Reports Medicine), five minutes a day of “cyclic sighing” lifted mood and lowered breathing rate more than mindfulness meditation.',
      steps: ['Breathe in through your nose.', 'Without breathing out, take a second short sniff to fill your lungs completely.', 'Breathe out slowly through your mouth until empty.', 'Repeat 2–3 times for a quick reset, or for five minutes as a daily practice.'] },
    { id: 'breath_slow', n: 'Slow exhale breathing', cat: 'calm', time: '3–5 min', w: 'breath:slow',
      line: 'Make the out-breath longer than the in-breath, about six breaths a minute.',
      why: 'Slow breathing with long exhales shifts the nervous system toward rest and increases heart-rate variability (Zaccaro et al., 2018 review).',
      steps: ['Sit or lie comfortably.', 'Breathe in through the nose for 4.', 'Breathe out gently for 6, like blowing through a straw.', 'Keep going for 3–5 minutes. If you feel light-headed, breathe more softly.'] },
    { id: 'breath_box', n: 'Box breathing', cat: 'calm', time: '2–4 min', w: 'breath:box',
      line: 'In, hold, out, hold: four equal sides. Easy to remember under pressure.',
      why: 'A steady rhythm gives the mind one simple job and slows breathing. Used by athletes, nurses and the military for acute stress.',
      steps: ['Breathe in for 4.', 'Hold for 4.', 'Breathe out for 4.', 'Hold for 4.', 'Repeat four rounds or more.'] },
    { id: 'ground_54321', n: '5-4-3-2-1 grounding', cat: 'calm', time: '3 min', w: 'ground',
      line: 'Pull your attention out of the alarm and into the room, sense by sense.',
      why: 'Naming sensory details engages attention in the present, interrupting panic, flashbacks and dissociation. It’s a standard grounding skill in trauma and anxiety therapy.',
      steps: ['Name 5 things you can see.', 'Name 4 things you can feel (feet on the floor, fabric, air).', 'Name 3 things you can hear.', 'Name 2 things you can smell (or like the smell of).', 'Name 1 thing you can taste, or one kind thing to tell yourself.'] },
    { id: 'worry_time', n: 'Worry time', cat: 'calm', time: '15 min a day', w: 'sheet',
      line: 'Give worry an appointment so it stops showing up all day.',
      why: 'Postponing worry to a set daily slot reduces how much time people spend worrying (Borkovec’s stimulus control studies; McGowan & Behar, 2013).',
      steps: ['Pick a 15-minute slot each day (not near bedtime).', 'When a worry shows up outside it, jot it down and say “later”.', 'At worry time, go through the list: can I act on this? If yes, plan one step. If no, let it go for today.', 'When the time is up, stop, even mid-worry.'],
      fields: [['worry', 'What’s the worry?', 'area', 'e.g. I’ll mess up the presentation'], ['act', 'Can I do something about it today?', 'text', 'Yes: what? No: let it go for now'], ['step', 'One next step (if any)', 'text', 'e.g. rehearse once at 4 pm']] },
    { id: 'defusion', n: 'Unhook from a thought', cat: 'think', time: '2 min', w: null,
      line: 'Notice “I’m having the thought that…” instead of believing every thought.',
      why: 'Cognitive defusion is a core skill of Acceptance and Commitment Therapy (ACT). Studies show it reduces how believable and upsetting negative thoughts feel (Masuda et al., 2004).',
      steps: ['Catch a sticky thought: “I’m a failure.”', 'Add “I’m having the thought that I’m a failure.”', 'Then: “I notice I’m having the thought that…”', 'Try saying it in a silly voice, or sing it to “Happy Birthday”.', 'Let the thought stay while you do what matters.'] },

    // --------------------------------------------------------------------------------- crisis
    { id: 'safety_plan', n: 'Safety plan', cat: 'crisis', time: '20 min, once', w: 'sheet',
      line: 'A plan written on a calm day, for the hardest days.',
      why: 'The Stanley–Brown safety planning intervention was linked to about 45% fewer suicidal behaviours in emergency department patients (Stanley et al., JAMA Psychiatry, 2018).',
      steps: ['Write your warning signs.', 'List things you can do alone to cope.', 'List people and places that distract you.', 'List people you can ask for help.', 'Add professionals and crisis lines.', 'Make your environment safer.', 'Keep it on your phone and paper.'],
      fields: [['signs', '1. My warning signs', 'area', 'Thoughts, feelings, situations that come before a crisis'], ['alone', '2. Things I can do on my own', 'area', 'e.g. cold shower, music, walk the dog'], ['distract', '3. People and places that help me feel better', 'area', ''], ['help', '4. People I can ask for help (names and numbers)', 'area', ''], ['pros', '5. Professionals and crisis lines', 'area', 'e.g. my GP, 988, Samaritans 116 123'], ['safe', '6. Making my space safer', 'area', 'e.g. medicines kept by a friend'], ['reason', 'My reason for living', 'text', '']] },
    { id: 'tipp', n: 'TIPP: change your body chemistry', cat: 'crisis', time: '5–15 min', w: null,
      line: 'When emotions are at 10/10, start with the body, not with thinking.',
      why: 'TIPP is a DBT distress-tolerance skill (Linehan). Cold water on the face triggers the dive reflex and slows the heart; intense exercise burns off adrenaline.',
      steps: ['Temperature: hold your face in cold water, or press an ice pack to your eyes and cheeks, for 30 seconds while holding your breath (skip if you have heart problems).', 'Intense exercise: sprint, jumping jacks, stairs, for a few minutes.', 'Paced breathing: breathe out longer than in.', 'Paired muscle relaxation: tense a muscle group as you breathe in, release as you breathe out.'] },

    // --------------------------------------------------------------------------------- think
    { id: 'thought_record', n: 'Thought record', cat: 'think', time: '10 min', w: 'sheet',
      line: 'Take a painful thought to court: evidence for, evidence against, verdict.',
      why: 'The thought record is a core tool of cognitive behavioural therapy (Beck), the most researched form of talk therapy for depression and anxiety.',
      steps: ['Describe the situation in facts.', 'Write the automatic thought and how much you believe it.', 'Name the feeling and rate it 0–100.', 'List evidence for and against.', 'Write a more balanced thought.', 'Re-rate the feeling.'],
      fields: [['situation', 'Situation', 'text', 'Where, when, who? Facts only'], ['thought', 'Automatic thought', 'text', 'e.g. They think I’m useless'], ['feeling', 'Feeling', 'text', 'e.g. anxious, ashamed'], ['before', 'How strong (0–100)?', 'range', ''], ['for', 'Evidence for', 'area', ''], ['against', 'Evidence against', 'area', 'What would a friend say? What else could explain it?'], ['balanced', 'More balanced thought', 'area', ''], ['after', 'How strong now (0–100)?', 'range', '']] },
    { id: 'problem_solve', n: 'Problem-solving steps', cat: 'think', time: '15 min', w: 'sheet',
      line: 'Turn a cloud of worry into one concrete next step.',
      why: 'Problem-solving therapy is an effective treatment for depression and stress (Cuijpers et al., 2018 meta-analysis).',
      steps: ['Define the problem in one sentence.', 'Brainstorm options without judging.', 'Weigh pros and cons.', 'Pick one and plan the first step.', 'Try it, then review.'],
      fields: [['problem', 'The problem, in one sentence', 'text', ''], ['options', 'All possible options (silly ones too)', 'area', ''], ['choice', 'The option I’ll try', 'text', ''], ['step', 'First step, when', 'text', 'e.g. Email HR on Monday at 10']] },
    { id: 'evidence_file', n: 'Evidence file', cat: 'self', time: '2 min a day', w: 'sheet',
      line: 'Collect proof against the voice that says you’re a fraud or failure.',
      why: 'Memory is biased toward threats and failures, especially with low mood. Writing down positives counters that bias (a common CBT technique for low self-esteem, Fennell).',
      steps: ['Each day, write one thing you did well, someone thanked you for, or you got through.', 'Include small things.', 'Read the file when the critic gets loud.'],
      fields: [['win', 'Something I did, handled or was thanked for', 'area', ''], ['means', 'What this says about me', 'text', 'e.g. I’m reliable under pressure']] },
    { id: 'inner_critic', n: 'Name the inner critic', cat: 'self', time: '10 min', w: 'sheet',
      line: 'Give the harsh voice a name and a character, so it stops sounding like truth.',
      why: 'Compassion-focused therapy (Gilbert) and ACT both use externalising the critic. It creates distance and makes room for a kinder voice.',
      steps: ['Write down what the critic usually says.', 'Whose voice does it sound like?', 'Give it a name (“The Inspector”).', 'What is it afraid of? Critics usually try to protect you.', 'Write what a wise, kind coach would say instead.'],
      fields: [['says', 'What the critic says', 'area', ''], ['whose', 'Whose voice is it?', 'text', ''], ['name', 'Its name', 'text', 'e.g. The Inspector'], ['fear', 'What is it trying to protect me from?', 'text', ''], ['coach', 'What a kind coach would say', 'area', '']] },

    // --------------------------------------------------------------------------------- get the engine going
    { id: 'behav_activation', n: 'Behavioural activation', cat: 'move', time: '10 min to plan', w: 'sheet',
      line: 'Act first, feel better later. Plan small doses of pleasure and achievement.',
      why: 'Behavioural activation is as effective as CBT for depression and can be delivered by non-specialists (Richards et al., COBRA trial, Lancet, 2016).',
      steps: ['List activities that used to bring pleasure or a sense of achievement.', 'Pick two small ones for tomorrow, with a time.', 'Do them even if you don’t feel like it.', 'Rate mood before and after.'],
      fields: [['pleasure', 'Something small that might bring pleasure', 'text', 'e.g. coffee on the balcony'], ['mastery', 'Something small that brings a sense of achievement', 'text', 'e.g. wash the dishes'], ['when', 'When exactly?', 'text', 'Tomorrow at…'], ['mood', 'Mood afterwards (0–10)', 'range10', '']] },
    { id: 'movement', n: 'Movement as medicine', cat: 'move', time: '10–30 min', w: 'timer:10:Move',
      line: 'Any movement counts. A brisk walk is a real treatment.',
      why: 'A 2024 BMJ network meta-analysis (Noetel et al.) found walking, jogging, yoga and strength training all reduced depression, with effects comparable to therapy. Exercise also reduces anxiety.',
      steps: ['Pick the easiest movement you’ll actually do.', 'Start with 10 minutes.', 'Outdoors and with someone is a bonus.', 'Notice how you feel after, not during.'] },
    { id: 'social_dose', n: 'A daily dose of people', cat: 'move', time: '5 min', w: null,
      line: 'One small connection a day: a text, a chat, a wave.',
      why: 'Even brief interactions with strangers and acquaintances lift mood (Sandstrom & Dunn, 2014). Connection protects against depression and early death (Holt-Lunstad, 2010).',
      steps: ['Send one message to someone you like.', 'Say something kind to someone who serves you.', 'Say yes to one invitation this week.', 'Join one recurring group.'] },
    { id: 'gauge_log', n: 'Daily gauge reading', cat: 'move', time: '1 min a day', w: 'garage',
      line: 'Log mood, energy, sleep, stress and focus. Patterns show up within weeks.',
      why: 'Self-monitoring is part of nearly every effective therapy. It helps spot triggers and early warning signs, especially for bipolar disorder and PMDD.',
      steps: ['Pick a regular time (evening works for most).', 'Rate each gauge honestly.', 'Add a one-line note.', 'Check the 30-day chart every week.'] },
    { id: 'values', n: 'Values compass', cat: 'move', time: '15 min', w: 'sheet',
      line: 'Know what you want to steer towards, not just what you’re avoiding.',
      why: 'Values work is central to ACT. Acting on values gives direction when feelings are unreliable.',
      steps: ['Pick life areas: relationships, work, health, fun, community, growth.', 'For each, write what kind of person you want to be.', 'Rate how closely you live it (0–10).', 'Choose one small action toward the lowest one.'],
      fields: [['area', 'Life area', 'text', 'e.g. friendship'], ['value', 'What matters to me here', 'area', 'e.g. being loyal and fun to be around'], ['score', 'How closely I live it now (0–10)', 'range10', ''], ['action', 'One small step this week', 'text', '']] },
    { id: 'expressive_writing', n: 'Expressive writing', cat: 'self', time: '15–20 min, 4 days', w: 'sheet',
      line: 'Write your deepest thoughts and feelings about something painful, just for you.',
      why: 'James Pennebaker’s studies found writing about emotional experiences for 15–20 minutes on 3–4 days improved health and mood for many people.',
      steps: ['Set a timer for 15 minutes.', 'Write without stopping about something that troubles you.', 'Don’t worry about grammar.', 'Repeat on 3–4 days.', 'It may feel worse briefly before better.'],
      fields: [['text', 'Write freely', 'area', 'Nobody else will read this.']] },

    // --------------------------------------------------------------------------------- focus
    { id: 'pomodoro', n: 'Pomodoro sprints', cat: 'focus', time: '25 min', w: 'timer:25:Focus sprint',
      line: '25 minutes on one thing, then a 5-minute break.',
      why: 'Short time-boxed sprints lower the cost of starting and add urgency, which especially helps ADHD brains.',
      steps: ['Pick one task.', 'Start the timer.', 'Phone in another room.', 'When distracted, jot it on paper and return.', 'Break for 5 minutes. After four, take a longer break.'] },
    { id: 'body_double', n: 'Body doubling', cat: 'focus', time: 'any', w: 'timer:25:Body double session',
      line: 'Work alongside someone, in person or on video, to make starting easier.',
      why: 'A popular ADHD strategy: another person’s presence adds gentle accountability. Research is still early, but many people find it transforms boring tasks.',
      steps: ['Ask a friend to work alongside you, or join an online co-working room.', 'Say out loud what you’ll work on.', 'Work together for 25–50 minutes.', 'Report back at the end.'] },
    { id: 'external_brain', n: 'An external brain', cat: 'focus', time: '30 min to set up', w: null,
      line: 'Get everything out of your head and into one trusted system.',
      why: 'Working memory is limited, and very limited in ADHD. Offloading tasks to a reliable system frees attention and reduces anxiety (Risko & Gilbert, 2016, “cognitive offloading”).',
      steps: ['Pick one capture place (an app or notebook), not five.', 'Write down every task as soon as it appears.', 'Review it daily at a set time.', 'Put dates in a calendar with alarms.', 'Make it visible: whiteboards, sticky notes by the door.'] },
    { id: 'two_minute', n: 'The two-minute start', cat: 'focus', time: '2 min', w: 'timer:2:Just start',
      line: 'Promise yourself only two minutes. Starting is the hard part.',
      why: 'Lowering the threshold to start reduces the emotional cost of a task; once moving, most people continue (a principle from behavioural activation and habit research).',
      steps: ['Pick the smallest physical action (open the file, put on shoes).', 'Set a two-minute timer.', 'When it rings, you may stop. Often you won’t.'] },
    { id: 'implementation', n: 'If-then plans', cat: 'focus', time: '5 min', w: 'sheet',
      line: '“If it’s 7 am and I’ve had coffee, then I open the report.”',
      why: 'Implementation intentions roughly doubled follow-through in a meta-analysis of 94 studies (Gollwitzer & Sheeran, 2006).',
      steps: ['Pick a goal.', 'Choose a specific trigger: time, place or event.', 'Write “If [trigger], then I will [action].”', 'Plan for obstacles too: “If I feel tired, then I’ll do just 10 minutes.”'],
      fields: [['goal', 'Goal', 'text', ''], ['ifthen', 'If… then I will…', 'text', 'If it’s 7 am and I’ve made coffee, then I’ll open the report'], ['obstacle', 'If [obstacle], then…', 'text', '']] },
    { id: 'phone_friction', n: 'Phone friction', cat: 'focus', time: '15 min to set up', w: null,
      line: 'Make the phone a little harder to grab and a lot less shiny.',
      why: 'Small amounts of friction change behaviour more reliably than willpower. Removing the phone from the room improved attention and working memory in one study (Ward et al., 2017).',
      steps: ['Turn off all notifications that aren’t from people.', 'Move social apps off the home screen, or delete them from the phone.', 'Turn on grayscale in the evening.', 'Charge the phone outside the bedroom.', 'Use screen-time limits with a password someone else knows.'] },

    // --------------------------------------------------------------------------------- habits
    { id: 'urge_surf', n: 'Urge surfing', cat: 'habits', time: '10 min', w: 'timer:10:Ride the wave',
      line: 'Urges rise, peak and fall like waves. Ride one without acting on it.',
      why: 'Mindfulness-based relapse prevention (Marlatt, Bowen) uses urge surfing; it reduced cravings and use in trials for substance use and smoking.',
      steps: ['Notice the urge and where you feel it in your body.', 'Rate it 0–10.', 'Breathe and watch it like a wave: notice it rise.', 'Don’t act. Keep watching it peak and pass.', 'Rate it again after 10 minutes.'] },
    { id: 'halt', n: 'HALT check', cat: 'habits', time: '30 sec', w: null,
      line: 'Before acting on an urge, ask: am I Hungry, Angry, Lonely or Tired?',
      why: 'A recovery-community tool: many urges are really unmet basic needs. Meeting the need often dissolves the urge.',
      steps: ['Pause when an urge or mood hits.', 'Hungry? Eat something.', 'Angry? Move, write, talk it out.', 'Lonely? Reach out.', 'Tired? Rest.'] },
    { id: 'delay_distract', n: 'Delay, distract, decide', cat: 'habits', time: '15 min', w: 'timer:15:Delay',
      line: 'Put 15 minutes between the urge and the action.',
      why: 'Cravings usually peak and fade within minutes. Delay alone helps many people skip or reduce the behaviour.',
      steps: ['Delay: “Not now. In 15 minutes I’ll decide.”', 'Distract: do something absorbing.', 'Decide: is it still worth it? Often the urge has passed.'] },
    { id: 'habit_reversal', n: 'Habit reversal', cat: 'habits', time: 'ongoing', w: null,
      line: 'Spot the habit, then replace it with a competing response.',
      why: 'Habit reversal training is the leading treatment for tics, hair pulling and skin picking (Bate et al., 2011 review).',
      steps: ['Awareness: note when, where and how it happens.', 'Choose a competing response that makes the habit impossible (clench fists, hold a fidget) for one minute.', 'Use it every time you notice the urge.', 'Ask someone to cheer your progress.'] },

    // --------------------------------------------------------------------------------- people
    { id: 'boundary_script', n: 'Boundary script', cat: 'people', time: '10 min', w: 'sheet',
      line: 'Plan the words before the moment: short, kind and clear.',
      why: 'Assertiveness training reduces anxiety and improves self-esteem. Having words ready makes it far more likely you’ll use them.',
      steps: ['Name what isn’t OK.', 'Say what you need instead.', 'Say what you’ll do if it continues (a consequence you control).', 'Practise saying it out loud.', 'Expect guilt and pushback; neither means you were wrong.'],
      fields: [['who', 'With whom?', 'text', ''], ['notok', 'When you…', 'text', 'e.g. comment on my weight'], ['need', 'I need…', 'text', 'e.g. you to stop'], ['will', 'If it continues, I will…', 'text', 'e.g. leave the dinner early'], ['say', 'The whole sentence I’ll say', 'area', '']] },
    { id: 'dear_man', n: 'DEAR MAN: asking for what you need', cat: 'people', time: '10 min', w: 'sheet',
      line: 'A DBT recipe for asking or saying no, without exploding or caving.',
      why: 'An interpersonal effectiveness skill from dialectical behaviour therapy (Linehan), widely used and well studied as part of DBT.',
      steps: ['Describe the facts.', 'Express your feelings (“I feel…”).', 'Assert what you want clearly.', 'Reinforce: say why it’s good for them too.', 'Stay Mindful: keep to your point.', 'Appear confident.', 'Negotiate: be willing to give to get.'],
      fields: [['describe', 'Describe (facts only)', 'text', ''], ['express', 'Express (I feel…)', 'text', ''], ['assert', 'Assert (I’d like…)', 'text', ''], ['reinforce', 'Reinforce (this would help us because…)', 'text', ''], ['negotiate', 'What I could offer in return', 'text', '']] },
    { id: 'gray_rock', n: 'Gray rock', cat: 'people', time: 'as needed', w: null,
      line: 'Become as boring as a gray rock to someone who feeds on drama.',
      why: 'A popular strategy for dealing with manipulative or high-conflict people when you can’t avoid them. It isn’t research-tested as such, but it fits how reinforcement works: no reaction, less reward. Not suitable if you’re in danger.',
      steps: ['Keep answers short, factual and dull (“OK.” “I’ll think about it.”).', 'Don’t share personal news, feelings or plans.', 'Don’t defend, argue or explain (JADE: don’t Justify, Argue, Defend, Explain).', 'Move practical matters to writing.', 'Get support elsewhere.'] },
    { id: 'reality_log', n: 'Reality log', cat: 'people', time: '5 min', w: 'sheet',
      line: 'Write things down when they happen, so nobody can rewrite your memory.',
      why: 'Gaslighting works by eroding trust in your own perception. A dated record restores it, and can be useful evidence if you need help later.',
      steps: ['Write the date and time.', 'What happened, in facts and quotes.', 'How you felt.', 'Keep it somewhere private and safe.'],
      fields: [['when', 'Date and time', 'text', ''], ['what', 'What happened (facts and exact words)', 'area', ''], ['felt', 'How I felt', 'text', '']] },
    { id: 'anger_timeout', n: 'The anger timeout', cat: 'people', time: '20–30 min', w: 'timer:20:Timeout',
      line: 'Leave before you explode, and come back when you’re calm.',
      why: 'Anger management programmes teach timeouts to break escalation. Heart rate needs about 20 minutes to settle after a big surge (Gottman’s “flooding” research).',
      steps: ['Spot your early signs: heat, clenched jaw, raised voice.', 'Say “I need a break. I’ll be back in 20 minutes.”', 'Leave. Walk, breathe, don’t rehearse the argument.', 'Come back and talk when calm.'] },

    // --------------------------------------------------------------------------------- self
    { id: 'self_compassion', n: 'Self-compassion break', cat: 'self', time: '2 min', w: null,
      line: 'Talk to yourself the way you’d talk to a friend who’s struggling.',
      why: 'Kristin Neff’s research links self-compassion with less anxiety and depression and more motivation. A meta-analysis (MacBeth & Gumley, 2012) found a large effect on psychological distress.',
      steps: ['Mindfulness: “This is a moment of suffering.”', 'Common humanity: “Struggling is part of being human. Others feel this too.”', 'Kindness: hand on heart, “May I be kind to myself.” Or ask what you’d say to a friend.'] },
    { id: 'reparent', n: 'Reparenting', cat: 'self', time: 'ongoing', w: 'sheet',
      line: 'Give yourself now what you needed then.',
      why: 'Schema therapy and inner-child work aim to meet needs that went unmet in childhood. Schema therapy has strong evidence for personality disorders and chronic problems.',
      steps: ['Recall a moment when you felt young and alone.', 'Ask: what did that child need to hear?', 'Write it to them, from you now.', 'Then find one way to give yourself that this week: rest, play, protection, praise.'],
      fields: [['age', 'How old was I?', 'text', ''], ['moment', 'The moment', 'area', ''], ['needed', 'What I needed to hear', 'area', ''], ['now', 'How I’ll give myself that this week', 'text', '']] },
    { id: 'opposite_action', n: 'Opposite action', cat: 'self', time: 'as needed', w: null,
      line: 'When an emotion doesn’t fit the facts, do the opposite of what it urges.',
      why: 'A DBT skill based on exposure principles: acting opposite to the urge (approach instead of avoid, reach out instead of withdraw) reduces the emotion over time.',
      steps: ['Name the emotion and its urge (fear: avoid; shame: hide; sadness: withdraw; anger: attack).', 'Check: does it fit the facts?', 'If not, do the opposite, all the way: posture, voice and action.'] },
    { id: 'radical_accept', n: 'Radical acceptance', cat: 'self', time: 'as needed', w: null,
      line: 'Stop fighting what you can’t change, so you can deal with what you can.',
      why: 'A DBT distress-tolerance skill. Acceptance isn’t approval; it reduces the extra suffering of “this shouldn’t be happening”.',
      steps: ['Notice the fight: “It’s not fair, it shouldn’t be like this.”', 'Remind yourself: this is how it is right now.', 'Let your body accept: relax your hands, half-smile.', 'Ask: given this, what’s my next wise step?'] },
    { id: 'exposure_ladder', n: 'Exposure ladder', cat: 'think', time: 'weeks', w: 'sheet',
      line: 'Face fears in steps, from slightly scary to the summit.',
      why: 'Exposure is the most effective psychological treatment for phobias, OCD, panic, social anxiety and PTSD. Staying in a feared situation lets the brain learn it is safe (inhibitory learning).',
      steps: ['List 8–10 situations from mildly to very scary, rating each 0–100.', 'Start near the bottom.', 'Stay until the fear drops, without safety behaviours.', 'Repeat until it’s easy, then climb.'],
      fields: [['fear', 'The fear', 'text', ''], ['steps', 'My ladder (easiest at the top), with 0–100 ratings', 'area', 'e.g. 20: say hi to a neighbour\n40: ask a question in a shop'], ['next', 'This week’s step', 'text', '']] },

    // --------------------------------------------------------------------------------- rest
    { id: 'sleep_window', n: 'Reset your sleep window', cat: 'rest', time: '2–6 weeks', w: null,
      line: 'The core moves of CBT-I: fixed wake time, bed only when sleepy.',
      why: 'CBT for insomnia is the first-line treatment (American College of Physicians, 2016) and works better long term than sleeping pills. Stimulus control and sleep restriction are its strongest parts.',
      steps: ['Fix your wake-up time, seven days a week.', 'Go to bed only when sleepy, not just tired.', 'If awake for ~20 minutes, get up, do something dull in dim light, return when sleepy.', 'Use the bed only for sleep and sex.', 'No naps for now. If very sleepy, don’t drive. For stricter sleep restriction, use a CBT-I programme or clinician.'] },
    { id: 'wind_down', n: 'The wind-down hour', cat: 'rest', time: '60 min', w: 'timer:60:Wind-down',
      line: 'Give the engine an hour to cool down before parking it.',
      why: 'Bright screens, work and arousal before bed delay sleep. A consistent routine signals the body clock (sleep hygiene is weaker alone, but helps as part of CBT-I).',
      steps: ['Set an alarm an hour before bed.', 'Dim lights; screens off or on night mode.', 'Write tomorrow’s to-do list to park worries.', 'Do something calm: shower, reading, stretching.'] },
    { id: 'sensory_kit', n: 'Sensory toolkit', cat: 'rest', time: '20 min to build', w: null,
      line: 'A kit that turns down the volume of the world.',
      why: 'Occupational therapists build sensory strategies for autistic people and anyone prone to overload. Reducing input prevents shutdowns and meltdowns.',
      steps: ['Noise: earplugs or noise-cancelling headphones.', 'Light: sunglasses, a cap, warm bulbs.', 'Touch: soft layers, a weighted blanket.', 'A regulating object: fidget, chewing gum, scent.', 'An exit plan: where you can go to recover.'] }
  ];

  BM.toolById = {};
  BM.TOOLS.forEach(function (t) { BM.toolById[t.id] = t; });
})();

/* ===== admin.html ===== */
(function () {
  var esc = UI.esc;
  var TABS = [['overview', 'Overview', 'grid'], ['usage', 'Usage', 'scan'], ['feedback', 'Feedback', 'inbox'], ['users', 'Users', 'users'], ['demo', 'Demo data', 'database']];

  UI.page('admin', { title: 'Admin', auth: 'admin' }, function (view, ctx) {
    var tab = TABS.some(function (t) { return t[0] === ctx.args[0]; }) ? ctx.args[0] : 'overview';
    var fbFilter = 'new';
    view.innerHTML = '<div class="ui-wrap"><div class="ui-page-head"><div><h1>Admin</h1><p class="muted">Only admins see this page.</p></div></div>' +
      '<nav class="ui-tabs">' + TABS.map(function (t) {
        return '<a href="#admin/' + t[0] + '" class="' + (t[0] === tab ? 'on' : '') + '">' + UI.icon(t[2]) + t[1] + '</a>';
      }).join('') + '</nav><div data-body><div class="ui-skel"></div></div></div>';
    var body = view.querySelector('[data-body]');

    function overview() {
      return UI.api('admin_overview').then(function (d) {
        var stat = function (n, label, go) { return '<a class="ui-card ui-stat" href="#admin/' + go + '" style="text-decoration:none;color:inherit"><b>' + n + '</b><span>' + label + '</span></a>'; };
        body.innerHTML = '<div class="ad-stats">' + stat(d.users, 'people signed up', 'users') + stat(d.admins, UI.plural(d.admins, 'admin').replace(/^\d+ /, ''), 'users') +
          stat(d.feedback_new, 'new feedback', 'feedback') + stat(d.scans, 'saved check results', 'usage') + stat(d.gauges, 'gauge readings', 'overview') +
          stat(d.plan, 'repair plan items', 'overview') + stat(d.journal, 'saved worksheets', 'overview') + '</div>' +
          '<p class="muted small" style="margin-top:18px">Counts only. Logbooks are private: admins never see anyone’s answers, readings or worksheets.</p>' +
          '<p class="muted small" style="margin-top:18px">Demo data is <b>' + esc(d.demo.state) + '</b> (' + d.demo.counts.users + ' demo people). Manage it in the Demo data tab.</p>';
      });
    }

    function feedback() {
      return UI.api('list_feedback', null).then(function (d) {
        var items = d.items.filter(function (i) { return fbFilter === 'all' || i.status === fbFilter; });
        body.innerHTML = '<div class="ui-row" style="margin-bottom:16px"><div class="ui-seg">' + [['new', 'New'], ['read', 'Read'], ['done', 'Done'], ['all', 'All']].map(function (f) {
          var n = f[0] === 'all' ? d.items.length : d.counts[f[0]];
          return '<button data-filter="' + f[0] + '" class="' + (fbFilter === f[0] ? 'on' : '') + '">' + f[1] + ' (' + n + ')</button>';
        }).join('') + '</div></div>' +
          (items.length ? '<div class="ad-fb">' + items.map(function (i) {
            var c = i.context || {};
            return '<div class="ui-item" data-id="' + esc(i.id) + '"><div class="meta"><span class="ui-badge ' + (i.kind === 'bug' ? 'bad' : i.kind === 'idea' ? 'brand' : '') + '">' + esc(i.kind_label) + '</span>' +
              '<b>' + esc(i.name) + '</b>' + (i.email ? '<a href="mailto:' + esc(i.email) + '">' + esc(i.email) + '</a>' : '') + '<span>' + esc(UI.fmtDateTime(i.created)) + '</span></div>' +
              '<p class="msg">' + esc(i.message) + '</p>' +
              '<div class="ctx">' + esc([c.page, c.screen, c.theme, c.browser].filter(Boolean).join(' · ')) + '</div>' +
              '<textarea data-note placeholder="Private note (only admins see it)">' + esc(i.note) + '</textarea>' +
              '<div class="ui-row" style="margin-top:10px">' + ['new', 'read', 'done'].map(function (s) {
                return '<button class="ui-btn sm' + (i.status === s ? ' primary' : '') + '" data-status="' + s + '">' + s[0].toUpperCase() + s.slice(1) + '</button>';
              }).join('') + '<span class="ui-spacer"></span><button class="ui-btn sm danger" data-del-fb>' + UI.icon('trash') + 'Delete</button></div></div>';
          }).join('') + '</div>'
            : '<div class="ui-empty">' + UI.icon('inbox') + '<h3>No ' + (fbFilter === 'all' ? '' : fbFilter + ' ') + 'messages</h3><p>New feedback goes to Prepsto (prepsto.com). Older messages and requests from the app show up here.</p></div>');
      });
    }

    function users(query) {
      return UI.api('list_users', query || null).then(function (d) {
        body.innerHTML = '<form class="ui-row" data-search style="margin-bottom:14px"><input type="search" name="q" placeholder="Search by name or email" value="' + esc(query || '') + '" style="max-width:360px">' +
          '<button class="ui-btn" type="submit">' + UI.icon('search') + 'Search</button><span class="muted small">' + UI.plural(d.total, 'person', 'people') + '</span></form>' +
          '<table class="ad-users"><thead><tr><th>Name</th><th>Email</th><th>Joined</th><th>Admin</th><th>Active</th></tr></thead><tbody>' +
          d.users.map(function (u) {
            return '<tr data-id="' + esc(u.id) + '"><td><b>' + esc(u.name) + '</b></td><td class="email">' + esc(u.email) + '</td><td class="joined muted">' + esc(UI.fmtDate(u.joined)) + '</td>' +
              '<td><label class="ui-check"><input type="checkbox" data-admin' + (u.is_admin ? ' checked' : '') + '> Admin</label></td>' +
              '<td><label class="ui-check"><input type="checkbox" data-enabled' + (u.enabled ? ' checked' : '') + '> Active</label></td></tr>';
          }).join('') + '</tbody></table>';
      });
    }

    function demo() {
      return UI.api('admin_overview').then(function (d) {
        var c = d.demo.counts;
        body.innerHTML = '<div class="ui-card ui-narrow" style="margin:0"><h3>Demo data</h3>' +
          '<p class="muted">Example people and content, so the app never looks empty for the first visitors. Demo rows are flagged, so removing them never touches real data. Once removed, it stays removed until you load it again.</p>' +
          '<p>Status: <b>' + esc(d.demo.state) + '</b> · ' + Object.keys(c).map(function (k) { return c[k] + ' ' + esc(k); }).join(', ') + '</p>' +
          '<div class="ui-row"><button class="ui-btn primary" data-demo="load">' + UI.icon('refresh') + (d.demo.state === 'loaded' ? 'Reload demo data' : 'Load demo data') + '</button>' +
          '<button class="ui-btn danger" data-demo="remove">' + UI.icon('trash') + 'Remove demo data</button></div></div>';
      });
    }

    function usage() {
      return UI.api('admin_usage').then(function (d) {
        body.innerHTML = '<p class="muted">How often each check is run (anonymous tallies; no answers are stored) and how many results members saved. Demo tallies are shown separately while demo data is loaded.</p>' +
          '<table class="ad-users"><thead><tr><th>Check</th><th>Runs ' + esc(d.month) + '</th><th>Runs all time</th><th>Saved</th><th>Demo</th></tr></thead><tbody>' +
          d.rows.map(function (r) {
            var s = BM.scanById[r.scan_id];
            return '<tr><td><b>' + esc(s ? s.n : r.scan_id) + '</b></td><td>' + r.month + '</td><td>' + r.all + '</td><td>' + r.saved + '</td><td class="joined muted">' + r.demo + '</td></tr>';
          }).join('') + '</tbody></table>';
      });
    }

    var DRAW = { overview: overview, usage: usage, feedback: feedback, users: users, demo: demo };

    view.addEventListener('click', function (e) {
      var f = e.target.closest('[data-filter]');
      if (f) { fbFilter = f.getAttribute('data-filter'); feedback(); return; }
      var st = e.target.closest('[data-status]');
      if (st) {
        var card = st.closest('[data-id]');
        UI.api('set_feedback_status', card.getAttribute('data-id'), st.getAttribute('data-status'), card.querySelector('[data-note]').value).then(function () { UI.toast('Saved', 'ok'); feedback(); });
        return;
      }
      var del = e.target.closest('[data-del-fb]');
      if (del) {
        UI.confirm({ title: 'Delete this message?', ok: 'Delete', danger: true }).then(function (yes) {
          if (yes) UI.api('delete_feedback', del.closest('[data-id]').getAttribute('data-id')).then(feedback);
        });
        return;
      }
      var dm = e.target.closest('[data-demo]');
      if (dm) {
        var load = dm.getAttribute('data-demo') === 'load';
        UI.confirm({ title: load ? 'Load the demo data?' : 'Remove the demo data?', text: load ? 'Demo people and content are added (any old demo rows are replaced).' : 'Every demo row is deleted. Real data stays.', ok: load ? 'Load' : 'Remove', danger: !load })
          .then(function (yes) { if (yes) UI.busy(dm, UI.api(load ? 'demo_load' : 'demo_remove')).then(function () { UI.toast('Done', 'ok'); demo(); }); });
      }
    });
    view.addEventListener('change', function (e) {
      var row = e.target.closest('tr[data-id]');
      if (!row) return;
      var id = row.getAttribute('data-id'), box = e.target;
      var fn = box.hasAttribute('data-admin') ? 'set_admin' : box.hasAttribute('data-enabled') ? 'set_enabled' : null;
      if (fn) UI.api(fn, id, box.checked).then(function () { UI.toast('Saved', 'ok'); }, function (err) { box.checked = !box.checked; UI.toast(err.message, 'error'); });
    });
    view.addEventListener('submit', function (e) {
      if (e.target.matches('[data-search]')) { e.preventDefault(); users(UI.formData(e.target).q); }
    });
    return DRAW[tab]();
  });
})();

/* ===== auth.html ===== */
(function () {
  var esc = UI.esc;
  var GOOGLE_G = '<svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>' +
    '<path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>' +
    '<path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>' +
    '<path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>';
  function pw(name, auto) {
    return '<div class="au-pw"><input type="password" name="' + name + '" autocomplete="' + auto + '" required minlength="8">' +
      '<button type="button" data-show>Show</button></div>';
  }
  UI.page('auth', { title: 'Sign in', auth: 'guest' }, function (view, ctx) {
    var mode = ['signup', 'reset'].indexOf(ctx.args[0]) >= 0 ? ctx.args[0] : 'login';
    function draw(msg, isErr) {
      var heading = { login: 'Welcome back', signup: 'Create your account', reset: 'Reset your password' }[mode];
      var sub = { login: 'Sign in to continue to ' + esc(UI.config.name) + '.', signup: 'It\'s free and takes a few seconds.',
        reset: 'We\'ll email you a link to choose a new password.' }[mode];
      view.innerHTML = '<div class="au-wrap"><div class="ui-card au-card">' +
        '<h1>' + heading + '</h1><p class="muted">' + sub + '</p>' +
        (mode !== 'reset' ? '<div class="ui-seg" role="tablist"><button type="button" data-mode="login" class="' + (mode === 'login' ? 'on' : '') + '">Sign in</button>' +
          '<button type="button" data-mode="signup" class="' + (mode === 'signup' ? 'on' : '') + '">Create account</button></div>' : '<div style="height:14px"></div>') +
        '<form class="ui-stack" data-form="' + mode + '" novalidate>' +
        (mode === 'signup' ? '<label class="ui-field"><span>Your name</span><input type="text" name="name" autocomplete="name" required maxlength="60"></label>' : '') +
        '<label class="ui-field"><span>Email</span><input type="email" name="email" autocomplete="email" required></label>' +
        (mode === 'login' ? '<label class="ui-field"><span>Password</span>' + pw('password', 'current-password') + '</label>' : '') +
        (mode === 'signup' ? '<label class="ui-field"><span>Password <em>(at least 8 characters)</em></span>' + pw('password', 'new-password') + '</label>' +
          (window.LegalKit ? '<div>' + LegalKit.consentField() + '</div>' : '') : '') +
        '<div data-msg role="alert"' + (msg ? ' class="' + (isErr ? 'ui-error' : 'ui-note') + '">' + esc(msg) : ' hidden>') + '</div>' +
        '<button class="ui-btn primary block" type="submit">' + { login: 'Sign in', signup: 'Create account', reset: 'Send the link' }[mode] + '</button></form>' +
        (mode !== 'reset' ? '<div class="au-or">or</div><button type="button" class="ui-btn block au-google" data-google>' + GOOGLE_G + 'Continue with Google</button>' : '') +
        '<div class="au-links">' + (mode === 'login' ? '<a data-mode="reset">Forgot your password?</a>' : '<a data-mode="login">' + UI.icon('back') + ' Back to sign in</a>') +
        '<a href="#landing" data-go="landing">About ' + esc(UI.config.name) + '</a></div></div></div>';
      var first = view.querySelector('input');
      if (first && !msg) first.focus();
    }
    view.addEventListener('click', function (e) {
      var m = e.target.closest('[data-mode]');
      if (m) { e.preventDefault(); mode = m.getAttribute('data-mode'); history.replaceState(null, '', '#auth' + (mode === 'login' ? '' : '/' + mode)); draw(); return; }
      var g = e.target.closest('[data-google]');
      if (g) { google(g); return; }
      var s = e.target.closest('[data-show]');
      if (s) { var i = s.parentNode.querySelector('input'); i.type = i.type === 'password' ? 'text' : 'password'; s.textContent = i.type === 'password' ? 'Show' : 'Hide'; }
    });
    view.addEventListener('submit', function (e) {
      e.preventDefault();
      var form = e.target, v = UI.formData(form);
      var problem = !/^\S+@\S+\.\S+$/.test(v.email || '') ? 'Please enter a valid email address.'
        : mode !== 'reset' && (v.password || '').length < (mode === 'signup' ? 8 : 1) ? (mode === 'signup' ? 'Please choose a password of at least 8 characters.' : 'Please enter your password.')
        : mode === 'signup' && (v.name || '').trim().length < 2 ? 'Please tell us your name.' : null;
      if (problem) { say(problem, true); return; }
      if (mode === 'signup' && window.LegalKit && !LegalKit.consentChecked(form)) return;  // the kit shows its own message
      UI.busy(form.querySelector('[type=submit]'), UI.auth(mode, v)).then(function (r) {
        if (mode === 'reset' || (r && !r.me)) { mode = 'login'; draw(r && r.message, false); restore({ email: v.email }); }
        else UI.toast(mode === 'signup' ? 'Welcome to ' + UI.config.name + '!' : 'Welcome back!', 'ok');
      }, function (err) { say(err.message, true); });
    });
    // Sign-up asks for the Privacy & Terms tick here too (ticking it is remembered for the new account).
    function google(btn) {
      var form = view.querySelector('form'), v = mode === 'signup' ? UI.formData(form) : {};
      if (mode === 'signup' && window.LegalKit && !LegalKit.consentChecked(form)) return;
      UI.busy(btn, UI.auth('google', { name: (v.name || '').trim() })).then(function () {
        UI.toast(mode === 'signup' ? 'Welcome to ' + UI.config.name + '!' : 'Welcome back!', 'ok');
      }, function (err) { say(err.message, true); });
    }
    function say(msg, isErr) {
      var box = view.querySelector('[data-msg]');
      box.className = isErr ? 'ui-error' : 'ui-note'; box.textContent = msg; box.hidden = false;
    }
    function restore(v) {
      ['name', 'email'].forEach(function (k) { var i = view.querySelector('[name=' + k + ']'); if (i && v[k]) i.value = v[k]; });
    }
    draw();
  });
})();

/* ===== diagnose.html ===== */
(function () {
  var esc = UI.esc;

  function tabs(on) {
    return '<nav class="ui-tabs dg-tabs"><a href="#diagnose" class="' + (on === 'lights' ? 'on' : '') + '">' + UI.icon('brake') + 'Warning lights</a>' +
      '<a href="#diagnose/scans" class="' + (on === 'scans' ? 'on' : '') + '">' + UI.icon('scan') + 'Diagnostic checks <span class="count">' + BM.SCANS.length + '</span></a></nav>';
  }

  function lightsPage(view) {
    var on = UI.store.get('lights', []).filter(function (id) { return BM.lightById[id]; });
    view.innerHTML = '<div class="ui-wrap"><div class="ui-page-head"><div><div class="eyebrow">Diagnose</div><h1>Which lights are on?</h1>' +
      '<p class="muted">Tick everything you’ve noticed over the last few weeks. The board shows what those lights usually point to.</p></div>' +
      '<button class="ui-btn ghost" data-clear>' + UI.icon('refresh') + 'Switch all off</button></div>' + tabs('lights') +
      '<div class="dg-board"><div>' + BM.SYSTEMS.map(function (s) {
        var ls = BM.LIGHTS.filter(function (l) { return l[2] === s.id; });
        if (!ls.length) return '';
        return '<div class="dg-sys"><h3>' + UI.icon(s.icon) + esc(s.name) + '</h3><div class="dg-lamps">' + ls.map(function (l) {
          var lit = on.indexOf(l[0]) >= 0;
          return '<button type="button" class="bm-lamp' + (lit ? ' on' : '') + (l[3] === 'crisis' ? ' crisis' : '') + '" data-light="' + l[0] + '" aria-pressed="' + lit + '"><i></i><span>' + esc(l[1]) + '</span></button>';
        }).join('') + '</div></div>';
      }).join('') + '</div><aside class="dg-out" data-out id="dg-out"></aside></div>' +
      '<div class="dg-bar" data-bar><a class="ui-btn primary" href="#dg-out" data-jump></a></div></div>';
    var out = view.querySelector('[data-out]'), bar = view.querySelector('[data-bar]');
    function draw() {
      UI.store.set('lights', on);
      var ranked = BM.rankLights(on).slice(0, 8);
      var crisis = on.some(function (id) { return BM.lightById[id].crisis; });
      out.innerHTML = '<div class="dg-panel"><div class="ui-row between"><div><h2>Diagnostic panel</h2><p>' + (on.length ? 'Lights on right now' : 'Tick a light to begin') + '</p></div>' +
        '<span class="cnt">' + on.length + '</span></div></div>' +
        (crisis ? '<div class="bm-see"><h3>' + UI.icon('brake') + 'One of these needs attention today</h3><p style="margin:0 0 10px">Thoughts of death or self-harm deserve real help, now. You don’t have to be in immediate danger to call.</p><button class="bm-brake" data-brake>' + UI.icon('brake') + 'Emergency brake</button></div>' : '') +
        (ranked.length ? ranked.map(function (r) {
          var pct = Math.round(r.hits.length / r.of * 100);
          return '<div class="dg-match"><div class="row"><span class="bm-code">' + esc(r.c.code) + '</span><b>' + esc(r.c.n) + '</b></div>' +
            '<div class="bm-meter"><span style="width:' + pct + '%"></span></div>' +
            '<div class="hits">' + r.hits.length + ' of its ' + r.of + ' lights: ' + r.hits.map(function (h) { return esc(BM.lightById[h].label.toLowerCase()); }).slice(0, 3).join('; ') + (r.hits.length > 3 ? '…' : '') + '</div>' +
            '<div class="acts"><a class="ui-btn sm" href="#manual/' + r.c.id + '" data-go="manual/' + r.c.id + '">Read entry</a>' +
            (r.c.scan ? '<a class="ui-btn sm primary" href="#scan/' + r.c.scan + '" data-go="scan/' + r.c.scan + '">' + UI.icon('scan') + 'Run the check</a>' : '') + '</div></div>';
        }).join('') + '<p class="small muted">Matches show which manual entries share your lights, not what you “have”. Several lights point to many things at once; that’s normal. ' +
          '<a href="#workorder" data-go="workorder">Put your lights on a work order</a>.</p>'
          : '<div class="ui-empty" style="padding:28px 16px">' + UI.icon('dash') + '<h3>All lights off</h3><p>Tick the ones you recognise. Nothing is saved anywhere but this browser.</p></div>');
      var btn = bar.querySelector('[data-jump]');
      btn.innerHTML = UI.icon('dash') + on.length + ' light' + (on.length === 1 ? '' : 's') + ' on · see matches';
      bar.classList.toggle('show', on.length > 0);
    }
    view.addEventListener('click', function (e) {
      var b = e.target.closest('[data-light]');
      if (b) {
        var id = b.getAttribute('data-light'), i = on.indexOf(id);
        if (i >= 0) on.splice(i, 1); else on.push(id);
        b.classList.toggle('on', i < 0); b.setAttribute('aria-pressed', String(i < 0));
        if (i < 0 && BM.lightById[id].crisis) BM.crisis();
        draw(); return;
      }
      if (e.target.closest('[data-clear]')) {
        on = []; view.querySelectorAll('[data-light]').forEach(function (x) { x.classList.remove('on'); x.setAttribute('aria-pressed', 'false'); }); draw(); return;
      }
      if (e.target.closest('[data-jump]')) { e.preventDefault(); out.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    });
    draw();
    return Promise.resolve();
  }

  function scansPage(view) {
    var local = BM.local.results();
    var groups = [
      ['Published screeners', 'Short questionnaires that doctors use, reproduced word for word with their official scoring. Still not a diagnosis: a high score means “get a proper check”.', BM.SCANS.filter(function (s) { return s.kind === 'validated'; })],
      ['Pattern checks', 'Our own plain-language checks, written from the diagnostic criteria and research. Useful for reflection; not validated tests.', BM.SCANS.filter(function (s) { return s.kind === 'pattern'; })],
      ['Childhood', 'What your upbringing may have installed.', BM.SCANS.filter(function (s) { return s.kind === 'aces' || s.kind === 'factory'; })]
    ];
    view.innerHTML = '<div class="ui-wrap"><div class="ui-page-head"><div><div class="eyebrow">Diagnose</div><h1>Diagnostic checks</h1>' +
      '<p class="muted">Two to five minutes each. Answers are scored in your browser; nothing is sent anywhere unless you save it to your logbook.</p></div></div>' + tabs('scans') +
      BM.note() +
      (local.length ? '<section class="dg-groups"><h2>On this device</h2><p>Your recent results. ' + (UI.me ? 'Save them to your logbook from your Garage.' : 'They stay in this browser only.') + '</p><div class="dg-recent">' +
        local.slice(0, 5).map(function (r) {
          var s = BM.scanById[r.scan_id];
          return s ? '<div class="dg-rec"><span class="bm-level l' + r.level + '">' + esc(r.label) + '</span><div class="grow"><b>' + esc(s.n) + '</b><span class="small muted">' + esc(UI.ago(r.taken)) + ' · score ' + r.score + ' of ' + r.max + '</span></div>' +
            '<a class="ui-btn sm" href="#scan/' + s.id + '" data-go="scan/' + s.id + '">Retake</a></div>' : '';
        }).join('') + '</div><p style="margin-top:10px"><a class="ui-btn sm brass" href="#workorder" data-go="workorder">' + UI.icon('clipboard') + 'Make a work order</a></p></section>' : '') +
      '<section class="dg-groups"><h2>Popular in the waiting room</h2><p>The checks people run most this month (anonymous counts).</p><div class="dg-top" data-top><span class="small muted">Loading…</span></div></section>' +
      '<div class="dg-groups">' + groups.map(function (g) {
        return '<h2>' + esc(g[0]) + '</h2><p>' + esc(g[1]) + '</p><div class="bm-cards">' + g[2].map(function (s) { return BM.scanCard(s); }).join('') + '</div>';
      }).join('') + '</div></div>';
    return UI.apiQuiet('shop_stats').then(function (st) {
      var box = view.querySelector('[data-top]');
      if (!box) return;
      box.innerHTML = st.top.length ? st.top.map(function (t, i) {
        var s = BM.scanById[t.scan_id];
        return s ? '<a class="bm-chip" href="#scan/' + s.id + '" data-go="scan/' + s.id + '"><span class="bm-code">#' + (i + 1) + '</span>' + esc(s.n) + '</a>' : '';
      }).join('') + '<span class="small muted" style="align-self:center">' + st.month_total.toLocaleString() + ' checks run this month</span>' : '<span class="small muted">Be the first this month.</span>';
    }, function () {
      var box = view.querySelector('[data-top]'); if (box) box.innerHTML = '';
    });
  }

  UI.page('diagnose', { title: 'Diagnose', nav: 'Diagnose', icon: 'scan', order: 20 }, function (view, ctx) {
    return ctx.args[0] === 'scans' ? scansPage(view) : lightsPage(view);
  });
})();

/* ===== factory.html ===== */
(function () {
  var esc = UI.esc;

  function listPage(view) {
    view.innerHTML = '<div class="ui-wrap"><div class="fs-hero"><div><div class="eyebrow">Factory settings</div><h1>What your upbringing installed</h1>' +
      '<p class="muted" style="font-size:1.08rem">Every adult runs on software installed in childhood: how safe the world is, whether feelings are allowed, what love costs. ' +
      'Here are ' + BM.PATTERNS.length + ' common patterns, what each one tends to install, and how people update it.</p>' +
      '<p class="muted small">Understanding isn’t blaming. Most parents passed on what they were given, and you can hold “they did their best” and “it hurt me” at the same time.</p></div>' +
      '<div class="ui-card ui-stack"><h3>Run the check</h3><p>' + BM.PATTERNS.length + ' quick statements about how you grew up. You’ll see which settings you recognise, strongest first.</p>' +
      '<a class="ui-btn primary block" href="#scan/factory" data-go="scan/factory">' + UI.icon('scan') + 'Factory Settings check</a>' +
      '<a class="ui-btn block" href="#scan/aces" data-go="scan/aces">Childhood adversity count (ACEs)</a></div></div>' +
      BM.FACTORY_GROUPS.map(function (g) {
        var list = BM.PATTERNS.filter(function (p) { return p.grp === g.id; });
        return '<section class="fs-grp"><div class="fs-grp-head"><h2>' + esc(g.name) + '</h2><p>' + esc(g.line) + '</p></div><div class="bm-cards">' +
          list.map(function (p) { return BM.patternCard(p); }).join('') + '</div></section>';
      }).join('') + BM.note() + '</div>';
    return Promise.resolve();
  }

  function patternPage(view, p) {
    var g = BM.FACTORY_GROUPS.filter(function (x) { return x.id === p.grp; })[0];
    var conds = BM.existing(p.conds, BM.conditionById), tools = BM.existing(p.tools, BM.toolById);
    view.innerHTML = '<div class="ui-wrap"><a class="bm-back" href="#factory" data-go="factory">' + UI.icon('back') + 'Factory settings</a>' +
      '<div class="bm-art-head"><div class="ui-row"><span class="bm-code">FS · ' + esc(g.name) + '</span>' + (p.aka || []).map(function (a) { return '<span class="bm-st">' + esc(a) + '</span>'; }).join('') + '</div>' +
      '<h1>' + esc(p.n) + '</h1><p class="line">' + esc(g.line) + '</p></div>' +
      '<div class="bm-art"><div>' +
        '<div class="fs-voice"><small>THE INNER VOICE IT CAN LEAVE</small>' + esc(p.voice) + '</div>' +
        '<div class="fs-two"><section class="ui-card"><h2 style="font-size:1.15rem">What it looked like</h2><ul class="bm-list">' + p.looked.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul></section>' +
        '<section class="ui-card"><h2 style="font-size:1.15rem">What it can install</h2><ul class="bm-list warn">' + p.installs.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul></section></div>' +
        '<section class="bm-sec"><h2>' + UI.icon('wrench') + 'Rewiring it</h2><ol class="bm-steps">' + p.rewire.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ol></section>' +
        (tools.length ? '<section class="bm-sec"><h2>' + UI.icon('wrench') + 'Tools for this</h2><div class="bm-cards">' + tools.map(function (t) { return BM.toolCard(t); }).join('') + '</div></section>' : '') +
        (conds.length ? '<section class="bm-sec"><h2>' + UI.icon('book') + 'Where it can show up in the manual</h2><div class="bm-cards">' + conds.map(function (c) { return BM.condCard(c); }).join('') + '</div></section>' : '') +
        BM.note('<b>Nobody here is a doctor.</b> Recognising a pattern isn’t a diagnosis of you or your parents. If old memories feel overwhelming, a trauma-informed therapist can help you go through them safely.') +
      '</div><aside class="bm-side">' +
        (p.note ? '<div class="ui-card bm-stat"><b>Research</b>' + esc(p.note) + '</div>' : '') +
        '<div class="ui-card"><b class="mono small" style="color:var(--c-accent);letter-spacing:.12em">DOES THIS FIT?</b><p style="margin:8px 0 12px">“' + esc(p.q) + '”</p>' +
        '<a class="ui-btn primary block" href="#scan/factory" data-go="scan/factory">' + UI.icon('scan') + 'Take the full check</a></div>' +
        '<div class="ui-row">' + BM.planButton('pattern', p.id) + '</div>' +
      '</aside></div></div>';
    return Promise.resolve();
  }

  UI.page('factory', { title: function (a) { var p = BM.patternById[a[0]]; return p ? p.n : 'Factory settings'; }, nav: 'Upbringing', icon: 'factory', order: 30 }, function (view, ctx) {
    var p = BM.patternById[ctx.args[0]];
    return p ? patternPage(view, p) : listPage(view);
  });
})();

/* ===== garage.html ===== */
(function () {
  var esc = UI.esc;
  var G = [['mood', 'Mood', 10, false], ['energy', 'Energy', 10, false], ['sleep', 'Sleep', 12, false, 'h'], ['stress', 'Stress', 10, true], ['focus', 'Focus', 10, false]];
  var STATUS = [['want', 'Want to try'], ['trying', 'Trying it'], ['works', 'Works for me'], ['nope', 'Not for me']];

  function localDate() { var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }

  function chart(gauges, width) {
    var days = 30, w = Math.max(300, width || 600), h = 190, padL = 28, padB = 22, today = new Date(localDate() + 'T12:00:00');
    var x = function (iso) { var d = (today - new Date(iso + 'T12:00:00')) / 864e5; return padL + (w - padL - 8) * (1 - d / days); };
    var y = function (v, max) { return 10 + (h - padB - 10) * (1 - v / max); };
    var pts = gauges.filter(function (g) { return (today - new Date(g.day + 'T12:00:00')) / 864e5 <= days; }).sort(function (a, b) { return a.day < b.day ? -1 : 1; });
    var series = [['mood', 10, 'var(--c-lamp)'], ['stress', 10, 'var(--c-bad)'], ['sleep', 12, 'var(--c-accent)']];
    var grid = [0, 5, 10].map(function (v) { var yy = y(v, 10); return '<line x1="' + padL + '" x2="' + (w - 6) + '" y1="' + yy + '" y2="' + yy + '" stroke="var(--c-line)" stroke-dasharray="3 4"/><text x="4" y="' + (yy + 4) + '" font-size="10" fill="var(--c-muted)" font-family="JetBrains Mono, monospace">' + v + '</text>'; }).join('');
    var lines = series.map(function (s) {
      var p = pts.filter(function (g) { return g[s[0]] != null; }).map(function (g) { return x(g.day).toFixed(1) + ',' + y(g[s[0]], s[1]).toFixed(1); });
      return p.length ? '<polyline points="' + p.join(' ') + '" fill="none" stroke="' + s[2] + '" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>' +
        p.map(function (q) { var c = q.split(','); return '<circle cx="' + c[0] + '" cy="' + c[1] + '" r="2.6" fill="' + s[2] + '"/>'; }).join('') : '';
    }).join('');
    var labels = [30, 15, 0].map(function (d) { var xx = padL + (w - padL - 8) * (1 - d / days); return '<text x="' + xx + '" y="' + (h - 4) + '" font-size="10" text-anchor="' + (d === 30 ? 'start' : d === 0 ? 'end' : 'middle') + '" fill="var(--c-muted)" font-family="JetBrains Mono, monospace">' + (d ? d + ' days ago' : 'today') + '</text>'; }).join('');
    return '<svg viewBox="0 0 ' + w + ' ' + h + '" role="img" aria-label="Mood, stress and sleep over the last 30 days">' + grid + lines + labels + '</svg>' +
      '<div class="gr-legend"><span><i style="background:var(--c-lamp)"></i>Mood</span><span><i style="background:var(--c-bad)"></i>Stress</span><span><i style="background:var(--c-accent)"></i>Sleep (hours, of 12)</span></div>';
  }

  function refTitle(kind, ref) {
    var o = kind === 'condition' ? BM.conditionById[ref] : kind === 'pattern' ? BM.patternById[ref] : BM.toolById[ref];
    var go = (kind === 'condition' ? 'manual/' : kind === 'pattern' ? 'factory/' : 'toolbox/') + ref;
    return o ? { n: o.n, go: go, tag: kind === 'condition' ? o.code : kind === 'pattern' ? 'FS' : 'TOOL' } : { n: ref, go: 'manual', tag: '?' };
  }

  UI.page('garage', { title: 'My garage', nav: 'Garage', icon: 'dash', auth: 'user', order: 5 }, function (view, ctx) {
    view.innerHTML = '<div class="ui-wrap"><div class="ui-skel" style="height:280px"></div></div>';
    var book = null;

    function draw(d) {
      book = d;
      var sample = !!d.sample, b = sample ? d.sample : d;
      var latest = b.gauges[0] || null, today = b.gauges.filter(function (g) { return g.day === localDate(); })[0] || null;
      var since = Date.now() - 60 * 864e5;
      var recent = {};
      b.scans.forEach(function (s) { if (new Date(s.taken).getTime() > since && !recent[s.scan_id]) recent[s.scan_id] = s; });
      var lit = Object.keys(recent).map(function (k) { return recent[k]; }).filter(function (s) { return s.level >= 2; });
      var local = BM.local.results().filter(function (r) { return !d.scans.some(function (s) { return s.scan_id === r.scan_id && Math.abs(new Date(s.taken) - new Date(r.taken)) < 2000; }); });
      var first = (ctx.me.name || '').split(' ')[0];
      view.innerHTML = '<div class="ui-wrap"><div class="ui-page-head"><div><div class="eyebrow">My garage</div><h1>' + (new Date().getHours() < 12 ? 'Morning' : new Date().getHours() < 18 ? 'Afternoon' : 'Evening') + ', ' + esc(first) + '. How’s the engine?</h1>' +
        '<p class="muted">Your private logbook. Only you can see it.</p></div><a class="ui-btn" href="#workorder" data-go="workorder">' + UI.icon('clipboard') + 'Work order</a></div>' +
        (sample ? '<div class="gr-sample">' + UI.icon('info') + '<span><b>These are sample readings.</b> Log your first gauge reading or save a check and your own logbook takes over.</span></div>' : '') +
        '<div class="gr-cluster"><div class="ui-row between" style="margin-bottom:12px"><span class="cap">INSTRUMENT CLUSTER · ' + (latest ? esc(UI.fmtDate(latest.day)) : 'NO READINGS YET') + '</span>' +
        '<span class="cap">' + b.gauges.length + ' READINGS</span></div><div class="gr-gauges">' + G.map(function (g) {
          var v = latest ? latest[g[0]] : null;
          return BM.gaugeSvg({ value: v == null ? 0 : v, max: g[2], label: g[1], shown: v == null ? '–' : v, unit: v == null ? '' : (g[4] || ''), invert: g[3] });
        }).join('') + '</div>' +
        '<div class="gr-lamps"><span class="cap">CHECK ENGINE:</span>' + (lit.length ? lit.map(function (s) {
          var sc = BM.scanById[s.scan_id];
          return '<a class="gr-lamp l' + s.level + '" href="#scan/' + s.scan_id + '" data-go="scan/' + s.scan_id + '"><i></i>' + esc(sc ? sc.n : s.scan_id) + ': ' + esc(s.label) + '</a>';
        }).join('') : '<span class="gr-lamp ok"><i></i>All clear in the last 60 days</span>') + '</div></div>' +

        '<div class="gr-grid"><div class="ui-stack">' +
          '<form class="ui-card gr-card" data-reading><h2>' + UI.icon('dash') + (today && !sample ? 'Today’s reading (update it)' : 'Log today’s reading') + '</h2><div class="gr-sliders">' + G.map(function (g) {
            var v = today && !sample && today[g[0]] != null ? today[g[0]] : (g[0] === 'sleep' ? 7 : 5);
            return '<label class="gr-slider"><span>' + g[1] + '</span><input type="range" name="' + g[0] + '" min="0" max="' + (g[0] === 'sleep' ? 14 : 10) + '" step="' + (g[0] === 'sleep' ? .5 : 1) + '" value="' + v + '"><output>' + v + (g[4] || '') + '</output></label>';
          }).join('') + '<input type="text" name="note" maxlength="280" placeholder="One line about today (optional)" value="' + esc(today && !sample ? today.note : '') + '"></div>' +
          '<div class="ui-row" style="margin-top:14px"><button class="ui-btn primary" type="submit">' + UI.icon('save') + 'Save reading</button><span class="small muted">Stress: 0 = calm, 10 = maxed out.</span></div></form>' +
          '<div class="ui-card gr-card gr-chart"><h2>' + UI.icon('sliders') + 'The last 30 days</h2><div data-chart></div></div>' +
          '<div class="ui-card gr-card"><h2>' + UI.icon('scan') + 'Service history</h2>' +
            (local.length && !sample ? '<div class="gr-sample" style="margin-bottom:12px">' + UI.icon('phone') + '<span>' + local.length + ' result' + (local.length === 1 ? '' : 's') + ' on this device aren’t in your logbook yet.</span><button class="ui-btn sm primary" data-import>Save them</button></div>' : '') +
            (b.scans.length ? '<div class="gr-list">' + b.scans.map(function (s) {
              var sc = BM.scanById[s.scan_id];
              return '<div class="gr-row" data-id="' + esc(s.id) + '"><span class="bm-level l' + s.level + '">' + esc(s.label) + '</span><div class="grow"><b>' + esc(sc ? sc.n : s.scan_id) + '</b><span class="small muted">' +
                esc(UI.fmtDate(s.taken)) + ' · ' + s.score + ' of ' + s.max + '</span></div><a class="ui-btn sm" href="#scan/' + esc(s.scan_id) + '" data-go="scan/' + esc(s.scan_id) + '">Retake</a>' +
                (sample ? '' : '<button class="ui-btn sm ghost icon" data-del-scan aria-label="Delete">' + UI.icon('trash') + '</button>') + '</div>';
            }).join('') + '</div>' : '<div class="ui-empty" style="padding:24px">' + UI.icon('scan') + '<p>No saved checks yet.</p><a class="ui-btn primary" href="#diagnose/scans" data-go="diagnose/scans">Run a check</a></div>') + '</div>' +
        '</div><div class="ui-stack">' +
          '<div class="ui-card gr-card"><h2>' + UI.icon('wrench') + 'Repair plan</h2>' + (b.plan.length ? '<div class="gr-list">' + b.plan.map(function (p) {
            var t = refTitle(p.kind, p.ref);
            return '<div class="gr-row" data-pid="' + esc(p.id) + '"><div class="grow"><span class="bm-code">' + esc(t.tag) + '</span> <a href="#' + t.go + '" data-go="' + t.go + '"><b style="display:inline">' + esc(t.n) + '</b></a>' +
              (p.note ? '<span class="small muted" style="display:block;margin-top:4px">' + esc(p.note) + '</span>' : '') + '</div>' +
              (sample ? '<span class="bm-st">' + esc((STATUS.filter(function (s) { return s[0] === p.status; })[0] || STATUS[0])[1]) + '</span>' :
                '<select data-status aria-label="Status">' + STATUS.map(function (s) { return '<option value="' + s[0] + '"' + (p.status === s[0] ? ' selected' : '') + '>' + s[1] + '</option>'; }).join('') + '</select>' +
                '<button class="ui-btn sm ghost icon" data-note aria-label="Add a note">' + UI.icon('edit') + '</button><button class="ui-btn sm ghost icon" data-del-plan aria-label="Remove">' + UI.icon('trash') + '</button>') + '</div>';
          }).join('') + '</div>' : '<div class="ui-empty" style="padding:24px">' + UI.icon('wrench') + '<p>Add entries, patterns and tools with “Add to my repair plan”.</p><a class="ui-btn" href="#toolbox" data-go="toolbox">Open the toolbox</a></div>') + '</div>' +
          '<div class="ui-card gr-card gr-j"><h2>' + UI.icon('clipboard') + 'Worksheets</h2>' + (b.journal.length ? '<div class="gr-list">' + b.journal.map(function (j) {
            var t = BM.toolById[j.tool];
            return '<details data-jid="' + esc(j.id) + '"><summary><span>' + esc(t ? t.n : j.tool) + ' <span class="small muted">· ' + esc(UI.fmtDate(j.created)) + '</span></span>' + UI.icon('chevron') + '</summary><dl>' +
              (t && t.fields ? t.fields : Object.keys(j.data).map(function (k) { return [k, k]; })).filter(function (f) { return j.data[f[0]] != null && j.data[f[0]] !== ''; }).map(function (f) {
                return '<dt>' + esc(f[1]) + '</dt><dd>' + esc(j.data[f[0]]) + '</dd>';
              }).join('') + '</dl>' + (sample ? '' : '<button class="ui-btn sm danger" data-del-j style="margin-bottom:12px">' + UI.icon('trash') + 'Delete</button>') + '</details>';
          }).join('') + '</div>' : '<div class="ui-empty" style="padding:24px">' + UI.icon('clipboard') + '<p>Thought records, safety plans and other worksheets you save show up here.</p><a class="ui-btn" href="#toolbox/thought_record" data-go="toolbox/thought_record">Try a thought record</a></div>') + '</div>' +
          '<div class="ui-card gr-card"><h2>' + UI.icon('lock') + 'Your data</h2><p class="muted small">Your logbook is yours. Download it any time, or wipe it clean (your account stays).</p>' +
            '<div class="ui-row"><button class="ui-btn" data-export>' + UI.icon('download') + 'Download my logbook</button><button class="ui-btn danger" data-wipe>' + UI.icon('trash') + 'Delete everything</button></div></div>' +
          BM.note() +
        '</div></div></div>';
      var ch = view.querySelector('[data-chart]');
      ch.innerHTML = chart(b.gauges, ch.clientWidth);
    }

    function load() { return UI.api('get_garage').then(draw); }

    view.addEventListener('input', function (e) {
      if (e.target.type === 'range' && e.target.closest('[data-reading]')) e.target.nextElementSibling.textContent = e.target.value + (e.target.name === 'sleep' ? 'h' : '');
    });
    view.addEventListener('submit', function (e) {
      if (!e.target.matches('[data-reading]')) return;
      e.preventDefault();
      var v = UI.formData(e.target);
      UI.busy(e.target.querySelector('[type=submit]'), UI.api('save_gauge', v, localDate())).then(function () { UI.toast('Reading saved', 'ok'); return load(); });
    });
    view.addEventListener('change', function (e) {
      var s = e.target.closest('[data-status]');
      if (s) UI.api('plan_update', s.closest('[data-pid]').getAttribute('data-pid'), s.value, null).then(function () { UI.toast('Updated', 'ok'); });
    });
    view.addEventListener('click', function (e) {
      var t;
      if ((t = e.target.closest('[data-del-scan]'))) {
        UI.confirm({ title: 'Delete this result?', ok: 'Delete', danger: true }).then(function (y) { if (y) UI.api('delete_scan', t.closest('[data-id]').getAttribute('data-id')).then(load); });
      } else if ((t = e.target.closest('[data-del-plan]'))) {
        UI.api('plan_remove', t.closest('[data-pid]').getAttribute('data-pid')).then(load);
      } else if ((t = e.target.closest('[data-note]'))) {
        var id = t.closest('[data-pid]').getAttribute('data-pid'), item = book.plan.filter(function (p) { return p.id === id; })[0] || {};
        var m = UI.modal('<h2>A note to yourself</h2><form data-noteform><textarea name="note" maxlength="500" placeholder="How is it going? What did you notice?">' + esc(item.note || '') + '</textarea>' +
          '<div class="ui-row end" style="margin-top:14px"><button class="ui-btn ghost" type="button" data-close>Cancel</button><button class="ui-btn primary" type="submit">Save</button></div></form>');
        m.el.querySelector('form').addEventListener('submit', function (ev) {
          ev.preventDefault();
          UI.busy(ev.target.querySelector('[type=submit]'), UI.api('plan_update', id, null, ev.target.note.value)).then(function () { m.close(); load(); });
        });
      } else if ((t = e.target.closest('[data-del-j]'))) {
        e.preventDefault();
        UI.confirm({ title: 'Delete this worksheet?', ok: 'Delete', danger: true }).then(function (y) { if (y) UI.api('journal_delete', t.closest('[data-jid]').getAttribute('data-jid')).then(load); });
      } else if ((t = e.target.closest('[data-import]'))) {
        UI.busy(t, UI.api('import_scans', BM.local.results())).then(function (r) { UI.toast(r.imported + ' saved to your logbook', 'ok'); return load(); });
      } else if ((t = e.target.closest('[data-export]'))) {
        UI.busy(t, UI.api('export_logbook')).then(function (d) {
          var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(d, null, 2)], { type: 'application/json' }));
          a.download = 'brain-mechanic-logbook-' + localDate() + '.json'; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
        });
      } else if ((t = e.target.closest('[data-wipe]'))) {
        UI.confirm({ title: 'Delete your whole logbook?', text: 'Every reading, saved check, plan item and worksheet will be gone for good. Results kept in this browser are cleared too. Your account stays.', ok: 'Delete everything', danger: true }).then(function (y) {
          if (y) UI.api('clear_logbook').then(function (r) { BM.local.clear(); UI.toast(r.deleted + ' entries deleted', 'ok'); return load(); });
        });
      }
    });
    return load();
  });
})();

/* ===== help.html ===== */
(function () {
  var esc = UI.esc;
  var WHO = [
    ['FIRST STOP', 'Family doctor (GP)', 'Rules out physical causes (thyroid, anaemia, vitamin levels, sleep apnoea, medication side effects), can prescribe common medications and refer you on. Often the fastest door in.'],
    ['DIAGNOSIS + THERAPY', 'Clinical psychologist', 'Assesses and treats with talk therapy. Can diagnose in most places; usually can’t prescribe. Good for ADHD and autism assessments, anxiety, depression, trauma.'],
    ['MEDICAL DOCTOR', 'Psychiatrist', 'A medical doctor specialised in mental health: diagnosis and medication, especially for bipolar disorder, psychosis, severe depression or complex cases.'],
    ['TALK THERAPY', 'Therapist, counsellor, social worker', 'Psychotherapists, licensed counsellors (LPC/LMHC), clinical social workers (LCSW) and others. Titles are regulated differently by country: check registration.'],
    ['TESTING', 'Neuropsychologist', 'Detailed testing of attention, memory and learning. Useful for complicated ADHD, autism or learning questions.'],
    ['PRESCRIBER', 'Psychiatric nurse practitioner', 'In some countries, can assess, diagnose and prescribe. Often shorter waits than psychiatrists.'],
    ['LIVED EXPERIENCE', 'Peer support worker', 'Someone trained who has been through it themselves. Groups like AA, SMART Recovery, CoDA or ACA are peer-led too.'],
    ['NOT CLINICAL', 'Coach', 'Can help with goals and habits (ADHD coaching is popular) but isn’t a regulated health profession and can’t diagnose or treat.']
  ];
  var THERAPIES = [
    ['CBT', 'Cognitive behavioural therapy: change unhelpful thinking and behaviour patterns, with homework.', 'Depression, anxiety, panic, social anxiety, OCD (as ERP), insomnia (as CBT-I), eating disorders (CBT-E)'],
    ['Behavioural activation', 'Re-engage with activities that bring pleasure and meaning.', 'Depression'],
    ['ERP', 'Exposure and response prevention: face the fear, skip the ritual.', 'OCD, health anxiety, BDD'],
    ['DBT', 'Dialectical behaviour therapy: skills for emotions, distress, relationships and mindfulness.', 'BPD, self-harm, intense emotions'],
    ['ACT', 'Acceptance and commitment therapy: unhook from thoughts, act on values.', 'Anxiety, chronic pain, depression, stress'],
    ['CPT, PE, EMDR', 'Trauma-focused therapies that process memories so they lose their charge.', 'PTSD and complex PTSD'],
    ['IPT', 'Interpersonal therapy: work on relationships, roles and grief.', 'Depression, postpartum depression'],
    ['Schema therapy', 'Change deep patterns (“schemas”) formed in childhood, including reparenting.', 'Personality disorders, chronic problems, childhood wounds'],
    ['Psychodynamic', 'Explore how past experiences and unconscious patterns shape the present.', 'Depression, relationship patterns, personality'],
    ['MBCT', 'Mindfulness-based cognitive therapy, usually in groups.', 'Preventing depression relapse'],
    ['EFT / Gottman', 'Couples therapies built on attachment and decades of relationship research.', 'Couples conflict, attachment problems'],
    ['CBT-I', 'CBT for insomnia: sleep window, stimulus control, worry tools.', 'Chronic insomnia (first-line before pills)'],
    ['Family-based treatment', 'Parents take charge of meals with a therapist’s support.', 'Anorexia in teenagers']
  ];
  var COUNTRY = [
    ['United States', 'Your primary care doctor, your insurer’s directory or an Employee Assistance Program (often a few free sessions). Low-cost: community mental health centres, university training clinics, Open Path Collective (sliding scale). Search directories like Psychology Today by issue and insurance. 988 for crisis.'],
    ['Canada', 'Your family doctor or a walk-in clinic. Québec: your local CLSC, or Info-Social 811 (option 2) to talk to a social worker now. Many workplace plans cover psychologists; employers’ EAPs offer free sessions. 988 for crisis.'],
    ['United Kingdom', 'Your GP, or self-refer to NHS Talking Therapies in England (free CBT and counselling; no GP needed). Scotland, Wales and Northern Ireland have their own routes through your GP. Samaritans 116 123 for crisis.'],
    ['Ireland', 'Your GP, or HSE counselling services; 116 123 (Samaritans) and text 50808 for crisis.'],
    ['Australia', 'A GP can make a Mental Health Treatment Plan for Medicare-subsidised psychology sessions. Head to Health for options. Lifeline 13 11 14.'],
    ['Everywhere else', 'Start with a doctor or a local health line. findahelpline.com lists free helplines in over 130 countries.']
  ];
  var ASK = ['What’s your experience with people with my kind of problem?', 'Which approach do you use, and what’s the evidence for it?', 'How will we know if it’s working, and when should we review?', 'How long does treatment usually take?', 'What does it cost, and do you offer a sliding scale?', 'What happens between sessions?'];
  var FLAGS = ['They promise a cure, or a fixed number of sessions for anything', 'They push one method for every problem', 'They talk about themselves more than about you', 'They dismiss your questions, culture or identity', 'They blur boundaries (friendship, money, touch)', 'You feel worse after months with no plan to change course'];

  UI.page('help', { title: 'Find a mechanic', nav: 'Get help', icon: 'shield', order: 50 }, function (view) {
    view.innerHTML = '<div class="ui-wrap"><div class="ui-page-head"><div><div class="eyebrow">Find a mechanic</div><h1>Taking it to a professional</h1>' +
      '<p class="muted">The manual tells you what a light might mean. A professional opens the hood. Here’s who does what, which therapies work for what, and how to get the most from an appointment.</p></div>' +
      '<a class="ui-btn primary" href="#workorder" data-go="workorder">' + UI.icon('clipboard') + 'Make a work order</a></div>' +
      '<div class="hp-crisis">' + BM.crisisHtml() + '</div>' +
      '<section class="hp-sec"><h2>' + UI.icon('users') + 'Who’s who in the garage</h2><p>Titles vary by country. When in doubt, start with a family doctor.</p><div class="hp-who">' +
        WHO.map(function (w) { return '<div class="ui-card"><span class="tag">' + esc(w[0]) + '</span><h3>' + esc(w[1]) + '</h3><p>' + esc(w[2]) + '</p></div>'; }).join('') + '</div></section>' +
      '<section class="hp-sec"><h2>' + UI.icon('wrench') + 'Types of tune-up</h2><p>Talk therapies with strong evidence, and what each is best known for. The relationship with your therapist matters as much as the method: research consistently finds the “therapeutic alliance” is one of the best predictors of good outcomes.</p>' +
        '<table class="hp-table"><thead><tr><th>Therapy</th><th>What it is</th><th>Best evidence for</th></tr></thead><tbody>' +
        THERAPIES.map(function (t) { return '<tr><td>' + esc(t[0]) + '</td><td>' + esc(t[1]) + '</td><td>' + esc(t[2]) + '</td></tr>'; }).join('') + '</tbody></table></section>' +
      '<section class="hp-sec"><h2>' + UI.icon('map') + 'Finding (and affording) help</h2><div class="hp-country">' +
        COUNTRY.map(function (c) { return '<div class="ui-card"><h3 style="font-size:1.05rem">' + esc(c[0]) + '</h3><p class="muted small" style="margin:6px 0 0">' + esc(c[1]) + '</p></div>'; }).join('') + '</div></section>' +
      '<section class="hp-sec"><h2>' + UI.icon('clipboard') + 'Getting the most from an appointment</h2><div class="hp-two">' +
        '<div class="ui-card"><h3 style="font-size:1.05rem">Bring</h3><ul class="bm-list good"><li>Your work order: check results, warning lights, how long it’s been going on</li><li>Medications and supplements you take</li><li>Family history (depression, bipolar, ADHD, addiction)</li><li>One sentence on what you want from this visit</li><li>For ADHD or autism assessments: school reports or someone who knew you as a child</li></ul>' +
        '<a class="ui-btn brass" href="#workorder" data-go="workorder" style="margin-top:12px">' + UI.icon('clipboard') + 'Build my work order</a></div>' +
        '<div class="ui-card"><h3 style="font-size:1.05rem">Questions to ask a therapist</h3><ul class="bm-list">' + ASK.map(function (q) { return '<li>' + esc(q) + '</li>'; }).join('') + '</ul></div></div></section>' +
      '<section class="hp-sec"><h2>' + UI.icon('brake') + 'Red flags in a therapist</h2><p>It’s fine to switch. Most people try more than one before it clicks.</p><ul class="bm-list bad">' + FLAGS.map(function (f) { return '<li>' + esc(f) + '</li>'; }).join('') + '</ul></section>' +
      BM.note() + '</div>';
    return Promise.resolve();
  });
})();

/* ===== landing.html ===== */
// Watch section: swap the video's cover for YouTube's player (privacy-enhanced) only when it's pressed.
  if (!window.__ytFilm) {
    window.__ytFilm = true;
    document.addEventListener('click', function (e) {
      var b = e.target && e.target.closest ? e.target.closest('[data-yt-film]') : null;
      if (!b) return;
      var f = document.createElement('iframe');
      f.src = 'https://www.youtube-nocookie.com/embed/' + b.getAttribute('data-yt-film') + '?autoplay=1&rel=0&playsinline=1';
      f.title = b.getAttribute('data-yt-title') || 'Video';
      f.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
      f.allowFullscreen = true;
      f.referrerPolicy = 'strict-origin-when-cross-origin';
      b.parentNode.replaceChild(f, b);
    });
  }
(function () {
  var esc = UI.esc;
  var TRY = ['can’t focus', 'panic at night', 'my mum', 'narcissist', 'can’t say no', 'always tired'];
  var FAQ = [
    ['Is this a diagnosis?', 'No. Nobody here is a doctor. Brain Mechanic is for fun and self-reflection, and is in no way medical advice. Checks tell you which “warning lights” your answers switch on, so you can decide whether to see a professional. Only a qualified clinician who meets you can diagnose anything.'],
    ['Where does the information come from?', 'From the diagnostic manuals (DSM-5-TR and the WHO’s ICD-11), clinical guidelines and published research. Every manual entry names its sources, and says plainly whether something is a recognised diagnosis or a popular concept like “codependency”. Four checks are published, free-to-use screeners (PHQ-9, GAD-7, PC-PTSD-5, AUDIT-C); the rest are our own plain-language pattern checks and say so.'],
    ['Do I need an account?', 'No. The manual, the checks and the toolbox are free and open. Without an account, your check results stay in this browser only. A free account adds the Garage: daily gauge readings, a repair plan, saved worksheets and your check history, on any device.'],
    ['Who can see my answers?', 'Without an account, nobody: results stay on your device. With an account, your logbook is private to you; the app’s admin screens only show totals, never your answers or notes. You can download or delete everything from your Garage at any time. We only count, anonymously, how often each check is run.'],
    ['What is a work order?', 'A one-page summary of your check results, the warning lights you noticed and the questions you want to ask, to print or show a doctor or therapist. It helps you say in five minutes what might otherwise take three appointments.'],
    ['What if I’m in crisis?', 'Use the red Emergency brake at the top of every page. It lists free, confidential crisis lines (988 in the US and Canada, Samaritans 116 123 in the UK and Ireland, and more). If you might act on thoughts of harming yourself, call your local emergency number now.']
  ];

  function office() {
    var lamps = [['FOCUS', '#f2a72e', 1], ['ALARM', '#e0473a', 1], ['MOOD', '#f2a72e', 0], ['SLEEP', '#7cc4a1', 1], ['PEOPLE', '#f2a72e', 0], ['SELF', '#e0473a', 0]];
    var buttons = '';
    [[268, 128], [296, 128], [324, 128], [268, 156], [296, 156], [324, 156]].forEach(function (p, i) {
      buttons += '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="9" fill="var(--brass)"/>';
    });
    return '<div class="lp-office" role="img" aria-label="A psychologist’s office: a tufted leather armchair, a green banker’s lamp, a certificate that says not a doctor, and a car dashboard of warning lights on the wall">' +
      '<svg viewBox="0 0 560 480" xmlns="http://www.w3.org/2000/svg">' +
      '<defs><pattern id="lpstripe" width="28" height="10" patternUnits="userSpaceOnUse"><rect width="14" height="10" fill="var(--stripe)"/></pattern>' +
      '<radialGradient id="lpglow" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="var(--glow)"/><stop offset="1" stop-color="var(--glow)" stop-opacity="0"/></radialGradient>' +
      '<linearGradient id="lpleather" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--leather-h)"/><stop offset=".5" stop-color="var(--leather)"/><stop offset="1" stop-color="var(--leather-d)"/></linearGradient></defs>' +
      // wall, stripes, wainscot
      '<rect width="560" height="480" fill="var(--wall)"/><rect width="560" height="318" fill="url(#lpstripe)" opacity=".7"/>' +
      '<rect y="318" width="560" height="162" fill="var(--panel)"/><rect y="314" width="560" height="8" fill="var(--panel-d)"/>' +
      '<g fill="none" stroke="var(--panel-d)" stroke-width="3"><rect x="22" y="336" width="150" height="70" rx="4"/><rect x="196" y="336" width="168" height="70" rx="4"/><rect x="388" y="336" width="150" height="70" rx="4"/></g>' +
      // rug
      '<ellipse cx="300" cy="452" rx="250" ry="34" fill="var(--rug)"/><ellipse cx="300" cy="452" rx="232" ry="27" fill="none" stroke="var(--rug-b)" stroke-width="3" stroke-dasharray="10 6"/>' +
      // lamp glow
      '<ellipse class="lamp-l" cx="112" cy="190" rx="150" ry="130" fill="url(#lpglow)"/>' +
      // certificate
      '<g transform="translate(46 54) rotate(-2)"><rect width="150" height="104" rx="4" fill="var(--panel)"/><rect x="8" y="8" width="134" height="88" fill="var(--paper)"/>' +
      '<text x="75" y="30" text-anchor="middle" font-family="Fraunces, Georgia, serif" font-size="12" font-weight="700" fill="var(--ink)">CERTIFICATE</text>' +
      '<text x="75" y="46" text-anchor="middle" font-family="Fraunces, Georgia, serif" font-size="10" font-style="italic" fill="var(--ink)">Brain Mechanic</text>' +
      '<text x="75" y="62" text-anchor="middle" font-family="Source Sans 3, sans-serif" font-size="8" fill="var(--ink)">licensed to tinker</text>' +
      '<text x="75" y="74" text-anchor="middle" font-family="Source Sans 3, sans-serif" font-size="8" font-weight="700" fill="#9b2d24">(NOT A DOCTOR)</text>' +
      '<circle cx="118" cy="84" r="8" fill="var(--brass)"/><path d="M114 90l-3 9 7-4 7 4-3-9" fill="var(--brass)"/></g>' +
      // dashboard on the wall
      '<g data-go="diagnose" class="hl-all" style="cursor:pointer"><rect x="236" y="40" width="290" height="150" rx="26" fill="var(--dash)" stroke="var(--brass)" stroke-width="3"/>' +
      '<circle cx="300" cy="96" r="40" fill="#120c0a" stroke="#4a3427" stroke-width="2"/><circle cx="462" cy="96" r="40" fill="#120c0a" stroke="#4a3427" stroke-width="2"/>' +
      '<path d="M272 112a32 32 0 0 1 56 0" fill="none" stroke="#7cc4a1" stroke-width="3" opacity=".7"/><path d="M434 112a32 32 0 0 1 56 0" fill="none" stroke="#f2a72e" stroke-width="3" opacity=".7"/>' +
      '<text x="300" y="128" text-anchor="middle" font-family="JetBrains Mono, monospace" font-size="8" fill="#bba793">MOOD</text><text x="462" y="128" text-anchor="middle" font-family="JetBrains Mono, monospace" font-size="8" fill="#bba793">STRESS</text>' +
      '<rect class="needle" x="300" y="94" width="30" height="3" rx="1.5" fill="#e0857a"/><rect class="needle" x="462" y="94" width="30" height="3" rx="1.5" fill="#e0857a" style="animation-delay:-2s"/>' +
      lamps.map(function (l, i) {
        var x = 352 + (i % 3) * 26, y = 74 + Math.floor(i / 3) * 42;
        return '<g class="hl"><circle cx="' + x + '" cy="' + y + '" r="8" fill="' + l[1] + '" class="' + (l[2] ? 'on' : '') + '" opacity="' + (l[2] ? 1 : .25) + '"/>' +
          '<text x="' + x + '" y="' + (y + 20) + '" text-anchor="middle" font-family="JetBrains Mono, monospace" font-size="6.5" fill="#bba793">' + l[0] + '</text></g>';
      }).join('') + '</g>' +
      // floor lamp
      '<rect x="108" y="196" width="7" height="236" fill="var(--brass)"/><ellipse cx="112" cy="434" rx="34" ry="8" fill="var(--brass)"/>' +
      '<path d="M76 196h72l-12-42H88z" fill="var(--shade)"/><path d="M76 196h72" stroke="var(--brass)" stroke-width="4"/><ellipse cx="112" cy="198" rx="20" ry="5" fill="#ffe6a8" class="lamp-l"/>' +
      // side table + tissues + clipboard
      '<rect x="152" y="352" width="70" height="8" rx="3" fill="var(--panel-d)"/><rect x="183" y="358" width="8" height="72" fill="var(--panel-d)"/><ellipse cx="187" cy="432" rx="22" ry="5" fill="var(--panel-d)"/>' +
      '<rect x="160" y="330" width="40" height="22" rx="3" fill="#e9eef2"/><path d="M172 330c2-12 12-12 16 0" fill="#fff" stroke="#d7dde2"/>' +
      // armchair
      '<g transform="translate(238 186)">' +
      '<path d="M60 20c-6-14 6-20 22-20h96c16 0 28 6 22 20l6 132H54z" fill="url(#lpleather)"/>' + // back
      '<path d="M40 40c-18 0-30 14-26 34l12 92h44L66 58c-2-12-12-18-26-18zM224 40c18 0 30 14 26 34l-12 92h-44l4-108c2-12 12-18 26-18z" fill="var(--leather)"/>' + // wings
      '<g fill="var(--brass)" opacity=".9">' + [[96, 40], [130, 40], [164, 40], [113, 70], [147, 70], [96, 100], [130, 100], [164, 100], [113, 130], [147, 130]].map(function (b) {
        return '<circle cx="' + b[0] + '" cy="' + b[1] + '" r="3.5"/>';
      }).join('') + '</g>' +
      '<g stroke="var(--leather-d)" stroke-width="1.6" opacity=".7" fill="none">' +
      '<path d="M96 40l17 30 17-30 17 30 17-30M96 100l17-30 17 30 17-30 17 30M96 100l17 30 17-30 17 30 17-30"/></g>' +
      '<rect x="70" y="148" width="124" height="40" rx="14" fill="var(--leather-h)"/>' + // seat cushion
      '<rect x="0" y="120" width="70" height="120" rx="30" fill="url(#lpleather)"/><rect x="194" y="120" width="70" height="120" rx="30" fill="url(#lpleather)"/>' + // arms
      '<path d="M8 136h54M202 136h54" stroke="var(--leather-h)" stroke-width="3" stroke-linecap="round" opacity=".7"/>' +
      '<rect x="24" y="182" width="216" height="52" rx="12" fill="var(--leather-d)"/>' + // skirt
      '<path d="M32 196h200" stroke="var(--brass)" stroke-width="1.5" stroke-dasharray="4 4" opacity=".7"/>' +
      '<rect x="36" y="232" width="16" height="26" rx="4" fill="#2a1912"/><rect x="212" y="232" width="16" height="26" rx="4" fill="#2a1912"/>' +
      // notepad on the arm
      '<g transform="translate(206 104) rotate(8)"><rect width="44" height="54" rx="4" fill="var(--paper)"/><rect x="14" y="-4" width="16" height="8" rx="2" fill="var(--brass)"/>' +
      '<path d="M8 16h28M8 26h28M8 36h18" stroke="#b9a68c" stroke-width="2"/></g></g>' +
      // wrench on the rug
      '<g transform="translate(470 432) rotate(-18)"><rect x="-46" y="-5" width="80" height="10" rx="5" fill="#9aa3ab"/><path d="M34-14a14 14 0 1 0 0 28 14 14 0 0 0 0-28zm4 6v16h-10V-8z" fill="#9aa3ab"/></g>' +
      // plant
      '<g transform="translate(500 300)"><path d="M-18 40h36l-6 40h-24z" fill="#b5653f"/><g fill="#3f7a5a"><ellipse cx="-14" cy="12" rx="9" ry="26" transform="rotate(-24)"/><ellipse cx="14" cy="10" rx="9" ry="28" transform="rotate(22)"/><ellipse cx="0" cy="0" rx="9" ry="32"/></g></g>' +
      '</svg><div class="lp-tag"><b>Session notes:</b> two warning lights on. Focus and alarm. Let’s take a look.</div></div>';
  }

  UI.page('landing', { title: 'The owner’s manual for your mind' }, function (view, ctx) {
    var me = ctx.me;
    var sysCount = {};
    BM.CONDITIONS.forEach(function (c) { sysCount[c.sys] = (sysCount[c.sys] || 0) + 1; });
    var samplePatterns = ['parentified', 'critical', 'emoneglect', 'narcparent'].map(function (id) { return BM.patternById[id]; });
    view.innerHTML =
      '<section class="lp-hero"><div class="ui-wrap"><div>' +
        '<div class="eyebrow">Brain Mechanic · est. 2026</div>' +
        '<h1>Pull up a chair. Let’s look <em>under the hood.</em></h1>' +
        '<p class="lp-lead">A repair manual for the human mind. Look up what you’re going through, see which warning lights are on, find out what your upbringing installed, and leave with tools to try and a work order for a real professional.</p>' +
        '<div class="lp-ask"><form data-ask><label class="bm-search">' + UI.icon('search') + '<input type="search" name="q" placeholder="What’s the noise? Describe it in your own words" aria-label="Describe what you’re going through"></label>' +
        '<button class="ui-btn primary" type="submit">Look it up</button></form></div>' +
        '<div class="lp-try"><span>Try:</span>' + TRY.map(function (t) { return '<button type="button" data-try="' + esc(t) + '">' + esc(t) + '</button>'; }).join('') + '</div>' +
        '<div class="lp-cta"><a class="ui-btn primary lg" href="#diagnose" data-go="diagnose">' + UI.icon('scan') + 'Run a free diagnostic</a>' +
        (me ? '<a class="ui-btn lg" href="#garage" data-go="garage">Open my garage</a>' : '<a class="ui-btn lg" href="#auth/signup" data-go="auth/signup">Keep a logbook</a>') + '</div>' +
        '<div class="lp-proof"><span>' + UI.icon('check') + BM.CONDITIONS.length + ' manual entries</span><span>' + UI.icon('check') + BM.PATTERNS.length + ' upbringing patterns</span>' +
        '<span>' + UI.icon('check') + BM.TOOLS.length + ' tools</span><span>' + UI.icon('check') + 'Free, no account needed</span></div>' +
      '</div>' + office() + '</div></section>' +

      '<section class="lp-section"><div class="ui-wrap">' + BM.note('<b>Nobody here is a doctor.</b> Brain Mechanic is for fun and self-reflection only and is in no way medical advice. Think of it as the owner’s manual in the glovebox: handy for knowing what a light means, and for knowing when to take the car to a real mechanic.') + '</div></section>' +

      '<section class="lp-section ytf" id="watch"><div class="ui-wrap"><div class="ytf-in"><div class="ytf-copy"><div class="eyebrow"><svg viewBox="0 0 28 20" width="20" height="14" aria-hidden="true"><rect width="28" height="20" rx="5" fill="#FF0033"/><path d="M11.2 5.8v8.4l7.3-4.2z" fill="#fff"/></svg>Watch</div><h2>See Brain Mechanic in about a minute</h2><p>A short video tour of what Brain Mechanic does and how it works.</p><a class="ytf-link" href="https://www.youtube.com/watch?v=5BWx9DjbcDs" target="_blank" rel="noopener">Watch on YouTube &#8599;</a></div><div><div class="ytf-frame"><button type="button" class="ytf-cover" data-yt-film="5BWx9DjbcDs" data-yt-title="Brain Mechanic video" aria-label="Play the Brain Mechanic video (1:14)"><img src="_/theme/yt-cover.jpg" alt="" loading="lazy" decoding="async" width="960" height="540"><span class="ytf-play" aria-hidden="true"><svg viewBox="0 0 68 48" width="68" height="48"><path d="M66.5 7.7a8.5 8.5 0 0 0-6-6C55.3.3 34 .3 34 .3s-21.3 0-26.5 1.4a8.5 8.5 0 0 0-6 6C.1 13 .1 24 .1 24s0 11 1.4 16.3a8.5 8.5 0 0 0 6 6c5.2 1.4 26.5 1.4 26.5 1.4s21.3 0 26.5-1.4a8.5 8.5 0 0 0 6-6C67.9 35 67.9 24 67.9 24s0-11-1.4-16.3z" fill="#FF0033"/><path d="M45 24 27 14v20z" fill="#fff"/></svg></span><span class="ytf-len">1:14</span></button></div><p class="ytf-note">The video loads from YouTube when you press play.</p></div></div></div></section>' +
      '<section class="lp-section" id="how"><div class="ui-wrap"><div class="lp-head"><h2>How the shop works</h2><p>The way a good mechanic works: listen to the noise, read the lights, run the diagnostics, then fix what you can and refer the rest.</p></div>' +
        '<div class="lp-steps">' + [['search', 'Describe the noise', 'Type it in plain words (“can’t focus”, “my dad”) and the manual finds the matching entries.'],
          ['brake', 'Read the warning lights', 'Tick the symptoms that are on. The board ranks what they usually point to.'],
          ['scan', 'Run a diagnostic', 'Published screeners and plain-language pattern checks, scored on the spot.'],
          ['wrench', 'Repair or refer', 'Try tools that work, and take a printed work order to a professional for the rest.']].map(function (s, i) {
          return '<div class="ui-card lp-step"><span class="n">STEP 0' + (i + 1) + '</span>' + UI.icon(s[0]) + '<h3>' + esc(s[1]) + '</h3><p>' + esc(s[2]) + '</p></div>';
        }).join('') + '</div></div></section>' +

      '<section class="lp-section"><div class="ui-wrap"><div class="lp-head"><h2>What’s under the hood</h2><p>Ten systems, from steering (focus) to factory settings (childhood). Pick one to open its section of the manual.</p></div>' +
        '<div class="lp-systems">' + BM.SYSTEMS.map(function (s) {
          return '<a class="lp-sys" href="#manual/sys/' + s.id + '" data-go="manual/sys/' + s.id + '">' + UI.icon(s.icon) + '<em>' + s.code + ' · ' + (sysCount[s.id] || 0) + ' entries</em><b>' + esc(s.name) + '</b><span>' + esc(s.part) + '</span></a>';
        }).join('') + '</div></div></section>' +

      '<section class="lp-section"><div class="ui-wrap"><div class="lp-factory"><div><div class="eyebrow">Factory settings</div><h2>Your parents installed some of your software</h2>' +
        '<p>Helicopter parents, the eggshell house, the little parent who raised their siblings, love that came with a report card. ' + BM.PATTERNS.length + ' patterns, what each one tends to install in adults, and how people update it. Not about blame: your parents had factory settings too.</p>' +
        '<div class="ui-row"><a class="ui-btn primary" href="#scan/factory" data-go="scan/factory">Run the Factory Settings check</a><a class="ui-btn" href="#factory" data-go="factory">Browse patterns</a></div></div>' +
        '<div class="bm-cards">' + samplePatterns.map(function (p) { return BM.patternCard(p); }).join('') + '</div></div></div></section>' +

      '<section class="lp-section"><div class="ui-wrap"><div class="lp-head"><h2>The fine print, in big letters</h2></div><div class="lp-fine">' +
        '<div class="ui-card"><h3>' + UI.icon('info') + 'Not a doctor</h3><p class="muted">Nobody here is a doctor, psychologist or therapist. This is for fun and self-reflection. It is not medical advice, a diagnosis or treatment.</p></div>' +
        '<div class="ui-card"><h3>' + UI.icon('book') + 'Honest about evidence</h3><p class="muted">Every entry says whether it’s a recognised diagnosis or a popular idea, names its sources, and separates published screeners from our own checks.</p></div>' +
        '<div class="ui-card"><h3>' + UI.icon('brake') + 'Help when it matters</h3><p class="muted">The Emergency brake is on every page, with free crisis lines. Checks flag answers that deserve help today.</p></div>' +
      '</div></div></section>' +

      '<section class="lp-section"><div class="ui-wrap"><div class="lp-head"><h2>Questions from the waiting room</h2></div><div class="lp-faq">' +
        FAQ.map(function (q) { return '<details><summary>' + esc(q[0]) + '</summary><p>' + esc(q[1]) + '</p></details>'; }).join('') + '</div></div></section>' +

      '<section class="lp-section"><div class="ui-wrap"><div class="lp-band"><div><h2>The chair’s free. Sit down.</h2><p>Start with what’s bothering you most. It takes two minutes.</p></div>' +
        '<a class="ui-btn lg" href="#diagnose" data-go="diagnose">' + UI.icon('scan') + 'Start the diagnostic</a></div></div></section>';

    view.addEventListener('submit', function (e) {
      if (!e.target.matches('[data-ask]')) return;
      e.preventDefault();
      var q = e.target.q.value.trim();
      UI.go('manual', 's', q || '');
    });
    view.addEventListener('click', function (e) {
      var t = e.target.closest('[data-try]');
      if (t) UI.go('manual', 's', t.getAttribute('data-try'));
    });
  });
})();

/* ===== manual.html ===== */
(function () {
  var esc = UI.esc;
  var POPULAR = ['can’t focus', 'panic at night', 'my mum', 'narcissist', 'always tired', 'can’t say no', 'overthinking', 'my partner checks my phone', 'imposter', 'can’t sleep'];

  function resultsHtml(q) {
    var res = BM.search(q);
    if (!res.length) {
      return '<div class="ui-empty mn-none">' + UI.icon('search') + '<h3>Nothing in the manual for “' + esc(q) + '”</h3><p>Try other words, or tick the warning lights you notice.</p>' +
        '<a class="ui-btn primary" href="#diagnose" data-go="diagnose">Check warning lights</a></div>';
    }
    var groups = [['condition', 'Repair manual', function (r) { return BM.condCard(r.obj); }], ['pattern', 'Factory settings (upbringing)', function (r) { return BM.patternCard(r.obj); }],
      ['tool', 'Toolbox', function (r) { return BM.toolCard(r.obj); }], ['scan', 'Checks you can run', function (r) { return BM.scanCard(r.obj); }]];
    var top = res[0].score;
    return groups.map(function (g) {
      var list = res.filter(function (r) { return r.type === g[0] && r.score >= top * 0.2; }).slice(0, g[0] === 'condition' ? 9 : 6);
      if (!list.length) return '';
      return '<section class="mn-group"><h2>' + esc(g[1]) + '<span class="count">' + list.length + '</span></h2><div class="bm-cards">' + list.map(g[2]).join('') + '</div></section>';
    }).join('');
  }

  function systemsHtml(only) {
    return BM.SYSTEMS.filter(function (s) { return !only || s.id === only; }).map(function (s) {
      var list = BM.CONDITIONS.filter(function (c) { return c.sys === s.id; });
      return '<section class="mn-sys"><div class="mn-sys-head"><span class="ic">' + UI.icon(s.icon) + '</span><div><h2>' + esc(s.name) + '</h2><p>' + esc(s.part) + '</p></div>' +
        '<span class="bm-code">' + s.code + '</span></div><div class="bm-cards">' + list.map(function (c) { return BM.condCard(c); }).join('') + '</div>' +
        (s.id === 'factory' ? '<p style="margin-top:14px"><a href="#factory" data-go="factory">See all ' + BM.PATTERNS.length + ' upbringing patterns ' + UI.icon('arrow') + '</a></p>' : '') + '</section>';
    }).join('');
  }

  function listPage(view, ctx) {
    var mode = ctx.args[0] === 's' ? 'search' : ctx.args[0] === 'sys' ? 'sys' : 'all';
    var q = mode === 'search' ? (ctx.args.slice(1).join('/') || '') : '';
    var sys = mode === 'sys' && BM.systemById[ctx.args[1]] ? ctx.args[1] : null;
    view.innerHTML = '<div class="ui-wrap"><div class="mn-top"><div><div class="eyebrow">The repair manual</div><h1>What’s that noise?</h1>' +
      '<p class="muted" style="margin:6px 0 0">' + BM.CONDITIONS.length + ' entries across ten systems. Search in your own words, typos welcome.</p></div>' +
      '<label class="bm-search">' + UI.icon('search') + '<input type="search" data-q placeholder="e.g. can’t focus, my dad yells, panic at night" value="' + esc(q) + '" aria-label="Search the manual"></label>' +
      '<div class="bm-chips" data-chips><button class="bm-chip' + (!sys && !q ? ' on' : '') + '" data-sys="">All systems</button>' +
      BM.SYSTEMS.map(function (s) { return '<button class="bm-chip' + (sys === s.id ? ' on' : '') + '" data-sys="' + s.id + '">' + UI.icon(s.icon) + esc(s.name) + '</button>'; }).join('') + '</div>' +
      '<div class="mn-legend"><span>Labels:</span>' + ['dx', 'icd', 'occ', 'concept', 'urgent'].map(function (k) { return BM.statusBadge(k); }).join('') +
      '<span>Hover a label for what it means.</span></div></div>' +
      '<div data-out></div>' +
      '<div style="margin-top:28px">' + BM.note() + '</div></div>';
    var out = view.querySelector('[data-out]'), input = view.querySelector('[data-q]');
    function popular() {
      return '<div class="lp-try" style="display:flex;flex-wrap:wrap;gap:6px 8px;margin-bottom:22px;font-size:.88rem;color:var(--c-muted)"><span>People look up:</span>' +
        POPULAR.map(function (t) { return '<button type="button" class="bm-chip" data-try="' + esc(t) + '">' + esc(t) + '</button>'; }).join('') + '</div>';
    }
    function draw() {
      var v = input.value.trim();
      if (v) out.innerHTML = '<div class="mn-results">' + resultsHtml(v) + '</div>';
      else out.innerHTML = (sys ? '' : popular()) + systemsHtml(sys);
    }
    var t = null;
    input.addEventListener('input', function () {
      clearTimeout(t);
      t = setTimeout(function () {
        var v = input.value.trim();
        if (v) { sys = null; view.querySelectorAll('[data-sys]').forEach(function (b) { b.classList.remove('on'); }); }
        try { history.replaceState(null, '', v ? UI.hashFor('manual', 's', v) : '#manual'); } catch (e) {}
        draw();
      }, 140);
    });
    view.addEventListener('click', function (e) {
      var b = e.target.closest('[data-sys]');
      if (b) {
        sys = b.getAttribute('data-sys') || null; input.value = '';
        view.querySelectorAll('[data-sys]').forEach(function (x) { x.classList.toggle('on', x === b); });
        try { history.replaceState(null, '', sys ? '#manual/sys/' + sys : '#manual'); } catch (e2) {}
        draw(); return;
      }
      var tr = e.target.closest('[data-try]');
      if (tr) { input.value = tr.getAttribute('data-try'); input.dispatchEvent(new Event('input')); }
    });
    draw();
    if (mode === 'search' && !q) input.focus();
    return Promise.resolve();
  }

  function entryPage(view, c) {
    var s = BM.systemById[c.sys], st = BM.STATUS[c.st] || BM.STATUS.concept;
    var mix = BM.existing(c.mix, BM.conditionById), tools = BM.existing(c.tools, BM.toolById);
    var pats = BM.PATTERNS.filter(function (p) { return p.conds.indexOf(c.id) >= 0; });
    var scan = c.scan && BM.scanById[c.scan];
    var urgent = c.st === 'urgent';
    view.innerHTML = '<div class="ui-wrap"><a class="bm-back" href="#manual/sys/' + s.id + '" data-go="manual/sys/' + s.id + '">' + UI.icon('back') + esc(s.name) + '</a>' +
      '<div class="bm-art-head"><div class="mn-entry-meta"><span class="bm-code">' + esc(c.code) + '</span>' + BM.statusBadge(c.st) +
      '<span class="mn-where">' + UI.icon(s.icon) + esc(s.name) + '</span></div>' +
      '<h1>' + esc(c.n) + '</h1><p class="line">' + esc(c.line) + '</p>' +
      (c.aka && c.aka.length ? '<p class="small muted" style="margin-top:8px">Also called: ' + c.aka.map(esc).join(' · ') + '</p>' : '') + '</div>' +
      (urgent ? '<div class="bm-see" style="margin-bottom:20px"><h3>' + UI.icon('brake') + 'If this is you right now</h3><p style="margin:0 0 10px">Please talk to someone today. You don’t have to explain it well.</p><button class="bm-brake" data-brake>' + UI.icon('brake') + 'Open the emergency brake</button></div>' : '') +
      '<div class="bm-art"><div>' +
        '<section class="bm-sec"><h2>' + UI.icon('brake') + 'Warning lights</h2><ul class="bm-list warn">' + c.signs.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul></section>' +
        '<section class="bm-sec"><h2>' + UI.icon('engine') + 'Under the hood</h2><p>' + esc(c.under) + '</p><p class="small muted"><b>' + esc(st[0]) + ':</b> ' + esc(st[1]) + '</p></section>' +
        (c.myth ? '<section class="bm-sec"><h2>' + UI.icon('bulb') + 'Garage myth</h2><div class="bm-myth"><div class="m"><b>Myth</b><p>' + esc(c.myth[0]) + '</p></div><div class="t"><b>What’s true</b><p>' + esc(c.myth[1]) + '</p></div></div></section>' : '') +
        '<section class="bm-sec"><h2>' + UI.icon('shield') + 'What the professionals do</h2><p>' + esc(c.pro) + '</p></section>' +
        '<section class="bm-sec"><h2>' + UI.icon('wrench') + 'Self-repair: what you can try</h2><ul class="bm-list good">' + c.diy.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul></section>' +
        (tools.length ? '<section class="bm-sec"><h2>' + UI.icon('wrench') + 'Tools for this</h2><div class="bm-cards">' + tools.map(function (t) { return BM.toolCard(t); }).join('') + '</div></section>' : '') +
        (mix.length ? '<section class="bm-sec mn-mix"><h2>' + UI.icon('refresh') + 'Often mixed up with</h2><div class="bm-links">' + mix.map(function (m) {
          return '<a class="bm-chip" href="#manual/' + m.id + '" data-go="manual/' + m.id + '"><span class="bm-code">' + esc(m.code) + '</span>' + esc(m.n) + '</a>';
        }).join('') + '</div></section>' : '') +
        (pats.length ? '<section class="bm-sec"><h2>' + UI.icon('factory') + 'Factory settings that can feed it</h2><div class="bm-cards">' + pats.slice(0, 6).map(function (p) { return BM.patternCard(p); }).join('') + '</div></section>' : '') +
        BM.note() +
      '</div><aside class="bm-side">' +
        (scan ? '<div class="ui-card"><h3 style="font-size:1.05rem">Run the check</h3><p class="muted small">' + esc(scan.n) + ' · ' + esc(scan.time) + (scan.kind === 'validated' ? ' · a published screener' : ' · our own pattern check') + '</p>' +
          '<a class="ui-btn primary block" href="#scan/' + scan.id + '" data-go="scan/' + scan.id + '">' + UI.icon('scan') + 'Start the check</a></div>' : '') +
        '<div class="ui-card bm-stat"><b>How common</b>' + esc(c.stat) + '</div>' +
        '<div class="ui-card"><b class="mono small" style="color:var(--c-accent);letter-spacing:.12em">LIGHTS IT USES</b><div class="mn-lights" style="margin-top:10px">' +
          c.lights.map(function (l) { return BM.lightById[l] ? '<span><i></i>' + esc(BM.lightById[l].label) + '</span>' : ''; }).join('') + '</div></div>' +
        '<div class="bm-see"><h3>' + UI.icon('brake') + 'Take it to a pro when…</h3><ul>' + c.see.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>' +
          '<p style="margin:10px 0 0"><a href="#help" data-go="help">Who to see, and how ' + UI.icon('arrow') + '</a></p></div>' +
        '<div class="ui-row">' + BM.planButton('condition', c.id) + '<a class="ui-btn ghost" href="#workorder" data-go="workorder">' + UI.icon('clipboard') + 'Work order</a></div>' +
      '</aside></div></div>';
    return Promise.resolve();
  }

  UI.page('manual', { title: function (a) { var c = BM.conditionById[a[0]]; return c ? c.n : 'Repair manual'; }, nav: 'Manual', icon: 'book', order: 10 }, function (view, ctx) {
    var c = BM.conditionById[ctx.args[0]];
    if (c) return entryPage(view, c);
    return listPage(view, ctx);
  });
})();

/* ===== profile.html ===== */
(function () {
  var esc = UI.esc;
  UI.page('profile', { title: 'Your profile', auth: 'user' }, function (view, ctx) {
    var me = ctx.me;
    view.innerHTML = '<div class="ui-wrap ui-narrow"><div class="pf-head"><span class="ui-avatar">' + esc(UI.initials(me.name)) + '</span>' +
      '<div><h1>' + esc(me.name) + '</h1><div class="muted">' + esc(me.email) + (me.joined ? ' · member since ' + esc(UI.fmtDate(me.joined, { month: 'long', year: 'numeric' })) : '') + '</div></div></div>' +
      '<div class="pf-grid"><form class="ui-card ui-stack" data-name><h3>Your name</h3><label class="ui-field"><span>Shown to other people</span>' +
      '<input type="text" name="name" value="' + esc(me.name) + '" maxlength="60" required></label><button class="ui-btn primary" type="submit">Save</button></form>' +
      '<div class="ui-card ui-stack"><h3>Appearance</h3><p class="muted small">Follow your device, or pick one.</p><div data-theme-box></div>' +
      '<h3 style="margin-top:22px">Password</h3><p class="muted small">We\'ll email you a link to choose a new one.</p>' +
      '<button class="ui-btn" data-reset>' + UI.icon('mail') + 'Email me a reset link</button></div></div>' +
      '<div class="ui-card" style="margin-top:16px"><div class="pf-links">' +
      (me.is_admin ? '<a href="#admin" data-go="admin">' + UI.icon('shield') + 'Admin</a>' : '') +
      '<button data-feedback>' + UI.icon('chat') + 'Submit feedback</button>' +
      '<button data-lk-open="overview">' + UI.icon('lock') + 'Privacy &amp; Terms, and your data</button>' +
      '<button data-signout-here>' + UI.icon('logout') + 'Sign out</button></div></div></div>';
    function themeBox() {
      var t = UI.theme();
      view.querySelector('[data-theme-box]').innerHTML = '<div class="ui-seg">' + [['auto', 'Auto'], ['light', 'Light'], ['dark', 'Dark']].map(function (o) {
        return '<button type="button" data-theme-pick="' + o[0] + '" class="' + (t === o[0] ? 'on' : '') + '">' + o[1] + '</button>';
      }).join('') + '</div>';
    }
    themeBox();
    view.addEventListener('click', function (e) {
      var t = e.target.closest('[data-theme-pick]');
      if (t) { UI.setTheme(t.getAttribute('data-theme-pick')); themeBox(); UI.renderChrome(); return; }
      if (e.target.closest('[data-reset]')) {
        UI.busy(e.target.closest('[data-reset]'), UI.auth('reset', { email: me.email })).then(function (r) { UI.toast(r.message, 'ok'); });
      }
      if (e.target.closest('[data-signout-here]')) UI.auth('logout');
    });
    view.querySelector('[data-name]').addEventListener('submit', function (e) {
      e.preventDefault();
      var v = UI.formData(e.target);
      UI.busy(e.target.querySelector('[type=submit]'), UI.api('update_profile', v.name)).then(function (r) {
        UI.setMe(r.me); ctx.me = r.me; UI.toast('Saved', 'ok');
        view.querySelector('.pf-head h1').textContent = r.me.name;
      });
    });
  });
})();

/* ===== scan.html ===== */
(function () {
  var esc = UI.esc;
  /* Answers that need more than a score: [item index, minimum value, kind] */
  var FLAGS = {
    phq9: [[8, 1, 'crisis']],
    bpd: [[4, 2, 'crisis']],
    relationship: [[11, 2, 'abuse'], [8, 2, 'abuse'], [9, 2, 'abuse']],
    eating: [[2, 2, 'doctor'], [1, 3, 'doctor']],
    auditc: []
  };

  function itemsOf(scan) {
    if (scan.kind === 'factory') return BM.PATTERNS.map(function (p) { return { q: p.q, opts: scan.opts, pid: p.id }; });
    return scan.items.map(function (it) { return typeof it === 'string' ? { q: it, opts: scan.opts } : it; });
  }

  /* Score answers (array of numbers, null = unanswered). gate: true/false for the PC-PTSD-5 opener. */
  BM.scoreScan = function (scan, ans, gate) {
    var items = itemsOf(scan);
    var max = items.reduce(function (s, it) { return s + it.opts[it.opts.length - 1][1]; }, 0);
    var score = ans.reduce(function (s, v) { return s + (v || 0); }, 0);
    var r = { scan_id: scan.id, score: score, max: max, taken: new Date().toISOString(), detail: null };
    if (scan.gate && gate === false) { r.score = 0; score = 0; r.detail = { gate: false }; }
    if (scan.kind === 'pattern') {
      var pct = max ? score / max * 100 : 0;
      var band = BM.PATTERN_BANDS.filter(function (b) { return pct < b.pct; })[0] || BM.PATTERN_BANDS[3];
      r.level = band.level; r.label = band.label; r.text = band.text; r.pct = Math.round(pct);
      if (scan.subscales) {
        var sub = {};
        Object.keys(scan.subscales).forEach(function (k) {
          var idx = scan.subscales[k], m = idx.length * 4, s = idx.reduce(function (t, i) { return t + (ans[i] || 0); }, 0);
          sub[k] = Math.round(s / m * 100);
        });
        var style = sub.anx < 50 && sub.avo < 50 ? 'Secure-leaning' : sub.anx >= 50 && sub.avo < 50 ? 'Anxious-leaning' : sub.avo >= 50 && sub.anx < 50 ? 'Avoidant-leaning' : 'Fearful-avoidant-leaning';
        r.detail = { anx: sub.anx, avo: sub.avo, style: style };
        r.label = style; r.level = style === 'Secure-leaning' ? 0 : Math.max(sub.anx, sub.avo) >= 75 ? 3 : 2;
        r.text = { 'Secure-leaning': 'Your answers lean secure: closeness and independence both feel mostly OK.',
          'Anxious-leaning': 'Your answers lean anxious: closeness calms you and distance alarms you. Very common, and changeable.',
          'Avoidant-leaning': 'Your answers lean avoidant: independence feels safe and too much closeness feels like pressure.',
          'Fearful-avoidant-leaning': 'Your answers show both: you want closeness and fear it. Often linked to unpredictable early relationships.' }[style];
      }
    } else if (scan.kind === 'factory') {
      var hits = items.map(function (it, i) { return { id: it.pid, v: ans[i] || 0 }; }).filter(function (h) { return h.v > 0; })
        .sort(function (a, b) { return b.v - a.v; });
      var clear = hits.filter(function (h) { return h.v === 2; }).length;
      r.level = clear === 0 ? (hits.length ? 1 : 0) : clear <= 3 ? 1 : clear <= 7 ? 2 : 3;
      r.label = clear + ' clear, ' + (hits.length - clear) + ' partial';
      r.text = hits.length ? 'These are the factory settings you recognised, strongest first. Each one links to what it tends to install and how people update it.' : 'You didn’t recognise any of the patterns. That’s worth celebrating.';
      r.detail = { top: hits.slice(0, 10).map(function (h) { return [h.id, h.v]; }) };
    } else {
      var b = scan.bands.filter(function (x) { return score <= x.max; })[0] || scan.bands[scan.bands.length - 1];
      r.level = b.level; r.label = b.label; r.text = b.text;
    }
    var flags = (FLAGS[scan.id] || []).filter(function (f) { return (ans[f[0]] || 0) >= f[1]; }).map(function (f) { return f[2]; });
    r.flags = flags.filter(function (f, i) { return flags.indexOf(f) === i; });
    return r;
  };

  function flagHtml(kind) {
    if (kind === 'crisis') return '<div class="bm-see sc-flag"><h3>' + UI.icon('brake') + 'One answer matters more than the score</h3><p style="margin:0 0 10px">You mentioned thoughts of death or hurting yourself. Please talk to someone today: a crisis line, your doctor, or someone you trust. You deserve support right now.</p><button class="bm-brake" data-brake>' + UI.icon('brake') + 'Open the emergency brake</button></div>';
    if (kind === 'abuse') return '<div class="bm-see sc-flag"><h3>' + UI.icon('shield') + 'Your safety comes first</h3><p style="margin:0">Fear, threats and coercion are signs of abuse. Domestic abuse services help with safety planning, whether or not you want to leave: US <a href="tel:18007997233">1-800-799-7233</a> · UK <a href="tel:08082000247">0808 2000 247</a> · Canada <a href="https://sheltersafe.ca" target="_blank" rel="noopener">sheltersafe.ca</a>. In danger, call your emergency number.</p></div>';
    return '<div class="bm-see sc-flag"><h3>' + UI.icon('info') + 'Please see a doctor about this</h3><p style="margin:0">Some of your answers (purging or strong restriction) can affect your physical health. A doctor can check you safely and help, without judgement.</p></div>';
  }

  function resultHtml(scan, r) {
    var c = BM.conditionById[scan.cond];
    var gauge = BM.gaugeSvg({ value: r.max ? r.score / r.max * 10 : 0, max: 10, label: scan.kind === 'factory' ? 'patterns' : 'score', shown: r.score + '/' + r.max, invert: true });
    var extra = '';
    if (r.detail && r.detail.style) {
      extra = '<div class="sc-block"><h2>Your two attachment dials</h2><div class="ui-row top" style="gap:24px"><div class="sc-quad"><div>Anxious</div><div>Fearful-avoidant</div><div>Secure</div><div>Avoidant</div>' +
        '<span class="dot" style="left:' + r.detail.avo + '%;bottom:' + r.detail.anx + '%"></span></div>' +
        '<div class="sc-sub"><div class="row"><span class="sc-axis">ANXIETY</span><div class="bm-meter"><span style="width:' + r.detail.anx + '%"></span></div><b>' + r.detail.anx + '%</b></div>' +
        '<div class="row"><span class="sc-axis">AVOIDANCE</span><div class="bm-meter"><span style="width:' + r.detail.avo + '%"></span></div><b>' + r.detail.avo + '%</b></div>' +
        '<p class="small muted">Up = more anxiety about closeness. Right = more avoidance of closeness. Read about <a href="#manual/anxattach" data-go="manual/anxattach">anxious</a> and <a href="#manual/avoidattach" data-go="manual/avoidattach">avoidant</a> attachment.</p></div></div></div>';
    }
    if (r.detail && r.detail.top) {
      var pats = r.detail.top.map(function (t) { var p = BM.patternById[t[0]]; return p ? BM.patternCard(p, '<span class="bm-level ' + (t[1] === 2 ? 'l3' : 'l1') + '" style="align-self:flex-start">' + (t[1] === 2 ? 'Clearly' : 'A bit') + '</span>') : ''; }).join('');
      extra = pats ? '<div class="sc-block"><h2>Your factory settings</h2><div class="bm-cards">' + pats + '</div></div>' : '';
    }
    var tools = BM.existing(scan.next, BM.toolById);
    return '<div class="sc-res"><div>' + gauge + '</div><div><span class="bm-level l' + r.level + '">' + esc(r.label) + '</span>' +
      '<h2>' + esc(scan.n) + '</h2><p>' + esc(r.text) + '</p>' +
      (scan.kind !== 'validated' && scan.kind !== 'aces' ? '<p class="small muted">' + (scan.kind === 'pattern' ? 'A pattern check, not a validated test. ' : '') + 'It shows which lights your answers switch on, not what you “have”.</p>' : '<p class="small muted">A screener result, not a diagnosis. Only a clinician who meets you can diagnose.</p>') +
      '<div class="sc-acts">' + (UI.me ? '<button class="ui-btn primary" data-save>' + UI.icon('save') + 'Save to my logbook</button>' : '<button class="ui-btn primary" data-save-guest>' + UI.icon('save') + 'Keep it in a logbook</button>') +
      '<a class="ui-btn" href="#workorder" data-go="workorder">' + UI.icon('clipboard') + 'Work order for a pro</a>' +
      '<button class="ui-btn ghost" data-again>' + UI.icon('refresh') + 'Retake</button></div></div></div>' +
      r.flags.map(flagHtml).join('') + extra +
      (c ? '<div class="sc-block"><h2>What this lights up in the manual</h2><div class="bm-cards">' + BM.condCard(c) + '</div></div>' : '') +
      (tools.length ? '<div class="sc-block"><h2>Tools to try first</h2><div class="bm-cards">' + tools.map(function (t) { return BM.toolCard(t); }).join('') + '</div></div>' : '') +
      '<div class="sc-block">' + BM.note() + '</div>';
  }

  UI.page('scan', { title: function (a) { var s = BM.scanById[a[0]]; return s ? s.n : 'Check'; } }, function (view, ctx) {
    var scan = BM.scanById[ctx.args[0]];
    if (!scan) { UI.go('diagnose', 'scans'); return Promise.resolve(); }
    var items = itemsOf(scan), ans = items.map(function () { return null; }), gate = scan.gate ? null : true, last = null;

    function form() {
      var kind = scan.kind === 'validated' ? '<span class="bm-st dx">Published screener</span>' : scan.kind === 'pattern' ? '<span class="bm-st">Pattern check · not validated</span>' : '<span class="bm-st occ">Childhood</span>';
      view.innerHTML = '<div class="ui-wrap sc-wrap"><a class="bm-back" href="#diagnose/scans" data-go="diagnose/scans">' + UI.icon('back') + 'All checks</a>' +
        '<div class="sc-head"><div class="sc-meta">' + kind + '<span class="bm-st">' + esc(scan.time) + '</span><span class="bm-st">' + items.length + ' questions</span></div><h1>' + esc(scan.n) + '</h1></div>' +
        '<form data-form novalidate>' +
        '<div class="sc-fuel"><div class="row"><span>FUEL</span><span data-count>0 / ' + items.length + '</span></div><div class="bm-meter"><span data-fill style="width:0%"></span></div></div>' +
        (scan.gate ? '<fieldset class="sc-q" data-gate><legend><span class="n">START</span>' + esc(scan.gate) + '</legend><div class="sc-opts">' +
          '<label class="sc-opt"><input type="radio" name="gate" value="1"><span>Yes</span></label><label class="sc-opt"><input type="radio" name="gate" value="0"><span>No</span></label></div></fieldset>' : '') +
        '<div data-items' + (scan.gate ? ' hidden' : '') + '><p class="sc-intro">' + esc(scan.intro) + '</p>' +
        items.map(function (it, i) {
          return '<fieldset class="sc-q" data-i="' + i + '"><legend><span class="n">' + String(i + 1).padStart(2, '0') + '</span>' + esc(it.q) + '</legend><div class="sc-opts">' +
            it.opts.map(function (o) { return '<label class="sc-opt"><input type="radio" name="q' + i + '" value="' + o[1] + '"><span>' + esc(o[0]) + '</span></label>'; }).join('') + '</div></fieldset>';
        }).join('') + '</div>' +
        '<label class="ui-check sc-ack"><input type="checkbox" name="ack" data-ack><span>I understand this is a self-check for fun and reflection, <b>not a diagnosis or medical advice</b>.</span></label>' +
        '<div class="ui-row"><button class="ui-btn primary lg" type="submit">' + UI.icon('scan') + 'Run the scan</button><span class="small muted" data-hint></span></div>' +
        (scan.source || scan.note ? '<p class="sc-src">' + esc(scan.source || '') + (scan.source && scan.note ? ' ' : '') + esc(scan.note || '') + '</p>' : '') +
        '</form></div>';
    }
    function fuel() {
      var need = gate === false ? 0 : items.length, done = gate === false ? 0 : ans.filter(function (a) { return a !== null; }).length;
      var c = view.querySelector('[data-count]'), f = view.querySelector('[data-fill]');
      if (c) c.textContent = (gate === false ? 'done' : done + ' / ' + need);
      if (f) f.style.width = (gate === false ? 100 : Math.round(done / need * 100)) + '%';
    }
    function showResult(r) {
      view.innerHTML = '<div class="ui-wrap sc-wrap"><a class="bm-back" href="#diagnose/scans" data-go="diagnose/scans">' + UI.icon('back') + 'All checks</a>' + resultHtml(scan, r) + '</div>';
      window.scrollTo(0, 0);
    }
    form();

    view.addEventListener('change', function (e) {
      var t = e.target;
      if (t.name === 'gate') {
        gate = t.value === '1';
        view.querySelector('[data-items]').hidden = !gate;
      } else if (/^q\d+$/.test(t.name)) {
        var i = +t.name.slice(1); ans[i] = +t.value;
        var fs = t.closest('.sc-q'); fs.classList.add('done'); fs.classList.remove('miss');
      }
      fuel();
    });
    view.addEventListener('submit', function (e) {
      if (!e.target.matches('[data-form]')) return;
      e.preventDefault();
      var hint = view.querySelector('[data-hint]');
      if (scan.gate && gate === null) { hint.textContent = 'Answer the first question first.'; view.querySelector('[data-gate]').classList.add('miss'); return; }
      var missing = gate === false ? [] : ans.map(function (a, i) { return a === null ? i : -1; }).filter(function (i) { return i >= 0; });
      if (missing.length) {
        missing.forEach(function (i) { view.querySelector('[data-i="' + i + '"]').classList.add('miss'); });
        hint.textContent = missing.length + ' question' + (missing.length === 1 ? '' : 's') + ' left';
        view.querySelector('[data-i="' + missing[0] + '"]').scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
      if (!view.querySelector('[data-ack]').checked) { hint.textContent = 'Please tick the box above first.'; return; }
      last = BM.scoreScan(scan, ans, gate);
      last.id = 'r' + Date.now();
      BM.local.add({ id: last.id, scan_id: last.scan_id, score: last.score, max: last.max, level: last.level, label: last.label, taken: last.taken, detail: last.detail });
      UI.apiQuiet('count_scan', scan.id).catch(function () {});
      showResult(last);
      if (last.flags.indexOf('crisis') >= 0) setTimeout(BM.crisis, 300);
    });
    view.addEventListener('click', function (e) {
      if (e.target.closest('[data-again]')) { ans = items.map(function () { return null; }); gate = scan.gate ? null : true; form(); window.scrollTo(0, 0); return; }
      if (e.target.closest('[data-save-guest]')) { BM.askAccount('Save this result and track how it changes over time.'); return; }
      var sv = e.target.closest('[data-save]');
      if (sv && last) {
        UI.busy(sv, UI.api('save_scan', { scan_id: last.scan_id, score: last.score, max: last.max, level: last.level, label: last.label, detail: last.detail, taken: last.taken })).then(function () {
          UI.toast('Saved to your logbook', 'ok'); sv.innerHTML = UI.icon('check') + 'Saved'; sv.disabled = true;
        });
      }
    });
    return Promise.resolve();
  });
})();

/* ===== toolbox.html ===== */
(function () {
  var esc = UI.esc;

  function listPage(view) {
    var now = ['breath_sigh', 'ground_54321', 'tipp', 'safety_plan'].map(function (id) { return BM.toolById[id]; });
    view.innerHTML = '<div class="ui-wrap"><div class="ui-page-head"><div><div class="eyebrow">The toolbox</div><h1>Tools that actually help</h1>' +
      '<p class="muted">' + BM.TOOLS.length + ' techniques from CBT, DBT, ACT and sleep and habit research, each with the evidence behind it. Many have a live timer, pacer or worksheet.</p></div></div>' +
      '<h2 style="font-size:1.1rem;margin-bottom:10px">Need something right now?</h2><div class="tb-now">' +
      now.map(function (t) { return '<a href="#toolbox/' + t.id + '" data-go="toolbox/' + t.id + '">' + UI.icon(t.cat === 'crisis' ? 'brake' : 'wind') + esc(t.n) + '</a>'; }).join('') + '</div>' +
      BM.TOOL_CATS.map(function (c) {
        var list = BM.TOOLS.filter(function (t) { return t.cat === c.id; });
        return list.length ? '<section class="tb-cat"><div class="tb-cat-head"><h2>' + esc(c.name) + '</h2><p>' + esc(c.line) + '</p></div><div class="bm-cards">' +
          list.map(function (t) { return BM.toolCard(t); }).join('') + '</div></section>' : '';
      }).join('') + BM.note() + '</div>';
    return Promise.resolve();
  }

  /* ---------------------------------------------------------------- widgets */
  function breath(box, key) {
    var pat = BM.BREATHS[key], running = false, timer = null, round = 0;
    box.innerHTML = '<div class="tb-breath"><div class="tb-breath-pick">' + Object.keys(BM.BREATHS).map(function (k) {
      return '<button type="button" class="bm-chip' + (k === key ? ' on' : '') + '" data-bk="' + k + '">' + esc(BM.BREATHS[k].name) + '</button>';
    }).join('') + '</div><div class="tb-orb"><div class="ball" data-ball></div><div class="txt" data-txt>Press start and follow the circle</div></div>' +
      '<div class="ui-row"><button class="ui-btn primary" data-go-breath>' + UI.icon('play') + 'Start</button><span class="small muted" data-round></span></div></div>';
    var ball = box.querySelector('[data-ball]'), txt = box.querySelector('[data-txt]'), btn = box.querySelector('[data-go-breath]');
    function phase(i) {
      if (!running || !box.isConnected) { running = false; return; }
      var st = pat.steps[i % pat.steps.length], label = st[0], secs = st[1];
      if (i % pat.steps.length === 0) { round++; box.querySelector('[data-round]').textContent = 'Round ' + round; }
      var grow = /in|top up/i.test(label) && !/out/i.test(label), shrink = /out/i.test(label);
      ball.style.transitionDuration = secs + 's';
      if (grow) ball.style.transform = 'scale(' + (/top up/i.test(label) ? 2.3 : 2.05) + ')';
      if (shrink) ball.style.transform = 'scale(1)';
      var left = secs;
      txt.innerHTML = esc(label) + '<b>' + left + '</b>';
      var tick = setInterval(function () {
        if (!running || !box.isConnected) { clearInterval(tick); return; }
        left--; if (left > 0) txt.innerHTML = esc(label) + '<b>' + left + '</b>';
      }, 1000);
      timer = setTimeout(function () { clearInterval(tick); phase(i + 1); }, secs * 1000);
    }
    btn.addEventListener('click', function () {
      running = !running;
      btn.innerHTML = running ? UI.icon('pause') + 'Stop' : UI.icon('play') + 'Start';
      if (running) { round = 0; phase(0); } else { clearTimeout(timer); ball.style.transform = 'scale(1)'; txt.textContent = 'Paused. Notice how you feel.'; }
    });
    box.querySelectorAll('[data-bk]').forEach(function (b) {
      b.addEventListener('click', function () { running = false; clearTimeout(timer); breath(box, b.getAttribute('data-bk')); });
    });
  }

  function timerWidget(box, minutes, label) {
    var total = minutes * 60, left = total, running = false, iv = null;
    box.innerHTML = '<div class="tb-timer"><svg class="tb-ring" viewBox="0 0 200 200"><circle cx="100" cy="100" r="86" fill="none" stroke="var(--c-surface-2)" stroke-width="14"/>' +
      '<circle data-arc cx="100" cy="100" r="86" fill="none" stroke="var(--c-brand)" stroke-width="14" stroke-linecap="round" stroke-dasharray="540.4" stroke-dashoffset="0" transform="rotate(-90 100 100)"/>' +
      '<text data-t x="100" y="108" text-anchor="middle" font-size="34" font-weight="700" fill="var(--c-ink)"></text></svg>' +
      '<div class="ui-row"><button class="ui-btn primary" data-start>' + UI.icon('play') + 'Start ' + esc(label.toLowerCase()) + '</button><button class="ui-btn ghost" data-reset>' + UI.icon('refresh') + 'Reset</button></div></div>';
    var t = box.querySelector('[data-t]'), arc = box.querySelector('[data-arc]'), start = box.querySelector('[data-start]');
    function draw() {
      t.textContent = Math.floor(left / 60) + ':' + String(left % 60).padStart(2, '0');
      arc.setAttribute('stroke-dashoffset', String(540.4 * (1 - left / total)));
    }
    function chime() {
      try { var a = new (window.AudioContext || window.webkitAudioContext)(), o = a.createOscillator(), g = a.createGain(); o.frequency.value = 660; o.connect(g); g.connect(a.destination);
        g.gain.setValueAtTime(.2, a.currentTime); g.gain.exponentialRampToValueAtTime(.001, a.currentTime + 1.2); o.start(); o.stop(a.currentTime + 1.2); } catch (e) {}
    }
    start.addEventListener('click', function () {
      running = !running;
      start.innerHTML = running ? UI.icon('pause') + 'Pause' : UI.icon('play') + 'Resume';
      if (running) {
        iv = setInterval(function () {
          if (!box.isConnected) { clearInterval(iv); return; }
          left--; draw();
          if (left <= 0) { clearInterval(iv); running = false; chime(); UI.toast('Time. Nicely done.', 'ok'); start.innerHTML = UI.icon('play') + 'Again'; left = total; }
        }, 1000);
      } else clearInterval(iv);
    });
    box.querySelector('[data-reset]').addEventListener('click', function () { clearInterval(iv); running = false; left = total; draw(); start.innerHTML = UI.icon('play') + 'Start'; });
    draw();
  }

  function ground(box) {
    var steps = [[5, 'things you can see'], [4, 'things you can feel'], [3, 'things you can hear'], [2, 'things you can smell'], [1, 'thing you can taste, or one kind thing to tell yourself']];
    box.innerHTML = '<div class="tb-ground">' + steps.map(function (s, i) {
      return '<div class="step' + (i === 0 ? ' on' : '') + '" data-step="' + i + '"><div class="big">' + s[0] + '</div><h3>Name ' + s[0] + ' ' + esc(s[1]) + '</h3><div class="inputs">' +
        Array.apply(null, Array(s[0])).map(function (_, j) { return '<input type="text" placeholder="' + (j + 1) + '…" aria-label="' + esc(s[1]) + ' ' + (j + 1) + '">'; }).join('') +
        '</div><button class="ui-btn primary" data-next>' + (i < 4 ? 'Next ' + UI.icon('arrow') : 'Done') + '</button></div>';
    }).join('') + '<div class="step" data-step="5"><h3>You’re here. Right now.</h3><p class="muted">Take one slow breath out. Notice anything that’s shifted, even a little.</p><button class="ui-btn" data-restart>' + UI.icon('refresh') + 'Again</button></div></div>';
    var i = 0;
    box.addEventListener('click', function (e) {
      if (e.target.closest('[data-next]')) { i++; } else if (e.target.closest('[data-restart]')) { i = 0; box.querySelectorAll('input').forEach(function (x) { x.value = ''; }); } else return;
      box.querySelectorAll('[data-step]').forEach(function (s) { s.classList.toggle('on', +s.getAttribute('data-step') === i); });
      var f = box.querySelector('.step.on input'); if (f) f.focus();
    });
  }

  function sheet(box, tool) {
    box.innerHTML = '<form class="tb-sheet" data-sheet-form><h3 style="margin:0">Worksheet</h3>' + tool.fields.map(function (f) {
      var input = f[2] === 'area' ? '<textarea name="' + f[0] + '" placeholder="' + esc(f[3]) + '" maxlength="4000"></textarea>'
        : f[2] === 'range' || f[2] === 'range10' ? '<div class="tb-range"><input type="range" name="' + f[0] + '" min="0" max="' + (f[2] === 'range' ? 100 : 10) + '" step="' + (f[2] === 'range' ? 5 : 1) + '" value="' + (f[2] === 'range' ? 50 : 5) + '"><output>' + (f[2] === 'range' ? 50 : 5) + '</output></div>'
        : '<input type="text" name="' + f[0] + '" placeholder="' + esc(f[3]) + '" maxlength="400">';
      return '<label class="ui-field"><span>' + esc(f[1]) + '</span>' + input + '</label>';
    }).join('') +
      '<div class="ui-row">' + (UI.me ? '<button class="ui-btn primary" type="submit">' + UI.icon('save') + 'Save to my logbook</button>' : '<button class="ui-btn primary" type="button" data-ask>' + UI.icon('save') + 'Save in a logbook</button>') +
      '<button class="ui-btn" type="button" data-dl>' + UI.icon('download') + 'Download as text</button><button class="ui-btn ghost" type="reset">Clear</button></div>' +
      '<p class="small muted" style="margin:0">' + (UI.me ? 'Saved worksheets are private to you, in your Garage.' : 'Nothing you type leaves this browser unless you create an account and save it.') + '</p></form>';
    var form = box.querySelector('form');
    form.addEventListener('input', function (e) { if (e.target.type === 'range') e.target.nextElementSibling.textContent = e.target.value; });
    function text() {
      var d = UI.formData(form);
      return tool.n + ' (' + new Date().toLocaleDateString() + ')\n\n' + tool.fields.map(function (f) { return f[1] + ':\n' + (d[f[0]] || '') + '\n'; }).join('\n');
    }
    box.addEventListener('click', function (e) {
      if (e.target.closest('[data-ask]')) BM.askAccount('Save worksheets like this one and come back to them later.');
      if (e.target.closest('[data-dl]')) {
        var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text()], { type: 'text/plain' }));
        a.download = tool.id + '.txt'; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
      }
    });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var d = UI.formData(form), filled = {};
      tool.fields.forEach(function (f) { if (f[2] && f[2].indexOf('range') === 0) { filled[f[0]] = d[f[0]]; } else if ((d[f[0]] || '').trim()) filled[f[0]] = d[f[0]]; });
      var anyText = tool.fields.some(function (f) { return !(f[2] && f[2].indexOf('range') === 0) && (d[f[0]] || '').trim(); });
      if (!anyText) { UI.toast('Fill in at least one box first.', 'error'); return; }
      UI.busy(form.querySelector('[type=submit]'), UI.api('journal_add', tool.id, filled)).then(function () {
        UI.toast('Saved to your logbook', 'ok'); form.reset();
        form.querySelectorAll('output').forEach(function (o) { o.textContent = o.previousElementSibling.value; });
      });
    });
  }

  function toolPage(view, t) {
    var cat = BM.TOOL_CATS.filter(function (c) { return c.id === t.cat; })[0];
    var conds = BM.CONDITIONS.filter(function (c) { return c.tools.indexOf(t.id) >= 0; });
    var pats = BM.PATTERNS.filter(function (p) { return p.tools.indexOf(t.id) >= 0; });
    view.innerHTML = '<div class="ui-wrap"><a class="bm-back" href="#toolbox" data-go="toolbox">' + UI.icon('back') + 'Toolbox</a>' +
      '<div class="bm-art-head"><div class="ui-row"><span class="bm-code">' + esc(cat.name) + '</span><span class="bm-st">' + esc(t.time) + '</span></div><h1>' + esc(t.n) + '</h1><p class="line">' + esc(t.line) + '</p></div>' +
      '<div class="bm-art"><div>' + (t.w && t.w !== 'garage' ? '<div class="tb-widget" data-widget></div>' : '') +
        (t.w === 'garage' ? '<div class="tb-widget"><h3>Your daily gauges</h3><p class="muted">Log five gauges in under a minute; your Garage draws the 30-day chart.</p><a class="ui-btn primary" href="#garage" data-go="garage">' + UI.icon('dash') + 'Open my garage</a></div>' : '') +
        '<section class="bm-sec"><h2>' + UI.icon('wrench') + 'How to do it</h2><ol class="bm-steps">' + t.steps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ol></section>' +
        '<section class="bm-sec"><h2>' + UI.icon('book') + 'Why it works</h2><p>' + esc(t.why) + '</p></section>' +
        (conds.length ? '<section class="bm-sec"><h2>' + UI.icon('book') + 'Used for</h2><div class="bm-links">' + conds.map(function (c) {
          return '<a class="bm-chip" href="#manual/' + c.id + '" data-go="manual/' + c.id + '"><span class="bm-code">' + esc(c.code) + '</span>' + esc(c.n) + '</a>'; }).join('') +
          pats.map(function (p) { return '<a class="bm-chip" href="#factory/' + p.id + '" data-go="factory/' + p.id + '"><span class="bm-code">FS</span>' + esc(p.n) + '</a>'; }).join('') + '</div></section>' : '') +
        BM.note() +
      '</div><aside class="bm-side"><div class="ui-card"><h3 style="font-size:1.05rem">Keep it handy</h3><p class="muted small">Add it to your repair plan and mark how it works for you.</p>' + BM.planButton('tool', t.id) + '</div>' +
        '<div class="ui-card"><h3 style="font-size:1.05rem">Not working?</h3><p class="muted small">Tools are a start, not a substitute for care. If things aren’t improving after a few weeks, a professional can help find what fits.</p>' +
        '<a href="#help" data-go="help">Find a pro ' + UI.icon('arrow') + '</a></div></aside></div></div>';
    var box = view.querySelector('[data-widget]');
    if (box) {
      if (t.w.indexOf('breath:') === 0) breath(box, t.w.split(':')[1]);
      else if (t.w === 'ground') ground(box);
      else if (t.w.indexOf('timer:') === 0) timerWidget(box, +t.w.split(':')[1], t.w.split(':')[2] || 'Timer');
      else if (t.w === 'sheet') sheet(box, t);
    }
    return Promise.resolve();
  }

  UI.page('toolbox', { title: function (a) { var t = BM.toolById[a[0]]; return t ? t.n : 'Toolbox'; }, nav: 'Toolbox', icon: 'wrench', order: 40 }, function (view, ctx) {
    var t = BM.toolById[ctx.args[0]];
    return t ? toolPage(view, t) : listPage(view);
  });
})();

/* ===== workorder.html ===== */
(function () {
  var esc = UI.esc;
  var WANTS = ['An assessment for what’s going on', 'To talk about treatment options', 'A referral to a specialist', 'To rule out physical causes', 'Medication advice', 'Therapy recommendations'];

  UI.page('workorder', { title: 'Work order' }, function (view, ctx) {
    var draft = UI.store.get('wo', { noticed: '', since: '', questions: '', wants: [] });
    var lights = UI.store.get('lights', []).filter(function (id) { return BM.lightById[id]; });
    var results = BM.local.results().map(function (r) { return Object.assign({ src: 'device' }, r); });
    var picked = {};

    function key(r) { return r.scan_id + '|' + String(r.taken).slice(0, 19); }
    function merge(server) {
      (server || []).forEach(function (s) {
        if (!results.some(function (r) { return r.scan_id === s.scan_id && Math.abs(new Date(r.taken) - new Date(s.taken)) < 2000; })) results.push(Object.assign({ src: 'logbook' }, s));
      });
      results.sort(function (a, b) { return a.taken < b.taken ? 1 : -1; });
      var seen = {};
      results.forEach(function (r) { if (!seen[r.scan_id]) { picked[key(r)] = true; seen[r.scan_id] = 1; } });
    }

    function sheet() {
      var chosen = results.filter(function (r) { return picked[key(r)]; });
      return '<div class="wo-sheet" data-sheet><div class="ui-row between top"><div><span class="mono small" style="color:#a8792f;letter-spacing:.12em">BRAIN MECHANIC · WORK ORDER</span><h1>Notes for my appointment</h1>' +
        '<span class="small" style="color:#6c5849">' + esc(ctx.me ? ctx.me.name + ' · ' : '') + esc(new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })) + '</span></div>' +
        '<span class="stamp">SELF-CHECK · NOT A DIAGNOSIS</span></div>' +
        '<h3>What I’ve noticed</h3>' + (draft.noticed ? '<p>' + esc(draft.noticed) + '</p>' : '<p class="empty">(add a few lines on the left)</p>') +
        (draft.since ? '<p><b>Going on for:</b> ' + esc(draft.since) + '</p>' : '') +
        '<h3>Warning lights I recognise</h3>' + (lights.length ? '<p>' + lights.map(function (l) { return '• ' + esc(BM.lightById[l].label); }).join('\n') + '</p>' : '<p class="empty">(none ticked on the Diagnose page)</p>') +
        '<h3>Self-check results</h3>' + (chosen.length ? '<table><thead><tr><th>Check</th><th>Score</th><th>Result</th><th>Date</th></tr></thead><tbody>' + chosen.map(function (r) {
          var s = BM.scanById[r.scan_id];
          return '<tr><td>' + esc(s ? s.n : r.scan_id) + (s && s.kind === 'pattern' ? '<br><span style="color:#a08d7e;font-size:.75rem">pattern check, not validated</span>' : '') + '</td><td>' + r.score + ' / ' + r.max + '</td><td>' + esc(r.label) + '</td><td>' + esc(UI.fmtDate(r.taken)) + '</td></tr>';
        }).join('') + '</tbody></table>' : '<p class="empty">(no results selected)</p>') +
        '<h3>What I’d like from this appointment</h3>' + (draft.wants.length ? '<p>' + draft.wants.map(function (w) { return '• ' + esc(w); }).join('\n') + '</p>' : '<p class="empty">(pick on the left)</p>') +
        '<h3>My questions</h3>' + (draft.questions ? '<p>' + esc(draft.questions) + '</p>' : '<p class="empty">(optional)</p>') +
        '<p class="fine">Prepared with Brain Mechanic, a self-reflection tool. Nobody at Brain Mechanic is a doctor. PHQ-9, GAD-7, PC-PTSD-5 and AUDIT-C are published screeners; other checks are informal pattern checks. Please interpret with clinical judgement.</p></div>';
    }

    function draw() {
      view.innerHTML = '<div class="ui-wrap"><div class="ui-page-head wo-head"><div><div class="eyebrow">Work order</div><h1>Bring this to a professional</h1>' +
        '<p class="muted">A one-page summary so the first appointment starts in the right place. Nothing here is sent anywhere: it’s built in your browser.</p></div>' +
        '<div class="ui-row"><button class="ui-btn" data-copy>' + UI.icon('copy') + 'Copy text</button><button class="ui-btn primary" data-print>' + UI.icon('print') + 'Print or save PDF</button></div></div>' +
        '<div class="wo-grid"><form class="wo-edit" data-edit>' +
          '<div class="ui-card"><h2>Check results to include</h2>' + (results.length ? '<div class="wo-pick">' + results.map(function (r) {
            var s = BM.scanById[r.scan_id];
            return s ? '<label class="ui-check"><input type="checkbox" data-pick="' + esc(key(r)) + '"' + (picked[key(r)] ? ' checked' : '') + '><span><b>' + esc(s.n) + '</b> · ' + esc(r.label) + ' <span class="small muted">' + esc(UI.fmtDate(r.taken)) + (r.src === 'logbook' ? ' · logbook' : ' · this device') + '</span></span></label>' : '';
          }).join('') + '</div>' : '<p class="muted small">No results yet. <a href="#diagnose/scans" data-go="diagnose/scans">Run a check</a> and it appears here.</p>') + '</div>' +
          '<div class="ui-card"><h2>Warning lights</h2><p class="muted small" style="margin:0">' + (lights.length ? lights.length + ' lights from the Diagnose page are on the sheet. ' : 'None ticked yet. ') + '<a href="#diagnose" data-go="diagnose">Change them</a>.</p></div>' +
          '<div class="ui-card ui-stack"><h2>In your own words</h2>' +
            '<label class="ui-field"><span>What I’ve noticed</span><textarea name="noticed" maxlength="1500" placeholder="e.g. Since spring I can’t concentrate at work, I wake at 4 am, and I snap at my kids.">' + esc(draft.noticed) + '</textarea></label>' +
            '<label class="ui-field"><span>How long it’s been going on</span><input type="text" name="since" maxlength="80" value="' + esc(draft.since) + '" placeholder="e.g. about 6 months"></label>' +
            '<div class="ui-field"><span>What I’d like</span><div class="ui-stack" style="margin-top:6px">' + WANTS.map(function (w) {
              return '<label class="ui-check"><input type="checkbox" data-want="' + esc(w) + '"' + (draft.wants.indexOf(w) >= 0 ? ' checked' : '') + '><span>' + esc(w) + '</span></label>';
            }).join('') + '</div></div>' +
            '<label class="ui-field"><span>Questions I want to ask</span><textarea name="questions" maxlength="1000" placeholder="e.g. Could this be ADHD? What are my options besides medication?">' + esc(draft.questions) + '</textarea></label>' +
            '<p class="small muted" style="margin:0">Your draft is kept in this browser only.</p></div>' +
        '</form><div data-sheet-box>' + sheet() + '</div></div></div>';
    }
    function refresh() { UI.store.set('wo', draft); view.querySelector('[data-sheet-box]').innerHTML = sheet(); }

    view.addEventListener('input', function (e) {
      var t = e.target;
      if (t.name === 'noticed' || t.name === 'since' || t.name === 'questions') { draft[t.name] = t.value; refresh(); }
    });
    view.addEventListener('change', function (e) {
      var t = e.target;
      if (t.hasAttribute('data-pick')) { picked[t.getAttribute('data-pick')] = t.checked; refresh(); }
      if (t.hasAttribute('data-want')) {
        var w = t.getAttribute('data-want');
        draft.wants = draft.wants.filter(function (x) { return x !== w; }); if (t.checked) draft.wants.push(w); refresh();
      }
    });
    view.addEventListener('click', function (e) {
      if (e.target.closest('[data-print]')) window.print();
      if (e.target.closest('[data-copy]')) {
        var txt = view.querySelector('[data-sheet]').innerText;
        (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(function () { UI.toast('Copied', 'ok'); }, function () { UI.toast('Select the sheet and copy it by hand.', 'error'); });
      }
    });

    if (ctx.me) return UI.api('get_garage').then(function (d) { merge(d.sample ? [] : d.scans); draw(); });
    merge([]); draw();
    return Promise.resolve();
  });
})();
