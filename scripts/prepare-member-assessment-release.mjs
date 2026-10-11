import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hostingHash } from './build-ai-readiness-overlay.mjs';

// Local preparation only. No provider calls, deployment, role or grant changes.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(root, 'output/member-assessment-release/public');
const read = path => readFileSync(resolve(root, path), 'utf8');
const baseline = JSON.parse(read('docs/operations/ai-readiness-live-baseline.json'));
function replaceOnce(source, before, after) {
  if (source.split(before).length !== 2) throw new Error('Candidate source changed: ' + before.slice(0, 80));
  return source.replace(before, after);
}
const paths = ['workouts.html', 'assets/js/workouts-app.js', 'assets/js/workouts-production-runtime.js'];
for (const path of paths) {
  const pinned = baseline.recoveredFiles.find(file => file.path === path);
  if (!pinned || hostingHash(Buffer.from(read(path))) !== pinned.hostingHash) throw new Error('Workout source drift: ' + path);
}
const changed = {};
let html = read('workouts.html');
html = replaceOnce(html, '</head>', '<link rel="stylesheet" href="assets/css/ai-assessment.css"><link rel="stylesheet" href="assets/css/member-assessment.css"></head>');
html = replaceOnce(html, '<main>', '<main><p class="planner-navigation"><a href="#member-assessments">AI assessment notebook</a></p>');
html = replaceOnce(html, 'assets/js/workouts-app.js?v=print-consistency-20261006', 'assets/js/workouts-app.js?v=assessment-account-20261010');
html = replaceOnce(html, '</main>', '<section id="member-assessments" class="assessment-account" hidden aria-label="AI assessment notebook"></section></main>');
changed['workouts.html'] = html;
let app = read('assets/js/workouts-app.js');
app = "import {installMemberAssessment} from './member-assessment-app.js';\nlet assessmentWidget=null;\n" + app;
app = replaceOnce(app, './workouts-production-runtime.js?v=signin-feedback-20261006', './workouts-production-runtime.js?v=assessment-account-20261010');
app = replaceOnce(app, 'runtime=await productionRuntime();', "runtime=await productionRuntime();try{assessmentWidget=installMemberAssessment({root:document.getElementById('member-assessments'),runtime,enabled:true});}catch{const panel=document.getElementById('member-assessments');panel.hidden=false;panel.textContent='Assessment saving is unavailable. Reload to retry; your workout notebook remains available.';}");
app += "\nwindow.addEventListener('pagehide',()=>assessmentWidget?.destroy());\n";
changed['assets/js/workouts-app.js'] = app;
let runtime = read('assets/js/workouts-production-runtime.js');
runtime = "import {createAssessmentAccountClient} from './member-assessment-app.js';\n" + runtime;
runtime = replaceOnce(runtime, 'trackingClient=null,now=', 'trackingClient=null,assessmentFactory=null,now=');
runtime = replaceOnce(runtime, 'if(trackingFactory)trackingClient=trackingFactory(app);', 'if(trackingFactory)trackingClient=trackingFactory(app);\n const assessmentAccount=assessmentFactory?assessmentFactory(app):null;');
runtime = replaceOnce(runtime, 'Object.freeze({...bridge,', 'Object.freeze({...bridge,assessmentAccount,');
runtime = replaceOnce(runtime, '\n }});\n}\nexport function friendlyError', "\n },assessmentFactory:app=>createAssessmentAccountClient({functions:functionsSdk.getFunctions(app,'us-west1'),httpsCallable:functionsSdk.httpsCallable})});\n}\nexport function friendlyError");
changed['assets/js/workouts-production-runtime.js'] = runtime;
for (const path of ['assets/js/member-assessment-app.js', 'assets/css/member-assessment.css', 'assets/js/ai-assessment-app.js']) changed[path] = read(path);
let guest = read('ai-assessment.html');
guest = replaceOnce(guest, 'Account saving and purchases are not connected. Results stay in this tab and reset when you reload, leave, or close it.', 'Guest results stay in this tab and reset when you reload, leave, or close it. To save by choice, start an assessment in your signed-in notebook. Purchases are not connected.');
guest = replaceOnce(guest, '<a href="privacy.html">Privacy policy</a>', '<a href="workouts.html#member-assessments">Open your member assessment notebook</a><br><a href="privacy.html">Privacy policy</a>');
changed['ai-assessment.html'] = guest;
let landing = read('ai-readiness.html');
landing = replaceOnce(landing, 'Take the assessment here on The Ballers Kingdom. Results stay in this tab; account saving and purchases await setup.', 'Take the guest assessment here. Its results stay in this tab. For optional account saving, start an assessment in your signed-in notebook. Purchases are not connected.');
landing = replaceOnce(landing, '<a class="btn btn-primary" href="ai-assessment.html">Try the native assessment</a>', '<a class="btn btn-primary" href="ai-assessment.html">Try the native assessment</a><p><a href="workouts.html#member-assessments">Open your member assessment notebook</a></p>');
changed['ai-readiness.html'] = landing;
let privacy = read('privacy.html');
privacy = replaceOnce(privacy, 'The assessment on ballkingdom.com uses fixed scoring', 'The guest assessment on ballkingdom.com uses fixed scoring');
privacy = replaceOnce(privacy, 'Account saving is not active in this release.', 'Optional member account saving is described below.');
privacy = replaceOnce(privacy, '<h2>Contact</h2>', '<h2>Optional assessment account saving</h2><p>The guest assessment keeps answers only in tab memory. In the signed-in notebook, answers are sent to our Firebase service only when you choose Save this result to my account. Saved answers and results are private to your account and retained until you delete them. Use Delete saved result to remove their answer record. Coaches cannot access assessment results through workout permissions. Minimal security and deletion receipts may remain to prevent duplicate retries; these contain no answers or scores. No assessment answers are sent to Base44, an AI provider, or QuickBooks. This feature does not create paid access.</p><h2>Contact</h2>');
changed['privacy.html'] = privacy;
const files = [];
for (const [path, source] of Object.entries(changed)) {
  const destination = resolve(out, path); mkdirSync(dirname(destination), { recursive: true }); writeFileSync(destination, source);
  files.push({ path: '/' + path, hostingHash: hostingHash(Buffer.from(source)) });
}
writeFileSync(resolve(out, '../candidate-plan.json'), JSON.stringify({ status: 'PREPARED_NOT_APPROVED', project: 'the-ballers-kingdom', site: 'ballkingdom-com', backend: 'assessmentAccount', files, requiredApprovals: ['new-assessment-runtime-IAM', 'new-callable-public-invocation'], forbiddenTargets: ['existing-functions', 'rules', 'DNS', 'other-hosting-sites', 'payment-providers'] }, null, 2) + '\n');
console.log('Prepared nine public paths in an ignored candidate; production and original workout source are unchanged.');
