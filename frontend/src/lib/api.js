import { Capacitor } from '@capacitor/core';

const NATIVE_API_URL = 'https://cash-hub.onrender.com';

const ENV_API_URL = (process.env.REACT_APP_BACKEND_URL || '').trim().replace(/\/+$/, '');

const LOOPBACK_URL = /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:\d+)?$/i;

const isLoopback = (url) => LOOPBACK_URL.test(url);

export const API_URL = Capacitor.isNativePlatform()
  ? (ENV_API_URL && !isLoopback(ENV_API_URL) ? ENV_API_URL : NATIVE_API_URL)
  : (ENV_API_URL || (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:8000'));