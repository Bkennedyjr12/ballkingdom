const SERVICE_TYPES = new Set(['training', 'consulting', 'inspection']);
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DAY_MS = 24 * 60 * 60 * 1000;

function asDate(value, fieldName) {
  const date = value?.toDate instanceof Function ? value.toDate() : new Date(value);
  if (Number.isNaN(date.getTime())) throw new TypeError(`${fieldName} must be a valid date`);
  return date;
}

function requiredText(value, fieldName, maxLength = 200) {
  const result = String(value ?? '').trim();
  if (!result || result.length > maxLength) throw new TypeError(`${fieldName} is invalid`);
  return result;
}

export function validateAppointment(data) {
  if (!data || typeof data !== 'object') throw new TypeError('appointment is required');
  const serviceType = String(data.serviceType ?? '').trim().toLowerCase();
  if (!SERVICE_TYPES.has(serviceType)) throw new TypeError('serviceType is invalid');
  const customerEmail = String(data.customerEmail ?? '').trim().toLowerCase();
  if (!EMAIL_PATTERN.test(customerEmail) || customerEmail.length > 254) {
    throw new TypeError('customerEmail is invalid');
  }
  const amountCents = data.amountCents == null ? null : data.amountCents;
  if (serviceType !== 'training' && (!Number.isInteger(amountCents) || amountCents <= 0)) {
    throw new TypeError('amountCents must be a positive integer for consulting and inspection');
  }
  if (serviceType === 'training' && amountCents != null && (!Number.isInteger(amountCents) || amountCents <= 0)) {
    throw new TypeError('amountCents must be a positive integer when supplied');
  }
  return {
    serviceType,
    serviceName: requiredText(data.serviceName, 'serviceName'),
    customerName: requiredText(data.customerName, 'customerName'),
    customerEmail,
    startsAt: asDate(data.startsAt, 'startsAt'),
    amountCents,
    currency: String(data.currency ?? 'USD').trim().toUpperCase() || 'USD',
    status: String(data.status ?? '').trim().toLowerCase(),
  };
}

export function isApprovalDue(data, now = new Date()) {
  const appointment = validateAppointment(data);
  const current = asDate(now, 'now');
  const millisecondsUntilStart = appointment.startsAt.getTime() - current.getTime();
  return appointment.status === 'accepted' && millisecondsUntilStart > 0 && millisecondsUntilStart <= DAY_MS;
}

export function buildInvoiceRequest(appointment) {
  const normalized = validateAppointment(appointment);
  const useCatalogPrice = normalized.serviceType === 'training' && normalized.amountCents == null;
  return {
    serviceType: normalized.serviceType,
    itemName: normalized.serviceName,
    description: normalized.serviceName,
    amount: useCatalogPrice ? null : normalized.amountCents / 100,
    useCatalogPrice,
  };
}
