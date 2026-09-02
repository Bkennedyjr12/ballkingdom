import test from 'node:test';
import assert from 'node:assert/strict';
import {runQuickBooksCommerceHealth} from '../../src/commerce/quickbooks-commerce-health.js';

const healthyCredentials=Object.freeze({
  accessToken:'private-access',realmId:'private-realm',credentialBindingPublished:true,
  refreshContinuityVerified:true,rotationPersisted:true,realmBound:true,
});

test('returns only redacted health booleans after exact company verification',async()=>{
  const calls=[];
  const result=await runQuickBooksCommerceHealth({
    credentialCoordinator:{async getHealthCredentials(){calls.push('refresh');return healthyCredentials;}},
    createClient:credentials=>{calls.push(credentials);return {async getCompanyInfo(){return {companyName:'The Ballers Kingdom'};}};},
  });
  assert.deepEqual(result,{
    status:'healthy',credentialBindingPublished:true,refreshContinuityVerified:true,rotationPersisted:true,
    realmVerified:true,companyVerified:true,
  });
  assert.deepEqual(calls,['refresh',{
    accessToken:'private-access',realmId:'private-realm',requestTimeoutMs:60_000,
  }]);
  assert.doesNotMatch(JSON.stringify(result),/private-access|private-realm|token|The Ballers Kingdom/i);
});

test('accepts exact unchanged-token continuity without claiming a persisted rotation',async()=>{
  const result=await runQuickBooksCommerceHealth({
    credentialCoordinator:{async getHealthCredentials(){return {...healthyCredentials,rotationPersisted:false};}},
    createClient:()=>({async getCompanyInfo(){return {companyName:'The Ballers Kingdom'};}}),
  });
  assert.deepEqual(result,{
    status:'healthy',credentialBindingPublished:true,refreshContinuityVerified:true,
    rotationPersisted:false,realmVerified:true,companyVerified:true,
  });
});

test('fails closed before CompanyInfo when refresh continuity evidence is incomplete',async()=>{
  let companyReads=0;
  await assert.rejects(runQuickBooksCommerceHealth({
    credentialCoordinator:{async getHealthCredentials(){return {...healthyCredentials,refreshContinuityVerified:false};}},
    createClient:()=>({async getCompanyInfo(){companyReads+=1;}}),
  }),/health/i);
  assert.equal(companyReads,0);
});

test('fails closed for the wrong QuickBooks company without returning its name',async()=>{
  await assert.rejects(runQuickBooksCommerceHealth({
    credentialCoordinator:{async getHealthCredentials(){return healthyCredentials;}},
    createClient:()=>({async getCompanyInfo(){return {companyName:'Wrong Company'};}}),
  }),error=>error.code==='QBO_COMPANY_MISMATCH'&&!/Wrong Company/.test(error.message));
});
