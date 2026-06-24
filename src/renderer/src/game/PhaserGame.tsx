import { useEffect, useRef } from "react";
import * as Phaser from "phaser";
import { KingdomScene } from "./scenes/Kingdom";

type PhaserDevWindow = Window & {
  __phaser?: Phaser.Game;
  __realmkeeperPhaser?: Phaser.Game;
};

/**
 * Single Phaser game hosting the unified KingdomScene (per Q40 — see
 * .docs/plans/vision.md). Replaces the previous Throne/Realm/Arena
 * 3-scene drill-down with one pan/zoom canvas.
 *
 * KingdomScene is the only Phaser scene. The legacy WorldScene +
 * WorldSelectScene were ported and deleted (see git history for the
 * 3-scene implementation).
 */
export function PhaserGame() {
  const hostRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Phaser.Game | null>(null);

  useEffect(() => {
    if (!hostRef.current || gameRef.current) return;
    const host = hostRef.current;
    const devWindow = window as PhaserDevWindow;
    if (import.meta.env.DEV) {
      devWindow.__realmkeeperPhaser?.destroy(true);
      devWindow.__realmkeeperPhaser = undefined;
      devWindow.__phaser = undefined;
    }
    host.replaceChildren();

    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: host,
      backgroundColor: "#04060d",
      pixelArt: true,
      roundPixels: true,
      scale: {
        mode: Phaser.Scale.RESIZE,
        width: "100%",
        height: "100%",
      },
      scene: [KingdomScene],
    });
    gameRef.current = game;
    if (import.meta.env.DEV) {
      devWindow.__phaser = game;
      devWindow.__realmkeeperPhaser = game;
    }

    // Phaser RESIZE mode only watches window.resize. Our stage size shifts
    // when CSS grid (side panel) reflows without a window resize. Without
    // this, canvas resolution diverges from displayed CSS size and pointer
    // hits land in the wrong place.
    const ro = new ResizeObserver(() => {
      const w = host.clientWidth;
      const h = host.clientHeight;
      if (w > 0 && h > 0) game.scale.resize(w, h);
    });
    ro.observe(host);

    return () => {
      ro.disconnect();
      if (import.meta.env.DEV && devWindow.__realmkeeperPhaser === game) {
        devWindow.__realmkeeperPhaser = undefined;
        devWindow.__phaser = undefined;
      }
      game.destroy(true);
      gameRef.current = null;
    };
  }, []);

  return <div ref={hostRef} style={{ position: "absolute", inset: 0 }} />;
}
