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
  const shelfWidth = Math.max(960, Math.ceil(Math.sqrt(worlds.length)) * 530);
  let clusterLeft = 420;
  let shelfTop = 0;
  let shelfHeight = 0;

  for (const key of sortedKeys) {
    const members = clusters
      .get(key)!
      .slice()
      .sort((a, b) => a.id.localeCompare(b.id));
    const columns = Math.ceil(Math.sqrt(members.length));
    const rows = Math.ceil(members.length / columns);
    const districtWidth = columns * 430 + 100;
    if (clusterLeft > 420 && clusterLeft + districtWidth > 420 + shelfWidth) {
      clusterLeft = 420;
      shelfTop += shelfHeight + 100;
      shelfHeight = 0;
    }
    const cx = clusterLeft;
    const cy = shelfTop;
    shelfHeight = Math.max(shelfHeight, rows * 370);

    if (members.length === 1) {
      out.set(members[0].id, { x: cx, y: cy, clusterKey: key });
      clusterLeft += districtWidth;
      continue;
    }

    members.forEach((w, i) => {
      out.set(w.id, {
        x: cx + (i % columns) * 430,
        y: cy + Math.floor(i / columns) * 370,
        clusterKey: key,
      });
    });
    clusterLeft += districtWidth;
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
