import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';

const isNative = () => Capacitor.isNativePlatform() && Capacitor.getPlatform() !== 'web';

export const ORDER_NOTIFICATION_CHANNEL_ID = 'cashhub-orders';
export const SILENT_NOTIFICATION_CHANNEL_ID = 'cashhub-silent';

let channelReady = null;

// Android requires a notification channel before anything can be posted.
const ensureChannel = async () => {
  if (channelReady) return channelReady;

  channelReady = (async () => {
    if (Capacitor.getPlatform() === 'android') {
      await Promise.all([
        LocalNotifications.createChannel({
          id: ORDER_NOTIFICATION_CHANNEL_ID,
          name: 'Orders',
          description: 'New product orders that need your attention.',
          importance: 4,
          visibility: 1,
          lights: true,
          lightColor: '#2C5530',
        }),
        LocalNotifications.createChannel({
          id: SILENT_NOTIFICATION_CHANNEL_ID,
          name: 'Other notifications',
          description: 'Notifications without sound.',
          importance: 2,
          visibility: 1,
          lights: false,
          vibration: false,
        }),
      ]);
    }
  })().catch((error) => {
    console.warn('Could not create notification channel', error);
  });

  return channelReady;
};

export const requestNotificationPermission = async () => {
  if (!isNative()) return 'unsupported';
  try {
    await ensureChannel();
    const current = await LocalNotifications.checkPermissions();
    if (current.display === 'granted') return 'granted';

    const asked = await LocalNotifications.requestPermissions();
    return asked.display;
  } catch (error) {
    console.warn('Could not request notification permission', error);
    return 'denied';
  }
};

// Android 13+ requires POST_NOTIFICATIONS, which Capacitor adds via the
// plugin manifest merge but is only granted at runtime.
export const showNativeNotification = async ({
  id,
  type,
  title,
  body,
  channelId = SILENT_NOTIFICATION_CHANNEL_ID,
}) => {
  if (!isNative()) return false;

  try {
    const permission = await requestNotificationPermission();
    if (permission !== 'granted') return false;

    await LocalNotifications.schedule({
      notifications: [
        {
          id: Math.floor(Date.now() % 2147483647),
          title,
          body,
          channelId,
          smallIcon: 'ic_stat_icon_config_sample',
          // Tapping the notification should open the app.
          extra: { id, type, notificationId: id },
          schedule: { at: new Date(Date.now() + 100) },
        },
      ],
    });
    return true;
  } catch (error) {
    console.warn('Could not show notification', error);
    return false;
  }
};

export const describeNotificationEvent = (data) => {
  const type = data?.type;

  if (type === 'new_order') {
    const buyer = data.order?.buyerName || 'a buyer';
    return {
      id: data.id || `order-${data.order?.id || Date.now()}`,
      title: data.title || 'New order received',
      body: data.body || `New order from ${buyer}`,
    };
  }

  if (type === 'new_deposit') {
    const name = data.deposit?.user_name || data.deposit?.userName || 'A member';
    const amount = Number(data.deposit?.amount || 0).toLocaleString();
    return {
      id: data.id || `deposit-${data.deposit?.id || Date.now()}`,
      title: data.title || 'Deposit received',
      body: data.body || `${name} deposited UGX ${amount}`,
    };
  }

  if (type === 'new_withdrawal') {
    const name = data.withdrawal?.user_name || data.withdrawal?.userName || 'A member';
    const amount = Number(data.withdrawal?.amount || 0).toLocaleString();
    return {
      id: data.id || `withdrawal-${data.withdrawal?.id || Date.now()}`,
      title: data.title || 'Withdrawal requested',
      body: data.body || `${name} requested UGX ${amount}`,
    };
  }

  if (type === 'new_loan') {
    const name = data.loan?.user_name || data.loan?.userName || 'A member';
    const amount = Number(data.loan?.amount || 0).toLocaleString();
    return {
      id: data.id || `loan-${data.loan?.id || Date.now()}`,
      title: data.title || 'Loan request',
      body: data.body || `${name} applied for UGX ${amount}`,
    };
  }

  if (type === 'transaction_update') {
    return {
      id: data.id || `transaction-${Date.now()}`,
      title: data.title || 'Transaction update',
      body: data.body || 'Your transaction has been updated.',
    };
  }

  if (type === 'announcement') {
    return {
      id: `announcement-${Date.now()}`,
      title: 'Group announcement',
      body: String(data.message || data.announcement?.message || 'New announcement from the group').slice(0, 200),
    };
  }

  return null;
};