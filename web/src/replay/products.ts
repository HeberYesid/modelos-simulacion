import type { ReplayOrderItem, ReplayProductVisualKind } from "./project";

export const MAX_VISIBLE_PRODUCT_MODELS = 6;

export function productBasketSignature(items: readonly ReplayOrderItem[]): string {
  return JSON.stringify(items.map((item) => [
    item.product_id,
    item.display_name,
    item.visual_kind,
    item.quantity,
  ]));
}

/** Expand line quantities into a bounded visual sample for the preparation tray. */
export function visibleProductKinds(items: readonly ReplayOrderItem[]): ReplayProductVisualKind[] {
  const visible: ReplayProductVisualKind[] = [];
  const representedKinds = new Set<ReplayProductVisualKind>();
  const shownPerLine = items.map(() => 0);

  items.forEach((item, index) => {
    if (visible.length < MAX_VISIBLE_PRODUCT_MODELS && !representedKinds.has(item.visual_kind)) {
      visible.push(item.visual_kind);
      shownPerLine[index] = 1;
      representedKinds.add(item.visual_kind);
    }
  });

  items.forEach((item, index) => {
    while (visible.length < MAX_VISIBLE_PRODUCT_MODELS && shownPerLine[index] < item.quantity) {
      visible.push(item.visual_kind);
      shownPerLine[index] += 1;
    }
  });
  return visible;
}

export function basketUnitCount(items: readonly ReplayOrderItem[]): number {
  return items.reduce((total, item) => total + item.quantity, 0);
}
