// ─────────────────────────────────────────────────────────────────────────────
// Fotos faltantes de los catálogos (PR-4): helpers puros de
// lib/catalogos/fotos-faltantes.ts + agregación del resumen semanal
// (lib/catalogos/fotos-resumen.ts con clients mockeados) + registro del cron
// semanal en la telemetría (cron-telemetry.ts).
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi } from "vitest";

import {
  LIMITE_CODIGOS,
  formatCodigos,
  buildNuevosSinFotoMsg,
  buildResumenSemanalMsg,
  colaSinFoto,
  tieneFotoProducto,
} from "@/lib/catalogos/fotos-faltantes";

// ── formatCodigos (límite 15 + "y N más") ────────────────────────────────────

describe("formatCodigos", () => {
  it("hasta 15 códigos: los lista todos separados por coma", () => {
    expect(formatCodigos(["A", "B", "C"])).toBe("A, B, C");
    const quince = Array.from({ length: 15 }, (_, i) => `C${i + 1}`);
    expect(formatCodigos(quince)).toBe(quince.join(", "));
  });

  it("más de 15: lista 15 y agrupa el resto como 'y N más'", () => {
    const veinte = Array.from({ length: 20 }, (_, i) => `C${i + 1}`);
    const out = formatCodigos(veinte);
    expect(out).toBe(`${veinte.slice(0, 15).join(", ")} y 5 más`);
    expect(LIMITE_CODIGOS).toBe(15);
  });
});

// ── buildNuevosSinFotoMsg (alerta del sync — SOLO nuevos, anti-ruido) ────────

describe("buildNuevosSinFotoMsg", () => {
  it("0 nuevos sin foto → null (anti-ruido: no se manda nada)", () => {
    expect(buildNuevosSinFotoMsg("Reebok", [])).toBeNull();
  });

  it("singular y plural con el texto exacto", () => {
    expect(buildNuevosSinFotoMsg("Reebok", ["100123"])).toBe(
      "📷 Reebok: 1 producto nuevo sin foto: 100123",
    );
    expect(buildNuevosSinFotoMsg("Joybees", ["A1", "B2"])).toBe(
      "📷 Joybees: 2 productos nuevos sin foto: A1, B2",
    );
  });

  it("más de 15 códigos: lista 15 + 'y N más'", () => {
    const cods = Array.from({ length: 18 }, (_, i) => `T${i + 1}`);
    expect(buildNuevosSinFotoMsg("Tommy", cods)).toBe(
      `📷 Tommy: 18 productos nuevos sin foto: ${cods.slice(0, 15).join(", ")} y 3 más`,
    );
  });
});

// ── buildResumenSemanalMsg (resumen semanal) ─────────────────────────────────

describe("buildResumenSemanalMsg", () => {
  // Daniel, 3-ago-2026: *"solo dime si me faltan fotos, no si no me faltan
  // fotos"*. Antes esto devolvía "📷 Los 3 catálogos tienen todas sus fotos ✅"
  // y llegaba cada lunes sin nada que hacer con él.
  it("todo en 0 → NO hay mensaje (null), no un aviso de 'todo bien'", () => {
    const msg = buildResumenSemanalMsg([
      { label: "Reebok", codigos: [] },
      { label: "Joybees", codigos: [] },
      { label: "Tommy", codigos: [] },
    ]);
    expect(msg).toBeNull();
  });

  it("una sola marca, sin faltantes → tampoco avisa", () => {
    expect(buildResumenSemanalMsg([{ label: "Reebok", codigos: [] }])).toBeNull();
  });

  it("sin faltantes pero con una marca PENDIENTE sí avisa (no es 'todo bien')", () => {
    const msg = buildResumenSemanalMsg([
      { label: "Reebok", codigos: [] },
      { label: "Tommy", codigos: [], pendiente: true },
    ]);
    expect(msg).not.toBeNull();
    expect(msg).toContain("pendiente de activación");
  });

  it("basta UNA foto faltante para que avise", () => {
    const msg = buildResumenSemanalMsg([
      { label: "Reebok", codigos: ["ABC-1"] },
      { label: "Joybees", codigos: [] },
      { label: "Tommy", codigos: [] },
    ]);
    expect(msg).not.toBeNull();
    expect(msg).toContain("ABC-1");
  });

  it("con faltantes: línea resumen + detalle solo de marcas con códigos", () => {
    const msg = buildResumenSemanalMsg([
      { label: "Reebok", codigos: ["A", "B"] },
      { label: "Joybees", codigos: [] },
      { label: "Tommy", codigos: ["T1"] },
    ]);
    expect(msg).toBe(
      "📷 Resumen semanal de fotos — Reebok: 2 sin foto · Joybees: 0 · Tommy: 1\n\n" +
        "Reebok (2): A, B\nTommy (1): T1",
    );
  });

  it("Tommy pendiente de DDL: se reporta 'pendiente de activación' sin fallar", () => {
    const msg = buildResumenSemanalMsg([
      { label: "Reebok", codigos: [] },
      { label: "Joybees", codigos: [] },
      { label: "Tommy", codigos: [], pendiente: true },
    ]);
    // Con una marca pendiente NO aplica el mensaje de "todas sus fotos".
    expect(msg).toBe(
      "📷 Resumen semanal de fotos — Reebok: 0 sin foto · Joybees: 0 · Tommy: pendiente de activación",
    );
  });

  it("el detalle también respeta el límite de 15 códigos", () => {
    const cods = Array.from({ length: 17 }, (_, i) => `R${i + 1}`);
    const msg = buildResumenSemanalMsg([
      { label: "Reebok", codigos: cods },
      { label: "Joybees", codigos: [] },
      { label: "Tommy", codigos: [] },
    ]);
    expect(msg).toContain(`Reebok (17): ${cods.slice(0, 15).join(", ")} y 2 más`);
  });
});

