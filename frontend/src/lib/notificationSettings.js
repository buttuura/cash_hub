export const ORDER_SOUND_SETTING_CHANGED = 'cashhub-order-sound-setting-changed';

export const getOrderSoundEnabled = (userId) => {
  if (!userId) return false;
  const setting = localStorage.getItem(`cashhub-order-sound:${userId}`);
  return setting === null || setting === 'true';
};

export const saveOrderSoundEnabled = (userId, enabled) => {
  if (!userId) return;
  localStorage.setItem(`cashhub-order-sound:${userId}`, String(enabled));
  window.dispatchEvent(new CustomEvent(ORDER_SOUND_SETTING_CHANGED, {
    detail: { userId, enabled },
  }));
};
