import type { RwApi } from "./index";

declare global {
  interface Window {
    rw: RwApi;
  }
}

export {};
