import type * as Phaser from "phaser";
import type { OrchestrationRun } from "@shared/orchestration";
import { runSiteReadout } from "./run-sites";
import { isCanvasClick } from "./canvas-click";

export class RunSiteLayer {
  private markers = new Map<string, Phaser.GameObjects.Text>();
  constructor(
    private scene: Phaser.Scene,
    private inspect: (runId: string) => void
  ) {}
  sync(
    sites: { run: OrchestrationRun; x: number; y: number }[],
    unavailable: boolean
  ) {
    const alive = new Set(sites.map((site) => site.run.id));
    for (const [id, marker] of this.markers) {
      if (!alive.has(id)) {
        marker.destroy();
        this.markers.delete(id);
      }
    }
    for (const { run, x, y } of sites) {
      let marker = this.markers.get(run.id);
      if (!marker) {
        marker = this.scene.add
          .text(x, y, "", {
            fontFamily: "system-ui, sans-serif",
            fontSize: "10px",
            resolution: 2,
            backgroundColor: "#17192e",
            padding: { x: 8, y: 5 },
            align: "center",
          })
          .setOrigin(0.5, 0)
          .setDepth(66)
          .setInteractive({ useHandCursor: true });
        marker.on("pointerup", (pointer: Phaser.Input.Pointer) => {
          if (isCanvasClick(pointer, this.scene.game.canvas))
            this.inspect(run.id);
        });
        this.markers.set(run.id, marker);
      }
      const readout = runSiteReadout(run, unavailable);
      const title =
        run.title.length > 18 ? `${run.title.slice(0, 17)}…` : run.title;
      const text = `RUN · ${readout.status}\n${title}`;
      if (marker.text !== text) marker.setText(text);
      if (marker.style.color !== readout.color) marker.setColor(readout.color);
      marker.setPosition(x, y);
    }
  }
  destroy() {
    for (const marker of this.markers.values()) marker.destroy();
    this.markers.clear();
  }
}
