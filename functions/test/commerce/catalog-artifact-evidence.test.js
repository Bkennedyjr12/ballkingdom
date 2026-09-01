import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile, stat} from 'node:fs/promises';
import {getConfiguredCommerceItem} from '../../src/commerce/catalog.js';

const ARTIFACT_URL = new URL('../../../home-inspection-guide/public/assets/guide.pdf', import.meta.url);

test('configured artifact identity matches the independently read source file', async () => {
  const item = getConfiguredCommerceItem('home-inspection-study-guide');
  const [bytes, details] = await Promise.all([readFile(ARTIFACT_URL), stat(ARTIFACT_URL)]);
  assert.equal(details.size, item.artifact.exactBytes);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), item.artifact.sha256);
  assert.equal(createHash('md5').update(bytes).digest('base64'), item.artifact.md5Hash);
  assert.equal(item.sourceEvidence.reviewedAt, '2026-08-30');
});

test('records the dated tax source, California confirmation, and nationwide owner-approved risk', () => {
  const item = getConfiguredCommerceItem('home-inspection-study-guide');
  assert.equal(item.sourceEvidence.taxSource.publisher, 'California Department of Tax and Fee Administration');
  assert.equal(item.sourceEvidence.taxSource.publication, 'Publication 109 — Nontaxable Sales');
  assert.equal(item.sourceEvidence.taxSource.accessedAt, '2026-08-30');
  assert.equal(item.sourceEvidence.taxSource.url, 'https://cdtfa.ca.gov/formspubs/pub109/nontaxable-sales.htm');
  assert.equal(item.delivery, 'electronic_only');
  assert.equal(item.physicalCopyIncluded, false);
  assert.equal(item.tax.quickBooksTaxCode, 'NON');
  assert.equal(item.tax.accountantVerified, true);
  assert.equal(item.tax.geographicRestriction, 'none_owner_approved');
  assert.equal(item.tax.scope, 'Nationwide electronic-only delivery with no tangible copy or storage media');
  assert.equal(item.release.fulfillmentRuntimeVerified, true);
  assert.equal(item.active, false);
  assert.equal(item.release.deployApproved, false);
});
