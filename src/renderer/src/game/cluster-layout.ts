import type { WorldState } from "@shared/events";

export type ClusterLayoutEntry = {
  x: number;
  y: number;
  clusterKey: string;
};

export function computeClusterLayout(
  worldsRecord: Record<string, WorldState>
): Map<string, ClusterLayoutEntry> {
  const out = new Map<string, ClusterLayoutEntry>();
  const worlds = Object.values(worldsRecord);
  if (worlds.length === 0) return out;

  const clusters = new Map<string, WorldState[]>();
  for (const w of worlds) {
    const key = clusterKeyFor(w.path);
    let list = clusters.get(key);
    if (!list) {
      list = [];
      clusters.set(key, list);
    }
    list.push(w);
  }

  const sortedKeys = [...clusters.keys()].sort();

  for (const key of sortedKeys) {
    const members = clusters
      .get(key)!
      .slice()
      .sort((a, b) => a.id.localeCompare(b.id));
    const ch = hashString(key);
    const outerRadius = 520 + (Math.abs(ch) % 320);
    const outerAngle = ((Math.abs(ch >> 8) % 360) * Math.PI) / 180;
    const cx = Math.cos(outerAngle) * outerRadius;
    const cy = Math.sin(outerAngle) * outerRadius;

    if (members.length === 1) {
      out.set(members[0].id, { x: cx, y: cy, clusterKey: key });
      continue;
    }

    const innerRadius = Math.min(280, 145 + members.length * 20);
    members.forEach((w, i) => {
      const angle = (i / members.length) * Math.PI * 2 - Math.PI / 2;
      out.set(w.id, {
        x: cx + Math.cos(angle) * innerRadius,
        y: cy + Math.sin(angle) * innerRadius,
        clusterKey: key,
      });
    });
  }

  return out;
}

export function clusterKeyFor(repoPath: string): string {
  const parts = repoPath.split("/").filter(Boolean);
  if (parts.length < 2) return repoPath;
  return "/" + parts.slice(0, -1).join("/");
}

export function clusterDisplayName(clusterKey: string): string {
  const parts = clusterKey.split("/").filter(Boolean);
  if (parts.length === 0) return "/";
  if (parts.length === 1) return parts[0];
  return parts.slice(-2).join(" / ");
}

export function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return h;
}
