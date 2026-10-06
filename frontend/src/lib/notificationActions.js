import { API_URL } from './api';

export const acknowledgeOrderNotification = async (data) => {
  if (data?.type !== 'new_order' || !data.id) return;

  window.dispatchEvent(new Event('stop-order-notification-sound'));
  const accessToken = localStorage.getItem('access_token');
  if (!accessToken) return;

  try {
    const response = await fetch(
      `${API_URL}/api/notifications/${encodeURIComponent(data.id)}/read`,
      { method: 'POST', headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (!response.ok) {
      throw new Error(`Could not acknowledge order notification (${response.status})`);
    }
  } catch (error) {
    console.error('Unable to acknowledge order notification:', error);
  }
};
