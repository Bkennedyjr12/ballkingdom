import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../../src/index.js',import.meta.url),'utf8');
test('public email sign-in transport explicitly permits invocation while retaining App Check',()=>{const block=source.split('export const requestPilotSignInLink = onCall({')[1].split('}, async request')[0];assert.match(block,/invoker:\s*['"]public['"]/);assert.match(block,/enforceAppCheck:true/);});
