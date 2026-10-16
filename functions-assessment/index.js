import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldPath, getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { createAssessmentRepository } from './generated/firestore-repository.js';
import { createAssessmentCallable } from './generated/callable-handler.js';

initializeApp();
let handler;
export const assessmentAccount = onCall({
  region: 'us-west1',
  serviceAccount: 'tbk-assessment-account@the-ballers-kingdom.iam.gserviceaccount.com',
  maxInstances: 2,
  concurrency: 20,
  timeoutSeconds: 30,
  memory: '256MiB',
  enforceAppCheck: true,
  cors: ['https://ballkingdom.com'],
  invoker: 'public',
}, request => {
  if (!handler) handler = createAssessmentCallable({
    enabled: process.env.BK_ASSESSMENT_ACCOUNT_ENABLED === 'true',
    auth: getAuth(),
    repository: createAssessmentRepository({ db: getFirestore(), documentIdField: FieldPath.documentId() }),
    ErrorClass: HttpsError,
  });
  return handler(request);
});
