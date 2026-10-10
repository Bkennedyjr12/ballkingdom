import { ANSWER_OPTIONS, DIMENSIONS, QUESTIONS, createAssessmentSession, scoreAssessment, transitionAssessment } from './ai-assessment-model.js';

// Tab-memory only. Deliberately no network, storage, cookies, query parsing or auth SDK.
const root = document.querySelector('#assessment-app');
let state = createAssessmentSession();

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

function button(label, action, { primary = false, disabled = false, text = false } = {}) {
  const node = element('button', label, text ? 'assessment-text-button' : `assessment-button${primary ? ' assessment-button-primary' : ''}`);
  node.type = 'button';
  node.disabled = disabled;
  node.addEventListener('click', () => dispatch(action));
  return node;
}

function heading(text) {
  const node = element('h2', text);
  node.tabIndex = -1;
  node.dataset.screenHeading = '';
  return node;
}

function actions(...nodes) {
  const group = element('div', undefined, 'assessment-buttons');
  group.append(...nodes);
  return group;
}

function minorActions(...nodes) {
  const group = element('div', undefined, 'assessment-minor-actions');
  group.append(...nodes);
  return group;
}

function restartButton() {
  return button('Restart assessment', { type: 'RESTART' }, { text: true });
}

function renderIntro() {
  root.append(heading('A snapshot of your current practice'), element('p', 'Answer twelve questions across three areas. Choose what is true today, then review and change any answer before seeing your results.'),
    element('p', 'This is a planning tool with fixed scoring. No account or contact details are needed.'),
    actions(button('Start assessment', { type: 'START' }, { primary: true })));
}

function renderQuestions() {
  const question = QUESTIONS[state.current];
  const dimension = DIMENSIONS.find(item => item.id === question.dimension);
  const meta = element('div', undefined, 'assessment-meta');
  meta.append(element('span', `Question ${state.current + 1} of ${QUESTIONS.length}`), element('span', dimension.title));
  const progress = element('progress', undefined, 'assessment-progress');
  progress.max = QUESTIONS.length;
  progress.value = state.answers.filter(value => value !== null).length;
  progress.setAttribute('aria-label', 'Questions answered');
  const title = heading(question.prompt);
  title.id = 'assessment-question-heading';
  const options = element('fieldset', undefined, 'assessment-options');
  options.setAttribute('aria-labelledby', title.id);
  const legend = element('legend', 'Choose your current level of practice', 'assessment-sr-only');
  options.append(legend);
  const next = button(state.returnToReview ? 'Return to review' : state.current === QUESTIONS.length - 1 ? 'Review answers' : 'Next question',
    { type: 'NEXT' }, { primary: true, disabled: state.answers[state.current] === null });
  for (const option of ANSWER_OPTIONS) {
    const label = element('label', undefined, 'assessment-option');
    const input = element('input');
    input.type = 'radio';
    input.name = 'assessment-answer';
    input.value = String(option.value);
    input.checked = state.answers[state.current] === option.value;
    input.setAttribute('aria-label', option.label);
    const copy = element('span');
    copy.append(element('strong', option.label), element('small', option.description));
    const points = element('span', String(option.value), 'assessment-points');
    points.setAttribute('aria-hidden', 'true');
    label.append(input, copy, points);
    input.addEventListener('change', () => {
      state = transitionAssessment(state, { type: 'CHOOSE', value: option.value });
      // Keep the existing radio group and focus for native keyboard navigation.
      next.disabled = false;
      progress.value = state.answers.filter(value => value !== null).length;
    });
    options.append(label);
  }
  root.append(meta, progress, title, options,
    actions(button('Back', { type: 'BACK' }, { disabled: state.current === 0 }), next),
    minorActions(button('Review progress', { type: 'REVIEW' }, { text: true }), restartButton()));
}

function renderReview() {
  const missing = state.answers.filter(value => value === null).length;
  root.append(heading('Review your answers'), element('p', missing ? `${missing} ${missing === 1 ? 'question still needs' : 'questions still need'} an answer.` : 'All twelve questions are answered. You can change any answer before viewing your results.'));
  const list = element('ol', undefined, 'assessment-review');
  QUESTIONS.forEach((question, index) => {
    const answer = ANSWER_OPTIONS.find(option => option.value === state.answers[index]);
    const item = element('li');
    item.append(element('p', `${index + 1}. ${question.prompt}`));
    const row = element('div', undefined, 'assessment-review-answer');
    row.append(element('span', answer ? `${answer.label} · ${answer.value} points` : 'Unanswered'),
      button(`${answer ? 'Edit' : 'Answer'} question ${index + 1}`, { type: 'EDIT', index }, { text: true }));
    item.append(row);
    list.append(item);
  });
  root.append(list, actions(button('See my results', { type: 'RESULT' }, { primary: true, disabled: missing > 0 })), minorActions(restartButton()));
}

function renderResults() {
  const report = scoreAssessment(state.answers);
  const score = element('div', `${report.total} / ${report.maximum}`, 'assessment-score');
  score.dataset.totalScore = '';
  score.setAttribute('aria-label', `Total score: ${report.total} out of ${report.maximum}`);
  root.append(heading('Your readiness snapshot'), score, element('h3', report.stage.label), element('p', report.stage.description),
    element('p', 'Use the areas below to plan a next step. These suggestions do not enroll you in a course, create an order, or grant paid access.'));
  for (const dimension of report.dimensions) {
    const area = element('section', undefined, 'assessment-report-area');
    if (report.priorities.includes(dimension.id)) area.append(element('span', 'A place to start', 'assessment-priority'));
    area.append(element('h3', dimension.title), element('p', `${dimension.score} / ${dimension.maximum}`, 'assessment-report-score'), element('p', dimension.nextStep));
    const link = element('a', dimension.offering.label);
    link.href = dimension.offering.href;
    area.append(link);
    root.append(area);
  }
  root.append(actions(button('Review my answers', { type: 'REVIEW' }, { primary: true })), minorActions(restartButton()));
}

function renderReset() {
  const panel = element('section', undefined, 'assessment-reset');
  panel.append(heading('Restart this assessment?'), element('p', 'This clears only the answers in this assessment. Your existing account and tools are not changed.'),
    actions(button('Keep my answers', { type: 'CANCEL_RESTART' }, { primary: true }), button('Clear answers and restart', { type: 'CLEAR_RESTART' })));
  root.append(panel);
}

function render(focus = true) {
  root.replaceChildren();
  if (state.restarting) renderReset();
  else if (state.screen === 'intro') renderIntro();
  else if (state.screen === 'questions') renderQuestions();
  else if (state.screen === 'review') renderReview();
  else renderResults();
  if (focus) root.querySelector('[data-screen-heading]')?.focus();
}

function dispatch(action) {
  try {
    state = transitionAssessment(state, action);
    render();
  } catch {
    root.querySelector('[role="alert"]')?.remove();
    const message = element('p', 'This step could not be completed. Check your answers, try again, or restart the assessment.', 'assessment-error');
    message.setAttribute('role', 'alert');
    root.append(message);
  }
}

if (root) render(false);
