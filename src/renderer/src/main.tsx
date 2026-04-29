import ReactDOM from "react-dom/client";
import { App } from "./App";
import { attachEventStream } from "./ipc";
import { useStore } from "./store";
import { preloadSounds, play } from "./audio/sounds";
import { attachLetterNotifications } from "./desktop-notifications";
import "./styles.css";

void preloadSounds();
attachEventStream();
attachLetterNotifications();

// Hydrate persisted kingdom state on launch. Renderer reads via IPC; the
// main process is the source of truth for the JSON file on disk.
void window.kh
  .loadPersisted()
  .then((s) => useStore.getState().hydratePersisted(s))
  .catch(() => {});

// Play the warp SFX whenever the camera is asked to pan to a world
// (clicking a wielder card, a letter, or a planet). cameraTargetVersion
// is monotonic so re-clicking the same world also fires.
let lastCamVersion = useStore.getState().cameraTargetVersion;
useStore.subscribe((state) => {
  if (state.cameraTargetVersion !== lastCamVersion) {
    lastCamVersion = state.cameraTargetVersion;
    play("world_warp");
  }
});

if (import.meta.env.DEV) {
  (window as unknown as { __khStore: typeof useStore }).__khStore = useStore;
}

ReactDOM.createRoot(document.getElementById("root")!).render(<App />);
