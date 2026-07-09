import fs from 'node:fs/promises';
import path from 'node:path';
import {
  escapeHtml,
  guidePath,
  guideRoot,
  manifestPath,
  readJson
} from './pipeline-utils.mjs';

function list(items = []) {
  if (!items.length) return '<p class="hi-empty">No entries yet.</p>';
  return `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`;
}

function figureCard(figure) {
  return `
    <figure class="hi-figure-card" data-filter-item data-search-text="${escapeHtml(`${figure.topicTag} ${figure.caption} ${figure.altText} ${figure.sourcePageReference}`)}">
      <img src="${escapeHtml(figure.assetPath)}" alt="${escapeHtml(figure.altText)}" loading="lazy">
      <figcaption class="hi-figure-meta">
        <span class="hi-figure-tag">${escapeHtml(figure.topicTag)}</span>
        <h4>${escapeHtml(figure.caption)}</h4>
        <p>${escapeHtml(figure.sourcePageReference)}</p>
        <div class="hi-confidence">
          <span>Confidence ${Math.round((figure.confidence ?? 0) * 100)}%</span>
          ${figure.needsReview ? '<span class="hi-review">Needs review</span>' : '<span>Reviewed by pipeline</span>'}
        </div>
      </figcaption>
    </figure>`;
}

function figuresForSection(section, figures) {
  const tags = new Set(section.figureTags || []);
  const matches = figures.filter((figure) => tags.has(figure.topicTag)).slice(0, 3);
  const selected = matches.length ? matches : figures.filter((figure) => figure.topicTag === 'overview').slice(0, 1);
  if (!selected.length) return '<div class="hi-empty">No cropped figures matched this topic yet.</div>';
  return selected.map(figureCard).join('');
}

function sectionCard(section, figures) {
  const searchText = [
    section.title,
    section.body,
    ...(section.checklist || []),
    ...(section.reportLanguage || []),
    ...(section.examTips || []),
    ...(section.fieldNotes || []),
    ...(section.figureTags || [])
  ].join(' ');

  return `
    <section class="hi-topic" id="${escapeHtml(section.id)}" data-filter-item data-search-text="${escapeHtml(searchText)}">
      <div class="hi-topic-main">
        <div class="hi-topic-copy">
          <h3 class="hi-topic-title">${escapeHtml(section.title)}</h3>
          <p class="hi-topic-body">${escapeHtml(section.body)}</p>
          <div class="hi-blocks">
            <div class="hi-block">
              <h4>Checklist</h4>
              ${list(section.checklist)}
            </div>
            <div class="hi-block hi-report">
              <h4>Report Language</h4>
              ${list(section.reportLanguage)}
            </div>
            <div class="hi-block">
              <h4>Exam Tips</h4>
              ${list(section.examTips)}
            </div>
            <div class="hi-block hi-note">
              <h4>Brian's Field Notes</h4>
              ${list(section.fieldNotes)}
            </div>
          </div>
        </div>
        <aside class="hi-figure-column" aria-label="Relevant cropped figures">
          ${figuresForSection(section, figures)}
        </aside>
      </div>
    </section>`;
}

function chapterMarkup(chapter, index, figures) {
  return `
    <article class="hi-chapter" id="${escapeHtml(chapter.id)}" data-filter-item data-search-text="${escapeHtml(`${chapter.title} ${chapter.summary}`)}">
      <header class="hi-chapter-header">
        <div class="hi-chapter-number">${String(index + 1).padStart(2, '0')}</div>
        <div>
          <h2>${escapeHtml(chapter.title)}</h2>
          <p>${escapeHtml(chapter.summary)}</p>
        </div>
      </header>
      <div class="hi-section-grid">
        ${(chapter.sections || []).map((section) => sectionCard(section, figures)).join('')}
      </div>
    </article>`;
}

