import type * as Phaser from "phaser";
import { isCanvasClick } from "./canvas-click";
import { activityCaptionScale, showActivityCaption } from "./activity-caption";
import type { SessionActivity } from "./session-activity";
import { stationFeedback, type StationFeedback } from "./station-feedback";
import {
  layoutSiteLabels,
  type SiteLabel,
  type LabelObstacle,
} from "./site-label-layout";
import {
  WORKSTATION_KEY,
  WORKSTATION_SCALE,
  workstationFrame,
} from "./realm-workstations";

type Placement = {
  activity: SessionActivity;
  x: number;
  y: number;
  displayName?: string;
  courtyardSlot?: number;
  settled?: boolean;
  agentPosition?: { x: number; y: number };
};

/** Scene-owned markers. React owns inspection and all operational controls. */
export class ActivitySiteLayer {
  private leaders: Phaser.GameObjects.Graphics;
  private hoveredId: string | null = null;
  private markers = new Map<
    string,
    {
      text: Phaser.GameObjects.Text;
      console: Phaser.GameObjects.Image;
      shadow: Phaser.GameObjects.Ellipse;
      styleKey: string;
      feedback?: StationFeedback;
    }
  >();
  constructor(
    private scene: Phaser.Scene,
    private inspect: (unitId: string) => void,
    private groundObjects?: Phaser.GameObjects.Container
  ) {
    this.leaders = scene.add.graphics().setDepth(64);
  }

  hoverAgent(unitId: string, hovered: boolean) {
    const id = `session:${unitId}`;
    if (hovered) this.hoveredId = id;
    else if (this.hoveredId === id) this.hoveredId = null;
  }

  sync(
    placements: Placement[],
    selectedUnitId?: string | null,
    obstacles: readonly LabelObstacle[] = []
  ) {
    const labels: SiteLabel[] = [];
    const now = Date.now();
    this.leaders.clear();
    const districtSizes = new Map<string, number>();
    for (const { activity } of placements) {
      districtSizes.set(
        activity.worldId,
        (districtSizes.get(activity.worldId) ?? 0) + 1
      );
    }
    const alive = new Set(placements.map((p) => p.activity.id));
    for (const [id, marker] of this.markers) {
      if (!alive.has(id)) {
        if (this.hoveredId === id) this.hoveredId = null;
        marker.text.destroy();
        marker.console.destroy();
        marker.shadow.destroy();
        this.markers.delete(id);
      }
    }
    for (const {
      activity,
      x,
      y,
      displayName,
      courtyardSlot = 0,
      settled = false,
    } of placements) {
      let marker = this.markers.get(activity.id);
      if (!marker) {
        const text = this.scene.add
          .text(x, y, "", {
            fontFamily: "system-ui, sans-serif",
            fontSize: "10px",
            resolution: 3,
            backgroundColor: "#18172c",
            padding: { x: 4, y: 4 },
            align: "center",
          })
          .setOrigin(0.5, 0)
          .setDepth(65)
          .setInteractive({ useHandCursor: true });
        text.on("pointerup", (pointer: Phaser.Input.Pointer) => {
          if (isCanvasClick(pointer, this.scene.game.canvas))
            this.inspect(activity.unitId);
        });
        marker = {
          text,
          shadow: this.scene.add
            .ellipse(x, y, 28, 8, 0x10182f, 0.18)
            .setDepth(58),
          console: this.scene.add
            .image(x, y, WORKSTATION_KEY, workstationFrame(activity))
            .setOrigin(0.5, 490 / 512)
            .setScale(WORKSTATION_SCALE * 0.68)
            .setDepth(59),
          styleKey: "",
        };
        this.markers.set(activity.id, marker);
        this.groundObjects?.add([marker.shadow, marker.console]);
        const site = marker;
        site.console.setInteractive({ useHandCursor: true });
        site.console.on("pointerup", (pointer: Phaser.Input.Pointer) => {
          if (isCanvasClick(pointer, this.scene.game.canvas))
            this.inspect(activity.unitId);
        });
        const reveal = () => {
          this.hoveredId = activity.id;
          site.text.setVisible(true);
        };
        const conceal = () => {
          if (this.hoveredId === activity.id) this.hoveredId = null;
        };
        for (const target of [site.console, site.text]) {
          target.on("pointerover", reveal);
          target.on("pointerout", conceal);
        }
      }
      const selected = activity.unitId === selectedUnitId;
      const focused = selected || this.hoveredId === activity.id;
      const name =
        displayName && focused
          ? `${displayName.length > 28 ? `${displayName.slice(0, 27)}…` : displayName}\n`
          : "";
      const caption = `${name}${activity.symbol} ${activity.label}`;
      const key = `${caption}|${activity.color}`;
      if (key !== marker.styleKey) {
        marker.text.setText(caption).setColor(activity.color);
        marker.styleKey = key;
      }
      marker.console.setFrame(workstationFrame(activity));
      const feedback = stationFeedback(
        marker.feedback,
        activity.state,
        settled,
        now
      );
      marker.feedback = feedback;
      marker.console.setTint(feedback.tint).setAlpha(feedback.alpha);
      marker.text.setPosition(x, y);
      marker.text.setScale(activityCaptionScale(this.scene.cameras.main.zoom));
      // Furniture faces out from the middle aisle; agents keep their stable seats.
      const side = courtyardSlot % 4 < 2 ? -1 : 1;
      marker.console.setPosition(x + side * 25, y - 12);
      marker.shadow.setPosition(x + side * 25, y - 10);
      if (this.groundObjects) {
        marker.console.setDepth(y - 12);
        marker.shadow.setDepth(y - 12.5);
      }
      // At distant overview only attention markers remain; district status remains visible.
      const urgent =
        activity.state === "blocked" || activity.state === "attention";
      const visible = showActivityCaption(
        this.scene.cameras.main.zoom,
        districtSizes.get(activity.worldId) ?? 0,
        urgent,
        focused || feedback.acknowledging
      );
      marker.text.setVisible(visible);
      if (visible)
        labels.push({
          id: activity.id,
          x,
          y,
          width: marker.text.width * marker.text.scaleX,
          height: marker.text.height * marker.text.scaleY,
          priority: selected ? 3 : urgent ? 2 : focused ? 1 : 0,
        });
    }
    const silhouettes = placements.flatMap(({ agentPosition }) =>
      agentPosition
        ? [
            {
              x: agentPosition.x,
              y: agentPosition.y - 52,
              width: 32,
              height: 60,
            },
          ]
        : []
    );
    const anchors = new Map(placements.map((p) => [p.activity.id, p]));
    for (const [id, position] of layoutSiteLabels(labels, 5, [
      ...obstacles,
      ...silhouettes,
    ])) {
      const marker = this.markers.get(id);
      const anchor = anchors.get(id);
      if (marker && anchor) {
        const { x, y } = position;
        marker.text.setPosition(x, y);
        if (Math.hypot(x - anchor.x, y - anchor.y) > 2) {
          const foot = anchor.agentPosition ?? {
            x: anchor.x,
            y: anchor.y - 16,
          };
          const end =
            y < foot.y ? y + marker.text.height * marker.text.scaleY : y;
          this.leaders.lineStyle(1, 0xd5dff2, 0.55);
          this.leaders.lineBetween(foot.x, foot.y + 8, x, end);
        }
      }
    }
  }

  destroy() {
    this.leaders.destroy();
    for (const marker of this.markers.values()) {
      marker.text.destroy();
      marker.console.destroy();
      marker.shadow.destroy();
    }
    this.markers.clear();
    this.hoveredId = null;
  }
}
