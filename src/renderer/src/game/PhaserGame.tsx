import { useEffect, useRef } from "react";
import * as Phaser from "phaser";
import { KingdomScene } from "./scenes/Kingdom";

/**
 * Single Phaser game hosting the unified KingdomScene (per Q40 — see
 * .docs/plans/vision.md). Replaces the previous Throne/Gummi/Arena
 * 3-scene drill-down with one pan/zoom canvas.
 *
 * The legacy WorldScene file is retained as a porting reference for
 * the iso-plane rendering work (still to merge into KingdomScene).
 * WorldSelectScene was deleted in cleanup; KingdomScene replaces both.
 */
export function PhaserGame() {
  const hostRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Phaser.Game | null>(null);

  useEffect(() => {
    if (!hostRef.current || gameRef.current) return;
    const host = hostRef.current;
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
      (window as unknown as { __phaser: Phaser.Game }).__phaser = game;
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
      game.destroy(true);
      gameRef.current = null;
    };
  }, []);

  return <div ref={hostRef} style={{ position: "absolute", inset: 0 }} />;
}
