import { normalizeWhatsAppNumber, buildWhatsAppUrl } from './whatsapp';

describe('whatsapp helper', () => {
  it('replaces a leading 0 with +256 for Ugandan numbers', () => {
    expect(normalizeWhatsAppNumber('0771234567')).toBe('+256771234567');
  });

  it('builds a WhatsApp link using the normalized Guarantor number', () => {
    expect(buildWhatsAppUrl('0771234567', 'hello guarantor')).toBe(
      'https://wa.me/256771234567?text=hello%20guarantor'
    );
  });
});
