import { describeNotificationEvent, getLocalNotificationId } from './notifications';
import { getOrderSoundEnabled } from './notificationSettings';

describe('getOrderSoundEnabled', () => {
  it('enables order alerts unless the user explicitly opted out', () => {
    localStorage.removeItem('cashhub-order-sound:seller-123');
    expect(getOrderSoundEnabled('seller-123')).toBe(true);

    localStorage.setItem('cashhub-order-sound:seller-123', 'false');
    expect(getOrderSoundEnabled('seller-123')).toBe(false);
  });
});

describe('getLocalNotificationId', () => {
  it('returns a stable positive Android notification id for an event', () => {
    const id = getLocalNotificationId('order-123');

    expect(id).toBeGreaterThan(0);
    expect(id).toBeLessThan(2147483647);
    expect(getLocalNotificationId('order-123')).toBe(id);
  });
});

describe('describeNotificationEvent', () => {
  it('describes a product order with its stable event id', () => {
    expect(describeNotificationEvent({
      id: 'order-123',
      type: 'new_order',
      body: 'New order from Jane',
      order: { id: '123', buyerName: 'Jane' },
    })).toEqual({
      id: 'order-123',
      title: 'New order received',
      body: 'New order from Jane',
    });
  });

  it('describes transaction status updates', () => {
    expect(describeNotificationEvent({
      id: 'withdrawal-status-123',
      type: 'transaction_update',
      title: 'Withdrawal approved',
      body: 'Your withdrawal was approved.',
    })).toEqual({
      id: 'withdrawal-status-123',
      title: 'Withdrawal approved',
      body: 'Your withdrawal was approved.',
    });
  });

  it('describes deposit submissions for administrators', () => {
    expect(describeNotificationEvent({
      id: 'deposit-123',
      type: 'new_deposit',
      title: 'Deposit received',
      body: 'Jane deposited UGX 52,000',
    })).toEqual({
      id: 'deposit-123',
      title: 'Deposit received',
      body: 'Jane deposited UGX 52,000',
    });
  });
});
