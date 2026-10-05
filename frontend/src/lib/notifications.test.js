import { describeNotificationEvent } from './notifications';

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
});
