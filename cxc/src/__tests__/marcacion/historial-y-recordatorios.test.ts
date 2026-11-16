// @vitest-environment node
//
// 🔴 CANDADO — «MIS MARCACIONES» Y «RECORDATORIOS» EN MARCACIÓN (16-nov-2026).
//   1. El historial muestra la hora CORREGIDA y no muestra la marca quitada.
//   2. Cada persona ve SOLO lo suyo: el código sale de la sesión, no de la URL.
//   3. A quién avisar: feriado, día libre, ya marcó, anti-duplicado.
//   4. El interruptor nace apagado.

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Correccion, MarcacionConId } from "@/lib/asistencia/correcciones";

let marcasCrudas: MarcacionConId[] = [];
let correcciones: Correccion[] = [];

vi.mock("@/lib/supabase-server", () => ({ supabaseServer: {} }));
vi.mock("@/lib/supabase-paginado", () => ({ leerTodoPaginado: async () => marcasCrudas }));
vi.mock("@/lib/asistencia/correcciones-server", () => ({
  leerCorrecciones: async () => ({ correcciones, faltaMigracion: false }),
}));
vi.mock("@/lib/asistencia/codigo-por-reloj-server", () => ({ leerMapaDeReloj: async () => new Map() }));

const pa = (dia: string, hora: string) => new Date(`${dia}T${hora}-05:00`).toISOString();
const marca = (id: string, codigo: string, dia: string, hora: string): MarcacionConId => ({
  id,
  empleado_codigo: codigo,
  empleado_nombre: null,
  ocurrio_en: pa(dia, hora),
  dispositivo: "telefono",
} as MarcacionConId);
const corr = (c: Partial<Correccion> & { id: string; empleadoCodigo: string; fecha: string }): Correccion => ({
  marcacionId: null,
  hora: "",
  motivo: "—",
  creadaPor: "roxana",
  creadaEn: "2026-11-14T00:00:00Z",
  ...c,
});

describe("1 · el historial con correcciones", () => {
  beforeEach(() => {
    marcasCrudas = [
      marca("a", "306", "2026-11-13", "09:57:00"),
      marca("b", "306", "2026-11-13", "12:19:00"), // la deshizo ella
      marca("c", "306", "2026-11-13", "12:20:00"),
      marca("d", "306", "2026-11-13", "13:19:00"),
      marca("e", "306", "2026-11-13", "18:55:00"), // Roxana la corrigió a 19:00
      marca("f", "7", "2026-11-13", "08:00:00"), // de otra persona
    ];
    correcciones = [
      corr({ id: "q", marcacionId: "b", empleadoCodigo: "306", fecha: "2026-11-13", quita: true }),
      corr({ id: "h", marcacionId: "e", empleadoCodigo: "306", fecha: "2026-11-13", hora: "19:00:00" }),
      corr({ id: "x", empleadoCodigo: "7", fecha: "2026-11-13", hora: "17:00:00" }), // agregada a otra persona
    ];
  });

  it("hora corregida, marca quitada fuera, y nada de otra persona", async () => {
    const { leerMarcasEfectivas } = await import("@/lib/asistencia/quien-marco-server");
    const { filasDelHistorial } = await import("@/lib/marcacion/historial");
    const marcas = await leerMarcasEfectivas("2026-11-01", "2026-11-15", "306");
    expect(marcas.every((m) => m.empleado_codigo === "306")).toBe(true);
    const filas = filasDelHistorial(marcas.map((m) => ({ ocurrioEn: m.ocurrio_en })), "2026-11-16");
    expect(filas).toEqual([
      { fecha: "2026-11-13", dia: "Vie 13", entrada: "9:57", almuerzo: "12:20", regreso: "1:19", salida: "7:00", faltaMarca: false },
    ]);
  });

  it("un día cerrado con menos de 4 lleva «Falta una marca»; hoy nunca; los días sin marcas no salen", async () => {
    const { filasDelHistorial } = await import("@/lib/marcacion/historial");
    const filas = filasDelHistorial(
      [
        { ocurrioEn: pa("2026-11-16", "08:57:00") },
        { ocurrioEn: pa("2026-11-16", "12:10:00") },
        { ocurrioEn: pa("2026-11-14", "08:57:00") },
      ],
      "2026-11-16",
    );
    expect(filas.map((f) => [f.fecha, f.faltaMarca, f.salida])).toEqual([
      ["2026-11-16", false, null],
      ["2026-11-14", true, null],
    ]);
  });

  it("las quincenas: rótulos, flechas y el tope del 1-jul-2026", async () => {
    const h = await import("@/lib/marcacion/historial");
    const hoy = "2026-11-16";
    expect(h.rotuloDelHistorial(h.quincenaPedida(null, hoy), hoy)).toBe("Esta quincena (16–30 nov)");
    expect(h.rotuloDelHistorial(h.quincenaPedida("2026-11-1", hoy), hoy)).toBe("Quincena anterior (1–15 nov)");
    expect(h.rotuloDelHistorial(h.quincenaPedida("2026-10-2", hoy), hoy)).toBe("16–31 oct");
    expect(h.quincenaPedida("2026-06-2", hoy).desde).toBe("2026-07-01");
    expect(h.quincenaPedida("2026-12-1", hoy).desde).toBe("2026-11-16");
    expect(h.quincenaAnterior({ desde: "2026-11-01", hasta: "2026-11-15" })).toEqual({ desde: "2026-10-16", hasta: "2026-10-31" });
    expect(h.quincenaSiguiente({ desde: "2026-10-16", hasta: "2026-10-31" })).toEqual({ desde: "2026-11-01", hasta: "2026-11-15" });
  });
});

