import type * as Phaser from "phaser";

export type AnnexLabel = {
  id: string;
  x: number;
  y: number;
  title: string;
  count: number;
};

/** Scene-owned project labels; annexes are presentation, not extra repo worlds. */
export class AnnexLabelLayer {
  private labels = new Map<string, Phaser.GameObjects.Text>();
  constructor(private scene: Phaser.Scene) {}

  sync(annexes: AnnexLabel[]) {
    const alive = new Set(annexes.map((annex) => annex.id));
    for (const [id, label] of this.labels) {
      if (!alive.has(id)) {
        label.destroy();
        this.labels.delete(id);
      }
    }
    for (const annex of annexes) {
      let label = this.labels.get(annex.id);
      if (!label) {
        label = this.scene.add
          .text(annex.x, annex.y + 148, "", {
            fontFamily: "system-ui, sans-serif",
            fontSize: "12px",
            resolution: 3,
            color: "#dce8ff",
            backgroundColor: "#18172c",
            align: "center",
            padding: { x: 5, y: 3 },
          })
          .setOrigin(0.5, 0)
          .setDepth(64);
        this.labels.set(annex.id, label);
      }
      const caption = `${annex.title}\n${annex.count} agents`;
      if (label.text !== caption) label.setText(caption);
      label.setPosition(annex.x, annex.y + 148);
    }
    return [...this.labels.values()].map((label) => ({
      x: label.x,
      y: label.y,
      width: label.width,
      height: label.height,
    }));
  }

  destroy() {
    for (const label of this.labels.values()) label.destroy();
    this.labels.clear();
  }
}
