/**
 * Ask an installed service worker to activate its waiting build, then reload.
 * Reload still works when service workers are unavailable (local development,
 * private browsing, or an older deployment).
 */
export async function activateUpdateAndReload(): Promise<void> {
  if ("serviceWorker" in navigator) {
    const registration = await navigator.serviceWorker.getRegistration();
    await registration?.update();
    registration?.waiting?.postMessage({ type: "SKIP_WAITING" });
  }
  window.location.reload();
}
