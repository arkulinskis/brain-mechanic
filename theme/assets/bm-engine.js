/* bm-engine.js: Brain Mechanic's JavaScript engines. The pages are Python Forms; this file keeps what draws, times
   or crunches text, unchanged from the JavaScript version:
     - the lookup engine (BM.search: stems, synonyms, typo-tolerant), the warning-light ranking and check scoring
     - drawings: the office scene on the landing page, dashboard gauges, the Garage's 30-day chart
     - live tool widgets: breathing pacer, timer, 5-4-3-2-1 grounding and the ADHD pit-crew widgets (BM.W)
   Python reaches it through client_code/bm.py (BM.json.* returns JSON text, so Python gets real dicts) and the
   custom components in client_code/Components (Office, Gauge, Chart, Widget). The widgets talk back through
   BM.host, which client_code/bm.py fills with Python functions (server calls, toasts, the account dialog).
   Content lives in bm-data.js (loaded first). */
(function () {
  'use strict';
  var BM = window.BM = window.BM || {};
  var UI = window.UI;
  var esc = UI.esc;
  BM.host = BM.host || {};

  /* ---------------------------------------------------------------- the small UI the engines use (shim) */
  UI.icon = function (name) { return '<i class="ic ic-' + name + '" aria-hidden="true"></i>'; };
  UI.toast = function (msg, kind) { if (BM.host.toast) BM.host.toast(String(msg), kind || ''); };
  UI.confirm = function (o) { return Promise.resolve(BM.host.confirm ? BM.host.confirm(JSON.stringify(o || {})) : window.confirm(o.title)); };
  /* UI.api('fn', a, b) -> Promise of the reply; an {ok: false, error} reply rejects with its message */
  UI.api = function () {
    var args = Array.prototype.slice.call(arguments);
    return Promise.resolve(BM.host.api(args[0], JSON.stringify(args.slice(1)))).then(function (text) {
      var r = JSON.parse(text);
      if (r.error) throw new Error(r.error);
      return r.result;
    });
  };
  UI.busy = function (btn, promise) {
    function done() { if (btn) { btn.disabled = false; btn.classList.remove('is-busy'); } }
    if (btn) { btn.disabled = true; btn.classList.add('is-busy'); }
    return Promise.resolve(promise).then(function (r) { done(); return r; }, function (e) { done(); UI.toast(e && e.message || 'That didn’t work.', 'error'); throw e; });
  };
  UI.formData = function (form) {
    var out = {};
    Array.prototype.forEach.call(form.elements, function (el) {
      if (!el.name || el.disabled) return;
      if ((el.type === 'checkbox' || el.type === 'radio') && !el.checked) return;
      out[el.name] = el.value;
    });
    return out;
  };
  try { Object.defineProperty(UI, 'me', { configurable: true, get: function () { return BM.host.me ? !!BM.host.me() : false; } }); } catch (e) {}
  BM.askAccount = function (why) { if (BM.host.askAccount) BM.host.askAccount(why || ''); };
  BM.existing = function (ids, byId) { return (ids || []).map(function (i) { return byId[i]; }).filter(Boolean); };
  /* swallow rejections the widgets leave unhandled: UI.busy already showed them */
  window.addEventListener('unhandledrejection', function (e) { if (e && e.reason && e.reason.message && /^[A-Z]/.test(e.reason.message)) e.preventDefault(); });

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
    ['boundaries', 'boundary', 'no', 'pleaser', 'pleasing'],
    ['overwhelm', 'overwhelmed', 'swamped', 'frazzled', 'scattered'],
    ['late', 'lateness', 'punctual', 'timeblind', 'hyperfocus']
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

  /* ---------------------------------------------------------------- scoring a check (results are plain JSON) */
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
    if (scan.shade) {  // ASRS: count the answers that land in the shaded boxes
      score = ans.filter(function (v, i) { return v != null && v >= scan.shade[i]; }).length;
      max = items.length;
    }
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


  /* ---------------------------------------------------------------- the office scene (landing page) */
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


  /* ---------------------------------------------------------------- the Garage's 30-day chart */
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


  /* ---------------------------------------------------------------- the ADHD pit-crew widgets (BM.W) */
  var W = BM.W = BM.W || {};
  /* ---------------------------------------------------------------- helpers */
  function chime() {
    try { var a = new (window.AudioContext || window.webkitAudioContext)(); [660, 880].forEach(function (f, i) { var o = a.createOscillator(), g = a.createGain(); o.frequency.value = f; o.connect(g); g.connect(a.destination);
      var t0 = a.currentTime + i * .35; g.gain.setValueAtTime(.18, t0); g.gain.exponentialRampToValueAtTime(.001, t0 + 1.1); o.start(t0); o.stop(t0 + 1.1); }); } catch (e) {}
  }
  function mmss(s) { s = Math.max(0, Math.round(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }
  function download(name, text) {
    var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
    a.download = name; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  /* Members save to the logbook (a journal entry under the tool's id); guests get the account pitch. */
  function save(toolId, data, btn) {
    if (!UI.me) { BM.askAccount('Keep this in your private logbook and find it on any device.'); return; }
    UI.busy(btn, UI.api('journal_add', toolId, data)).then(function () { UI.toast('Saved to your logbook', 'ok'); });
  }
  function saveRow(toolId) {
    return '<div class="ui-row">' + (UI.me ? '<button class="ui-btn" type="button" data-aw-save>' + UI.icon('save') + 'Save to my logbook</button>' : '<button class="ui-btn" type="button" data-aw-save>' + UI.icon('save') + 'Keep it in a logbook</button>') +
      '<button class="ui-btn ghost" type="button" data-aw-dl>' + UI.icon('download') + 'Download as text</button></div>';
  }
  W.chime = chime;

  /* ---------------------------------------------------------------- the shrinking disc (Time Timer style) */
  function sector(frac) {
    var r = 82, cx = 100, cy = 100;
    if (frac <= 0) return '';
    if (frac >= 0.9999) return '<circle cx="100" cy="100" r="' + r + '" fill="var(--c-brand)"/>';
    var a = -frac * 2 * Math.PI, x = cx + r * Math.sin(a), y = cy - r * Math.cos(a);
    return '<path d="M100 100 L100 ' + (cy - r) + ' A' + r + ' ' + r + ' 0 ' + (frac > 0.5 ? 1 : 0) + ' 0 ' + x.toFixed(2) + ' ' + y.toFixed(2) + ' Z" fill="var(--c-brand)"/>';
  }
  function ticks() {
    var out = '';
    for (var i = 0; i < 60; i++) {
      var a = i / 60 * 2 * Math.PI, long = i % 5 === 0, r1 = long ? 86 : 89, r2 = 94;
      out += '<line x1="' + (100 + r1 * Math.sin(a)).toFixed(1) + '" y1="' + (100 - r1 * Math.cos(a)).toFixed(1) + '" x2="' + (100 + r2 * Math.sin(a)).toFixed(1) + '" y2="' + (100 - r2 * Math.cos(a)).toFixed(1) + '" stroke="var(--c-muted)" stroke-width="' + (long ? 2 : 1) + '"/>';
    }
    return out;
  }
  /* W.disc(el, minutes, {choices, autostart, label}) -> {set(min), start(), stop()} */
  W.disc = function (el, minutes, o) {
    o = o || {};
    var total = minutes * 60, left = total, endAt = null, iv = null;
    el.innerHTML = '<div class="aw-disc">' + (o.choices ? '<div class="aw-mins">' + o.choices.map(function (m) {
        return '<button type="button" class="bm-chip' + (m === minutes ? ' on' : '') + '" data-min="' + m + '">' + m + ' min</button>'; }).join('') + '</div>' : '') +
      '<svg viewBox="0 0 200 200" role="img" aria-label="Visual timer"><circle cx="100" cy="100" r="96" fill="var(--c-surface)" stroke="var(--c-line)" stroke-width="2"/>' + ticks() +
      '<g data-sector></g><circle cx="100" cy="100" r="30" fill="var(--c-surface)" stroke="var(--c-line)"/><text data-t x="100" y="106" text-anchor="middle" font-size="17" font-weight="700" fill="var(--c-ink)"></text></svg>' +
      '<div class="ui-row" style="justify-content:center"><button type="button" class="ui-btn primary" data-disc-go>' + UI.icon('play') + 'Start ' + esc(o.label || 'timer') + '</button>' +
      '<button type="button" class="ui-btn ghost" data-disc-reset>' + UI.icon('refresh') + 'Reset</button></div></div>';
    var sec = el.querySelector('[data-sector]'), txt = el.querySelector('[data-t]'), go = el.querySelector('[data-disc-go]');
    function draw() { sec.innerHTML = sector(left / total); txt.textContent = mmss(left); }
    function stop() { clearInterval(iv); iv = null; endAt = null; }
    function tick() {
      if (!el.isConnected) { stop(); return; }
      left = Math.max(0, (endAt - Date.now()) / 1000); draw();
      if (left <= 0) { stop(); chime(); UI.toast('Time. Stand up, stretch, and decide what’s next.', 'ok'); go.innerHTML = UI.icon('play') + 'Again'; left = total; setTimeout(draw, 1500); }
    }
    function start() { if (iv) return; if (left <= 0) left = total; endAt = Date.now() + left * 1000; iv = setInterval(tick, 250); go.innerHTML = UI.icon('pause') + 'Pause'; tick(); }
    function set(m) { stop(); minutes = m; total = left = m * 60; draw(); go.innerHTML = UI.icon('play') + 'Start ' + esc(o.label || 'timer');
      el.querySelectorAll('[data-min]').forEach(function (b) { b.classList.toggle('on', +b.getAttribute('data-min') === m); }); }
    el.addEventListener('click', function (e) {
      var m = e.target.closest('[data-min]');
      if (m) { set(+m.getAttribute('data-min')); return; }
      if (e.target.closest('[data-disc-go]')) { if (iv) { left = Math.max(0, (endAt - Date.now()) / 1000); stop(); go.innerHTML = UI.icon('play') + 'Resume'; } else start(); }
      if (e.target.closest('[data-disc-reset]')) set(minutes);
    });
    draw();
    if (o.autostart) start();
    return { set: set, start: start, stop: stop, left: function () { return left; } };
  };

  /* ---------------------------------------------------------------- make time visible + estimate trainer */
  W.time = function (box) {
    box.innerHTML = '<div class="aw"><div><h3>Time you can see</h3><p class="hint">Pick a length, press start, and put it where your eyes land. The coloured part is the time you have left.</p></div>' +
      '<div data-disc></div><hr class="aw-sep">' +
      '<div><h3>How long does it really take?</h3><p class="hint">Guess, then time it for real. After a few tasks you’ll know your personal multiplier.</p></div>' +
      '<div data-trainer></div><div data-mult></div><ul class="aw-log" data-log></ul>' +
      '<div class="ui-row"><button type="button" class="ui-btn ghost sm" data-clear-log>' + UI.icon('trash') + 'Clear my log</button><span class="small muted">Kept only in this browser.</span></div></div>';
    W.disc(box.querySelector('[data-disc]'), 25, { choices: [5, 10, 15, 25, 45, 60], label: 'timer' });
    var tr = box.querySelector('[data-trainer]'), startAt = null, iv = null, cur = null;
    function log() { return UI.store.get('adhd.times', []); }
    function drawLog() {
      var l = log();
      box.querySelector('[data-log]').innerHTML = l.slice(0, 8).map(function (x) {
        var r = x.a / x.g;
        return '<li><span>' + esc(x.t || 'A task') + '</span><b>guess ' + x.g + 'm · took ' + (Math.round(x.a * 10) / 10) + 'm · ×' + r.toFixed(1) + '</b></li>';
      }).join('');
      var recent = l.slice(0, 10), g = 0, a = 0;
      recent.forEach(function (x) { g += x.g; a += x.a; });
      var m = g ? a / g : 0;
      box.querySelector('[data-mult]').innerHTML = recent.length >= 2
        ? '<div class="aw-mult" data-multiplier="' + m.toFixed(2) + '"><strong>×' + m.toFixed(1) + '</strong><p>' + (m > 1.15 ? 'Things take you about ' + m.toFixed(1) + ' times your guess. When you think 20 minutes, plan ' + Math.round(20 * m) + '.' : m < 0.85 ? 'You tend to overestimate. Good news: you’re faster than you think.' : 'Your guesses are close. Keep a small buffer anyway.') + ' Based on your last ' + recent.length + ' tasks.</p></div>'
        : '<p class="small muted" style="margin:0">Time ' + (2 - recent.length) + ' more task' + (recent.length === 1 ? '' : 's') + ' to see your multiplier.</p>';
    }
    function idle() {
      clearInterval(iv); startAt = null;
      tr.innerHTML = '<form class="aw-train" data-train-form><label class="ui-field" style="margin:0"><span>Task</span><input type="text" name="t" maxlength="80" placeholder="e.g. answer emails"></label>' +
        '<label class="ui-field" style="margin:0"><span>My guess (min)</span><input type="number" name="g" min="1" max="600" value="15" inputmode="numeric"></label>' +
        '<button class="ui-btn primary" type="submit">' + UI.icon('play') + 'Start timing</button></form>';
    }
    function running() {
      tr.innerHTML = '<div class="aw-big"><b>Timing</b><p>' + esc(cur.t || 'Your task') + ' · you guessed ' + cur.g + ' min</p></div><div class="aw-watch" data-watch>0:00</div>' +
        '<div class="ui-row" style="justify-content:center"><button type="button" class="ui-btn primary" data-train-done>' + UI.icon('check') + 'Done</button><button type="button" class="ui-btn ghost" data-train-cancel>Cancel</button></div>';
      iv = setInterval(function () {
        if (!box.isConnected) { clearInterval(iv); return; }
        var w = box.querySelector('[data-watch]'); if (w) w.textContent = mmss((Date.now() - startAt) / 1000);
      }, 500);
    }
    box.addEventListener('submit', function (e) {
      if (!e.target.matches('[data-train-form]')) return;
      e.preventDefault();
      var d = UI.formData(e.target), g = Math.max(1, Math.min(600, parseInt(d.g, 10) || 0));
      cur = { t: (d.t || '').trim().slice(0, 80), g: g }; startAt = Date.now(); running();
    });
    box.addEventListener('click', function (e) {
      if (e.target.closest('[data-train-done]') && startAt) {
        var mins = Math.max(0.1, (Date.now() - startAt) / 60000);
        var l = log(); l.unshift({ t: cur.t, g: cur.g, a: Math.round(mins * 10) / 10, d: new Date().toISOString().slice(0, 10) });
        UI.store.set('adhd.times', l.slice(0, 50)); idle(); drawLog();
        UI.toast(mins > cur.g * 1.15 ? 'Logged. It took longer than you guessed: that’s the data you need.' : 'Logged. Nicely estimated.', 'ok');
      }
      if (e.target.closest('[data-train-cancel]')) idle();
      if (e.target.closest('[data-clear-log]')) UI.confirm({ title: 'Clear your time log?', ok: 'Clear', danger: true }).then(function (y) { if (y) { UI.store.set('adhd.times', []); drawLog(); } });
    });
    idle(); drawLog();
  };

  /* ---------------------------------------------------------------- overwhelm reset */
  W.reset = function (box, tool) {
    var NAMES = ['Pull over', 'Empty the trunk', 'Pick one', 'Shrink it', 'Go'];
    var i = 0, lines = [], pick = null, breathing = false, bt = null;
    box.innerHTML = '<div class="aw"><div class="aw-steps">' + NAMES.map(function () { return '<i></i>'; }).join('') + '</div>' +
      '<div class="aw-step" data-s="0"><h3>1. Pull over</h3><p class="hint">Your head has too many tabs open. That’s a state, not a character flaw. Two slow breaths first: in through the nose, a second short sniff, then a long breath out.</p>' +
        '<div class="aw-ball-wrap"><div class="aw-ball" data-ball></div></div><p class="aw-say" data-say></p>' +
        '<div class="ui-row" style="justify-content:center"><button type="button" class="ui-btn primary" data-breathe>' + UI.icon('wind') + 'Breathe with me</button><button type="button" class="ui-btn ghost" data-next>Skip ' + UI.icon('arrow') + '</button></div></div>' +
      '<div class="aw-step" data-s="1"><h3>2. Empty the trunk</h3><p class="hint">Everything in your head, one per line. Tasks, worries, “buy milk”, all of it. No order, no judging.</p>' +
        '<textarea data-dump maxlength="4000" aria-label="Everything on my mind, one per line" placeholder="reply to Sam&#10;dentist&#10;the report&#10;laundry"></textarea>' +
        '<div class="ui-row"><button type="button" class="ui-btn primary" data-next>Next ' + UI.icon('arrow') + '</button></div></div>' +
      '<div class="aw-step" data-s="2"><h3>3. Pick one</h3><p class="hint">Not the most important. Just one: the one due soonest, the smallest, or the one that makes the others easier.</p><div class="aw-pick" data-picks></div>' +
        '<div class="ui-row"><button type="button" class="ui-btn ghost" data-back>' + UI.icon('back') + 'Back</button><button type="button" class="ui-btn primary" data-next>Next ' + UI.icon('arrow') + '</button></div></div>' +
      '<div class="aw-step" data-s="3"><h3>4. Shrink it</h3><p class="hint">What’s the very first physical action, something you could do in two minutes? “Open the laptop and type the email subject”, not “do the report”.</p>' +
        '<div class="aw-big"><b>The one thing</b><p data-one></p></div><label class="ui-field" style="margin:0"><span>First tiny action</span><input type="text" data-first maxlength="200" placeholder="e.g. open the file and write the title"></label>' +
        '<div class="ui-row"><button type="button" class="ui-btn ghost" data-back>' + UI.icon('back') + 'Back</button><button type="button" class="ui-btn primary" data-next>Ready ' + UI.icon('arrow') + '</button></div></div>' +
      '<div class="aw-step" data-s="4"><h3>5. Go: ten minutes, that’s all</h3><div class="aw-big"><b>First move</b><p data-first-show></p></div><div data-go-disc></div>' +
        '<div data-parked></div>' + saveRow(tool.id) + '<div class="ui-row"><button type="button" class="ui-btn ghost" data-restart>' + UI.icon('refresh') + 'Start over</button></div></div></div>';
    var dump = box.querySelector('[data-dump]');
    dump.value = UI.store.get('adhd.dump', '');
    dump.addEventListener('input', function () { UI.store.set('adhd.dump', dump.value); });
    function show() {
      box.querySelectorAll('.aw-steps i').forEach(function (b, k) { b.classList.toggle('on', k <= i); });
      box.querySelectorAll('[data-s]').forEach(function (s) { s.classList.toggle('on', +s.getAttribute('data-s') === i); });
    }
    function stopBreath() { breathing = false; clearTimeout(bt); var b = box.querySelector('[data-ball]'); if (b) { b.style.transitionDuration = '.6s'; b.style.transform = 'scale(1)'; } }
    function breathe() {
      var ball = box.querySelector('[data-ball]'), say = box.querySelector('[data-say]');
      var seq = [['Breathe in through the nose', 2, 1.9], ['Second short sniff', 1, 2.3], ['Long, slow breath out', 6, 1]], k = 0, rounds = 0;
      breathing = true;
      (function step() {
        if (!breathing || !box.isConnected) return;
        if (k === seq.length) { k = 0; rounds++; }
        if (rounds === 2) { breathing = false; say.textContent = 'Good. Now let’s empty the trunk.'; bt = setTimeout(function () { if (i === 0) { i = 1; show(); dump.focus(); } }, 1400); return; }
        var s = seq[k++]; ball.style.transitionDuration = s[1] + 's'; ball.style.transform = 'scale(' + s[2] + ')'; say.textContent = s[0];
        bt = setTimeout(step, s[1] * 1000);
      })();
    }
    function parse() { return dump.value.split('\n').map(function (x) { return x.trim(); }).filter(Boolean).slice(0, 40); }
    function next() {
      if (i === 0) { stopBreath(); i = 1; show(); dump.focus(); return; }
      if (i === 1) {
        lines = parse();
        if (!lines.length) { UI.toast('Write at least one thing down first.', 'error'); return; }
        if (pick != null && lines.indexOf(pick) < 0) pick = null;
        box.querySelector('[data-picks]').innerHTML = lines.map(function (l, k) { return '<button type="button" class="bm-chip' + (l === pick ? ' on' : '') + '" data-pick="' + k + '">' + esc(l) + '</button>'; }).join('');
        i = 2; show(); return;
      }
      if (i === 2) {
        if (pick == null) { UI.toast('Tap one thing to work on.', 'error'); return; }
        box.querySelector('[data-one]').textContent = pick; i = 3; show(); box.querySelector('[data-first]').focus(); return;
      }
      if (i === 3) {
        var f = box.querySelector('[data-first]').value.trim();
        if (!f) { UI.toast('Write one tiny first action.', 'error'); return; }
        var parked = lines.filter(function (l) { return l !== pick; });
        UI.store.set('adhd.parked', parked);
        box.querySelector('[data-first-show]').textContent = f;
        box.querySelector('[data-parked]').innerHTML = parked.length ? '<div><h4 style="margin:0 0 6px">Parked, not forgotten (' + parked.length + ')</h4><ul class="aw-parked">' + parked.map(function (l) { return '<li>' + esc(l) + '</li>'; }).join('') + '</ul></div>' : '';
        i = 4; show();
        W.disc(box.querySelector('[data-go-disc]'), 10, { label: '10 minutes' });
      }
    }
    function text() {
      return 'Overwhelm reset (' + new Date().toLocaleDateString() + ')\n\nThe one thing: ' + (pick || '') + '\nFirst tiny action: ' + box.querySelector('[data-first]').value.trim() +
        '\n\nParked for later:\n' + lines.filter(function (l) { return l !== pick; }).map(function (l) { return '- ' + l; }).join('\n') + '\n';
    }
    box.addEventListener('click', function (e) {
      if (e.target.closest('[data-breathe]')) { if (!breathing) breathe(); return; }
      if (e.target.closest('[data-next]')) { next(); return; }
      if (e.target.closest('[data-back]')) { i = Math.max(1, i - 1); show(); return; }
      var p = e.target.closest('[data-pick]');
      if (p) { pick = lines[+p.getAttribute('data-pick')]; box.querySelectorAll('[data-pick]').forEach(function (b) { b.classList.toggle('on', b === p); }); return; }
      if (e.target.closest('[data-restart]')) { stopBreath(); i = 0; pick = null; show(); window.scrollTo(0, box.getBoundingClientRect().top + window.scrollY - 120); return; }
      if (e.target.closest('[data-aw-dl]')) { download('overwhelm-reset.txt', text()); return; }
      var sv = e.target.closest('[data-aw-save]');
      if (sv) save(tool.id, { one: pick || '', first: box.querySelector('[data-first]').value.trim(), parked: lines.filter(function (l) { return l !== pick; }).join('\n') }, sv);
    });
    box.querySelector('[data-first]').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); next(); } });
    show();
  };

  /* ---------------------------------------------------------------- dopamine menu */
  var COURSES = [
    ['starters', 'Starters', 'quick lifts, 5 minutes or less', ['One favourite song, loud', 'Walk around the block', 'Cold water on my face', '20 jumping jacks', 'Step outside into daylight', 'Make a nice drink', 'Text a friend something silly', 'Stretch for 3 minutes']],
    ['mains', 'Mains', 'bigger things that really refuel you', ['A workout or sport', 'Cook something new', 'An hour on a hobby', 'Coffee with a friend', 'A walk in nature', 'Play an instrument', 'Build or fix something', 'A class: dance, climbing, art']],
    ['sides', 'Sides', 'add-ons that make boring tasks bearable', ['A playlist for chores', 'A podcast while cleaning', 'Body doubling on video', 'Work from a café', 'A fidget toy', 'Brown noise', 'A standing desk', 'A nice pen and paper']],
    ['desserts', 'Desserts', 'fun but easy to overdo: set a timer', ['Social media (timer on)', 'A video game (timer on)', 'YouTube rabbit holes', 'One TV episode, then stop', 'Window shopping (cart only)']],
    ['specials', 'Specials', 'once in a while', ['A concert or a match', 'A day trip', 'Somewhere I’ve never been', 'A weekend learning something new']]
  ];
  W.menu = function (box, tool) {
    var menu = UI.store.get('adhd.menu', {});
    COURSES.forEach(function (c) { if (!Array.isArray(menu[c[0]])) menu[c[0]] = []; });
    function persist() { UI.store.set('adhd.menu', menu); }
    function draw() {
      box.innerHTML = '<div class="aw"><div><h3>My dopamine menu</h3><p class="hint">Tap ideas to add them, or write your own. When you’re bored or itchy, order from here instead of reaching for the phone.</p></div>' +
        '<div class="ui-row"><button type="button" class="ui-btn primary" data-order>' + UI.icon('sparkle') + 'Pick me a starter</button></div><div data-order-out></div>' +
        COURSES.map(function (c) {
          var mine = menu[c[0]], ideas = c[3].filter(function (x) { return mine.indexOf(x) < 0; });
          return '<section class="aw-course" data-course="' + c[0] + '"><h4>' + esc(c[1]) + ' <span>' + esc(c[2]) + '</span></h4>' +
            '<div class="aw-mine">' + (mine.length ? mine.map(function (x, k) { return '<button type="button" class="bm-chip" data-del="' + c[0] + ':' + k + '" aria-label="Remove ' + esc(x) + '">' + esc(x) + ' ' + UI.icon('x') + '</button>'; }).join('') : '<span class="small muted">Nothing yet.</span>') + '</div>' +
            (ideas.length ? '<div class="aw-ideas">' + ideas.map(function (x) { return '<button type="button" class="bm-chip" data-idea="' + c[0] + '" data-v="' + esc(x) + '">' + UI.icon('plus') + esc(x) + '</button>'; }).join('') + '</div>' : '') +
            '<form class="aw-add" data-add="' + c[0] + '"><input type="text" maxlength="80" placeholder="My own ' + esc(c[1].toLowerCase().replace(/s$/, '')) + '…" aria-label="Add your own ' + esc(c[1].toLowerCase()) + '"><button class="ui-btn sm" type="submit">' + UI.icon('plus') + 'Add</button></form></section>';
        }).join('') + saveRow(tool.id) + '<p class="small muted" style="margin:0">Your menu is kept in this browser.</p></div>';
    }
    function add(course, v) {
      v = String(v || '').trim().slice(0, 80);
      if (!v || menu[course].indexOf(v) >= 0 || menu[course].length >= 20) return;
      menu[course].push(v); persist(); draw();
    }
    function text() {
      return 'My dopamine menu\n\n' + COURSES.map(function (c) { return c[1] + ' (' + c[2] + '):\n' + (menu[c[0]].length ? menu[c[0]].map(function (x) { return '- ' + x; }).join('\n') : '-') + '\n'; }).join('\n');
    }
    box.addEventListener('click', function (e) {
      var idea = e.target.closest('[data-idea]');
      if (idea) { add(idea.getAttribute('data-idea'), idea.getAttribute('data-v')); return; }
      var del = e.target.closest('[data-del]');
      if (del) { var p = del.getAttribute('data-del').split(':'); menu[p[0]].splice(+p[1], 1); persist(); draw(); return; }
      if (e.target.closest('[data-order]')) {
        var pool = menu.starters.length ? menu.starters : COURSES[0][3];
        var pickOne = pool[Math.floor(Math.random() * pool.length)];
        box.querySelector('[data-order-out]').innerHTML = '<div class="aw-order" data-ordered>' + esc(pickOne) + '</div>';
        return;
      }
      if (e.target.closest('[data-aw-dl]')) { download('dopamine-menu.txt', text()); return; }
      var sv = e.target.closest('[data-aw-save]');
      if (sv) { var data = {}; COURSES.forEach(function (c) { if (menu[c[0]].length) data[c[0]] = menu[c[0]].join('\n'); });
        if (!Object.keys(data).length) { UI.toast('Add something to your menu first.', 'error'); return; }
        save(tool.id, data, sv); }
    });
    box.addEventListener('submit', function (e) {
      var f = e.target.closest('[data-add]');
      if (!f) return;
      e.preventDefault(); add(f.getAttribute('data-add'), f.querySelector('input').value);
      var again = box.querySelector('[data-add="' + f.getAttribute('data-add') + '"] input'); if (again) again.focus();
    });
    draw();
  };

  /* ---------------------------------------------------------------- launch pad door card */
  var DOOR = ['Keys', 'Phone', 'Wallet or cards', 'Medication taken', 'Bag or laptop', 'Charger', 'Water bottle', 'Lunch', 'Headphones', 'Glasses'];
  W.door = function (box, tool) {
    var items = UI.store.get('adhd.door', null) || DOOR.slice(0, 6), ticked = {};
    function persist() { UI.store.set('adhd.door', items); }
    function draw() {
      var spare = DOOR.filter(function (x) { return items.indexOf(x) < 0; });
      var all = items.length && items.every(function (x) { return ticked[x]; });
      box.innerHTML = '<div class="aw"><div><h3>Before I leave</h3><p class="hint">Tick through it at the door. Untick happens by itself next time you open this page.</p></div>' +
        (all ? '<div class="aw-ready" data-ready>' + UI.icon('check') + ' Ready to roll</div>' : '') +
        '<div class="aw-door">' + items.map(function (x, k) {
          return '<label class="' + (ticked[x] ? 'ticked' : '') + '"><input type="checkbox" data-tick="' + k + '"' + (ticked[x] ? ' checked' : '') + '>' + esc(x) +
            '<button type="button" class="ui-btn sm ghost icon x" data-rm="' + k + '" aria-label="Remove ' + esc(x) + '">' + UI.icon('x') + '</button></label>';
        }).join('') + '</div>' +
        (spare.length ? '<div class="aw-ideas">' + spare.map(function (x) { return '<button type="button" class="bm-chip" data-add-item="' + esc(x) + '">' + UI.icon('plus') + esc(x) + '</button>'; }).join('') + '</div>' : '') +
        '<form class="aw-add" data-door-add><input type="text" maxlength="60" placeholder="Add my own, e.g. bus pass" aria-label="Add an item"><button class="ui-btn sm" type="submit">' + UI.icon('plus') + 'Add</button></form>' +
        '<div class="ui-row"><button type="button" class="ui-btn primary" data-door-print>' + UI.icon('print') + 'Print the door card</button></div>' + saveRow(tool.id) + '</div>';
    }
    function add(v) { v = String(v || '').trim().slice(0, 60); if (v && items.indexOf(v) < 0 && items.length < 20) { items.push(v); persist(); draw(); } }
    function printCard() {
      var w = window.open('', '_blank');
      if (!w) { UI.toast('Your browser blocked the print window. Allow pop-ups, or use Download.', 'error'); return; }
      var html = '<!doctype html><html><head><meta charset="utf-8"><title>Door card</title></head><body style="font-family:Georgia,serif;margin:40px;color:#2a1c15">' +
        '<h1 style="font-size:40px;margin:0 0 6px">Before I leave</h1><p style="font-size:16px;color:#6b5a4d;margin:0 0 24px">Brain Mechanic launch pad</p>' +
        items.map(function (x) { return '<div style="font-size:30px;margin:14px 0;display:flex;gap:18px;align-items:center"><span style="width:30px;height:30px;border:3px solid #2a1c15;border-radius:6px;display:inline-block"></span>' + esc(x) + '</div>'; }).join('') +
        '</body></html>';
      w.document.open(); w.document.write(html); w.document.close();
      setTimeout(function () { try { w.focus(); w.print(); } catch (e) {} }, 300);
    }
    box.addEventListener('change', function (e) {
      var t = e.target.closest('[data-tick]');
      if (t) { ticked[items[+t.getAttribute('data-tick')]] = t.checked; draw(); }
    });
    box.addEventListener('click', function (e) {
      var rm = e.target.closest('[data-rm]');
      if (rm) { e.preventDefault(); items.splice(+rm.getAttribute('data-rm'), 1); persist(); draw(); return; }
      var ad = e.target.closest('[data-add-item]');
      if (ad) { add(ad.getAttribute('data-add-item')); return; }
      if (e.target.closest('[data-door-print]')) { printCard(); return; }
      if (e.target.closest('[data-aw-dl]')) { download('door-card.txt', 'Before I leave\n\n' + items.map(function (x) { return '[ ] ' + x; }).join('\n') + '\n'); return; }
      var sv = e.target.closest('[data-aw-save]');
      if (sv) save(tool.id, { items: items.join('\n') }, sv);
    });
    box.addEventListener('submit', function (e) {
      if (!e.target.matches('[data-door-add]')) return;
      e.preventDefault(); add(e.target.querySelector('input').value);
      var again = box.querySelector('[data-door-add] input'); if (again) again.focus();
    });
    draw();
  };

  /* ---------------------------------------------------------------- what Python calls (client_code/bm.py) */
  function pick(o, fields) { var r = {}; fields.forEach(function (f) { r[f] = o[f] == null ? null : o[f]; }); return r; }
  var LISTS = {
    conditions: function () { return BM.CONDITIONS; }, patterns: function () { return BM.PATTERNS; },
    tools: function () { return BM.TOOLS; }, scans: function () { return BM.SCANS; }
  };
  var CARD = {
    conditions: ['id', 'code', 'n', 'sys', 'st', 'line', 'scan', 'tools', 'lights', 'aka'],
    patterns: ['id', 'n', 'grp', 'voice', 'tools', 'conds', 'q', 'aka'],
    tools: ['id', 'n', 'cat', 'time', 'w', 'line', 'ic', 'fields'],
    scans: ['id', 'n', 'kind', 'time', 'cond', 'bay']
  };
  BM.json = {
    /* the small tables + counts */
    meta: function () {
      return JSON.stringify({ STATUS: BM.STATUS, SYSTEMS: BM.SYSTEMS, LIGHTS: BM.LIGHTS, FACTORY_GROUPS: BM.FACTORY_GROUPS, TOOL_CATS: BM.TOOL_CATS,
        BREATHS: BM.BREATHS, PATTERN_BANDS: BM.PATTERN_BANDS });
    },
    /* every item of a kind with the fields cards and cross-links need */
    cards: function (kind) { return JSON.stringify(LISTS[kind]().map(function (o) { return pick(o, CARD[kind]); })); },
    /* one whole item, or null */
    one: function (kind, id) {
      var by = { conditions: BM.conditionById, patterns: BM.patternById, tools: BM.toolById, scans: BM.scanById }[kind];
      return JSON.stringify(by[id] || null);
    },
    adhd: function () { return JSON.stringify(BM.ADHD); },
    search: function (q) { return JSON.stringify(BM.search(q).map(function (r) { return { type: r.type, id: r.id, score: r.score }; })); },
    rank: function (onJson) { return JSON.stringify(BM.rankLights(JSON.parse(onJson)).map(function (r) { return { id: r.c.id, hits: r.hits, of: r.of }; })); },
    items: function (scanId) {
      var scan = BM.scanById[scanId];
      return JSON.stringify(scan ? itemsOf(scan).map(function (it, i) { return { q: it.q, opts: it.opts, shade: scan.shade ? scan.shade[i] : null }; }) : []);
    },
    score: function (scanId, ansJson, gate) {
      return JSON.stringify(BM.scoreScan(BM.scanById[scanId], JSON.parse(ansJson), gate === null || gate === undefined ? undefined : !!gate));
    }
  };
  BM.gauge = function (json) { return BM.gaugeSvg(JSON.parse(json)); };
  BM.chart = function (json, width) { return chart(JSON.parse(json), width); };
  BM.office = office;
  /* A live widget for a tool (w = breath:<key> | ground | timer:<min>:<label> | adhd:<name>) into box */
  BM.mountWidget = function (box, id) {
    var t = BM.toolById[id], w = t && t.w;
    if (!w) return;
    if (w.indexOf('breath:') === 0) breath(box, w.split(':')[1]);
    else if (w === 'ground') ground(box);
    else if (w.indexOf('timer:') === 0) timerWidget(box, +w.split(':')[1], w.split(':')[2] || 'Timer');
    else if (w.indexOf('adhd:') === 0 && W[w.slice(5)]) W[w.slice(5)](box, t);
  };
  BM.download = function (name, text, type) {
    var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: type || 'text/plain' }));
    a.download = name; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  };
})();
