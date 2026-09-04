// ─────────────────────────────────────────────────────────────────────────────
// 🔴 CONDUCTA: «Aplicar quincena» aplica con la fecha ELEGIDA, no con hoy.
//
// El botón viejo escribía la fecha de HOY y por eso nadie lo usó en 90 días
// (cero `prestamo_aplicar_quincena` en activity_logs): contabilidad registra
// 1–4 días después del pago y el movimiento caía en la quincena equivocada.
//
// Lo que se amarra aquí:
//  1. La fecha del cuerpo es la que llega a la RPC — y la QUINCENA del dedup
//     se deriva de ESA fecha, no de hoy (si no, aplicar dos veces cobra dos).
//  2. Los atajos «15» y «fin de mes» dan la fecha correcta en meses de
//     28/29/30/31 días.
//  3. Quien ya tiene un pago en la quincena elegida NO se duplica y SE DICE.
//  4. El monto por persona es el mismo que el pago individual (la deducción,
//     capeada al saldo en la última cuota — igual que la RPC).
//
// Fechas FIJAS siempre; el único `new Date()` permitido es el del fallback
// sin cuerpo, y ahí se congela el reloj.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { signSession } from "@/lib/session-cookie";
import {
  quincenaDeFecha,
  atajosFechaPago,
  esFechaISO,
  resumenAplicarQuincena,
  type PersonaQuincena,
} from "@/lib/prestamos-quincena";

const SECRET_PREV = process.env.SESSION_SECRET;
beforeAll(() => { process.env.SESSION_SECRET = "test-secret-aplicar-quincena"; });
afterAll(() => { process.env.SESSION_SECRET = SECRET_PREV; });

/** Cada llamada a la RPC: [nombre, args]. */
const rpcCalls: Array<[string, Record<string, string>]> = [];

vi.mock("@/lib/supabase-server", () => ({
  supabaseServer: {
    rpc: (fn: string, args: Record<string, string>) => {
      rpcCalls.push([fn, args]);
      return Promise.resolve({
        data: { aplicados: [], omitidos: [], total: 0, count_aplicados: 0, count_omitidos: 0 },
        error: null,
      });
    },
  },
}));

vi.mock("@/lib/log-activity", () => ({ logActivity: vi.fn(async () => {}) }));

const { POST } = await import("@/app/api/prestamos/aplicar-quincena/route");

function pedir(body: string | null, role = "contabilidad") {
  const cookie = signSession({ role, userId: "u1", userName: "conta", sessionToken: "t1", modules: ["prestamos"] });
  return new NextRequest("https://fashiongr.com/api/prestamos/aplicar-quincena", {
    method: "POST",
    headers: { cookie: `cxc_session=${cookie}`, "content-type": "application/json" },
    ...(body === null ? {} : { body }),
  });
}

beforeEach(() => { rpcCalls.length = 0; });

describe("POST /api/prestamos/aplicar-quincena — la fecha elegida manda", () => {
  it("guarda la fecha del cuerpo, no la de hoy, y el dedup mira la quincena de ESA fecha", async () => {
    // El caso medido: el 1-sep contabilidad registra la quincena del 30-ago.
    const res = await POST(pedir(JSON.stringify({ fecha: "2026-08-30" })));
    expect(res.status).toBe(200);
    expect(rpcCalls).toHaveLength(1);
    const [fn, args] = rpcCalls[0];
    expect(fn).toBe("prestamos_aplicar_quincena");
    expect(args.p_fecha).toBe("2026-08-30");
    // 🔑 La quincena del dedup es la de agosto 16–31, NO la quincena de hoy.
    expect(args.p_quincena_start).toBe("2026-08-16");
    expect(args.p_quincena_end).toBe("2026-08-31");
  });

  it("fin de mes real: el 31 cae en la quincena 16–31; el 15 en la 1–15", async () => {
    await POST(pedir(JSON.stringify({ fecha: "2026-07-31" })));
    expect(rpcCalls[0][1]).toMatchObject({ p_fecha: "2026-07-31", p_quincena_start: "2026-07-16", p_quincena_end: "2026-07-31" });
    await POST(pedir(JSON.stringify({ fecha: "2026-07-15" })));
    expect(rpcCalls[1][1]).toMatchObject({ p_fecha: "2026-07-15", p_quincena_start: "2026-07-01", p_quincena_end: "2026-07-15" });
  });

  it("una fecha que no existe se rechaza con 400 y NO llama la RPC", async () => {
    for (const mala of ["2026-02-30", "30-08-2026", "2026-13-01", "hola", "2026-08-3", ""]) {
      const res = await POST(pedir(JSON.stringify({ fecha: mala })));
      expect(res.status, `fecha "${mala}"`).toBe(400);
    }
    expect(rpcCalls).toHaveLength(0);
  });

  it("sin cuerpo conserva la conducta vieja: hoy en Panamá y su quincena", async () => {
    vi.useFakeTimers();
    // 02:00 UTC del 16-sep = 21:00 del 15-sep en Panamá → quincena 1–15.
    vi.setSystemTime(new Date("2026-09-16T02:00:00Z"));
    const res = await POST(pedir(null));
    vi.useRealTimers();
    expect(res.status).toBe(200);
    expect(rpcCalls[0][1]).toMatchObject({ p_fecha: "2026-09-15", p_quincena_start: "2026-09-01", p_quincena_end: "2026-09-15" });
  });

  it("sin sesión de admin/contabilidad → 403 sin tocar la RPC", async () => {
    const res = await POST(pedir(JSON.stringify({ fecha: "2026-08-30" }), "vendedor"));
    expect(res.status).toBe(403);
    expect(rpcCalls).toHaveLength(0);
  });
});

