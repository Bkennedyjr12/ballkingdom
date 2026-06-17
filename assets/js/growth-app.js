// The Ballers Kingdom — Inner Game: growth-app.js
// Drives the emotional self-regulation flow + personal growth log.
// Pure vanilla JS, no dependencies. Data from growth-data.js.

(function () {
  'use strict';

  var DATA = window.GROWTH_DATA;
  if (!DATA) return;

  var LOG_KEY = 'bk_inner_game_log_v1';
  var app = document.getElementById('ig-app');
  if (!app) return;

  // ---- State ----
  var state = { emotion: null, shade: null, intensity: 5, step: 0 };

  // Flow steps after an emotion is chosen.
  var STEPS = ['name', 'body', 'impulse', 'need', 'regulate', 'response', 'reflect', 'insight'];

  // ---- Helpers ----
  function el(tag, cls, html) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function findEmotion(id) {
    return DATA.emotions.filter(function (e) { return e.id === id; })[0];
  }

  // ---- Log (localStorage) ----
  function loadLog() {
    try { return JSON.parse(localStorage.getItem(LOG_KEY)) || []; }
    catch (e) { return []; }
  }
  function saveLogEntry(entry) {
    var log = loadLog();
    log.unshift(entry);
    if (log.length > 200) log = log.slice(0, 200);
    try { localStorage.setItem(LOG_KEY, JSON.stringify(log)); } catch (e) {}
  }
  function clearLog() {
    try { localStorage.removeItem(LOG_KEY); } catch (e) {}
  }

  // ---- Renderers ----
  function render() {
    app.innerHTML = '';
    if (!state.emotion) { renderPicker(); }
    else { renderStep(); }
    app.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function renderPicker() {
    var wrap = el('div', 'ig-picker');
    wrap.appendChild(el('div', 'ig-kicker', 'Inner Game'));
    wrap.appendChild(el('h2', 'ig-h2', 'What are you feeling right now?'));
    wrap.appendChild(el('p', 'ig-lead',
      'Pick the one that fits best. There are no wrong answers \u2014 naming it is the first move.'));

    var grid = el('div', 'ig-grid');
    DATA.emotions.forEach(function (em) {
      var card = el('button', 'ig-emotion');
      card.type = 'button';
      card.innerHTML =
        '<span class="ig-glyph">' + esc(em.glyph) + '</span>' +
        '<span class="ig-emotion-label">' + esc(em.label) + '</span>' +
        '<span class="ig-emotion-blurb">' + esc(em.blurb) + '</span>';
      card.addEventListener('click', function () {
        state.emotion = em.id; state.shade = null; state.intensity = 5; state.step = 0;
        render();
      });
      grid.appendChild(card);
    });
    wrap.appendChild(grid);
    wrap.appendChild(renderCrisis());
    wrap.appendChild(renderLogSummary());
    app.appendChild(wrap);
  }

  function renderStep() {
    var em = findEmotion(state.emotion);
    var key = STEPS[state.step];
    var card = el('div', 'ig-step');

    // progress
    var prog = el('div', 'ig-progress');
    STEPS.forEach(function (s, i) {
      prog.appendChild(el('span', 'ig-dot' + (i <= state.step ? ' on' : '')));
    });
    card.appendChild(prog);

    // header
    var head = el('div', 'ig-step-head');
    head.innerHTML = '<span class="ig-glyph sm">' + esc(em.glyph) + '</span>' +
      '<span class="ig-step-emotion">' + esc(em.label) +
      (state.shade ? ' \u00B7 ' + esc(state.shade) : '') + '</span>';
    card.appendChild(head);

    var body = el('div', 'ig-step-body');

    if (key === 'name') {
      body.appendChild(el('h3', 'ig-h3', 'Name it more precisely'));
      body.appendChild(el('p', null, 'Which shade fits best? Specific naming calms the nervous system \u2014 the research calls it "name it to tame it."'));
      var shades = el('div', 'ig-shades');
      em.shades.forEach(function (sh) {
        var b = el('button', 'ig-chip' + (state.shade === sh ? ' on' : ''), esc(sh));
        b.type = 'button';
        b.addEventListener('click', function () { state.shade = sh; render(); });
        shades.appendChild(b);
      });
      body.appendChild(shades);
    }
    else if (key === 'body') {
      body.appendChild(el('h3', 'ig-h3', 'Where do you feel it?'));
      body.appendChild(el('p', null, esc(em.body)));
      body.appendChild(el('p', 'ig-muted', 'Now rate the intensity \u2014 this guides how you respond.'));
      var slate = el('div', 'ig-intensity');
      var range = el('input');
      range.type = 'range'; range.min = '1'; range.max = '10'; range.value = String(state.intensity);
      range.className = 'ig-range';
      var out = el('span', 'ig-int-val', String(state.intensity) + ' / 10');
      range.addEventListener('input', function () {
        state.intensity = parseInt(range.value, 10);
        out.textContent = state.intensity + ' / 10';
      });
      slate.appendChild(range); slate.appendChild(out);
      body.appendChild(slate);
    }
    else if (key === 'impulse') {
      body.appendChild(el('h3', 'ig-h3', em.impulse.title));
      body.appendChild(el('p', 'ig-strong', esc(em.impulse.text)));
      body.appendChild(el('div', 'ig-callout warn', '<strong>Why pause:</strong> ' + esc(em.impulse.why)));
    }
    else if (key === 'need') {
      body.appendChild(el('h3', 'ig-h3', em.need.title));
      body.appendChild(el('p', 'ig-strong', esc(em.need.text)));
      body.appendChild(el('div', 'ig-callout', '<strong>Ask yourself:</strong> ' + esc(em.need.ask)));
    }
    else if (key === 'regulate') {
      body.appendChild(el('h3', 'ig-h3', em.regulate.title + ' \u2014 ' + esc(em.regulate.practice)));
      var ol = el('ol', 'ig-steps');
      em.regulate.steps.forEach(function (s) { ol.appendChild(el('li', null, esc(s))); });
      body.appendChild(ol);
      body.appendChild(el('div', 'ig-callout', esc(em.regulate.note)));
    }
    else if (key === 'response') {
      body.appendChild(el('h3', 'ig-h3', em.response.title));
      body.appendChild(el('p', 'ig-strong', esc(em.response.text)));
      body.appendChild(el('div', 'ig-script', '<span class="ig-script-tag">Try saying / writing</span>' + esc(em.response.script)));
      var ul = el('ul', 'ig-actions');
      em.response.actions.forEach(function (a) { ul.appendChild(el('li', null, esc(a))); });
      body.appendChild(ul);
    }
    else if (key === 'reflect') {
      body.appendChild(el('h3', 'ig-h3', 'Reflect'));
      body.appendChild(el('p', null, esc(em.reflect)));
      var ta = el('textarea', 'ig-textarea');
      ta.id = 'ig-reflection';
      ta.placeholder = 'Write a few honest lines. This saves privately to your device only \u2014 nothing is sent anywhere.';
      ta.rows = 5;
      body.appendChild(ta);
    }
    else if (key === 'insight') {
      body.appendChild(el('h3', 'ig-h3', 'The growth in this'));
      body.appendChild(el('div', 'ig-callout grow', esc(em.insight)));
      body.appendChild(el('p', 'ig-muted', 'You named it, understood the impulse, found the need, regulated, and chose a responsible response. That\u2019s the whole skill.'));
      var book = el('a', 'ig-book');
      book.href = 'contact.html';
      book.textContent = 'Want to go deeper? Book a development session \u2192';
      body.appendChild(book);
    }

    card.appendChild(body);

    // crisis net on intense steps
    if (state.intensity >= 8 && (key === 'impulse' || key === 'regulate')) {
      card.appendChild(renderCrisis());
    }

    // nav
    var nav = el('div', 'ig-nav');
    var back = el('button', 'ig-btn ghost', state.step === 0 ? '\u2190 Choose another feeling' : '\u2190 Back');
    back.type = 'button';
    back.addEventListener('click', function () {
      if (state.step === 0) { state.emotion = null; }
      else { state.step--; }
      render();
    });
    nav.appendChild(back);

    var nextLabel = (state.step === STEPS.length - 1) ? 'Save & finish' : 'Continue \u2192';
    var next = el('button', 'ig-btn primary', nextLabel);
    next.type = 'button';
    next.disabled = (key === 'name' && !state.shade);
    next.addEventListener('click', function () {
      if (state.step === STEPS.length - 1) { finish(); return; }
      state.step++;
      render();
    });
    nav.appendChild(next);
    card.appendChild(nav);

    app.appendChild(card);
  }

  function finish() {
    var em = findEmotion(state.emotion);
    var reflectionEl = document.getElementById('ig-reflection');
    var reflection = reflectionEl ? reflectionEl.value.trim() : '';
    saveLogEntry({
      ts: Date.now(),
      emotion: em.label,
      shade: state.shade || '',
      intensity: state.intensity,
      reflection: reflection
    });
    state.emotion = null; state.shade = null; state.intensity = 5; state.step = 0;
    render();
    var note = document.querySelector('.ig-saved-note');
    if (note) { note.style.display = 'block'; setTimeout(function () { note.style.display = 'none'; }, 4000); }
  }

  function renderCrisis() {
    var box = el('div', 'ig-crisis');
    box.appendChild(el('p', 'ig-crisis-text', esc(DATA.crisis.text)));
    var row = el('div', 'ig-crisis-lines');
    DATA.crisis.lines.forEach(function (l) {
      var a = el('a', 'ig-crisis-line');
      a.href = l.href;
      a.innerHTML = '<strong>' + esc(l.label) + '</strong><span>' + esc(l.detail) + '</span>';
      row.appendChild(a);
    });
    box.appendChild(row);
    return box;
  }

  function renderLogSummary() {
    var log = loadLog();
    var wrap = el('div', 'ig-log');
    var note = el('p', 'ig-saved-note', 'Saved to your growth log.');
    note.style.display = 'none';
    wrap.appendChild(note);

    var head = el('div', 'ig-log-head');
    head.appendChild(el('h3', 'ig-h3', 'Your growth log'));
    if (log.length) {
      var clear = el('button', 'ig-link-btn', 'Clear log');
      clear.type = 'button';
      clear.addEventListener('click', function () {
        if (confirm('Clear your entire growth log? This cannot be undone.')) { clearLog(); render(); }
      });
      head.appendChild(clear);
    }
    wrap.appendChild(head);

    if (!log.length) {
      wrap.appendChild(el('p', 'ig-muted', 'Nothing logged yet. Each time you work through a feeling, it\u2019s saved here privately so you can notice your patterns over time. Stored only on this device.'));
      return wrap;
    }

    // simple pattern: most frequent emotion
    var counts = {};
    log.forEach(function (e) { counts[e.emotion] = (counts[e.emotion] || 0) + 1; });
    var top = Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; })[0];
    wrap.appendChild(el('p', 'ig-pattern',
      'You\u2019ve checked in <strong>' + log.length + '</strong> time' + (log.length > 1 ? 's' : '') +
      '. Most frequent: <strong>' + esc(top) + '</strong>. Noticing the pattern is where change starts.'));

    var list = el('div', 'ig-log-list');
    log.slice(0, 6).forEach(function (e) {
      var item = el('div', 'ig-log-item');
      var d = new Date(e.ts);
      var date = (d.getMonth() + 1) + '/' + d.getDate() + ' ' +
        d.getHours() + ':' + ('0' + d.getMinutes()).slice(-2);
      item.innerHTML =
        '<div class="ig-log-meta"><span class="ig-log-emotion">' + esc(e.emotion) +
        (e.shade ? ' \u00B7 ' + esc(e.shade) : '') + '</span>' +
        '<span class="ig-log-int">' + esc(e.intensity) + '/10</span>' +
        '<span class="ig-log-date">' + esc(date) + '</span></div>' +
        (e.reflection ? '<p class="ig-log-reflection">' + esc(e.reflection) + '</p>' : '');
      list.appendChild(item);
    });
    wrap.appendChild(list);
    return wrap;
  }

  // ---- Boot ----
  render();
})();
