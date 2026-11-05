import type { CycleDirectoryGroup, CycleDirectoryRow } from "./cycle-directory-groups";

export type LinkedCycleOffer = {
  id: number; name: string; client: string; reference: string; revisions: number[];
};
export type OfferLinkSource = {
  id: number; name: string | null; client: string | null; reference: string | null; dataJson: string | null;
};
type Cycle = CycleDirectoryRow & { rootId?: number | null };
const object = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
function id(value: unknown): number | undefined {
  if (typeof value !== "number" && (typeof value !== "string" || !/^\d+$/.test(value))) return;
  const n = Number(value);
  return Number.isSafeInteger(n) && n > 0 ? n : undefined;
}

/** Links come from persisted cycle IDs/root IDs, never from coincident article codes.
 * One commercial offer counts once even when it includes several lots or revisions. */
export function linkOffersToCycleGroups<T extends Cycle>(groups: CycleDirectoryGroup<T>[], offers: OfferLinkSource[]) {
  const byId = new Map<number, T>();
  const rootGroups = new Map<number, Set<string>>();
  const groupLinks = new Map<string, Map<number, LinkedCycleOffer>>();
  const rowLinks = new Map<number, Map<number, LinkedCycleOffer>>();
  for (const group of groups) {
    groupLinks.set(group.key, new Map());
    for (const row of group.revisions) {
      byId.set(row.id, row);
      rowLinks.set(row.id, new Map());
      const root = id(row.rootId) ?? row.id;
      if (!rootGroups.has(root)) rootGroups.set(root, new Set());
      rootGroups.get(root)!.add(group.key);
    }
  }
  const add = (target: Map<number, LinkedCycleOffer>, source: OfferLinkSource, revision: number | undefined) => {
    let item = target.get(source.id);
    if (!item) {
      item = { id: source.id, name: source.name?.trim() || `Offerta #${source.id}`,
        client: source.client ?? "", reference: source.reference ?? "", revisions: [] };
      target.set(source.id, item);
    }
    if (revision !== undefined && !item.revisions.includes(revision)) item.revisions.push(revision);
  };
  for (const offer of offers) {
    let document: Record<string, unknown> | undefined;
    try { document = object(JSON.parse(offer.dataJson ?? "null")); } catch { continue; }
    if (!Array.isArray(document?.righe)) continue;
    for (const value of document.righe) {
      const row = object(value);
      if (!row) continue;
      const snapshot = object(row.data);
      const recordId = id(row.record_id) ?? id(snapshot?.record_id);
      const known = recordId === undefined ? undefined : byId.get(recordId);
      const root = known ? id(known.rootId) ?? known.id : id(row.root_id) ?? id(snapshot?.root_id) ?? recordId;
      if (root === undefined) continue;
      const revision = id(row.rev) ?? id(snapshot?.rev) ?? (known?.rev == null ? undefined : known.rev);
      for (const key of rootGroups.get(root) ?? []) add(groupLinks.get(key)!, offer, revision);
      if (known) add(rowLinks.get(known.id)!, offer, revision);
      else if (recordId === undefined && revision !== undefined) {
        for (const cycle of byId.values()) {
          if ((id(cycle.rootId) ?? cycle.id) === root && (cycle.rev ?? 1) === revision) add(rowLinks.get(cycle.id)!, offer, revision);
        }
      }
    }
  }
  const values = (items: Map<number, LinkedCycleOffer>) => [...items.values()].map(item => ({ ...item, revisions: item.revisions.sort((a, b) => a - b) }));
  return groups.map(group => {
    const revisions = group.revisions.map(row => ({ ...row, linkedOffers: values(rowLinks.get(row.id)!) }));
    return { ...group, revisions, latest: revisions.find(row => row.id === group.latest.id)!, linkedOffers: values(groupLinks.get(group.key)!) };
  });
}