describe("quincenaDeFecha — meses de 28/29/30/31 días", () => {
  it.each([
    ["2026-02-10", "2026-02-01", "2026-02-15"],
    ["2026-02-20", "2026-02-16", "2026-02-28"], // febrero normal
    ["2028-02-20", "2028-02-16", "2028-02-29"], // bisiesto
    ["2026-04-30", "2026-04-16", "2026-04-30"], // 30 días
    ["2026-08-31", "2026-08-16", "2026-08-31"], // 31 días
    ["2026-08-16", "2026-08-16", "2026-08-31"],
    ["2026-08-15", "2026-08-01", "2026-08-15"],
    ["2026-12-31", "2026-12-16", "2026-12-31"],
  ])("%s → [%s, %s]", (fecha, start, end) => {
    expect(quincenaDeFecha(fecha)).toEqual({ start, end });
  });
});

describe("atajosFechaPago — los dos pagos más recientes que ya pasaron", () => {
  it("el 1-sep propone el 31 de agosto (el pago que acaba de pasar), no el 30 de septiembre", () => {
    expect(atajosFechaPago("2026-09-01").map(a => a.fecha)).toEqual(["2026-08-31", "2026-08-15"]);
  });
  it("el día 15 propone el 15 mismo y el fin de mes anterior", () => {
    const a = atajosFechaPago("2026-09-15");
    expect(a.map(x => x.fecha)).toEqual(["2026-09-15", "2026-08-31"]);
    expect(a[0].label).toBe("15 de septiembre");
    expect(a[1].label).toBe("31 de agosto");
  });
  it("fin de mes REAL en febrero: el 1-mar propone el 28 (o 29 en bisiesto)", () => {
    expect(atajosFechaPago("2026-03-01").map(a => a.fecha)).toEqual(["2026-02-28", "2026-02-15"]);
    expect(atajosFechaPago("2028-03-01").map(a => a.fecha)).toEqual(["2028-02-29", "2028-02-15"]);
  });
  it("fin de mes de 30 días: el 2-may propone el 30 de abril", () => {
    expect(atajosFechaPago("2026-05-02").map(a => a.fecha)).toEqual(["2026-04-30", "2026-04-15"]);
  });
  it("en enero cruza de año y el label lo dice", () => {
    const a = atajosFechaPago("2027-01-05");
    expect(a.map(x => x.fecha)).toEqual(["2026-12-31", "2026-12-15"]);
    expect(a[0].label).toBe("31 de diciembre de 2026");
  });
  it("el último día del mes propone ese mismo día primero", () => {
    expect(atajosFechaPago("2026-08-31").map(a => a.fecha)).toEqual(["2026-08-31", "2026-08-15"]);
  });
});

