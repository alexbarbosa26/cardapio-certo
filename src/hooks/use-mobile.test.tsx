import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useIsMobile } from "./use-mobile";

type Listener = () => void;
const listeners = new Set<Listener>();
const originalMatchMedia = globalThis.matchMedia;
const originalWidth = globalThis.innerWidth;

function setWidth(width: number) {
  Object.defineProperty(globalThis, "innerWidth", { value: width, configurable: true, writable: true });
}

beforeEach(() => {
  listeners.clear();
  Object.defineProperty(globalThis, "matchMedia", {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      media: query,
      matches: globalThis.innerWidth < 768,
      addEventListener: (_: string, cb: Listener) => listeners.add(cb),
      removeEventListener: (_: string, cb: Listener) => listeners.delete(cb),
    }),
  });
});

afterEach(() => {
  Object.defineProperty(globalThis, "matchMedia", { configurable: true, writable: true, value: originalMatchMedia });
  setWidth(originalWidth);
  vi.restoreAllMocks();
});

describe("useIsMobile", () => {
  it("detecta viewport móvel abaixo do breakpoint", () => {
    setWidth(500);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(true);
  });

  it("detecta desktop no breakpoint exato", () => {
    setWidth(768);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);
  });

  it("reage à mudança da media query", () => {
    setWidth(1200);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);

    act(() => {
      setWidth(400);
      for (const cb of listeners) cb();
    });
    expect(result.current).toBe(true);
  });

  it("remove o listener ao desmontar", () => {
    setWidth(400);
    const { unmount } = renderHook(() => useIsMobile());
    expect(listeners.size).toBe(1);
    unmount();
    expect(listeners.size).toBe(0);
  });
});
