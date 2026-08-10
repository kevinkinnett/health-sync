/**
 * Ask an installed service worker to activate its waiting build, then reload.
 * Reload still works when service workers are unavailable (local development,
 * private browsing, or an older deployment).
 */
export async function activateUpdateAndReload(): Promise<void> {
  try {
    if ("serviceWorker" in navigator) {
      const registration = await navigator.serviceWorker.getRegistration();
      await registration?.update();
      registration?.waiting?.postMessage({ type: "SKIP_WAITING" });
    }
  } finally {
    // A broken/offline worker update must never strand the user on the gate;
    // a network reload can still pick up the current shell.
    window.location.reload();
  }
}
