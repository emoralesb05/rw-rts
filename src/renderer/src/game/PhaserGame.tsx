import { useEffect, useRef } from "react";
import * as Phaser from "phaser";
import { WorldSelectScene } from "./scenes/WorldSelect";
import { WorldScene } from "./scenes/World";
import { useStore } from "../store";

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
      // Pixel art mode: disables texture filtering / antialiasing so 32×32
      // sprites stay crisp when scaled. roundPixels keeps tween positions
      // on integer pixels so they don't shimmer between frames.
      pixelArt: true,
      roundPixels: true,
      scale: {
        mode: Phaser.Scale.RESIZE,
        width: "100%",
        height: "100%",
      },
      scene: [WorldSelectScene, WorldScene],
    });
    gameRef.current = game;

    // Phaser RESIZE mode only watches window.resize. Our stage size changes
    // when the side panel or unit dock layout shifts (CSS grid, no window
    // resize). Without this, the canvas internal resolution diverges from
    // the displayed CSS size and pointer hits land in the wrong place
    // (typical symptom: only clicks near the top-left of an object register).
    const ro = new ResizeObserver(() => {
      const w = host.clientWidth;
      const h = host.clientHeight;
      if (w > 0 && h > 0) game.scale.resize(w, h);
    });
    ro.observe(host);

    let lastWorldId: string | null = useStore.getState().activeWorldId;
    const unsub = useStore.subscribe((state) => {
      const id = state.activeWorldId;
      if (id === lastWorldId) return;
      lastWorldId = id;
      if (!game.scene) return;
      const target = id ? "world" : "worldSelect";
      const other = id ? "worldSelect" : "world";
      if (!game.scene.isActive(target)) {
        if (game.scene.isActive(other)) game.scene.stop(other);
        game.scene.start(target);
      }
    });

    return () => {
      ro.disconnect();
      unsub();
      game.destroy(true);
      gameRef.current = null;
    };
  }, []);

  return <div ref={hostRef} style={{ position: "absolute", inset: 0 }} />;
}
