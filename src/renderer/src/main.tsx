import ReactDOM from "react-dom/client";
import { App } from "./App";
import { attachEventStream } from "./ipc";
import { useStore } from "./store";
import { preloadSounds, play } from "./audio/sounds";
import "./styles.css";

void preloadSounds();
attachEventStream();

// Hydrate persisted kingdom state on launch. Renderer reads via IPC; the
// main process is the source of truth for the JSON file on disk.
void window.kh
  .loadPersisted()
  .then((s) => useStore.getState().hydratePersisted(s))
  .catch(() => {});

let lastWorldId = useStore.getState().activeWorldId;
useStore.subscribe((state) => {
  if (state.activeWorldId !== lastWorldId) {
    lastWorldId = state.activeWorldId;
    play("world_warp");
  }
});

if (import.meta.env.DEV) {
  (window as unknown as { __khStore: typeof useStore }).__khStore = useStore;
}

ReactDOM.createRoot(document.getElementById("root")!).render(<App />);
