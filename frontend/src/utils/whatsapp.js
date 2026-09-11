export const normalizeWhatsAppNumber = (phone) => {
  if (!phone) return '';

  const digits = String(phone).replace(/[^\d]/g, '');
  if (!digits) return '';

  const normalized = digits.startsWith('0') ? `+256${digits.slice(1)}` : `+${digits}`;
  return normalized;
};

export const buildWhatsAppUrl = (phone, message = '') => {
  if (!phone) return null;

  const normalized = normalizeWhatsAppNumber(phone);
  const waNumber = normalized.replace(/^\+/, '');
  if (!waNumber) return null;

  return `https://wa.me/${waNumber}?text=${encodeURIComponent(message)}`;
};
