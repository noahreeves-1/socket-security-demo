import { STATUSES, type Order } from "./schemas.js";

const FICTIONAL_NAMES = [
  "Arden Sample", "Blair Example", "Cedar Fiction", "Darcy Demo", "Ellis Sample",
  "Finley Example", "Gale Fiction", "Harper Demo", "Indigo Sample", "Jules Example",
  "Kai Fiction", "Linden Demo", "Morgan Sample", "Nova Example", "Oakley Fiction",
  "Parker Demo", "Quinn Sample", "River Example", "Sage Fiction", "Taylor Demo",
  "Urban Sample", "Vale Example", "Winter Fiction", "Xen Demo", "Yarrow Sample",
  "Zephyr Example", "Aspen Fiction", "Briar Demo", "Cove Sample", "Delta Example",
] as const;

const PRODUCTS = [
  { name: "Canvas tote", unitPriceCents: 2400 },
  { name: "Ceramic mug", unitPriceCents: 1800 },
  { name: "Desk notebook", unitPriceCents: 1200 },
  { name: "Cotton tee", unitPriceCents: 3200 },
  { name: "Water bottle", unitPriceCents: 2800 },
] as const;

// Fixed dates make the synthetic dataset reproducible across restarts and services.
export function createSeedOrders(): Order[] {
  return FICTIONAL_NAMES.map((name, index) => {
    const product = PRODUCTS[index % PRODUCTS.length]!;
    const secondProduct = PRODUCTS[(index + 2) % PRODUCTS.length]!;
    const items = [
      { ...product, quantity: (index % 3) + 1 },
      ...(index % 2 === 0 ? [{ ...secondProduct, quantity: 1 }] : []),
    ];
    return {
      id: `OP-${1001 + index}`,
      customer: { name, email: `customer${1001 + index}@example.test` },
      createdAt: new Date(Date.UTC(2026, 8, 25 + (index % 14), 9 + (index % 8), index)).toISOString(),
      status: STATUSES[index % STATUSES.length]!,
      items,
      totalCents: items.reduce((total, item) => total + item.quantity * item.unitPriceCents, 0),
    };
  });
}
