import { Capacitor } from '@capacitor/core';

const NATIVE_API_URL = 'https://cash-hub.onrender.com';

export const API_URL = process.env.REACT_APP_BACKEND_URL || (
  Capacitor.isNativePlatform()
    ? NATIVE_API_URL
    : process.env.NODE_ENV === 'production'
      ? ''
      : 'http://localhost:8000'
);