describe("2 · cada persona ve SOLO lo suyo", () => {
  it("un ?codigo= en la URL se ignora: manda la sesión", async () => {
    vi.resetModules();
    const pedidos: (string | undefined)[] = [];
    vi.doMock("@/lib/marcacion/acceso", () => ({
      requireMarcacion: () => ({ role: "marcacion", userId: "u-306", userName: "yeisibeth" }),
      leerEmpleadoCodigo: async () => "306",
    }));
    vi.doMock("@/lib/asistencia/quien-marco-server", () => ({
      leerMarcasEfectivas: async (_d: string, _h: string, codigo?: string) => {
        pedidos.push(codigo);
        return [];
      },
    }));
    const { GET } = await import("@/app/api/marcacion/historial/route");
    const { NextRequest } = await import("next/server");
    const res = await GET(new NextRequest("http://x/api/marcacion/historial?quincena=2026-11-1&codigo=7&empleado_codigo=7"));
    expect(res.status).toBe(200);
    expect(pedidos).toEqual(["306"]);
    vi.doUnmock("@/lib/marcacion/acceso");
    vi.doUnmock("@/lib/asistencia/quien-marco-server");
  });

  it("sin código de colaborador no lee nada", async () => {
    vi.resetModules();
    const leer = vi.fn(async () => []);
    vi.doMock("@/lib/marcacion/acceso", () => ({
      requireMarcacion: () => ({ role: "marcacion", userId: "u-x", userName: "x" }),
      leerEmpleadoCodigo: async () => null,
    }));
    vi.doMock("@/lib/asistencia/quien-marco-server", () => ({ leerMarcasEfectivas: leer }));
    const { GET } = await import("@/app/api/marcacion/historial/route");
    const { NextRequest } = await import("next/server");
    const res = await GET(new NextRequest("http://x/api/marcacion/historial?codigo=7"));
    expect(res.status).toBe(404);
    expect(leer).not.toHaveBeenCalled();
    vi.doUnmock("@/lib/marcacion/acceso");
    vi.doUnmock("@/lib/asistencia/quien-marco-server");
  });
});

