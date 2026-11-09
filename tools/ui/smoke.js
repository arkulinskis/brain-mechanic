/* Smoke test (tools/ui_test.py runs it at 1280 px and at 390 px): every page address opens without errors, is not
   empty and doesn't scroll sideways. Signed out (landing, the manual: all / a system / a lookup / an entry, the
   warning-light board with one light on, the checks, a check run end to end, factory settings, the toolbox with a
   breathing widget, a worksheet and an ADHD widget, the Pit Lane, find a pro, the work order, the Emergency brake
   dialog, sign in / up), then as a new member (the Garage + a reading, the plan button, the work order, profile),
   then as admin (every Admin tab). Python/JS errors are caught by ui_test.py from the browser log. Resolves to {ok, log}. */
(async function () {
  const log = [], bad = [];
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  async function until(fn, what, ms) {
    const end = Date.now() + (ms || 20000);
    while (Date.now() < end) { try { const v = fn(); if (v) return v; } catch (e) {} await sleep(150); }
    throw new Error('timed out waiting for: ' + what);
  }
  const q = (s) => document.querySelector(s), qa = (s) => Array.from(document.querySelectorAll(s));
  const errs = [];
  window.addEventListener('error', (e) => errs.push(String(e.message || e)));
  const visible = (el) => !!el && el.getClientRects().length > 0;
  function type(input, value) {
    input.focus(); input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true }));
  }
  function button(re, root) { return qa((root || '') + ' button').find((b) => re.test(b.textContent.trim()) && visible(b)); }
  function check(name, expect) {
    const main = q('.ui-main');
    const text = main ? main.innerText.trim() : '';
    const w = document.documentElement.scrollWidth, vw = screen.width <= 500 ? screen.width : window.innerWidth;
    const problems = [];
    if (text.length < 40) problems.push('empty page');
    if (expect && !new RegExp(expect.source, 'i').test(text)) problems.push('missing ' + expect);
    if (w > vw + 1) {
      const wide = qa('body *').filter((e) => { const r = e.getBoundingClientRect(); return r.width && r.right > vw + 1; })
        .slice(0, 3).map((e) => e.tagName.toLowerCase() + '.' + String(e.className).split(' ').slice(0, 2).join('.'));
      problems.push('scrolls sideways (' + w + ' > ' + vw + ') ' + wide.join(' '));
    }
    if (errs.length) problems.push('errors: ' + errs.splice(0).join(' / '));
    if (problems.length) bad.push(name + ': ' + problems.join('; '));
    log.push((problems.length ? 'BAD  ' : 'ok   ') + name);
  }
  async function open(hash, expect) {
    if (location.hash !== hash) window.UI_READY = false;
    location.hash = hash;
    await until(() => window.UI_READY && decodeURIComponent(location.hash) === decodeURIComponent(hash), hash, 40000);
    await sleep(700);
    check(hash, expect);
  }
  const modal = () => qa('.modal, .anvil-modal').find((m) => visible(m) && m.innerText.trim().length > 10);
  async function closeModal() {
    const m = modal();
    const close = m && qa('button').filter((b) => m.contains(b)).find((b) => /^(Cancel|Close|Not now)$/.test(b.textContent.trim()) && visible(b));
    if (close) close.click();
    await until(() => !modal(), 'dialog closed', 10000);
    await sleep(300);
  }
  async function dialog(name, opener, expect) {
    if (!opener) { bad.push('dialog ' + name + ': no button to open it'); return; }
    opener.click();
    const dlg = await until(() => modal(), 'dialog ' + name, 20000);
    await sleep(400);
    const problems = [];
    if (expect && !expect.test(dlg.innerText)) problems.push('missing ' + expect);
    if (errs.length) problems.push('errors: ' + errs.splice(0).join(' / '));
    if (problems.length) bad.push('dialog ' + name + ': ' + problems.join('; '));
    log.push((problems.length ? 'BAD  ' : 'ok   ') + 'dialog ' + name);
    await closeModal();
  }
  async function signUp(name, email, password) {
    location.hash = '#auth/signup';
    await until(() => window.UI_READY && qa('.au-card input').length >= 3, 'sign-up form');
    await sleep(400);
    const inputs = qa('.au-card input[type=text], .au-card input[type=email], .au-card input[type=password]');
    type(inputs[0], name); type(inputs[1], email); type(inputs[2], password);
    const tick = q('.au-card input[type=checkbox]'); if (tick && !tick.checked) tick.click();
    button(/Create account/, '.au-card .anvil-role-btn-block').click();
    const end = Date.now() + 40000;
    while (Date.now() < end) {
      if (location.hash === '#garage' && window.UI_READY) return true;
      const msg = q('.au-card .anvil-role-msg-error');
      if (msg && visible(msg) && msg.textContent.trim()) { log.push('sign-up said: ' + msg.textContent.trim()); return false; }
      await sleep(200);
    }
    log.push('sign-up: still on ' + location.hash);
    return false;
  }
  async function signIn(email, password) {
    location.hash = '#auth';
    await until(() => window.UI_READY && qa('.au-card input[type=password]').length, 'sign-in form');
    await sleep(400);
    type(q('.au-card input[type=email]'), email); type(q('.au-card input[type=password]'), password);
    button(/Sign in/, '.au-card .anvil-role-btn-block').click();
    await until(() => location.hash === '#garage' && window.UI_READY, 'signed in as ' + email, 40000);
  }
  async function signOut() {
    q('.anvil-role-avatar button').click();
    await sleep(300);
    button(/Sign out/, '.ui-menu').click();
    await until(() => {
      const a = q('.anvil-role-avatar button');
      return location.hash === '#landing' && window.UI_READY && (!a || !visible(a));
    }, 'signed out');
    await sleep(500);
  }
  try {
    // ---- signed out
    await open('#landing', /under the hood/);
    await dialog('emergency brake', qa('.bm-brake').find(visible), /988/);
    await open('#manual', /Steering & Focus/);
    await open('#manual/sys/alarm', /Alarm System/);
    await open('#manual/s/' + encodeURIComponent('can’t focus'), /Repair manual/);
    await open('#manual/adhd', /Warning lights/);
    await open('#diagnose', /Which lights are on/);
    const lamp = qa('.bm-lamp').find((b) => visible(b) && !b.classList.contains('crisis'));
    if (lamp) { lamp.click(); await until(() => qa('.dg-match').length, 'a match for the light'); log.push('ok   a light shows matches'); }
    else bad.push('#diagnose: no warning lights');
    await open('#diagnose/scans', /Published screeners/);
    await open('#scan/gad7', /questions/);
    qa('.sc-q').filter(visible).forEach((fs) => { const r = fs.querySelector('input[type=radio]'); if (r) r.click(); });
    await sleep(300);
    const ack = q('.sc-ack input[type=checkbox]'); if (ack && !ack.checked) ack.click();
    button(/Run the scan/).click();
    await until(() => visible(q('.sc-res')), 'the check result', 20000);
    await sleep(500);
    check('#scan/gad7 result', /screener result/);
    await open('#scan/asrs', /questions/);
    await open('#factory', /Factory settings/);
    await open('#factory/parentified', /inner voice/);
    await open('#toolbox', /right now/);
    await open('#toolbox/breath_sigh', /How to do it/);
    if (!q('.tb-breath, .tb-orb')) bad.push('#toolbox/breath_sigh: no breathing widget');
    await open('#toolbox/thought_record', /Worksheet/);
    await open('#toolbox/overwhelm_reset', /How to do it/);
    if (!q('.widget-box .aw, .widget-box [class^="aw"]')) bad.push('#toolbox/overwhelm_reset: no pit-crew widget');
    await open('#adhd', /bicycle brakes/);
    await open('#adhd/myths', /Garage myths/);
    await open('#help', /Who’s who/);
    await open('#workorder', /Notes for my appointment/);
    await open('#auth', /Sign in/);
    await open('#auth/signup', /Create account/);

    // ---- a new member
    const ok = await signUp('Smoke Driver', 'smoke' + Date.now() + '@example.com', 'Bm-' + Math.random().toString(36).slice(2) + '-Kq7');
    if (!ok) throw new Error('sign-up failed');
    await sleep(800);
    check('#garage (member)', /How’s the engine/);
    button(/Save reading/).click();
    await until(() => /Today’s reading/.test(q('.ui-main').innerText), 'the reading saved', 30000);
    log.push('ok   gauge reading saved');
    await open('#manual/adhd', /Warning lights/);
    button(/Add to my repair plan/).click();
    await until(() => button(/In your plan/), 'added to the plan', 20000);
    await open('#garage', /Repair plan/);
    if (!qa('.gr-row').length) bad.push('#garage: the plan item is missing');
    await open('#workorder', /Notes for my appointment/);
    await open('#profile', /Your name|profile/);
    await signOut();

    // ---- admin (ADMIN_EMAILS in Accounts.py): sign up the first time, sign in after that
    const adminPw = 'Bm-smoke-adm-93Kx-7q';
    if (!(await signUp('Admin Tester', 'arkulinskis@gmail.com', adminPw))) await signIn('arkulinskis@gmail.com', adminPw);
    for (const t of ['overview', 'usage', 'feedback', 'users', 'demo']) await open('#admin/' + t, /Admin/);
    await signOut();
    log.push(bad.length ? 'PROBLEMS: ' + bad.join(' | ') : 'PASSED');
    return { ok: !bad.length, log: log };
  } catch (e) {
    log.push(String(e && e.message || e));
    if (bad.length) log.push('PROBLEMS: ' + bad.join(' | '));
    return { ok: false, log: log };
  }
})();
