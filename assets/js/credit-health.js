/* Credit Health self-assessment — runs 100% client-side.
   No storage (no cookies/localStorage), no network requests, no personal identifiers collected. */
(function () {
  'use strict';
  var MAX = { pay: 25, util: 20, age: 12, mix: 8, inq: 10, checked: 10, specialty: 5, ein: 4, bank: 3, duns: 3 };
  var BIZ = ['ein', 'bank', 'duns'];
  var form = document.getElementById('ch-quiz');
  var out = document.getElementById('ch-results');
  var err = document.getElementById('ch-error');
  if (!form) return;

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  function band(p) {
    if (p >= 85) return ['Strong', 'Your habits and file hygiene look strong. Protect what you built and keep the rhythm.'];
    if (p >= 70) return ['Solid', 'A good foundation with a few clear levers to pull.'];
    if (p >= 50) return ['Building', 'You are on the way. Focused habits over the next 90 days can make a real difference in your file.'];
    return ['Foundation', 'Start with the basics: pull every file, fix what is inaccurate, and automate on-time payments.'];
  }

  function roadmap(a, hasBiz) {
    var d30 = [], d60 = [], d90 = [];
    if (a.checked < 10) d30.push('Pull all three bureau reports free at AnnualCreditReport.com and review every line: Is it mine? Accurate? Complete? Current?');
    if (a.specialty < 5) d30.push('Request your free LexisNexis, ChexSystems, and Early Warning disclosures (links below).');
    if (a.pay < 25) d30.push('Set up autopay for at least the minimum on every account so no payment is missed.');
    if (a.pay === 0) d30.push('List any collections or charge-offs. Verify each is accurate; dispute only items that are inaccurate or incomplete with the reporting company.');
    if (a.util <= 8) d30.push('Use the utilization calculator below and pick one card to pay down first.');
    if (a.util <= 15 && a.util > 8) d60.push('Bring overall utilization under 10% if you can — pay before the statement date so lower balances report.');
    if (a.util <= 8) d60.push('Work utilization below 30%, then toward 10%. Avoid closing paid-off cards, especially your oldest.');
    if (a.util === 6) d60.push('Consider one beginner-friendly account (e.g., a secured card or credit-builder loan) only if it fits your budget.');
    if (a.inq <= 3) d60.push('Pause new credit applications for at least 6 months; let recent inquiries age.');
    if (a.age <= 5) d60.push('Keep existing accounts open and in use lightly; age only comes with time.');
    if (a.mix === 0) d90.push('Once your payment system is steady, consider whether a builder account fits your goals. Never borrow just for "mix."');
    if (hasBiz) {
      if (a.ein === 0) d30.push('Get a free EIN directly from the IRS (never pay a third party).');
      if (a.bank === 0) d60.push('Open a dedicated business bank account and keep personal and business money separate.');
      if (a.duns < 3) d60.push('Request a free D-U-N-S Number and ask vendors whether they report payments to business bureaus.');
      d90.push('Build a loan-ready document vault: tax returns, year-to-date P&L and balance sheet, bank statements, and a debt schedule.');
      d90.push('Meet with a free SBDC or SCORE mentor (sba.gov/local-assistance) before applying for financing.');
    }
    d90.push('Re-pull your reports and re-take this check. Note what improved and set your next 90-day focus.');
    d90.push('Consider a security freeze at each bureau if you are not planning to apply for credit soon.');
    if (!d30.length) d30.push('Keep your weekly 30-minute money check-in: review balances, due dates, and any new alerts.');
    if (!d60.length) d60.push('Stay the course: on-time payments and low balances compound over time.');
    return [d30, d60, d90];
  }

  function list(items) { return '<ul>' + items.map(function (i) { return '<li>' + esc(i) + '</li>'; }).join('') + '</ul>'; }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var a = {}, missing = false;
    Object.keys(MAX).forEach(function (k) {
      var el = form.querySelector('input[name="' + k + '"]:checked');
      if (!el) { missing = true; return; }
      a[k] = parseInt(el.value, 10);
    });
    if (missing) { err.hidden = false; err.scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
    err.hidden = true;
    var hasBiz = BIZ.some(function (k) { return a[k] !== -1; });
    var got = 0, max = 0;
    Object.keys(MAX).forEach(function (k) {
      if (BIZ.indexOf(k) !== -1 && a[k] === -1) return;
      got += a[k]; max += MAX[k];
    });
    var pct = Math.round((got / max) * 100);
    var b = band(pct), r = roadmap(a, hasBiz);
    out.innerHTML =
      '<div class="ch-band ch-band-' + b[0].toLowerCase() + '"><p class="learn-kicker">Your credit health band</p>' +
      '<h2>' + b[0] + ' <span>' + pct + '/100</span></h2><p>' + esc(b[1]) + '</p>' +
      '<p class="ch-small">This is an educational habit score from your answers — not a credit score and not a prediction of any lender decision.</p></div>' +
      '<h3>Your 90-day roadmap</h3><div class="ch-road">' +
      '<div><h4>Days 1–30</h4>' + list(r[0]) + '</div>' +
      '<div><h4>Days 31–60</h4>' + list(r[1]) + '</div>' +
      '<div><h4>Days 61–90</h4>' + list(r[2]) + '</div></div>' +
      '<p class="ch-small">Remember: only inaccurate, incomplete, or unverifiable items can be disputed. Anyone promising to remove accurate negatives is a red flag.</p>' +
      '<p><a class="btn btn-ghost" href="#reports">Get your free reports</a></p>';
    out.hidden = false;
    out.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  form.addEventListener('reset', function () { out.hidden = true; out.innerHTML = ''; err.hidden = true; });

  // Utilization calculator
  var rows = document.getElementById('ch-util-rows');
  var uout = document.getElementById('ch-util-out');
  var n = 0;
  function addRow() {
    n++;
    var d = document.createElement('div');
    d.className = 'ch-util-row';
    d.innerHTML = '<label>Card ' + n + ' balance ($)<input type="number" min="0" step="1" inputmode="decimal" class="ch-bal" autocomplete="off" /></label>' +
      '<label>Card ' + n + ' limit ($)<input type="number" min="0" step="1" inputmode="decimal" class="ch-lim" autocomplete="off" /></label>';
    rows.appendChild(d);
  }
  function calc() {
    var bal = 0, lim = 0, worst = 0;
    rows.querySelectorAll('.ch-util-row').forEach(function (r) {
      var b = parseFloat(r.querySelector('.ch-bal').value) || 0, l = parseFloat(r.querySelector('.ch-lim').value) || 0;
      bal += b; lim += l; if (l > 0) worst = Math.max(worst, b / l);
    });
    if (lim <= 0) { uout.textContent = 'Enter balances and limits to calculate.'; return; }
    var p = (bal / lim) * 100;
    var msg = p < 10 ? 'Excellent range.' : p < 30 ? 'Good — under 10% is often cited as strongest.' : p < 50 ? 'Moderate — work toward under 30%.' : 'High — paying down balances is likely your biggest lever.';
    var to30 = Math.max(0, bal - lim * 0.3), to10 = Math.max(0, bal - lim * 0.1);
    uout.innerHTML = '<strong>Overall utilization: ' + p.toFixed(1) + '%</strong> — ' + esc(msg) +
      '<br />Highest single card: ' + (worst * 100).toFixed(1) + '%' +
      '<br />Pay down to reach 30%: $' + Math.ceil(to30).toLocaleString() + ' · to reach 10%: $' + Math.ceil(to10).toLocaleString();
  }
  if (rows) {
    addRow(); addRow();
    rows.addEventListener('input', calc);
    document.getElementById('ch-add-row').addEventListener('click', function () { addRow(); });
  }
})();
