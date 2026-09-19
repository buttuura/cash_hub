import React from "react";
import ReactDOM from "react-dom/client";
import "@/index.css";
import App from "@/App";

const root = ReactDOM.createRoot(document.getElementById("root"));

// Render immediately for fast UI display
root.render(
  <App />
);

// Check auth in background
if ('serviceWorker' in navigator) {
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
}
