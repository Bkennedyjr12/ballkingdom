// The Ballers Kingdom — Your Game interactive experience.
// Local-first by design: assessment, journal, and daily check-ins stay in this browser.
(function () {
  'use strict';

  var DATA = window.YOUR_GAME_DATA;
  var app = document.getElementById('yg-app');
  if (!DATA || !app) return;

  var PROFILE_KEY = 'bk_your_game_profile_v1';
  var DAILY_KEY = 'bk_daily_game_log_v1';
  var DRAFT_KEY = 'bk_your_game_draft_v1';
  var state = {
    screen: load(PROFILE_KEY, null) ? 'result' : 'welcome',
    tab: load(PROFILE_KEY, null) ? 'today' : 'assessment',
    round: 0,
    context: { name: '', arena: '', season: '' },
    answers: {},
    purpose: { people: '', burden: '', assignment: '', prayer: '' },
    notice: ''
  };

  function load(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) || fallback; }
    catch (e) { return fallback; }
  }
  function store(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch (e) { return false; }
  }
  function esc(value) {
    return String(value == null ? '' : value).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }
  function roleById(id) { return DATA.roles.filter(function (r) { return r.id === id; })[0]; }
  function seasonById(id) { return DATA.seasons.filter(function (s) { return s.id === id; })[0]; }
  function dateKey(date) {
    var d = date || new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function prettyDate(key) {
    var parts = key.split('-').map(Number);
    return new Date(parts[0], parts[1] - 1, parts[2]).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  }
  function daysBetween(a, b) {
    var aa = new Date(a + 'T12:00:00'); var bb = new Date(b + 'T12:00:00');
    return Math.round((bb - aa) / 86400000);
  }
  function setNotice(message) { state.notice = message; render(); }

  function shell(content) {
    var profile = load(PROFILE_KEY, null);
    var tabs = profile ?
      '<div class="yg-tabs" role="tablist" aria-label="Your Game sections">' +
        tabButton('result', 'Your roles') + tabButton('today', 'Today') + tabButton('progress', 'Progress') +
      '</div>' : '';
    return '<div class="yg-app-shell">' + tabs + (state.notice ? '<div class="yg-notice" role="status">' + esc(state.notice) + '</div>' : '') + content + '</div>';
  }
  function tabButton(id, label) {
    return '<button type="button" class="yg-tab' + (state.tab === id ? ' active' : '') + '" data-tab="' + id + '" role="tab" aria-selected="' + (state.tab === id) + '">' + label + '</button>';
  }

  function render() {
    state.notice = state.notice || '';
    var profile = load(PROFILE_KEY, null);
    if (profile && state.tab === 'today') app.innerHTML = shell(renderToday(profile));
    else if (profile && state.tab === 'progress') app.innerHTML = shell(renderProgress(profile));
    else if (profile && (state.tab === 'result' || state.screen === 'result')) app.innerHTML = shell(renderResult(profile));
    else if (state.screen === 'context') app.innerHTML = shell(renderContext());
    else if (state.screen === 'round') app.innerHTML = shell(renderRound());
    else if (state.screen === 'purpose') app.innerHTML = shell(renderPurpose());
    else app.innerHTML = shell(renderWelcome());
    bind();
  }

  function renderWelcome() {
    return '<section class="yg-card yg-welcome">' +
      '<div class="yg-card-kicker">Your Game · Start here</div><h2>Purpose is practiced before it is fully understood.</h2>' +
      '<p class="yg-intro">This experience will help you recognize your two strongest contribution patterns, examine how those strengths bend under pressure, name your current season, and build a daily rule of faithfulness.</p>' +
      '<div class="yg-truth"><span>Identity comes first</span><strong>You are created in God’s image and invited into faithful stewardship. No role, score, title, win, or failure can carry the weight of telling you who you are.</strong><small>Ephesians 2:10 · Romans 12:3–8</small></div>' +
      '<div class="yg-role-preview">' + DATA.roles.map(function (r) { return '<div><b>' + r.mark + '</b><span>' + r.name.replace('The ', '') + '</span><small>' + r.verb + '</small></div>'; }).join('') + '</div>' +
      '<p class="yg-guardrail">' + esc(DATA.guardrail) + '</p>' +
      '<button type="button" class="yg-action primary" data-action="start">Begin the assessment <span>→</span></button><span class="yg-time">About 7 minutes · 20 original prompts</span>' +
    '</section>';
  }

  function renderContext() {
    return '<section class="yg-card">' + progress(1, 6, 'Set the field') +
      '<div class="yg-card-kicker">Before the roles</div><h2>What field are you standing on right now?</h2>' +
      '<label class="yg-label" for="yg-name">First name <small>optional</small></label><input class="yg-input" id="yg-name" maxlength="40" value="' + esc(state.context.name) + '" placeholder="What should your playbook call you?" />' +
      '<fieldset class="yg-fieldset"><legend>Primary arena</legend><div class="yg-choice-grid">' + DATA.arenas.map(function (a) { return choice('arena', a, a, state.context.arena === a); }).join('') + '</div></fieldset>' +
      '<fieldset class="yg-fieldset"><legend>Current season</legend><div class="yg-season-grid">' + DATA.seasons.map(function (s) { return '<button type="button" class="yg-season' + (state.context.season === s.id ? ' selected' : '') + '" data-choice="season" data-value="' + s.id + '"><strong>' + s.name + '</strong><span>' + s.line + '</span></button>'; }).join('') + '</div></fieldset>' +
      nav('Back', 'Continue', 'welcome', 'context-next', Boolean(state.context.arena && state.context.season)) + '</section>';
  }
  function choice(type, value, label, selected) {
    return '<button type="button" class="yg-choice' + (selected ? ' selected' : '') + '" data-choice="' + type + '" data-value="' + esc(value) + '">' + esc(label) + '</button>';
  }

  function renderRound() {
    var round = DATA.rounds[state.round];
    var answered = round.statements.filter(function (s, i) { return state.answers[state.round + '-' + i]; }).length;
    return '<section class="yg-card">' + progress(state.round + 2, 6, round.eyebrow) +
      '<div class="yg-card-kicker">' + round.eyebrow + ' · Round ' + (state.round + 1) + ' of 4</div><h2>' + round.name + '</h2><p class="yg-round-prompt">' + round.prompt + '</p>' +
      '<div class="yg-statements">' + round.statements.map(function (statement, i) {
        var key = state.round + '-' + i; var selected = state.answers[key];
        return '<fieldset class="yg-statement"><legend>' + (i + 1) + '. ' + esc(statement.text) + '</legend><div class="yg-scale">' + DATA.scale.map(function (s) {
          return '<button type="button" aria-label="' + esc(s.label) + '" class="yg-rate' + (selected === s.value ? ' selected' : '') + '" data-rate="' + key + '" data-role="' + statement.role + '" data-value="' + s.value + '"><b>' + s.value + '</b><span>' + s.label + '</span></button>';
        }).join('') + '</div></fieldset>';
      }).join('') + '</div>' +
      nav('Back', state.round === 3 ? 'Name my purpose' : 'Next round', 'round-back', 'round-next', answered === 5) + '</section>';
  }

  function renderPurpose() {
    return '<section class="yg-card">' + progress(6, 6, 'Stewardship') +
      '<div class="yg-card-kicker">Purpose · Hold it with open hands</div><h2>Name what is already asking for your faithfulness.</h2><p class="yg-round-prompt">' + esc(DATA.purposeNote) + '</p>' +
      field('people', 'Who do you feel responsible to serve?', 'Young athletes, my team, business owners, my family…', state.purpose.people) +
      field('burden', 'What problem, need, or possibility keeps getting your attention?', 'The thing you cannot easily ignore…', state.purpose.burden) +
      field('assignment', 'What responsibility is actually in front of you now?', 'Name the present assignment—not the someday dream.', state.purpose.assignment) +
      field('prayer', 'What is the one prayer you are carrying in this season?', 'Lord, show me…', state.purpose.prayer) +
      nav('Back', 'Build my Kingdom Playbook', 'purpose-back', 'finish', Boolean(state.purpose.assignment.trim())) + '</section>';
  }
  function field(id, label, placeholder, value) {
    return '<label class="yg-label" for="yg-' + id + '">' + label + '</label><textarea class="yg-input yg-text" id="yg-' + id + '" data-purpose="' + id + '" rows="2" placeholder="' + esc(placeholder) + '">' + esc(value) + '</textarea>';
  }
  function progress(current, total, label) {
    return '<div class="yg-progress"><div><span style="width:' + Math.round(current / total * 100) + '%"></span></div><small>' + esc(label) + ' · ' + current + '/' + total + '</small></div>';
  }
  function nav(backLabel, nextLabel, backAction, nextAction, enabled) {
    return '<div class="yg-nav"><button type="button" class="yg-action ghost" data-action="' + backAction + '">← ' + backLabel + '</button><button type="button" class="yg-action primary" data-action="' + nextAction + '"' + (enabled ? '' : ' disabled') + '>' + nextLabel + ' →</button></div>';
  }

  function scoreProfile() {
    var scores = Object.fromEntries(DATA.roles.map(function (r) { return [r.id, 0]; }));
    DATA.rounds.forEach(function (round, ri) {
      round.statements.forEach(function (statement, si) { scores[statement.role] += state.answers[ri + '-' + si] || 0; });
    });
    var ranked = DATA.roles.slice().sort(function (a, b) { return scores[b.id] - scores[a.id]; });
    return {
      createdAt: Date.now(), name: state.context.name.trim(), arena: state.context.arena,
      season: state.context.season, primary: ranked[0].id, secondary: ranked[1].id,
      scores: scores, purpose: Object.assign({}, state.purpose)
    };
  }

  function renderResult(profile) {
    var primary = roleById(profile.primary); var secondary = roleById(profile.secondary); var season = seasonById(profile.season);
    var purposeLine = buildPurpose(profile, primary);
    return '<section class="yg-result">' +
      '<div class="yg-result-hero"><div class="yg-card-kicker">' + esc(profile.name ? profile.name + '’s' : 'Your') + ' Kingdom Playbook</div><p class="yg-overline">Primary contribution pattern</p><div class="yg-role-lockup"><span>' + primary.mark + '</span><div><h2>' + primary.name + '</h2><p>' + primary.verb + ' what has been entrusted to you.</p></div></div><blockquote>“' + primary.essence + '”</blockquote><div class="yg-scripture">Biblical lens · ' + primary.scripture + '</div></div>' +
      '<div class="yg-result-grid"><article><span>Supporting role</span><h3>' + secondary.name + '</h3><p>' + secondary.contribution + '</p></article><article><span>Current season</span><h3>' + season.name + '</h3><p>' + season.line + '</p></article></div>' +
      '<article class="yg-purpose-card"><span>Working purpose statement</span><p>' + esc(purposeLine) + '</p><small>A prayerful working statement—not a divine prediction. Test it through Scripture, wise counsel, responsibility, and fruit.</small></article>' +
      '<div class="yg-playbook-grid"><article><span>At your best</span><p>' + primary.contribution + '</p></article><article class="pressure"><span>Under pressure</span><p>' + primary.pressure + '</p></article><article><span>Practice next</span><p>' + primary.practice + '</p></article><article><span>Identity declaration</span><p>' + primary.identity + '</p></article></div>' +
      '<article class="yg-next-play"><div><span>Your next faithful play</span><h3>' + esc(profile.purpose.assignment) + '</h3><p>Begin with one action small enough to complete, honest enough to matter, and clear enough to share with an accountability partner.</p></div><button type="button" class="yg-action primary" data-action="go-today">Set today’s play →</button></article>' +
      '<div class="yg-result-actions"><button type="button" class="yg-action secondary" data-share="roles">Share my role card</button><a class="yg-action ghost" href="growth.html?source=your-game&amp;role=' + primary.id + '">Take this into Inner Game →</a><button type="button" class="yg-text-action" data-action="retake">Retake assessment</button></div>' +
      '<p class="yg-framework-note">The five Kingdom Roles and all assessment language are an original Ballers Kingdom contribution framework. They are not spiritual offices, personality diagnoses, or measures of faith.</p>' +
    '</section>';
  }
  function buildPurpose(profile, role) {
    var people = profile.purpose.people ? 'serve ' + profile.purpose.people : 'serve the people entrusted to me';
    var burden = profile.purpose.burden ? ' I will bring those strengths to this burden: ' + profile.purpose.burden + '.' : '';
    return 'In this ' + seasonById(profile.season).name.toLowerCase() + ' season, I will use my ' + role.name.replace('The ', '').toLowerCase() + ' strengths to ' + people + '.' + burden + ' I will begin with the responsibility already in front of me.';
  }

  function renderToday(profile) {
    var key = dateKey(); var log = load(DAILY_KEY, []); var entry = log.filter(function (x) { return x.date === key; })[0] || {};
    var scripture = DATA.dailyScripture[Math.floor(new Date(key + 'T12:00:00').getTime() / 86400000) % DATA.dailyScripture.length];
    var primary = roleById(profile.primary);
    return '<section class="yg-daily">' +
      '<header class="yg-daily-head"><div><div class="yg-card-kicker">Daily Game · ' + prettyDate(key) + '</div><h2>Play today faithfully.</h2></div><div class="yg-day-mark"><span>' + primary.mark + '</span><small>' + primary.name.replace('The ', '') + '</small></div></header>' +
      '<article class="yg-daily-word"><span>Today’s biblical lens</span><h3>' + scripture.ref + '</h3><p>' + scripture.truth + '</p><strong>' + scripture.question + '</strong></article>' +
      (profile.purpose.prayer ? '<article class="yg-prayer"><span>My one prayer</span><p>' + esc(profile.purpose.prayer) + '</p></article>' : '') +
      '<form id="yg-daily-form">' +
        fieldValue('move', 'My one purpose move', 'The next faithful action—not the whole assignment.', entry.move || profile.purpose.assignment || '') +
        '<label class="yg-move-done"><input type="checkbox" name="moveDone"' + (entry.moveDone ? ' checked' : '') + ' /><span>I made this move today</span></label>' +
        '<div class="yg-daily-checks">' + check('spiritual', 'Spiritual', entry.spiritual, 'Scripture, prayer, worship, stillness…') + check('physical', 'Physical', entry.physical, 'Training, recovery, sleep, nutrition…') + check('relational', 'Relational / vocational', entry.relational, 'A conversation, service, craft, or repair…') + '</div>' +
        '<div class="yg-inner-reset"><div><span>Inner Game forecast</span><p>' + primary.innerPrompt + '</p></div><a href="growth.html?source=your-game&amp;role=' + primary.id + '">Work through what I’m feeling →</a></div>' +
        fieldValue('reflection', 'End-of-day truth', 'Where did I act faithfully? What needs gratitude, confession, repair, or release?', entry.reflection || '', true) +
        '<div class="yg-save-row"><button type="submit" class="yg-action primary">Save today</button><button type="button" class="yg-action secondary" data-share="today">Share accountability card</button></div>' +
      '</form></section>';
  }
  function fieldValue(id, label, placeholder, value, textarea) {
    var tag = textarea ? 'textarea' : 'input'; var end = textarea ? '</textarea>' : ' />';
    return '<label class="yg-label" for="daily-' + id + '">' + label + '</label><' + tag + ' class="yg-input' + (textarea ? ' yg-text' : '') + '" id="daily-' + id + '" name="' + id + '" placeholder="' + esc(placeholder) + '"' + (textarea ? ' rows="3">' + esc(value) : ' value="' + esc(value) + '"') + end;
  }
  function check(id, label, checked, hint) {
    return '<label class="yg-check"><input type="checkbox" name="' + id + '"' + (checked ? ' checked' : '') + ' /><span><b>' + label + '</b><small>' + hint + '</small></span></label>';
  }

  function renderProgress(profile) {
    var log = load(DAILY_KEY, []).slice().sort(function (a, b) { return a.date.localeCompare(b.date); });
    var allThree = log.filter(function (e) { return e.spiritual && e.physical && e.relational; }).length;
    var moves = log.filter(function (e) { return e.moveDone || (e.move && String(e.move).trim()); }).length;
    var returns = 0;
    for (var i = 1; i < log.length; i++) if (daysBetween(log[i - 1].date, log[i].date) > 1) returns++;
    var recent = log.slice(-7).reverse();
    return '<section class="yg-progress-view"><div class="yg-card-kicker">Daily Game · Progress</div><h2>Faithfulness is measured by return.</h2><p>No shame counter. No public leaderboard. Missed days are information; coming back is the practice.</p>' +
      '<div class="yg-stat-grid"><article><strong>' + log.length + '</strong><span>Days engaged</span></article><article><strong>' + allThree + '</strong><span>All three honored</span></article><article><strong>' + moves + '</strong><span>Purpose moves</span></article><article><strong>' + returns + '</strong><span>Times you returned</span></article></div>' +
      '<article class="yg-week"><header><span>Recent days</span><button type="button" data-share="week">Share weekly review</button></header>' + (recent.length ? recent.map(function (e) {
        var count = [e.spiritual, e.physical, e.relational].filter(Boolean).length;
        return '<div><time>' + prettyDate(e.date) + '</time><span>' + count + '/3 commitments</span><span>' + ((e.moveDone || (e.move && String(e.move).trim())) ? 'Purpose move made' : 'Still in play') + '</span></div>';
      }).join('') : '<p class="yg-empty">Your first saved Daily Game will appear here.</p>') + '</article>' +
      '<article class="yg-progress-truth"><span>Proverbs 24:16</span><p>The righteous may fall repeatedly and still rise again. The important count is not flawless performance—it is faithful return.</p></article>' +
    '</section>';
  }

  function saveDaily(form) {
    var key = dateKey(); var log = load(DAILY_KEY, []); var existing = log.findIndex(function (e) { return e.date === key; });
    var entry = {
      date: key, move: form.elements.move.value.trim(), moveDone: form.elements.moveDone.checked,
      spiritual: form.elements.spiritual.checked, physical: form.elements.physical.checked,
      relational: form.elements.relational.checked, reflection: form.elements.reflection.value.trim(), updatedAt: Date.now()
    };
    if (existing >= 0) log[existing] = entry; else log.push(entry);
    store(DAILY_KEY, log); setNotice('Today’s game card is saved on this device.');
  }

  function shareText(type) {
    var profile = load(PROFILE_KEY, null); if (!profile) return '';
    var primary = roleById(profile.primary); var secondary = roleById(profile.secondary);
    if (type === 'roles') return 'MY KINGDOM PLAYBOOK\n\nPrimary: ' + primary.name + '\nSupporting: ' + secondary.name + '\nSeason: ' + seasonById(profile.season).name + '\n\n' + buildPurpose(profile, primary) + '\n\nKnow whose you are. Play today faithfully.\nballkingdom.com/your-game';
    var log = load(DAILY_KEY, []); var today = log.filter(function (e) { return e.date === dateKey(); })[0];
    if (type === 'today') {
      if (!today) return 'I have not saved today’s Daily Game yet.';
      var count = [today.spiritual, today.physical, today.relational].filter(Boolean).length;
      return 'DAILY GAME · ' + prettyDate(today.date) + '\nPurpose move: ' + (today.moveDone ? 'Made' : 'Still in play') + '\nCommitments: ' + count + '/3\nOne honest line: ' + (today.reflection || 'Still reflecting.') + '\n\nAccountability without performance. Faithful return.\nballkingdom.com/your-game';
    }
    var last = log.slice().sort(function (a, b) { return b.date.localeCompare(a.date); }).slice(0, 7);
    var full = last.filter(function (e) { return e.spiritual && e.physical && e.relational; }).length;
    return 'WEEKLY KINGDOM REVIEW\nDays engaged: ' + last.length + '\nDays I honored all three: ' + full + '\nOne ask: Pray that I keep returning with honesty and discipline.\n\nballkingdom.com/your-game';
  }
  function share(type) {
    var text = shareText(type);
    if (navigator.share) navigator.share({ title: 'The Ballers Kingdom · Your Game', text: text }).catch(function () {});
    else if (navigator.clipboard) navigator.clipboard.writeText(text).then(function () { setNotice('Your share card was copied.'); });
    else setNotice('Sharing is not available in this browser.');
  }

  function bind() {
    app.querySelectorAll('[data-tab]').forEach(function (button) { button.addEventListener('click', function () { state.tab = button.dataset.tab; state.screen = button.dataset.tab; state.notice = ''; render(); }); });
    app.querySelectorAll('[data-choice]').forEach(function (button) { button.addEventListener('click', function () { state.context[button.dataset.choice] = button.dataset.value; render(); }); });
    app.querySelectorAll('[data-rate]').forEach(function (button) { button.addEventListener('click', function () { state.answers[button.dataset.rate] = Number(button.dataset.value); render(); }); });
    app.querySelectorAll('[data-purpose]').forEach(function (input) { input.addEventListener('input', function () {
      state.purpose[input.dataset.purpose] = input.value;
      var finish = app.querySelector('[data-action="finish"]');
      if (finish) finish.disabled = !state.purpose.assignment.trim();
    }); });
    app.querySelectorAll('[data-share]').forEach(function (button) { button.addEventListener('click', function () { share(button.dataset.share); }); });
    var name = app.querySelector('#yg-name'); if (name) name.addEventListener('input', function () { state.context.name = name.value; });
    var form = app.querySelector('#yg-daily-form'); if (form) form.addEventListener('submit', function (event) { event.preventDefault(); saveDaily(form); render(); });
    app.querySelectorAll('[data-action]').forEach(function (button) { button.addEventListener('click', function () { action(button.dataset.action); }); });
  }

  function action(name) {
    state.notice = '';
    if (name === 'start') state.screen = 'context';
    else if (name === 'welcome') state.screen = 'welcome';
    else if (name === 'context-next') { state.screen = 'round'; state.round = 0; }
    else if (name === 'round-back') { if (state.round > 0) state.round--; else state.screen = 'context'; }
    else if (name === 'round-next') { if (state.round < 3) state.round++; else state.screen = 'purpose'; }
    else if (name === 'purpose-back') { state.screen = 'round'; state.round = 3; }
    else if (name === 'finish') { var profile = scoreProfile(); store(PROFILE_KEY, profile); localStorage.removeItem(DRAFT_KEY); state.screen = 'result'; state.tab = 'result'; }
    else if (name === 'go-today') { state.screen = 'today'; state.tab = 'today'; }
    else if (name === 'retake') { localStorage.removeItem(PROFILE_KEY); state.screen = 'welcome'; state.tab = 'assessment'; state.round = 0; state.answers = {}; }
    render();
    app.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  render();
}());
