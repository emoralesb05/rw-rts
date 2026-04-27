import type { KhApi } from "./index";

declare global {
  interface Window {
    kh: KhApi;
  }
}

export {};
