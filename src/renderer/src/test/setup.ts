import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

afterEach(() => {
  cleanup();
});

if (typeof Element !== "undefined" && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = vi.fn();
}

if (typeof window !== "undefined" && !("ResizeObserver" in window)) {
  class TestResizeObserver implements ResizeObserver {
    observe(): void {
      return undefined;
    }

    unobserve(): void {
      return undefined;
    }

    disconnect(): void {
      return undefined;
    }
  }

  Object.defineProperty(window, "ResizeObserver", {
    configurable: true,
    writable: true,
    value: TestResizeObserver,
  });

  Object.defineProperty(globalThis, "ResizeObserver", {
    configurable: true,
    writable: true,
    value: TestResizeObserver,
  });
}