// ── colaSinFoto (pestaña "Faltan foto" del admin) ────────────────────────────

describe("colaSinFoto", () => {
  it("solo ACTIVOS/visibles sin foto: excluye con foto, inactivos y ocultados a mano", () => {
    const out = colaSinFoto([
      { sku: "con-foto", image_url: "https://x/y.jpg", active: true },
      { sku: "sin-foto", image_url: null, active: true },
      { sku: "foto-vacia", image_url: "   ", active: true },
      { sku: "inactivo", image_url: null, active: false },
      { sku: "oculto", image_url: null, active: true, oculto_manual: true },
      { sku: "sin-flag-active", image_url: null }, // undefined = se asume activo
    ]);
    expect(out.map((p) => p.sku)).toEqual(["sin-foto", "foto-vacia", "sin-flag-active"]);
  });

  it("ordena por disponibilidad desc (lo más vendible primero), con stock de fallback", () => {
    const out = colaSinFoto([
      { sku: "d2", image_url: null, disponibilidad: 2 },
      { sku: "d30", image_url: null, disponibilidad: 30 },
      { sku: "stock12", image_url: null, stock: 12 }, // Joybees: solo stock
      { sku: "sin-nada", image_url: null },
    ]);
    expect(out.map((p) => p.sku)).toEqual(["d30", "stock12", "d2", "sin-nada"]);
  });

  it("tieneFotoProducto: null, vacío y espacios cuentan como SIN foto", () => {
    expect(tieneFotoProducto({ image_url: null })).toBe(false);
    expect(tieneFotoProducto({ image_url: "" })).toBe(false);
    expect(tieneFotoProducto({ image_url: "  " })).toBe(false);
    expect(tieneFotoProducto({ image_url: "https://x/y.jpg" })).toBe(true);
  });
});

// ── Agregación del resumen (fotos-resumen.ts con clients mockeados) ──────────

// Fake mínimo de supabase: from().select().eq().order() → { data, error }.
function fakeDb(rows: Array<{ sku: string | null; image_url: string | null }>) {
  const order = vi.fn().mockResolvedValue({ data: rows, error: null });
  const eq = vi.fn().mockReturnValue({ order });
  const select = vi.fn().mockReturnValue({ eq });
  const from = vi.fn().mockReturnValue({ select });
  return { client: { from }, spies: { from, select, eq, order } };
}

const reebokRows = [
  { sku: "R1", image_url: null },
  { sku: "R2", image_url: "https://x/r2.jpg" },
  { sku: "R3", image_url: "  " },
  { sku: null, image_url: null }, // sin sku → se descarta
];
const joybeesRows = [{ sku: "J1", image_url: "https://x/j1.jpg" }];

const reebokFake = fakeDb(reebokRows);
const joybeesFake = fakeDb(joybeesRows);
const tommyFake = fakeDb([]);
const calvinFake = fakeDb([]);

