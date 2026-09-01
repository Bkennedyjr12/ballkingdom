const EXPECTED_COMPANY_NAME='The Ballers Kingdom';

function healthError(code='QBO_HEALTH_UNAVAILABLE') {
  const error=new Error('QuickBooks commerce health verification failed');
  error.code=code;
  return error;
}

export async function runQuickBooksCommerceHealth({credentialCoordinator,createClient}={}) {
  if (!credentialCoordinator?.getHealthCredentials || typeof createClient !== 'function') {
    throw new TypeError('QuickBooks commerce health dependencies are required');
  }
  const credentials=await credentialCoordinator.getHealthCredentials();
  if (credentials?.credentialBindingPublished !== true
    || credentials?.refreshContinuityVerified !== true
    || typeof credentials.rotationPersisted !== 'boolean'
    || credentials?.realmBound !== true
    || typeof credentials.accessToken !== 'string' || credentials.accessToken.length < 1
    || typeof credentials.realmId !== 'string' || credentials.realmId.length < 1) {
    throw healthError();
  }
  const company=await createClient({
    accessToken:credentials.accessToken,
    realmId:credentials.realmId,
  }).getCompanyInfo();
  if (company?.companyName !== EXPECTED_COMPANY_NAME) throw healthError('QBO_COMPANY_MISMATCH');
  return Object.freeze({
    status:'healthy',credentialBindingPublished:true,refreshContinuityVerified:true,
    rotationPersisted:credentials.rotationPersisted,
    realmVerified:true,companyVerified:true,
  });
}
