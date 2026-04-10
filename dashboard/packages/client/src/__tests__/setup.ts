import "@testing-library/jest-dom/vitest";

// Stub ResizeObserver for Recharts
globalThis.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};
