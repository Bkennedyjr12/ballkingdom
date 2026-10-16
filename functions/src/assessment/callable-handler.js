import { createAssessmentService } from './service.js';

export const ASSESSMENT_WEB_APP_ID = '1:78885961453:web:9f7beee5425137768a96e4';
const messages = Object.freeze({
  ASSESSMENT_DISABLED: ['failed-precondition', 'Account saving is not connected.'],
  ASSESSMENT_AUTH_REQUIRED: ['unauthenticated', 'Sign in with a current verified account before continuing.'],
  ASSESSMENT_INPUT_INVALID: ['invalid-argument', 'Check the assessment and selected account action.'],
  ASSESSMENT_NOT_FOUND: ['not-found', 'Assessment was not found.'],
  ASSESSMENT_RATE_LIMITED: ['resource-exhausted', 'Account actions are temporarily limited. Wait a minute and retry.'],
  ASSESSMENT_CAPACITY: ['resource-exhausted', 'Your account holds 100 assessments. Delete an older result to save another.'],
  ASSESSMENT_RETRY_CONFLICT: ['failed-precondition', 'The saved attempt has different answers. Start a new save attempt.'],
  ASSESSMENT_ALREADY_DELETED: ['failed-precondition', 'This assessment was deleted. Start a new assessment to save again.'],
});

// Dependency injection permits verification without live Auth users or database records.
export function createAssessmentCallable({ enabled = false, auth, repository, now, ErrorClass = Error } = {}) {
  const service = createAssessmentService({ enabled, repository, now, authenticateRequest: async request => {
    if (!request?.auth?.uid || request.app?.appId !== ASSESSMENT_WEB_APP_ID
      || request.auth.token?.email_verified !== true || request.rawRequest?.get?.('origin') !== 'https://ballkingdom.com') return null;
    const current = await auth.getUser(request.auth.uid);
    const authTime = request.auth.token.auth_time;
    const validAfter = current.tokensValidAfterTime ? Date.parse(current.tokensValidAfterTime) : 0;
    if (current.uid !== request.auth.uid || current.disabled === true || current.emailVerified !== true
      || !Number.isSafeInteger(authTime) || authTime <= 0 || !Number.isFinite(validAfter) || authTime * 1000 < validAfter) return null;
    return { uid: current.uid, appCheckValid: true };
  } });
  return async request => {
    try {
      const input = request?.data;
      if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).length !== 2
        || !Object.hasOwn(input, 'action') || !Object.hasOwn(input, 'payload') || !['save', 'get', 'list', 'delete'].includes(input.action)) {
        throw Object.assign(new Error(), { code: 'ASSESSMENT_INPUT_INVALID' });
      }
      return await service[input.action === 'delete' ? 'remove' : input.action](input.payload, request);
    } catch (error) {
      const [code, message] = messages[error?.code] ?? ['unavailable', 'This account action could not be confirmed. Keep this tab open and retry.'];
      // Fixed messages only. Never log user payloads, tokens, emails or provider errors.
      throw new ErrorClass(code, message);
    }
  };
}
