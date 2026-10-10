import test from 'node:test';
import assert from 'node:assert/strict';

const model = await import('../assets/js/ai-assessment-model.js').catch(() => ({}));

test('native assessment computes a complete report from twelve bounded answers', () => {
  assert.equal(typeof model.scoreAssessment, 'function', 'native scoring is implemented');
  const result = model.scoreAssessment([0, 1, 2, 3, 3, 2, 1, 0, 1, 1, 2, 2]);
  assert.equal(result.total, 18);
  assert.equal(result.maximum, 36);
  assert.deepEqual(result.dimensions.map(({ score, maximum }) => [score, maximum]), [[6, 12], [6, 12], [6, 12]]);
  assert.equal(result.stage.id, 'pilot');
});

test('score boundaries choose the disclosed stage and preserve zero as a valid answer', () => {
  assert.equal(typeof model.scoreAssessment, 'function');
  for (const [answers, total, stage] of [
    [Array(12).fill(0), 0, 'basics'],
    [[3, 3, 3, 2, 0, 0, 0, 0, 0, 0, 0, 0], 11, 'basics'],
    [[3, 3, 3, 3, 0, 0, 0, 0, 0, 0, 0, 0], 12, 'pilot'],
    [[3, 3, 3, 3, 3, 3, 3, 2, 0, 0, 0, 0], 23, 'pilot'],
    [[3, 3, 3, 3, 3, 3, 3, 3, 0, 0, 0, 0], 24, 'practice'],
    [Array(12).fill(3), 36, 'practice'],
  ]) {
    const result = model.scoreAssessment(answers);
    assert.equal(result.total, total);
    assert.equal(result.stage.id, stage);
  }
});

test('incomplete and malformed answers never produce a report', () => {
  assert.equal(typeof model.scoreAssessment, 'function');
  for (const answers of [[], Array(11).fill(0), Array(13).fill(0), Array(12).fill(null), Array(12).fill('3'), Array(12).fill(4), Array(12).fill(-1), Array(12).fill(1.5), Array(12).fill(NaN), Array(12), { uid: 'synthetic', answers: Array(12).fill(3) }]) {
    assert.throws(() => model.scoreAssessment(answers), { code: 'ASSESSMENT_ANSWERS_INVALID' });
  }
});

test('next requires an answer, back retains it and review edits return to review', () => {
  assert.equal(typeof model.transitionAssessment, 'function');
  let state = model.transitionAssessment(model.createAssessmentSession(), { type: 'START' });
  assert.throws(() => model.transitionAssessment(state, { type: 'NEXT' }), { code: 'ASSESSMENT_ANSWER_REQUIRED' });
  state = model.transitionAssessment(state, { type: 'CHOOSE', value: 0 });
  state = model.transitionAssessment(state, { type: 'NEXT' });
  assert.equal(state.current, 1);
  state = model.transitionAssessment(state, { type: 'BACK' });
  assert.equal(state.current, 0);
  assert.equal(state.answers[0], 0);
  state = model.transitionAssessment(state, { type: 'REVIEW' });
  assert.throws(() => model.transitionAssessment(state, { type: 'RESULT' }), { code: 'ASSESSMENT_ANSWERS_INVALID' });
  state = model.transitionAssessment(state, { type: 'EDIT', index: 0 });
  state = model.transitionAssessment(state, { type: 'CHOOSE', value: 2 });
  state = model.transitionAssessment(state, { type: 'NEXT' });
  assert.equal(state.screen, 'review');
  assert.equal(state.answers[0], 2);
});

test('restart can be cancelled and confirmed restart clears only assessment state', () => {
  assert.equal(typeof model.transitionAssessment, 'function');
  let state = model.transitionAssessment(model.createAssessmentSession(), { type: 'START' });
  state = model.transitionAssessment(state, { type: 'CHOOSE', value: 3 });
  const before = state;
  state = model.transitionAssessment(state, { type: 'RESTART' });
  state = model.transitionAssessment(state, { type: 'CANCEL_RESTART' });
  assert.deepEqual(state.answers, before.answers);
  state = model.transitionAssessment(state, { type: 'RESTART' });
  state = model.transitionAssessment(state, { type: 'CLEAR_RESTART' });
  assert.equal(state.current, 0);
  assert.equal(state.screen, 'questions');
  assert.deepEqual(state.answers, Array(12).fill(null));
  assert.equal(before.answers[0], 3, 'transitions must not mutate a prior state');
});

test('question sequence finishes at review, then results remain editable', () => {
  assert.equal(typeof model.transitionAssessment, 'function');
  let state = model.transitionAssessment(model.createAssessmentSession(), { type: 'START' });
  for (let i = 0; i < 12; i += 1) {
    state = model.transitionAssessment(state, { type: 'CHOOSE', value: 3 });
    state = model.transitionAssessment(state, { type: 'NEXT' });
  }
  assert.equal(state.screen, 'review');
  state = model.transitionAssessment(state, { type: 'RESULT' });
  assert.equal(state.screen, 'results');
  state = model.transitionAssessment(state, { type: 'REVIEW' });
  state = model.transitionAssessment(state, { type: 'EDIT', index: 11 });
  state = model.transitionAssessment(state, { type: 'CHOOSE', value: 0 });
  state = model.transitionAssessment(state, { type: 'NEXT' });
  assert.equal(model.scoreAssessment(state.answers).total, 33);
});