describe("resumenAplicarQuincena — quien ya tiene el descuento NO se duplica y se dice", () => {
  const personas: PersonaQuincena[] = [
    // Ya pagó dentro de la quincena elegida (30-ago ∈ [16-ago, 31-ago]).
    { nombre: "MARIA", deduccion: 25, saldo: 100, fechasPagos: ["2026-08-30"] },
    // Pagó el 15 = la quincena ANTERIOR: SÍ es elegible. (La ventana es
    // asimétrica a propósito: con ±3 días al inicio, el pago del 15 quedaría
    // adentro de [13-ago, …] y el lote no le aplicaría a nadie — nunca.)
    { nombre: "KEVIN", deduccion: 50, saldo: 300, fechasPagos: ["2026-08-15"] },
    // Sin pagos: elegible; última cuota se capea al saldo.
    { nombre: "LUZ", deduccion: 50, saldo: 20, fechasPagos: [] },
    // Saldo en 0: no hay nada que descontar.
    { nombre: "RAMON", deduccion: 30, saldo: 0, fechasPagos: [] },
  ];

  it("separa elegibles, ya-tienen y sin-saldo por la fecha ELEGIDA", () => {
    const r = resumenAplicarQuincena(personas, "2026-08-30");
    expect(r.yaTienen).toEqual(["MARIA"]);
    expect(r.sinSaldo).toEqual(["RAMON"]);
    expect(r.elegibles.map(e => e.nombre)).toEqual(["KEVIN", "LUZ"]);
  });

  it("el monto por persona es el de su pago individual: la deducción, capeada al saldo", () => {
    const r = resumenAplicarQuincena(personas, "2026-08-30");
    expect(r.elegibles).toEqual([
      { nombre: "KEVIN", monto: 50 },
      { nombre: "LUZ", monto: 20 }, // última cuota: min(50, 20)
    ]);
    expect(r.total).toBe(70);
  });

  it("tolerancia de +3 días SOLO al final (la de la RPC): un pago del 1-sep cuenta para la quincena de agosto", () => {
    // El botón rápido individual escribe la fecha de HOY: un registro 1–3 días
    // después del cierre sigue siendo de esa quincena y NO se cobra de nuevo.
    const r = resumenAplicarQuincena(
      [{ nombre: "ANA", deduccion: 10, saldo: 50, fechasPagos: ["2026-09-01"] }],
      "2026-08-31",
    );
    expect(r.yaTienen).toEqual(["ANA"]);
    // Y a 4 días ya NO cuenta:
    const r2 = resumenAplicarQuincena(
      [{ nombre: "ANA", deduccion: 10, saldo: 50, fechasPagos: ["2026-09-04"] }],
      "2026-08-31",
    );
    expect(r2.elegibles.map(e => e.nombre)).toEqual(["ANA"]);
    // Al INICIO no hay tolerancia: el pago del 13-ago (quincena 1–15) no
    // bloquea la quincena 16–31.
    const r3 = resumenAplicarQuincena(
      [{ nombre: "ANA", deduccion: 10, saldo: 50, fechasPagos: ["2026-08-13"] }],
      "2026-08-31",
    );
    expect(r3.elegibles.map(e => e.nombre)).toEqual(["ANA"]);
  });

  it("si se elige otra quincena, el mismo grupo cambia de resumen (recalcula por fecha)", () => {
    // Para la quincena 1–15 de sep (ventana [1-sep, 18-sep]) el pago del
    // 30-ago es de la quincena PASADA: MARIA vuelve a ser elegible.
    const r = resumenAplicarQuincena(personas, "2026-09-15");
    expect(r.yaTienen).toEqual([]);
    expect(r.elegibles.map(e => e.nombre)).toEqual(["MARIA", "KEVIN", "LUZ"]);
    // Y para la del 16–31 de ago, MARIA (30-ago) es la única que ya tiene.
    const r2 = resumenAplicarQuincena(personas, "2026-08-31");
    expect(r2.yaTienen).toEqual(["MARIA"]);
  });
});

describe("esFechaISO", () => {
  it.each(["2026-08-30", "2026-02-28", "2028-02-29", "2026-12-31"])("acepta %s", f => {
    expect(esFechaISO(f)).toBe(true);
  });
  it.each(["2026-02-30", "2026-02-29", "2026-00-10", "2026-13-01", "2026-08-32", "26-08-30", "2026-8-30", "", null, 42])(
    "rechaza %s",
    f => { expect(esFechaISO(f)).toBe(false); },
  );
});
