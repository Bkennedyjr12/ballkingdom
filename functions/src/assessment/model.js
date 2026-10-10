// Original Ballers Kingdom assessment. Portable: no browser, provider or storage APIs.
export const ASSESSMENT_VERSION = 'bk-ai-readiness-v1';

export const DIMENSIONS = Object.freeze([
  Object.freeze({
    id: 'vision', title: 'Vision and leadership',
    nextStep: 'Choose one useful task, name its owner, and write down what a better outcome would look like.',
    offering: Object.freeze({ label: 'Explore consulting options', href: 'ee-venture.html' }),
  }),
  Object.freeze({
    id: 'people', title: 'People and capability',
    nextStep: 'Practice a low-risk task together. Compare the output with your own work and share what needed checking.',
    offering: Object.freeze({ label: 'Explore development tools', href: 'growth.html' }),
  }),
  Object.freeze({
    id: 'systems', title: 'Systems and data',
    nextStep: 'Map the information and permissions a pilot needs. Add a human review and record errors before expanding it.',
    offering: Object.freeze({ label: 'Browse the public catalog', href: 'products.html' }),
  }),
]);

export const QUESTIONS = Object.freeze([
  ['vision-goal', 'vision', 'Can you name one specific job where AI could help and how you would judge improvement?'],
  ['vision-owner', 'vision', 'Is someone responsible for choosing AI tools and reviewing the outcome?'],
  ['vision-boundaries', 'vision', 'Have you written down tasks AI may support and decisions that stay with a person?'],
  ['vision-review', 'vision', 'Do you revisit your AI priorities using lessons from earlier attempts?'],
  ['people-basics', 'people', 'Can people using AI explain its limits and check an output before relying on it?'],
  ['people-practice', 'people', 'Have you set aside time to practice an approved AI tool on a low-risk task?'],
  ['people-support', 'people', 'Do users know who to ask when an AI output is unclear or a tool fails?'],
  ['people-sharing', 'people', 'Do you share useful examples and lessons so others can repeat the approach?'],
  ['systems-data', 'systems', 'Do you know which information is safe to put into an AI tool?'],
  ['systems-access', 'systems', 'Are access permissions matched to the job and removed when no longer needed?'],
  ['systems-workflow', 'systems', 'Have you defined a repeatable workflow with a human check before an AI-assisted output is used?'],
  ['systems-measure', 'systems', 'Do you record whether that workflow saves time, improves quality, or introduces errors?'],
].map(([id, dimension, prompt]) => Object.freeze({ id, dimension, prompt })));

export const ANSWER_OPTIONS = Object.freeze([
  Object.freeze({ value: 0, label: 'Not yet', description: 'We have not put this in place.' }),
  Object.freeze({ value: 1, label: 'Starting', description: 'We are exploring it or trying it occasionally.' }),
  Object.freeze({ value: 2, label: 'In practice', description: 'We use it, but it still needs consistency.' }),
  Object.freeze({ value: 3, label: 'Consistent and reviewed', description: 'We use it regularly and check how it is working.' }),
]);

const STAGES = Object.freeze([
  Object.freeze({ id: 'basics', label: 'Build the basics', description: 'Start with a clear task, a safe information boundary, and a person who checks the result.' }),
  Object.freeze({ id: 'pilot', label: 'Test a focused pilot', description: 'Choose one repeatable task. Agree on a human check and compare the outcome before expanding it.' }),
  Object.freeze({ id: 'practice', label: 'Improve a working practice', description: 'Review what works, document the limits, and measure the next change before scaling it.' }),
]);

function assessmentError(code, message) {
  return Object.assign(new Error(message), { code });
}

function validAnswer(value) {
  return Number.isInteger(value) && value >= 0 && value <= 3;
}

export function scoreAssessment(answers) {
  if (!Array.isArray(answers) || answers.length !== QUESTIONS.length || Array.from(answers).some(value => !validAnswer(value))) {
    throw assessmentError('ASSESSMENT_ANSWERS_INVALID', 'Answer all twelve questions with a choice from zero to three.');
  }
  const total = answers.reduce((sum, value) => sum + value, 0);
  const dimensions = DIMENSIONS.map(dimension => Object.freeze({
    ...dimension,
    score: QUESTIONS.reduce((sum, question, index) => sum + (question.dimension === dimension.id ? answers[index] : 0), 0),
    maximum: 12,
  }));
  const lowest = Math.min(...dimensions.map(dimension => dimension.score));
  return Object.freeze({
    schemaVersion: ASSESSMENT_VERSION, total, maximum: 36,
    stage: STAGES[total < 12 ? 0 : total < 24 ? 1 : 2],
    dimensions: Object.freeze(dimensions),
    priorities: Object.freeze(dimensions.filter(dimension => dimension.score === lowest).map(dimension => dimension.id)),
  });
}

function session(value) {
  return Object.freeze({ ...value, answers: Object.freeze([...value.answers]) });
}

export function createAssessmentSession() {
  return session({ answers: Array(QUESTIONS.length).fill(null), current: 0, screen: 'intro', returnToReview: false, restarting: false });
}

export function transitionAssessment(state, action) {
  if (!action || typeof action.type !== 'string' || (state.restarting && !['CANCEL_RESTART', 'CLEAR_RESTART'].includes(action.type))) {
    throw assessmentError('ASSESSMENT_ACTION_INVALID', 'This assessment action is unavailable.');
  }
  const next = { ...state, answers: [...state.answers] };
  switch (action.type) {
    case 'START':
      if (state.screen !== 'intro') break;
      return session({ ...next, screen: 'questions' });
    case 'CHOOSE':
      if (state.screen !== 'questions' || !validAnswer(action.value)) break;
      next.answers[state.current] = action.value;
      return session(next);
    case 'NEXT':
      if (state.screen !== 'questions') break;
      if (!validAnswer(state.answers[state.current])) throw assessmentError('ASSESSMENT_ANSWER_REQUIRED', 'Choose an answer before continuing.');
      if (state.returnToReview || state.current === QUESTIONS.length - 1) return session({ ...next, screen: 'review', returnToReview: false });
      return session({ ...next, current: state.current + 1 });
    case 'BACK':
      if (state.screen !== 'questions' || state.current === 0) break;
      return session({ ...next, current: state.current - 1 });
    case 'REVIEW':
      if (!['questions', 'results'].includes(state.screen)) break;
      return session({ ...next, screen: 'review', returnToReview: false });
    case 'EDIT':
      if (state.screen !== 'review' || !Number.isInteger(action.index) || action.index < 0 || action.index >= QUESTIONS.length) break;
      return session({ ...next, screen: 'questions', current: action.index, returnToReview: true });
    case 'RESULT':
      if (state.screen !== 'review') break;
      scoreAssessment(state.answers);
      return session({ ...next, screen: 'results' });
    case 'RESTART':
      if (state.screen === 'intro') break;
      return session({ ...next, restarting: true });
    case 'CANCEL_RESTART':
      if (!state.restarting) break;
      return session({ ...next, restarting: false });
    case 'CLEAR_RESTART':
      if (!state.restarting) break;
      return session({ ...createAssessmentSession(), screen: 'questions' });
    default:
      break;
  }
  throw assessmentError('ASSESSMENT_ACTION_INVALID', 'This assessment action is unavailable.');
}
