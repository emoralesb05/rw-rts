import { useEffect, useRef } from "react";
import Phaser from "phaser";
import { WorldSelectScene } from "./scenes/WorldSelect";
import { WorldScene } from "./scenes/World";
import { useStore } from "../store";

export function PhaserGame() {
  const hostRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Phaser.Game | null>(null);

  useEffect(() => {
    if (!hostRef.current || gameRef.current) return;
    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: hostRef.current,
      backgroundColor: "#04060d",
      scale: {
        mode: Phaser.Scale.RESIZE,
        width: "100%",
        height: "100%",
      },
      scene: [WorldSelectScene, WorldScene],
    });
    gameRef.current = game;

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
      unsub();
      game.destroy(true);
      gameRef.current = null;
    };
  }, []);

  return <div ref={hostRef} style={{ position: "absolute", inset: 0 }} />;
}
