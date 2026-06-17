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

  // ---- Personalized analysis (rule-based, no API key needed) ----
  // Reads the actual answer pattern and produces a tailored narrative,
  // a strongest/weakest read, and specific SBA 7(a) vs 504 guidance.
  function analyze(scores, overall) {
    var ids = Object.keys(scores);
    var sorted = ids.slice().sort(function (a, b) { return scores[a].pct - scores[b].pct; });
    var weakest = scores[sorted[0]];
    var strongest = scores[sorted[sorted.length - 1]];
    var spread = strongest.pct - weakest.pct;

    var paras = [];

    // Opening read
    if (overall >= 85) {
      paras.push('You scored ' + overall + '/100 \u2014 deal-ready. The foundation is in place across the board. Your work now is timing and execution: moving on the right asset at the right moment while the wealth-transfer window is open.');
    } else if (overall >= 70) {
      paras.push('You scored ' + overall + '/100 \u2014 real momentum with specific gaps to close. You\u2019re closer than most owners think. Tightening one or two areas moves you into deal-ready territory.');
    } else if (overall >= 50) {
      paras.push('You scored ' + overall + '/100 \u2014 a forming foundation. The opportunity is real, but a lender, buyer, or successor would find gaps today. The good news: the gaps are fixable and you now know exactly where they are.');
    } else {
      paras.push('You scored ' + overall + '/100 \u2014 early stage, which is the right time to build correctly. Owners who fix these fundamentals early avoid the expensive scramble later when capital, a contract, or an exit is suddenly on the table.');
    }

    // Strongest / weakest read
    if (spread >= 25) {
      paras.push('Your strongest area is <strong>' + esc(strongest.name) + '</strong> (' + strongest.pct + '%) and your biggest gap is <strong>' + esc(weakest.name) + '</strong> (' + weakest.pct + '%). That ' + spread + '-point spread matters: lenders, buyers, and partners judge you by the weakest link, not the average. Closing ' + esc(weakest.name) + ' first will lift your whole profile.');
    } else {
      paras.push('Your three domains are fairly balanced, with <strong>' + esc(weakest.name) + '</strong> (' + weakest.pct + '%) as the area with the most room. Balanced profiles are good \u2014 it means no single gap is holding you hostage. Work top-down on the plan below.');
    }

    // Domain-specific guidance
    if (scores.capital && scores.capital.pct < 70) {
      paras.push('<strong>On capital:</strong> before you approach any lender, get your books current and know your credit position and debt-service coverage. If your goal is buying a building or major equipment, that\u2019s typically <strong>SBA 504</strong> territory (long-term, fixed-asset financing). If it\u2019s acquiring a business, working capital, or a change of ownership, that\u2019s usually <strong>SBA 7(a)</strong>. Eligible borrowers may be able to combine them \u2014 up to $10M in SBA-backed capital \u2014 which is exactly the kind of structuring conversation worth having early.');
    } else if (scores.capital) {
      paras.push('<strong>On capital:</strong> your financial house is in good order. The leverage now is structuring \u2014 matching the right SBA tool (504 for real estate/equipment, 7(a) for acquisition/working capital) to a specific asset and growth plan.');
    }

    if (scores.contract && scores.contract.pct < 60) {
      paras.push('<strong>On contracts:</strong> the fastest wins are getting fully registered (entity, EIN, licenses, SAM.gov if you want government work), pursuing the certifications that fit your market, and building a one-page capability statement. Buyers ask for that statement first \u2014 not having one ends the conversation before it starts.');
    }

    if (scores.exit && scores.exit.pct < 60) {
      paras.push('<strong>On continuity/exit:</strong> the single highest-leverage move is reducing how much the business depends on you personally. A business that can\u2019t run without the owner isn\u2019t transferable \u2014 and untransferable businesses are worth far less to a buyer, a lender, or your own family. Document the core processes and start delegating now, long before you plan to exit.');
    }

    return paras;
  }

  // ---- Optional AI analysis (off by default) ----
  // Flip AI_ENABLED to true and set AI_PROXY_URL after deploying
  // backend/worker.js (see backend/README.md). When off, the built-in
  // rule-based analyze() is used \u2014 no key, no backend, no cost.
  var AI_ENABLED = false;
  var AI_PROXY_URL = ''; // e.g. 'https://bk-ai.<your-subdomain>.workers.dev'

  function fetchAIAnalysis(scores, overall, container) {
    if (!AI_ENABLED || !AI_PROXY_URL) return;
    var payload = {
      overall: overall,
      domains: DATA.domains.map(function (d) { return { name: d.name, pct: scores[d.id].pct }; }),
      goal: ''
    };
    var note = el('p', 'rs-ai-note', 'Generating a personalized analysis\u2026');
    container.appendChild(note);
    fetch(AI_PROXY_URL, {
      method: 'POST',
      headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        if (data && data.analysis) {
          note.remove();
          var ai = el('div', 'rs-ai-analysis');
          ai.appendChild(el('div', 'rs-ai-tag', 'AI analysis'));
          data.analysis.split(/\n{2,}/).forEach(function (p) {
            if (p.trim()) ai.appendChild(el('p', null, esc(p.trim())));
          });
          container.appendChild(ai);
        } else { note.remove(); }
      }).catch(function () { note.remove(); });
  }

  // ---- Lead capture via Formspree (no backend needed) ----
  var FORMSPREE_ENDPOINT = 'https://formspree.io/f/mwvjjrre';

  function scoreSummary(scores, overall, g) {
    var lines = ['Overall readiness: ' + overall + '/100 (Grade ' + g.grade + ' \u2014 ' + g.stage + ')'];
    DATA.domains.forEach(function (dom) {
      lines.push(dom.name + ': ' + scores[dom.id].pct + '%');
    });
    return lines.join('\n');
  }

  function renderLeadForm(scores, overall, g) {
    var box = el('div', 'rs-lead');
    box.appendChild(el('h3', null, 'Get your full scorecard + a personalized path'));
    box.appendChild(el('p', 'rs-lead-sub',
      'Send your results to Brian Kennedy Jr and get a tailored follow-up on financing, contracts, and exit readiness. No spam \u2014 just a real next step.'));

    var form = el('form', 'rs-form');
    form.setAttribute('novalidate', 'novalidate');

    var nameI = inputField('rs-name', 'text', 'Your name', true);
    var emailI = inputField('rs-email', 'email', 'Email', true);
    var bizI = inputField('rs-biz', 'text', 'Business name (optional)', false);
    var phoneI = inputField('rs-phone', 'tel', 'Phone (optional)', false);

    var goalWrap = el('label', 'rs-field');
    goalWrap.appendChild(el('span', 'rs-field-label', 'What are you trying to do? (optional)'));
    var goal = el('textarea', 'rs-input');
    goal.rows = 3;
    goal.placeholder = 'e.g. buy my building, acquire a competitor, win government contracts, plan my exit\u2026';
    goalWrap.appendChild(goal);

    form.appendChild(fieldWrap('Your name', nameI));
    form.appendChild(fieldWrap('Email', emailI));
    form.appendChild(fieldWrap('Business name (optional)', bizI));
    form.appendChild(fieldWrap('Phone (optional)', phoneI));
    form.appendChild(goalWrap);

    var consent = el('label', 'rs-consent');
    var cb = el('input'); cb.type = 'checkbox'; cb.checked = true;
    consent.appendChild(cb);
    consent.appendChild(el('span', null, 'It\u2019s OK to contact me about my results. (You can opt out anytime.)'));
    form.appendChild(consent);

    var msg = el('div', 'rs-form-msg');
    var submit = el('button', 'btn btn-primary', 'Send me my scorecard \u2192');
    submit.type = 'submit';
    form.appendChild(submit);
    form.appendChild(msg);

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var name = nameI.value.trim();
      var email = emailI.value.trim();
      if (!name || !email || email.indexOf('@') < 0) {
        msg.className = 'rs-form-msg err';
        msg.textContent = 'Please add your name and a valid email.';
        return;
      }
      submit.disabled = true; submit.textContent = 'Sending\u2026';

      var payload = {
        name: name,
        email: email,
        business: bizI.value.trim(),
        phone: phoneI.value.trim(),
        goal: goal.value.trim(),
        consent: cb.checked ? 'yes' : 'no',
        source: 'ballkingdom.com Readiness Scorecard',
        overall_score: overall,
        grade: g.grade + ' \u2014 ' + g.stage,
        scorecard: scoreSummary(scores, overall, g),
        _subject: 'New Readiness Scorecard lead: ' + name + ' (' + overall + '/100, ' + g.grade + ')'
      };

      fetch(FORMSPREE_ENDPOINT, {
        method: 'POST',
        headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }).then(function (res) {
        if (res.ok) {
          form.innerHTML = '';
          var ok = el('div', 'rs-form-success');
          ok.innerHTML = '<strong>Sent. Thank you, ' + esc(name) + '.</strong><br>' +
            'Your scorecard is on its way to Brian. Want to skip the wait? ' +
            '<a href="' + esc(DATA.booking) + '">Book a strategy session now \u2192</a>';
          form.appendChild(ok);
        } else {
          throw new Error('Formspree error');
        }
      }).catch(function () {
        submit.disabled = false; submit.textContent = 'Send me my scorecard \u2192';
        msg.className = 'rs-form-msg err';
        msg.innerHTML = 'Something went wrong sending the form. You can email your results directly to ' +
          '<a href="mailto:info@ballkingdom.com">info@ballkingdom.com</a> or ' +
          '<a href="' + esc(DATA.booking) + '">book a session</a>.';
      });
    });

    box.appendChild(form);
    return box;
  }

  function inputField(id, type, ph, required) {
    var i = el('input', 'rs-input');
    i.type = type; i.id = id; i.placeholder = ph;
    if (required) i.required = true;
    return i;
  }
  function fieldWrap(label, input) {
    var w = el('label', 'rs-field');
    w.appendChild(el('span', 'rs-field-label', label));
    w.appendChild(input);
    return w;
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

    // personalized analysis
    var analysisWrap = el('div', 'rs-analysis');
    analysisWrap.appendChild(el('h3', null, 'What your scores mean for you'));
    analyze(scores, overall).forEach(function (p) {
      analysisWrap.appendChild(el('p', null, p));
    });
    fetchAIAnalysis(scores, overall, analysisWrap); // no-op unless AI_ENABLED
    wrap.appendChild(analysisWrap);

    // lead capture (Formspree -> emails Brian the full scorecard)
    wrap.appendChild(renderLeadForm(scores, overall, g));

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
