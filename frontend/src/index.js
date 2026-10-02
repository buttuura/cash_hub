import React from "react";
import ReactDOM from "react-dom/client";
import { Capacitor } from "@capacitor/core";
import "@/index.css";
import App from "@/App";

const root = ReactDOM.createRoot(document.getElementById("root"));

// Render immediately for fast UI display
root.render(
  <App />
);

// Offline caching is a browser-PWA concern. Inside the packaged Android app
// the shell is already local while the API is on another origin, so the
// service worker only served stale data and masked real network errors.
const supportsServiceWorker = 'serviceWorker' in navigator && !Capacitor.isNativePlatform();

// Check auth in background
if (supportsServiceWorker) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then((reg) => {
        console.log('Service worker registered.', reg);
        if (navigator.onLine && reg.active) {
          reg.active.postMessage({ type: 'REPLAY_OFFLINE_WRITES' });
        }
      })
      .catch((err) => console.warn('Service worker registration failed:', err));
  });

  window.addEventListener('online', () => {
    navigator.serviceWorker.ready.then((reg) => {
      reg.active?.postMessage({ type: 'REPLAY_OFFLINE_WRITES' });
    });
  });
} else if ('serviceWorker' in navigator) {
  // Drop any worker left behind by an earlier install so it stops controlling
  // the app and serving stale cached API responses.
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    registrations.forEach((registration) => registration.unregister());
  }).catch(() => {});
  if (window.caches?.keys) {
    window.caches.keys().then((keys) => {
      keys.filter((key) => key.startsWith('cashhub-')).forEach((key) => window.caches.delete(key));
    }).catch(() => {});
  }
}
