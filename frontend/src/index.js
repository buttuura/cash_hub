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
      .then((reg) => console.log('Service worker registered.', reg))
      .catch((err) => console.warn('Service worker registration failed:', err));
  });
}
