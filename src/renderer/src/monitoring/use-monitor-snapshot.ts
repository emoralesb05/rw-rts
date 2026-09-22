import { useEffect } from "react";
import { connectMonitor, useMonitorStore } from "./monitor-store";
export { applyMonitorDelta } from "./monitor-store";

let connection: ReturnType<typeof connectMonitor> | undefined;
/** Mounted by App, never by a workspace or Phaser scene. */
export function useMonitorConnection() {
  useEffect(() => {
    const current = connectMonitor(window.rw);
    connection = current;
    return () => {
      current.stop();
      if (connection === current) connection = undefined;
    };
  }, []);
}
export function useMonitorSnapshot() {
  const state = useMonitorStore();
  return { ...state, refresh: () => connection?.refresh() };
}