function overviewCards(guide) {
  const studyMethod = guide.studyMethod || [];
  const sequence = guide.inspectionSequence || [];
  const principles = guide.reportPrinciples || [];
  return `
    <section class="hi-chapter" id="field-system">
      <header class="hi-chapter-header">
        <div class="hi-chapter-number">FS</div>
        <div>
          <h2>Field System</h2>
          <p>A repeatable operating rhythm for studying, inspecting, and writing reports with confidence.</p>
        </div>
      </header>
      <div class="hi-blocks hi-wide-blocks">
        ${studyMethod.map((item) => `
          <div class="hi-block">
            <h4>${escapeHtml(item.title)}</h4>
            <p>${escapeHtml(item.body)}</p>
          </div>`).join('')}
      </div>
      <div class="hi-blocks hi-wide-blocks">
        <div class="hi-block hi-report">
          <h4>Inspection Sequence</h4>
          ${list(sequence)}
        </div>
        <div class="hi-block hi-note">
          <h4>Report Principles</h4>
          ${list(principles)}
        </div>
      </div>
    </section>`;
}

function classHubMarkup(guide) {
  const hub = guide.classHub;
  if (!hub) return '';
  return `
    <section class="hi-class-hub" id="class-hub">
      <div class="hi-class-copy">
        <span class="hi-kicker">${escapeHtml(hub.status)}</span>
        <h2>${escapeHtml(hub.program)}</h2>
        <p>${escapeHtml(hub.primaryGoal)}</p>
        <div class="hi-campus-card">
          <strong>${escapeHtml(hub.campusName)}</strong>
          <span>${escapeHtml(hub.campusAddress)}</span>
          <em>${escapeHtml(hub.noClassNotice)}</em>
        </div>
        <div class="hi-action-row">
          ${(hub.quickLinks || []).map((link) => `<a class="hi-action" href="${escapeHtml(link.href)}">${escapeHtml(link.label)}</a>`).join('')}
        </div>
      </div>
      <div class="hi-schedule-card">
        <h3>Class Schedule</h3>
        <div class="hi-schedule-list">
          ${(hub.classDates || []).map((item) => `
            <div class="hi-schedule-item">
              <span>${escapeHtml(item.label)}</span>
              <strong>${escapeHtml(item.date)}</strong>
              <em>${escapeHtml(item.time)}</em>
            </div>`).join('')}
        </div>
      </div>
      <div class="hi-class-workflow">
        <h3>During Class Capture Flow</h3>
        ${list(hub.duringClassWorkflow)}
      </div>
      <div class="hi-class-detail-grid">
        <div class="hi-block">
          <h4>Daily Prep Checklist</h4>
          ${list(hub.dailyPrepChecklist)}
        </div>
        <div class="hi-block">
          <h4>Photo Capture Standard</h4>
          ${list(hub.photoCaptureStandard)}
        </div>
        <div class="hi-block hi-report">
          <h4>Report Formula</h4>
          ${list(hub.reportFormula)}
        </div>
        <div class="hi-block hi-note">
          <h4>Exam Memory Hooks</h4>
          ${list(hub.examMemoryHooks)}
        </div>
        <div class="hi-block hi-report">
          <h4>Code Check + Report Binder Workflow</h4>
          ${list(hub.referenceBinderWorkflow)}
        </div>
        <div class="hi-block">
          <h4>Binder Topics Wired In</h4>
          ${list(hub.referenceBinderTopics)}
        </div>
      </div>
    </section>`;
}

function clientScript() {
  return `
    (() => {
      const input = document.querySelector('#guide-search');
      const count = document.querySelector('[data-result-count]');
      const items = Array.from(document.querySelectorAll('[data-filter-item]'));
      const sections = items.filter((item) => item.classList.contains('hi-topic'));
      function applyFilter() {
        const query = input.value.trim().toLowerCase();
        let visibleSections = 0;
        items.forEach((item) => {
          const haystack = (item.getAttribute('data-search-text') || '').toLowerCase();
          const match = !query || haystack.includes(query);
          item.classList.toggle('is-hidden', !match);
          if (match && item.classList.contains('hi-topic')) visibleSections += 1;
        });
        count.textContent = query ? visibleSections + ' matching topic' + (visibleSections === 1 ? '' : 's') : 'All topics';
      }
      input?.addEventListener('input', applyFilter);
    })();
  `;
}

