const GRAPH_ROOT = 'https://graph.microsoft.com/v1.0';

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, character => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;',
  })[character]);
}

async function expectResponse(response, operation) {
  if (response.ok) return response;
  throw new Error(`${operation} failed with provider status ${response.status}`);
}

export function createGraphClient(config, fetchImpl = fetch) {
  const sender = String(config.sender).trim().toLowerCase();

  async function accessToken() {
    const body = new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: config.refreshToken,
      grant_type: 'refresh_token',
      scope: 'offline_access Mail.Send',
    });
    const response = await fetchImpl(`https://login.microsoftonline.com/${encodeURIComponent(config.tenantId)}/oauth2/v2.0/token`, {
      method: 'POST', headers: {'content-type':'application/x-www-form-urlencoded'}, body,
    });
    await expectResponse(response, 'Microsoft authentication');
    const token = await response.json();
    if (!token.access_token) throw new Error('Microsoft authentication returned no access token');
    if (token.refresh_token && config.onRefreshToken) await config.onRefreshToken(token.refresh_token);
    return token.access_token;
  }

  async function send(message) {
    const token = await accessToken();
    const response = await fetchImpl(`${GRAPH_ROOT}/me/sendMail`, {
      method: 'POST',
      headers: {authorization:`Bearer ${token}`,'content-type':'application/json'},
      body: JSON.stringify({message, saveToSentItems:true}),
    });
    await expectResponse(response, 'Microsoft email delivery');
    return {accepted:true};
  }

  return {
    async sendPilotAuthLink({to, link} = {}) {
      const recipient = String(to ?? '').trim().toLowerCase();
      let actionLink;
      try {
        actionLink = new URL(String(link ?? ''));
      } catch {
        throw new Error('Pilot authentication email input is invalid');
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)
        || recipient.length > 254
        || actionLink.protocol !== 'https:') {
        throw new Error('Pilot authentication email input is invalid');
      }
      return send({
        subject:'Your secure sign-in link — The Ballers Kingdom',
        body:{
          contentType:'HTML',
          content:`<p>Use this one-time secure link to sign in to The Ballers Kingdom:</p><p><a href="${escapeHtml(actionLink.href)}">Finish secure sign-in</a></p><p>If you did not request this link, you can ignore this message.</p>`,
        },
        toRecipients:[{emailAddress:{address:recipient}}],
      });
    },
    async sendConfirmation({to, customerName, serviceName, startsAt}) {
      const when = new Intl.DateTimeFormat('en-US', {
        dateStyle:'full', timeStyle:'short', timeZone:'America/Los_Angeles',
      }).format(new Date(startsAt));
      return send({
        subject:`Appointment confirmed — ${serviceName}`,
        body:{contentType:'HTML',content:`<p>Hello ${escapeHtml(customerName)},</p><p>Your <strong>${escapeHtml(serviceName)}</strong> appointment with The Ballers Kingdom is confirmed for ${escapeHtml(when)}.</p><p>We look forward to serving you.</p>`},
        toRecipients:[{emailAddress:{address:String(to).trim().toLowerCase()}}],
      });
    },
    async sendInvoice({to, customerName, invoiceNumber, pdf}) {
      return send({
        subject:`The Ballers Kingdom invoice ${invoiceNumber}`,
        body:{contentType:'HTML',content:`<p>Hello ${escapeHtml(customerName)},</p><p>Your approved invoice from The Ballers Kingdom is attached.</p>`},
        toRecipients:[{emailAddress:{address:String(to).trim().toLowerCase()}}],
        attachments:[{
          '@odata.type':'#microsoft.graph.fileAttachment',
          name:`Ballers-Kingdom-Invoice-${invoiceNumber}.pdf`,
          contentType:'application/pdf',
          contentBytes:Buffer.from(pdf).toString('base64'),
        }],
      });
    },
  };
}