describe("3 · a quién avisar", () => {
  const base = async () => {
    const r = await import("@/lib/marcacion/recordatorios");
    return {
      r,
      e: {
        hoy: "2026-11-17", // martes
        ahora: "09:02",
        recordatorios: [{ codigo: "306", marca: 0 as const, hora: "09:00" }],
        diasLaborables: new Map<string, readonly number[]>(),
        hoyNoSeTrabaja: false,
        marcasHoy: new Map<string, number>(),
        yaAvisados: new Set<string>(),
      },
    };
  };

  it("hora en los últimos 5 minutos, día hábil y sin marcar: se avisa", async () => {
    const { r, e } = await base();
    expect(r.aQuienAvisar(e)).toEqual([{ codigo: "306", marca: 0 }]);
    expect(r.textoDelAviso(0)).toBe("Recuerda marcar tu entrada");
    expect(r.aQuienAvisar({ ...e, ahora: "09:06" })).toEqual([]);
    expect(r.aQuienAvisar({ ...e, ahora: "08:59" })).toEqual([]);
  });

  it("feriado o día libre de la empresa: no se avisa", async () => {
    const { r, e } = await base();
    expect(r.aQuienAvisar({ ...e, hoyNoSeTrabaja: true })).toEqual([]);
  });

  it("su día libre (no laborable para ella) y el domingo: no se avisa", async () => {
    const { r, e } = await base();
    expect(r.aQuienAvisar({ ...e, diasLaborables: new Map([["306", [1, 3, 4, 5, 6]]]) })).toEqual([]);
    expect(r.aQuienAvisar({ ...e, hoy: "2026-11-15" })).toEqual([]);
  });

  it("ya marcó esa marca: no se avisa; la siguiente sí", async () => {
    const { r, e } = await base();
    expect(r.aQuienAvisar({ ...e, marcasHoy: new Map([["306", 1]]) })).toEqual([]);
    const salida = { ...e, ahora: "18:01", recordatorios: [{ codigo: "306", marca: 3 as const, hora: "18:00" }] };
    expect(r.aQuienAvisar({ ...salida, marcasHoy: new Map([["306", 3]]) })).toEqual([{ codigo: "306", marca: 3 }]);
    expect(r.aQuienAvisar({ ...salida, marcasHoy: new Map([["306", 4]]) })).toEqual([]);
  });

  it("anti-duplicado: un aviso por persona, marca y día", async () => {
    const { r, e } = await base();
    expect(r.aQuienAvisar({ ...e, yaAvisados: new Set([r.llaveAviso("306", 0)]) })).toEqual([]);
  });

  it("ficha de baja: no se avisa", async () => {
    const { r, e } = await base();
    expect(r.aQuienAvisar({ ...e, deBaja: new Set(["306"]) })).toEqual([]);
  });

  it("renglones: apagados por defecto, Entrada y Salida con su horario, el almuerzo sin hora inventada", async () => {
    const { r } = await base();
    expect(r.recordatoriosDe([], { entrada: "09:00", salida: "18:00" })).toEqual([
      { marca: 0, activo: false, hora: "09:00" },
      { marca: 1, activo: false, hora: null },
      { marca: 2, activo: false, hora: null },
      { marca: 3, activo: false, hora: "18:00" },
    ]);
    // Un recordatorio encendido sin hora no vale.
    expect(r.validarRecordatorios([{ marca: 1, activo: true, hora: null }])).toBeNull();
    expect(r.validarRecordatorios([{ marca: 1, activo: true, hora: "12:30" }])).toEqual([{ marca: 1, activo: true, hora: "12:30" }]);
  });
});

describe("3b · la ruta que manda los avisos", () => {
  it("sin CRON_SECRET correcto contesta 401 y no lee nada", async () => {
    process.env.CRON_SECRET = "secreto-de-prueba";
    const { POST } = await import("@/app/api/recordatorios-marcacion/route");
    const { NextRequest } = await import("next/server");
    const sin = await POST(new NextRequest("http://x/api/recordatorios-marcacion", { method: "POST" }));
    expect(sin.status).toBe(401);
    const mala = await POST(new NextRequest("http://x/api/recordatorios-marcacion", { method: "POST", headers: { authorization: "Bearer otro" } }));
    expect(mala.status).toBe(401);
  });
});

describe("4 · el interruptor", () => {
  it("nace apagado: la pantalla de marcar queda como hoy", async () => {
    const { MARCACION_HISTORIAL_Y_AVISOS_2026_11 } = await import("@/lib/ui/marcacion-historial-avisos-2026-11");
    expect(MARCACION_HISTORIAL_Y_AVISOS_2026_11).toBe(false);
  });
});