async function main() {
  const guide = await readJson(guidePath, { title: 'Home Inspection Guide', chapters: [] });
  const manifest = await readJson(manifestPath, { figures: [] });
  const css = await fs.readFile(path.join(guideRoot, 'styles', 'home-inspection-guide.css'), 'utf8');
  const figures = manifest.figures || [];
  const sectionCount = guide.chapters.flatMap((chapter) => chapter.sections || []).length;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(guide.title)} | The Ballers Kingdom</title>
  <meta name="description" content="A searchable home inspection study guide with cropped reference figures, checklists, report comments, exam tips, and field notes.">
  <link rel="canonical" href="https://ballkingdom.com/home-inspection-guide/">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Oswald:wght@400;500;600;700&family=Inter:wght@400;500;600;700&family=Playfair+Display:ital,wght@0,600;1,600&display=swap" rel="stylesheet">
  <style>${css}</style>
</head>
<body class="hi-body">
  <div class="hi-shell">
    <nav class="hi-nav" aria-label="Home Inspection Guide">
      <div class="hi-nav-inner">
        <a class="hi-logo" href="../index.html"><span class="hi-mark">BK</span><span>The Ballers Kingdom</span></a>
        <div class="hi-nav-actions">
          <a href="#chapters">Chapters</a>
          <a href="#figures">Figures</a>
          <a class="hi-pill-link" href="public/assets/guide.pdf">Download PDF</a>
        </div>
      </div>
    </nav>
    <header class="hi-hero">
      <div class="hi-hero-inner">
        <div class="hi-kicker">BallKingdom Study Systems</div>
        <h1>Home Inspection <span>Guide</span></h1>
        <p class="hi-hero-copy">${escapeHtml(guide.subtitle)}</p>
        <div class="hi-dashboard">
          <div class="hi-stat"><strong>${guide.chapters.length}</strong><span>Chapters</span></div>
          <div class="hi-stat"><strong>${sectionCount}</strong><span>Study topics</span></div>
          <div class="hi-stat"><strong>${figures.length}</strong><span>Cropped figures</span></div>
          <div class="hi-stat"><strong>${manifest.sourceCount || 0}</strong><span>Source pages processed</span></div>
        </div>
      </div>
    </header>
    <main class="hi-main" id="chapters">
      <section class="hi-search-panel" aria-label="Search guide">
        <label for="guide-search" class="hi-kicker">Global search</label>
        <div class="hi-search-row">
          <input id="guide-search" class="hi-search" type="search" placeholder="Search drainage, GFCI, roof flashing, report language..." autocomplete="off">
          <span class="hi-count" data-result-count>All topics</span>
        </div>
      </section>
      <div class="hi-layout">
        <aside class="hi-rail" aria-label="Chapter navigation">
          <div class="hi-rail-title">Chapter Navigation</div>
          <a class="hi-chapter-link" href="#class-hub">Class Hub</a>
          <a class="hi-chapter-link" href="#field-system">Field System</a>
          ${guide.chapters.map((chapter) => `<a class="hi-chapter-link" href="#${escapeHtml(chapter.id)}">${escapeHtml(chapter.title)}</a>`).join('')}
        </aside>
        <div>
          ${classHubMarkup(guide)}
          ${overviewCards(guide)}
          ${guide.chapters.map((chapter, index) => chapterMarkup(chapter, index, figures)).join('')}
          <section class="hi-gallery" id="figures">
            <div class="hi-chapter-header">
              <div class="hi-chapter-number">FG</div>
              <div>
                <h2>Figure Gallery</h2>
                <p>Cropped images only. Full source scans stay in the audit originals folder and are not rendered in the normal guide.</p>
              </div>
            </div>
            <div class="hi-gallery-grid">${figures.map(figureCard).join('')}</div>
          </section>
        </div>
      </div>
    </main>
    <footer class="hi-footer">
      <p>Built for The Ballers Kingdom. Update with <code>npm run hi:add -- /path/to/photo.jpg</code> or <code>npm run hi:all</code>.</p>
    </footer>
  </div>
  <script>${clientScript()}</script>
</body>
</html>`;

  await fs.writeFile(path.join(guideRoot, 'index.html'), html);
  console.log(`Built ${path.join(guideRoot, 'index.html')}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
