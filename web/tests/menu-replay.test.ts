import { describe, expect, it } from "vitest";
import regularFixture from "./fixtures/replay/regular.json";
import { create_replay_projector, type ReplayTrace } from "../src/replay/project";
import { basketUnitCount, visibleProductKinds } from "../src/replay/products";

const menuItems = [
  { product_id: "fruit-salad", display_name: "Ensalada de frutas", visual_kind: "fruit_salad", quantity: 2 },
  { product_id: "ice-cream", display_name: "Helado", visual_kind: "ice_cream", quantity: 1 },
  { product_id: "slush", display_name: "Raspado", visual_kind: "slush", quantity: 2 },
] as const;

function traceWithItems(items: unknown): ReplayTrace {
  const trace = structuredClone(regularFixture) as unknown as {
    final_orders: Array<{ order_id: string; items?: unknown }>;
  };
  const order = trace.final_orders.find((candidate) => candidate.order_id === "order-group");
  if (!order) throw new Error("The regular replay fixture has no order-group order.");
  order.items = items;
  return trace as unknown as ReplayTrace;
}

describe("menu items in replay", () => {
  it("preserves the saved basket through repeated seeks and leaves historical orders unclassified", () => {
    const cursor = create_replay_projector(traceWithItems(menuItems));
    const atPreparation = cursor.project(5);

    expect(atPreparation.orders["order-group"]?.items).toEqual(menuItems);
    expect(cursor.project(1).orders["order-group"]?.items).toEqual(menuItems);
    expect(cursor.project(5)).toEqual(atPreparation);
    expect(Object.isFrozen(atPreparation.orders["order-group"]?.items)).toBe(true);

    const delivery = regularFixture.events.find((event) =>
      event.type === "order_delivered" && event.order_id === "order-group",
    );
    if (!delivery) throw new Error("The regular replay fixture has no order-group delivery event.");
    const atDelivery = cursor.project(delivery.time_s);
    expect(atDelivery.orders["order-group"]?.state).toBe("completed");
    expect(atDelivery.orders["order-group"]?.items).toEqual(menuItems);
    cursor.project(1);
    expect(cursor.project(delivery.time_s)).toEqual(atDelivery);

    const historical = create_replay_projector(regularFixture as ReplayTrace).project(5);
    expect(historical.orders["order-group"]?.items).toEqual([]);
  });

  it("keeps every product kind represented when the six-model tray cap applies", () => {
    const largeBasket = [
      { product_id: "fruit-salad", display_name: "Ensalada", visual_kind: "fruit_salad", quantity: 48 },
      { product_id: "ice-cream", display_name: "Helado", visual_kind: "ice_cream", quantity: 1 },
      { product_id: "slush", display_name: "Raspado", visual_kind: "slush", quantity: 1 },
    ] as const;

    expect(basketUnitCount(largeBasket)).toBe(50);
    expect(visibleProductKinds(largeBasket)).toEqual([
      "fruit_salad",
      "ice_cream",
      "slush",
      "fruit_salad",
      "fruit_salad",
      "fruit_salad",
    ]);
  });

  it("rejects malformed menu metadata instead of using it to describe the basket", () => {
    const invalidBaskets: unknown[] = [
      [{ product_id: "  ", display_name: "Ensalada", visual_kind: "fruit_salad", quantity: 1 }],
      [{ product_id: "fruit-salad", display_name: "  ", visual_kind: "fruit_salad", quantity: 1 }],
      [{ product_id: "unknown", display_name: "Producto", visual_kind: "juice", quantity: 1 }],
      [{ product_id: "fruit-salad", display_name: "Ensalada", visual_kind: "fruit_salad", quantity: 0 }],
      [{ product_id: "fruit-salad", display_name: "Ensalada", visual_kind: "fruit_salad" }],
      [{ product_id: "fruit-salad", display_name: "Ensalada", visual_kind: "fruit_salad", quantity: 1.5 }],
      [{ product_id: "fruit-salad", display_name: "Ensalada", visual_kind: "fruit_salad", quantity: 51 }],
      [
        { product_id: "same", display_name: "Ensalada", visual_kind: "fruit_salad", quantity: 1 },
        { product_id: "same", display_name: "Raspado", visual_kind: "slush", quantity: 1 },
      ],
      [
        { product_id: "fruit", display_name: "Ensalada", visual_kind: "fruit_salad", quantity: 26 },
        { product_id: "slush", display_name: "Raspado", visual_kind: "slush", quantity: 25 },
      ],
      Array.from({ length: 25 }, (_, index) => ({
        product_id: `product-${index}`,
        display_name: "Producto",
        visual_kind: "ice_cream",
        quantity: 1,
      })),
      null,
    ];

    for (const basket of invalidBaskets) {
      expect(() => create_replay_projector(traceWithItems(basket))).toThrow();
    }
  });
});
