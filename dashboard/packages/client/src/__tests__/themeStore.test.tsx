import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The theme store reads storage and the OS preference AT IMPORT, the same
 * moment the real app does, so every case loads a fresh copy of the module
 * after arranging the environment.
 */

type Listener = () => void;

function mockSystem(light: boolean) {
  const listeners: Listener[] = [];
  const mql = {
    matches: light,
    addEventListener: (_: string, fn: Listener) => listeners.push(fn),
    removeEventListener: vi.fn(),
  };
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => mql),
  );
  return {
    set(next: boolean) {
      mql.matches = next;
      listeners.forEach((fn) => fn());
    },
  };
}

async function loadStore() {
  vi.resetModules();
  return import("../stores/themeStore");
}

const root = () => document.documentElement;

beforeEach(() => {
  localStorage.clear();
  root().className = "";
  root().style.colorScheme = "";
  document.head.innerHTML = '<meta name="theme-color" content="#0d0f12" />';
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("theme store — initial choice", () => {
  it("defaults to system and follows a light OS preference", async () => {
    mockSystem(true);
    const { useThemeStore } = await loadStore();
    expect(useThemeStore.getState()).toMatchObject({ choice: "system", mode: "light", isDark: false });
    expect(root().classList.contains("light")).toBe(true);
    expect(root().classList.contains("dark")).toBe(false);
  });

  it("defaults to system and follows a dark OS preference", async () => {
    mockSystem(false);
    const { useThemeStore } = await loadStore();
    expect(useThemeStore.getState()).toMatchObject({ choice: "system", mode: "dark", isDark: true });
    expect(root().classList.contains("dark")).toBe(true);
  });

  it("a persisted explicit choice beats the OS preference", async () => {
    mockSystem(true);
    localStorage.setItem("vitalis.theme", "dark");
    const { useThemeStore } = await loadStore();
    expect(useThemeStore.getState()).toMatchObject({ choice: "dark", mode: "dark" });
  });

  it("ignores a garbage stored value and falls back to system", async () => {
    mockSystem(true);
    localStorage.setItem("vitalis.theme", "sepia");
    const { useThemeStore } = await loadStore();
    expect(useThemeStore.getState()).toMatchObject({ choice: "system", mode: "light" });
  });

  it("falls back to system when storage throws on read", async () => {
    mockSystem(true);
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });
    const { useThemeStore } = await loadStore();
    expect(useThemeStore.getState()).toMatchObject({ choice: "system", mode: "light" });
  });

  it("falls back to dark when the OS preference can't be read at all", async () => {
    vi.stubGlobal("matchMedia", undefined);
    const { useThemeStore } = await loadStore();
    expect(useThemeStore.getState()).toMatchObject({ choice: "system", mode: "dark" });
  });
});

describe("theme store — changing the choice", () => {
  it("persists the choice and flips the <html> class, color-scheme and meta", async () => {
    mockSystem(false);
    const { useThemeStore } = await loadStore();
    act(() => useThemeStore.getState().setChoice("light"));

    expect(localStorage.getItem("vitalis.theme")).toBe("light");
    expect(root().classList.contains("light")).toBe(true);
    expect(root().classList.contains("dark")).toBe(false);
    expect(root().style.colorScheme).toBe("light");
    expect(document.querySelector('meta[name="theme-color"]')?.getAttribute("content")).toBe("#eef0f3");

    act(() => useThemeStore.getState().setChoice("dark"));
    expect(root().classList.contains("dark")).toBe(true);
    expect(root().classList.contains("light")).toBe(false);
    expect(document.querySelector('meta[name="theme-color"]')?.getAttribute("content")).toBe("#0d0f12");
  });

  it("still applies the choice when storage throws on write", async () => {
    mockSystem(false);
    const { useThemeStore } = await loadStore();
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("full", "QuotaExceededError");
    });
    expect(() => act(() => useThemeStore.getState().setChoice("light"))).not.toThrow();
    expect(useThemeStore.getState().mode).toBe("light");
    expect(root().classList.contains("light")).toBe(true);
  });

  it("tracks the OS live under system, and ignores it under an explicit choice", async () => {
    const os = mockSystem(false);
    const { useThemeStore } = await loadStore();
    act(() => os.set(true));
    expect(useThemeStore.getState().mode).toBe("light");
    expect(root().classList.contains("light")).toBe(true);

    act(() => useThemeStore.getState().setChoice("dark"));
    act(() => os.set(false));
    act(() => os.set(true));
    expect(useThemeStore.getState().mode).toBe("dark");
  });

  it("toggle pins the opposite of what is painted", async () => {
    mockSystem(true);
    const { useThemeStore } = await loadStore();
    act(() => useThemeStore.getState().toggle());
    expect(useThemeStore.getState()).toMatchObject({ choice: "dark", mode: "dark" });
    expect(localStorage.getItem("vitalis.theme")).toBe("dark");
  });
});

describe("pre-paint script in index.html", () => {
  // The script that runs before any bundle loads. It must agree with the
  // store, or the page paints one mode and then flashes to the other.
  const html = readFileSync(join(__dirname, "..", "..", "index.html"), "utf8");
  const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1] ?? "";
  const run = () => new Function(script)();

  it("is present", () => {
    expect(script).toContain("vitalis.theme");
  });

  it("follows the OS when nothing is stored", () => {
    mockSystem(true);
    run();
    expect(root().classList.contains("light")).toBe(true);
    expect(document.querySelector('meta[name="theme-color"]')?.getAttribute("content")).toBe("#eef0f3");
  });

  it("honours a stored explicit choice over the OS", () => {
    mockSystem(true);
    localStorage.setItem("vitalis.theme", "dark");
    run();
    expect(root().classList.contains("dark")).toBe(true);
    expect(root().classList.contains("light")).toBe(false);
  });

  it("paints dark when neither storage nor the OS can be read", () => {
    vi.stubGlobal("matchMedia", undefined);
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });
    run();
    expect(root().classList.contains("dark")).toBe(true);
  });
});

describe("theme controls", () => {
  it("the top-bar toggle flips the class on <html>", async () => {
    mockSystem(false);
    await loadStore();
    const { ThemeToggle } = await import("../components/ThemeToggle");
    render(<ThemeToggle />);

    fireEvent.click(screen.getByRole("button", { name: "Switch to light theme" }));
    expect(root().classList.contains("light")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Switch to dark theme" }));
    expect(root().classList.contains("dark")).toBe(true);
  });

  it("the settings radiogroup offers system, light and dark", async () => {
    mockSystem(true);
    await loadStore();
    const { ThemeChoiceGroup } = await import("../components/ThemeToggle");
    render(<ThemeChoiceGroup />);

    expect(screen.getByRole("radio", { name: /System/ })).toHaveAttribute("aria-checked", "true");
    fireEvent.click(screen.getByRole("radio", { name: /Dark/ }));
    expect(screen.getByRole("radio", { name: /Dark/ })).toHaveAttribute("aria-checked", "true");
    expect(root().classList.contains("dark")).toBe(true);
    expect(localStorage.getItem("vitalis.theme")).toBe("dark");
  });
});
