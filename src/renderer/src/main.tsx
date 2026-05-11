import ReactDOM from "react-dom/client";
import { App } from "./App";
import { attachEventStream } from "./ipc";
import { useStore } from "./store";
import { preloadSounds, play } from "./audio/sounds";
import { attachMusicLoop } from "./audio/music";
import { attachLetterNotifications } from "./desktop-notifications";
import { attachStandingOrderRunner } from "./standing-orders";
import { seedVisualQaState } from "./dev/visual-qa-seed";
import "./styles.css";

void preloadSounds();
attachEventStream();
attachLetterNotifications();
attachStandingOrderRunner();
attachMusicLoop();

// Hydrate persisted kingdom state on launch. Renderer reads via IPC; the
// main process is the source of truth for the JSON file on disk.
const shouldSeedVisualQa =
  import.meta.env.DEV &&
  (new URLSearchParams(window.location.search).has("visual-qa") ||
    window.location.hash.includes("visual-qa"));

void window.kh
  .loadPersisted()
  .then((s) => useStore.getState().hydratePersisted(s))
  .catch(() => {})
  .finally(() => {
    if (shouldSeedVisualQa) {
      seedVisualQaState();
    }
  });

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
  const devWindow = window as unknown as {
    __khSeedVisualQa: typeof seedVisualQaState;
    __khStore: typeof useStore;
  };
  devWindow.__khStore = useStore;
  devWindow.__khSeedVisualQa = seedVisualQaState;
}

ReactDOM.createRoot(document.getElementById("root")!).render(<App />);
