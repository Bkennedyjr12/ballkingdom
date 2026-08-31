const MAX_JSON_BYTES = 16 * 1024;
const ORDER_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const GRANT = /^[A-Za-z0-9_-]{43}$/;
const ALLOWED_ORIGINS = Object.freeze(new Set([
  'https://ballkingdom.com',
  'https://ballkingdom-com.web.app',
]));
const ALLOWED_REQUEST_HEADERS = Object.freeze(new Set([
  'authorization','content-type','x-firebase-appcheck',
]));

function header(request,name) {
  const value=request?.headers?.[name] ?? request?.headers?.[name.toLowerCase()];
  return typeof value === 'string' ? value : '';
}

function reply(response,status,body='') {
  if (typeof response.status === 'function') response.status(status);
  else response.statusCode=status;
  if (status === 204 && typeof response.end === 'function') response.end();
  else if (typeof response.send === 'function') response.send(body);
  else response.end(body);
}

function setCors(response,origin) {
  response.setHeader('Access-Control-Allow-Origin',origin);
  response.setHeader('Vary','Origin');
}

function validOrigin(request) {
  const origin=header(request,'origin');
  return ALLOWED_ORIGINS.has(origin) ? origin : null;
}

function validPreflight(request) {
  if (header(request,'access-control-request-method') !== 'POST') return false;
  const requested=header(request,'access-control-request-headers')
    .split(',').map(value=>value.trim().toLowerCase()).filter(Boolean);
  return requested.length > 0 && requested.every(value=>ALLOWED_REQUEST_HEADERS.has(value));
}

function parseRequest(request) {
  if (header(request,'content-type').trim().toLowerCase() !== 'application/json') return null;
  if (!Buffer.isBuffer(request.rawBody)
    || request.rawBody.byteLength < 2 || request.rawBody.byteLength > MAX_JSON_BYTES) return null;
  let parsed;
  try {
    const text=new TextDecoder('utf-8',{fatal:true}).decode(request.rawBody);
    parsed=JSON.parse(text);
  } catch {
    return null;
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const keys=Object.keys(parsed).sort();
  if (keys.length !== 2 || keys[0] !== 'grant' || keys[1] !== 'orderHandle'
    || typeof parsed.orderHandle !== 'string' || !ORDER_ID.test(parsed.orderHandle)
    || typeof parsed.grant !== 'string' || !GRANT.test(parsed.grant)) return null;
  return Object.freeze({orderId:parsed.orderHandle,grant:parsed.grant});
}

export function readFirebaseBearerToken(request) {
  const match=/^Bearer ([A-Za-z0-9._~-]+)$/.exec(header(request,'authorization'));
  return match?.[1] ?? null;
}

export async function verifyAuthoritativeFirebaseUser({auth,idToken,expectedUid} = {}) {
  if (!auth?.verifyIdToken || !auth?.getUser || typeof idToken !== 'string') {
    throw Object.assign(new Error('Authentication is required'),{code:'AUTH_REQUIRED'});
  }
  try {
    const decoded=await auth.verifyIdToken(idToken,true);
    if (typeof decoded?.uid !== 'string' || decoded.uid.length < 1 || decoded.uid.length > 128
      || (expectedUid !== undefined && decoded.uid !== expectedUid)) throw new Error('Invalid identity');
    const user=await auth.getUser(decoded.uid);
    if (user?.uid !== decoded.uid || user.disabled === true || user.emailVerified !== true) {
      throw new Error('Invalid user');
    }
    return Object.freeze({uid:decoded.uid});
  } catch {
    throw Object.assign(new Error('Authentication is no longer valid'),{code:'AUTH_REQUIRED'});
  }
}

function appCheckToken(request) {
  const value=header(request,'x-firebase-appcheck');
  return /^[A-Za-z0-9._~-]+$/.test(value) ? value : null;
}

function createSafeDownloadResponse(response,onStart) {
  return new Proxy(response,{
    get(target,property,receiver) {
      if (property === 'setHeader') return () => {
        onStart();
        target.setHeader('Content-Type','application/pdf');
        target.setHeader('Content-Disposition',
          'attachment; filename="Home Inspection Study Guide.pdf"');
        target.setHeader('Cache-Control','private, no-store, max-age=0');
        target.setHeader('X-Content-Type-Options','nosniff');
        return target;
      };
      const value=Reflect.get(target,property,receiver);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}

export function createDownloadHttpHandler({auth,appCheck,fulfillment} = {}) {
  if (!auth?.verifyIdToken || !auth?.getUser || !appCheck?.verifyToken
    || !fulfillment?.redeemDownloadGrant) {
    throw new TypeError('Download HTTP dependencies are required');
  }
  return async function downloadHttpHandler(request,response) {
    const origin=validOrigin(request);
    if (!origin) { reply(response,403,'Forbidden'); return; }
    if (request.method === 'OPTIONS') {
      if (!validPreflight(request)) { reply(response,403,'Forbidden'); return; }
      setCors(response,origin);
      response.setHeader('Access-Control-Allow-Methods','POST');
      response.setHeader('Access-Control-Allow-Headers',
        'Authorization, Content-Type, X-Firebase-AppCheck');
      reply(response,204);
      return;
    }
    if (request.method !== 'POST') { reply(response,403,'Forbidden'); return; }
    setCors(response,origin);
    const input=parseRequest(request);
    if (!input) { reply(response,400,'Invalid request'); return; }
    const idToken=readFirebaseBearerToken(request);
    if (!idToken) { reply(response,401,'Unauthorized'); return; }

    let authoritativeUser;
    try {
      authoritativeUser=await verifyAuthoritativeFirebaseUser({auth,idToken});
    } catch {
      reply(response,401,'Unauthorized');
      return;
    }

    const limitedUseToken=appCheckToken(request);
    if (!limitedUseToken) { reply(response,403,'Forbidden'); return; }
    let app;
    try {
      app=await appCheck.verifyToken(limitedUseToken,{consume:true});
      if (app?.alreadyConsumed === true || typeof app?.appId !== 'string' || app.appId.length < 1) {
        throw new Error('Invalid App Check token');
      }
    } catch {
      reply(response,403,'Forbidden');
      return;
    }

    let streamingStarted=false;
    const safeResponse=createSafeDownloadResponse(response,()=>{streamingStarted=true;});
    try {
      await fulfillment.redeemDownloadGrant(input,Object.freeze({
        auth:authoritativeUser,
        app:Object.freeze({appId:app.appId}),
        response:safeResponse,
      }));
    } catch {
      if (streamingStarted || response.destroyed || response.headersSent) {
        if (!response.destroyed && typeof response.destroy === 'function') response.destroy();
        return;
      }
      reply(response,404,'Not found');
    }
  };
}
