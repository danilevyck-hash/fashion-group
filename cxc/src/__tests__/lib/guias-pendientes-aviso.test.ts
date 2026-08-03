// ─────────────────────────────────────────────────────────────────────────────
// Aviso de guías sin despachar. Fechas FIJAS, nunca `new Date()`.
//
// Contexto: el 3-ago-2026 había 55 guías en "Pendiente Bodega", la más vieja
// del 24-jul, con la mercancía ya entregada. Nadie se enteró porque el aviso de
// despacho sale solo al cerrar la guía. Esto es la red para que no se repita.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import {
  guiasVencidas,
  buildAvisoPendientes,
  diaPanama,
  DIAS_PARA_AVISAR,
  MAX_EN_MENSAJE,
  type GuiaPendiente,
} from "@/lib/guias/pendientes-aviso";

const g = (numero: number, fecha: string | null, extra: Partial<GuiaPendiente> = {}): GuiaPendiente => ({
  numero,
  fecha,
  ...extra,
});

describe("el día de Panamá (UTC−5 fijo)", () => {
  it("a las 02:00 UTC todavía es el día ANTERIOR en Panamá", () => {
    expect(diaPanama(new Date("2026-08-03T02:00:00Z"))).toBe("2026-08-02");
  });

  it("a las 05:00 UTC ya cambió el día", () => {
    expect(diaPanama(new Date("2026-08-03T05:00:00Z"))).toBe("2026-08-03");
  });

  it("a las 14:30 UTC (la hora del cron) es el mismo día", () => {
    expect(diaPanama(new Date("2026-08-03T14:30:00Z"))).toBe("2026-08-03");
  });
});

describe("🔴 qué se considera vencida", () => {
  const ahora = new Date("2026-08-03T14:30:00Z"); // 3-ago, 9:30 a.m. Panamá

  it("el umbral son 2 días", () => {
    expect(DIAS_PARA_AVISAR).toBe(2);
  });

  it("la de HOY no vence", () => {
    expect(guiasVencidas([g(185, "2026-08-03")], ahora)).toHaveLength(0);
  });

  it("la de AYER tampoco (1 día)", () => {
    expect(guiasVencidas([g(184, "2026-08-02")], ahora)).toHaveLength(0);
  });

  it("la de anteayer SÍ (2 días, el borde exacto)", () => {
    const v = guiasVencidas([g(183, "2026-08-01")], ahora);
    expect(v).toHaveLength(1);
    expect(v[0].dias).toBe(2);
  });

  it("la del 24-jul da 10 días — el caso real que destapó esto", () => {
    const v = guiasVencidas([g(171, "2026-07-24")], ahora);
    expect(v[0].dias).toBe(10);
  });

  it("⚠️ una guía SIN fecha se ignora (si no, avisaría para siempre)", () => {
    expect(guiasVencidas([g(999, null)], ahora)).toHaveLength(0);
  });

  it("ordena de la más vieja a la más nueva", () => {
    const v = guiasVencidas(
      [g(180, "2026-07-30"), g(171, "2026-07-24"), g(177, "2026-07-28")],
      ahora,
    );
    expect(v.map((x) => x.numero)).toEqual([171, 177, 180]);
  });
});

describe("🔴 el mensaje", () => {
  const ahora = new Date("2026-08-03T14:30:00Z");

  it("sin vencidas NO manda nada — nunca un 'todas al día ✅'", () => {
    expect(buildAvisoPendientes([])).toBeNull();
    expect(buildAvisoPendientes(guiasVencidas([g(185, "2026-08-03")], ahora))).toBeNull();
  });

  it("una sola guía va en singular", () => {
    const msg = buildAvisoPendientes(guiasVencidas([g(171, "2026-07-24")], ahora))!;
    expect(msg).toContain("1 guía sin despachar");
    expect(msg).not.toContain("guías sin despachar");
  });

  it("numera con el formato GT-XXX que se ve en la app", () => {
    const msg = buildAvisoPendientes(guiasVencidas([g(171, "2026-07-24")], ahora))!;
    expect(msg).toContain("GT-171");
  });

  it("muestra el transportista, o 'Entrega directa' cuando no hay", () => {
    const msg = buildAvisoPendientes(
      guiasVencidas(
        [
          g(182, "2026-07-30", { transportista: "RedNblue" }),
          g(181, "2026-07-30", { modo_entrega: "entrega_directa" }),
        ],
        ahora,
      ),
    )!;
    expect(msg).toContain("RedNblue");
    expect(msg).toContain("Entrega directa");
  });

  it("dice qué hacer, sin jerga", () => {
    const msg = buildAvisoPendientes(guiasVencidas([g(171, "2026-07-24")], ahora))!;
    expect(msg).toContain("márcalas como despachadas");
    for (const jerga of ["estado", "Completada", "PATCH", "null", "query"]) {
      expect(msg).not.toContain(jerga);
    }
  });

  it(`lista hasta ${MAX_EN_MENSAJE} y resume el resto`, () => {
    const muchas = Array.from({ length: MAX_EN_MENSAJE + 5 }, (_, i) => g(100 + i, "2026-07-24"));
    const msg = buildAvisoPendientes(guiasVencidas(muchas, ahora))!;
    expect(msg).toContain(`${MAX_EN_MENSAJE + 5} guías sin despachar`);
    expect(msg).toContain("…y 5 más.");
    expect(msg.split("• GT-")).toHaveLength(MAX_EN_MENSAJE + 1);
  });

  it("el escenario real del 3-ago: 55 pendientes, 3 listadas de ejemplo", () => {
    const reales = [
      g(171, "2026-07-24"),
      g(177, "2026-07-30", { modo_entrega: "entrega_directa" }),
      g(182, "2026-07-30", { transportista: "RedNblue" }),
      g(185, "2026-08-03"), // de hoy: NO entra
    ];
    const v = guiasVencidas(reales, ahora);
    expect(v).toHaveLength(3);
    expect(buildAvisoPendientes(v)).toContain("3 guías sin despachar");
  });
});
