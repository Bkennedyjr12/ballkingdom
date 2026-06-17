// The Ballers Kingdom — Readiness Scorecard engine
// Renders intro -> one question at a time across 3 domains -> scored results
// with per-domain bars, overall grade/stage, and a prioritized 12-step plan.
// Vanilla JS. Data from readiness-data.js.

(function () {
  'use strict';

  var DATA = window.READINESS_DATA;
  var app = document.getElementById('rs-app');
  if (!DATA || !app) return;

  // Flatten questions into a single ordered list with domain refs.
  var FLAT = [];
  DATA.domains.forEach(function (dom) {
    dom.questions.forEach(function (q, i) {
      FLAT.push({ domainId: dom.id, domainName: dom.name, tag: dom.tag, q: q.q, opts: q.opts });
    });
  });
  var TOTAL = FLAT.length;

  var answers = {}; // index -> 0..4
  var view = 'intro';
  var cur = 0;

  function el(tag, cls, html) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function render() {
    app.innerHTML = '';
    if (view === 'intro') renderIntro();
    else if (view === 'q') renderQuestion();
    else renderResults();
    app.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function renderIntro() {
    var c = el('div', 'rs-intro-card');
    c.appendChild(el('div', 'ig-kicker', 'Readiness Scorecard'));
    c.appendChild(el('h2', 'ig-h2', 'Where does your business actually stand?'));
    c.appendChild(el('p', 'ig-lead',
      'A straight-talk diagnostic across the three things that decide whether you build real, transferable wealth \u2014 not just run a business. Answer honestly; this is for you.'));

    var dom = el('div', 'rs-domains');
    DATA.domains.forEach(function (d) {
      var p = el('div', 'rs-domain-pill');
      p.appendChild(el('h4', null, esc(d.name)));
      p.appendChild(el('p', null, esc(d.blurb)));
      dom.appendChild(p);
    });
    c.appendChild(dom);

    var meta = el('div', 'rs-meta');
    meta.innerHTML =
      '<span>\u25F7 ' + TOTAL + ' questions \u00B7 3 domains</span>' +
      '<span>\u23F1 About 5 minutes</span>' +
      '<span>\u{1F512} Private \u2014 nothing leaves your device unless you ask</span>';
    c.appendChild(meta);

    var start = el('button', 'ig-btn primary', 'Start the assessment \u2192');
    start.type = 'button';
    start.addEventListener('click', function () { view = 'q'; cur = 0; render(); });
    c.appendChild(start);

    c.appendChild(el('p', 'rs-disclaimer-foot',
      'Educational self-assessment based on SBA/lender, procurement, and exit-readiness frameworks. Not financial, legal, or investment advice. Brian Kennedy Jr has done direct lending with AmPac Business Capital \u2014 SBA 504 for buildings & equipment and 7(a) for acquisitions.'));
    app.appendChild(c);
  }

  function renderQuestion() {
    var item = FLAT[cur];
    var wrap = el('div');

    var pct = Math.round((cur) / TOTAL * 100);
    var bar = el('div', 'rs-progress-bar');
    var fill = el('div', 'rs-progress-fill'); fill.style.width = pct + '%';
    bar.appendChild(fill);
    wrap.appendChild(bar);
    wrap.appendChild(el('div', 'rs-progress-label', 'Question ' + (cur + 1) + ' of ' + TOTAL));

    var card = el('div', 'rs-q');
    var head = el('div', 'rs-domain-head');
    head.appendChild(el('span', 'rs-domain-tag', esc(item.tag)));
    card.appendChild(head);
    card.appendChild(el('div', 'rs-q-text', esc(item.q)));

    var opts = el('div', 'rs-opts');
    item.opts.forEach(function (o, i) {
      var b = el('button', 'rs-opt' + (answers[cur] === i ? ' on' : ''), esc(o));
      b.type = 'button';
      b.addEventListener('click', function () {
        answers[cur] = i;
        // auto-advance
        setTimeout(function () {
          if (cur < TOTAL - 1) { cur++; render(); }
          else { view = 'results'; render(); }
        }, 160);
      });
      opts.appendChild(b);
    });
    card.appendChild(opts);
    wrap.appendChild(card);

    var nav = el('div', 'rs-nav');
    var back = el('button', 'ig-btn ghost', cur === 0 ? '\u2190 Intro' : '\u2190 Back');
    back.type = 'button';
    back.addEventListener('click', function () {
      if (cur === 0) { view = 'intro'; }
      else { cur--; }
      render();
    });
    nav.appendChild(back);

    if (answers[cur] != null) {
      var next = el('button', 'ig-btn primary', cur === TOTAL - 1 ? 'See results \u2192' : 'Next \u2192');
      next.type = 'button';
      next.addEventListener('click', function () {
        if (cur < TOTAL - 1) { cur++; render(); } else { view = 'results'; render(); }
      });
      nav.appendChild(next);
    }
    wrap.appendChild(nav);
    app.appendChild(wrap);
  }

  function domainScores() {
    var out = {};
    DATA.domains.forEach(function (dom) { out[dom.id] = { earned: 0, max: 0, name: dom.name }; });
    FLAT.forEach(function (item, idx) {
      var a = answers[idx] == null ? 0 : answers[idx];
      out[item.domainId].earned += a;
      out[item.domainId].max += 4;
    });
    Object.keys(out).forEach(function (k) {
      out[k].pct = out[k].max ? Math.round(out[k].earned / out[k].max * 100) : 0;
    });
    return out;
  }

  function gradeFor(score) {
    for (var i = 0; i < DATA.grades.length; i++) {
      if (score >= DATA.grades[i].min) return DATA.grades[i];
    }
    return DATA.grades[DATA.grades.length - 1];
  }

  function buildPlan(scores) {
    // Order domains weakest -> strongest, then interleave their playbook steps
    // so the plan front-loads the biggest gaps. Cap at 12 steps.
    var order = Object.keys(scores).sort(function (a, b) { return scores[a].pct - scores[b].pct; });
    var queues = {};
    order.forEach(function (id) { queues[id] = DATA.playbook[id].slice(); });
    var plan = [];
    var safety = 0;
    while (plan.length < 12 && safety < 60) {
      safety++;
      for (var i = 0; i < order.length; i++) {
        var id = order[i];
        if (queues[id].length) {
          var step = queues[id].shift();
          plan.push({ domainId: id, domainName: scores[id].name, t: step.t, d: step.d });
          if (plan.length >= 12) break;
        }
      }
      var any = order.some(function (id) { return queues[id].length; });
      if (!any) break;
    }
    return plan;
  }

  function renderResults() {
    var scores = domainScores();
    var overall = Math.round(
      Object.keys(scores).reduce(function (sum, k) { return sum + scores[k].pct; }, 0) /
      Object.keys(scores).length
    );
    var g = gradeFor(overall);
    var wrap = el('div');

    // overall
    var head = el('div', 'rs-overall');
    var grade = el('div', 'rs-grade', g.grade); grade.style.color = g.color;
    head.appendChild(grade);
    head.appendChild(el('div', 'rs-score-num', overall + ' / 100 overall readiness'));
    head.appendChild(el('div', 'rs-stage', g.stage));
    head.appendChild(el('p', 'rs-stage-desc', esc(g.desc)));
    wrap.appendChild(head);

    // bars
    var bars = el('div', 'rs-bars');
    DATA.domains.forEach(function (dom) {
      var s = scores[dom.id];
      var bg = gradeFor(s.pct);
      var row = el('div', 'rs-bar-row');
      var top = el('div', 'rs-bar-top');
      top.appendChild(el('span', 'rs-bar-name', esc(dom.name)));
      top.appendChild(el('span', 'rs-bar-val', s.pct + '%'));
      row.appendChild(top);
      var track = el('div', 'rs-bar-track');
      var fill = el('div', 'rs-bar-fill'); fill.style.background = bg.color;
      track.appendChild(fill); row.appendChild(track);
      bars.appendChild(row);
      setTimeout(function () { fill.style.width = s.pct + '%'; }, 60);
    });
    wrap.appendChild(bars);

    // plan
    var plan = buildPlan(scores);
    var planWrap = el('div', 'rs-plan');
    planWrap.appendChild(el('h3', null, 'Your 12-step readiness plan'));
    planWrap.appendChild(el('p', 'rs-plan-sub',
      'Ordered to attack your biggest gaps first. Work top-down \u2014 each step compounds into the next.'));
    plan.forEach(function (step, i) {
      var row = el('div', 'rs-step');
      row.appendChild(el('div', 'rs-step-num', String(i + 1)));
      var body = el('div', 'rs-step-body');
      body.appendChild(el('div', 'rs-step-domain', esc(step.domainName)));
      body.appendChild(el('h4', null, esc(step.t)));
      body.appendChild(el('p', null, esc(step.d)));
      row.appendChild(body);
      planWrap.appendChild(row);
    });
    wrap.appendChild(planWrap);

    // CTA
    var cta = el('div', 'rs-cta-card');
    cta.appendChild(el('h3', null, 'Ready to own the asset, not just operate the business?'));
    cta.appendChild(el('p', null,
      'I\u2019ve done direct lending with AmPac Business Capital \u2014 SBA 504 to buy buildings and major equipment, and 7(a) for acquisitions and working capital. Let\u2019s map your path across capital, contracts, and exit.'));
    var btns = el('div', 'rs-cta-btns');
    var book = el('a', 'btn btn-primary', 'Book a strategy session \u2192');
    book.href = DATA.booking;
    btns.appendChild(book);
    var print = el('button', 'btn btn-ghost', 'Print / save my scorecard');
    print.type = 'button';
    print.style.borderColor = '#fff'; print.style.color = '#fff';
    print.addEventListener('click', function () { window.print(); });
    btns.appendChild(print);
    cta.appendChild(btns);
    wrap.appendChild(cta);

    // retake
    var actions = el('div', 'rs-result-actions');
    var retake = el('button', 'ig-btn ghost', 'Retake assessment');
    retake.type = 'button';
    retake.addEventListener('click', function () { answers = {}; cur = 0; view = 'intro'; render(); });
    actions.appendChild(retake);
    wrap.appendChild(actions);

    wrap.appendChild(el('p', 'rs-disclaimer-foot',
      'This scorecard is an educational self-assessment, not financial, legal, tax, or investment advice. Results depend on the information you provided. SBA programs have eligibility requirements; no financing outcome is guaranteed.'));

    app.appendChild(wrap);
  }

  render();
})();
