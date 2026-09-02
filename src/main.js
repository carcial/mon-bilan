import "./styles/main.css";
import { createApp } from "./app.js";
import { config } from "./config.js";
import { registerServiceWorker } from "./pwa.js";

function boot() {
  document.title = config.appName;
  createApp();
  registerServiceWorker();
}

boot();
