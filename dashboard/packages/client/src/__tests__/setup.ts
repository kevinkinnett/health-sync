// Stub matchMedia before any module imports (theme store uses it at init)
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }),
});

import "@testing-library/jest-dom/vitest";

/*
 * Give every element a real box, and make ResizeObserver actually report one.
 *
 * jsdom answers every layout query with 0, so Recharts' ResponsiveContainer
 * concludes it has no room. Without this, a chart renders literally nothing —
 * no legend, no axis text, no marks — and every component assertion about it
 * is vacuous.
 *
 * KNOW THE LIMIT: this recovers the chart CHROME (legend labels, some axis
 * ticks, container structure) but NOT the plotted geometry. Line and area
 * curves still come out with no `d`, because the internal layout stays
 * degenerate under jsdom. So:
 *
 *   assert here  — legend text, labels, container structure, empty states
 *   assert in e2e — that a series actually DREW (path geometry, colours)
 *
 * That split is not a preference, it is the boundary of what jsdom can see.
 * A series silently failing to render — which is exactly what happened to the
 * HRV chart's deep-sleep line for seven weeks — is invisible here by
 * construction, and only the Playwright suite can catch it.
 */
const BOX = { width: 800, height: 400 };

for (const [prop, value] of [
  ["offsetWidth", BOX.width],
  ["offsetHeight", BOX.height],
  ["clientWidth", BOX.width],
  ["clientHeight", BOX.height],
] as const) {
  Object.defineProperty(HTMLElement.prototype, prop, {
    configurable: true,
    get: () => value,
  });
}

HTMLElement.prototype.getBoundingClientRect = function (): DOMRect {
  return {
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    right: BOX.width,
    bottom: BOX.height,
    ...BOX,
    toJSON: () => ({}),
  } as DOMRect;
};

globalThis.ResizeObserver = class {
  // A plain field, not a parameter property — `erasableSyntaxOnly` is on.
  cb: ResizeObserverCallback;
  constructor(cb: ResizeObserverCallback) {
    this.cb = cb;
  }
  observe(target: Element) {
    // Fire once, synchronously-ish, with a real box. A stub that never calls
    // back leaves ResponsiveContainer waiting forever at 0x0.
    this.cb(
      [{ target, contentRect: { ...BOX, top: 0, left: 0 } } as ResizeObserverEntry],
      this as unknown as ResizeObserver,
    );
  }
  unobserve() {}
  disconnect() {}
};