vi.mock("@/lib/catalogo/marcas", () => ({
  MARCAS_CONFIG: {
    reebok: {
      label: "Reebok",
      productsTable: "products",
      products: { writeDb: async () => reebokFake.client },
    },
    joybees: {
      label: "Joybees",
      productsTable: "joybees_products",
      products: { writeDb: async () => joybeesFake.client },
    },
    tommy: {
      label: "Tommy Hilfiger",
      productsTable: "tommy_products",
      products: { writeDb: async () => tommyFake.client },
    },
    calvin: {
      label: "Calvin Klein",
      productsTable: "calvin_products",
      products: { writeDb: async () => calvinFake.client },
    },
  },
}));

const tommyDdlPendienteMock = vi.fn<() => Promise<boolean>>().mockResolvedValue(true);
vi.mock("@/lib/switch-api/sync-catalogo-tommy", () => ({
  tommyDdlPendiente: () => tommyDdlPendienteMock(),
}));

const calvinDdlPendienteMock = vi.fn<() => Promise<boolean>>().mockResolvedValue(true);
vi.mock("@/lib/switch-api/sync-catalogo-calvin", () => ({
  calvinDdlPendiente: () => calvinDdlPendienteMock(),
}));

describe("calcularFotosResumen (agregación con clients mockeados)", () => {
  it("cuenta visibles sin foto por marca, respeta el guard de Tommy y arma el mensaje", async () => {
    const { calcularFotosResumen } = await import("@/lib/catalogos/fotos-resumen");
    const r = await calcularFotosResumen();

    expect(r.marcas).toEqual([
      { label: "Reebok", codigos: ["R1", "R3"] },
      { label: "Joybees", codigos: [] },
      { label: "Tommy", codigos: [], pendiente: true },
      { label: "Calvin", codigos: [], pendiente: true },
    ]);
    expect(r.totalSinFoto).toBe(2);
    expect(r.mensaje).toBe(
      "📷 Resumen semanal de fotos — Reebok: 2 sin foto · Joybees: 0 · Tommy: pendiente de activación · Calvin: pendiente de activación\n\n" +
        "Reebok (2): R1, R3",
    );

    // La query filtra visibles (active=true) y ordena por disponibilidad desc.
    expect(reebokFake.spies.from).toHaveBeenCalledWith("products");
    expect(reebokFake.spies.eq).toHaveBeenCalledWith("active", true);
    expect(reebokFake.spies.order).toHaveBeenCalledWith("disponibilidad", {
      ascending: false,
      nullsFirst: false,
    });
    // Con la DDL de Tommy/Calvin pendiente NO se consultan sus tablas.
    expect(tommyFake.spies.from).not.toHaveBeenCalled();
    expect(calvinFake.spies.from).not.toHaveBeenCalled();
  });
});

// ── Registro del cron semanal en la telemetría ───────────────────────────────

vi.mock("@/lib/supabase-server", () => ({ supabaseServer: { from: vi.fn() } }));
vi.mock("@/lib/telegram", () => ({
  sendTelegramAlert: vi.fn(),
  shortError: (s: string) => s,
}));

describe("telemetría del cron catalogos-fotos-resumen", () => {
  it("umbral SEMANAL propio (8 días), seed-tolerante y recuperable desde las 14 UTC", async () => {
    const t = await import("@/lib/cron-telemetry");
    expect(t.CRON_STALE_HOURS_POR_CRON["catalogos-fotos-resumen"]).toBe(8 * 24);
    expect(t.cronStaleThresholdHours("catalogos-fotos-resumen")).toBe(192);
    expect(t.SEED_TOLERANT_CRONS).toContain("catalogos-fotos-resumen");
    expect(t.COLATERAL_RECOVER_AFTER_HOUR_UTC["catalogos-fotos-resumen"]).toBe(14);
  });

  it("JAMÁS se silencia por 'recuperación en camino' (semanal, patrón grupo-resumen)", async () => {
    const t = await import("@/lib/cron-telemetry");
    expect(t.NUNCA_SILENCIAR.has("catalogos-fotos-resumen")).toBe(true);
    for (const h of [0, 9, 13, 17]) {
      expect(t.recoveryStillComingToday("catalogos-fotos-resumen", h)).toBe(false);
    }
  });

  it("umbral semanal: 5 días sin success NO es stale; 9 días sí", async () => {
    const t = await import("@/lib/cron-telemetry");
    const now = Date.parse("2026-07-27T13:00:00.000Z");
    const hace = (dias: number) => new Date(now - dias * 24 * 3600 * 1000).toISOString();
    expect(t.cronIsStale("catalogos-fotos-resumen", hace(5), now)).toBe(false);
    expect(t.cronIsStale("catalogos-fotos-resumen", hace(9), now)).toBe(true);
  });
});
