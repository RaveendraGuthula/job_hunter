import { VERSION } from "../version";

const STORAGE_KEY = "extensionState";

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    void chrome.storage.local.set({
      [STORAGE_KEY]: {
        installedAt: Date.now(),
        appVersion: VERSION,
      },
    });
  }
});