// ─────────────────────────────────────────────────────────────────────────────
// 🔴 ELIMINAR UNA PLANILLA: SOLO REABIERTA, Y SOLO SI NO BAJÓ NINGUNA DEUDA
//
// Daniel, 16-sep-2026: *«¿hace sentido reabrir y no eliminar? ¿no es lo mismo?
// quiero q sea sencillo»* y, sobre esta solución, *«si agregalo»*.
//
// Este candado fija las dos condiciones y el orden del flujo. Si alguien mañana
// «simplifica» ofreciendo borrar una cerrada de un tirón, o dejando pasar una
// que le bajó la deuda a alguien, esto se pone rojo.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import {
  porQueNoSePuedeEliminar,
  sePuedeEliminar,
  reabiertaDe,
  type CabeceraGuardada,
} from "@/lib/asistencia/planilla-guardada";

const base = (over: Partial<CabeceraGuardada> = {}): CabeceraGuardada => ({
  id: "a1",
  empresa: "fashion_wear",
  desde: "2026-09-01",
  hasta: "2026-09-15",
  corte: null,
  quincena: "2026-09-1",
  etiqueta: "1 sep 2026 al 15 sep 2026",
  version: 1,
  estado: "reabierta",
  cerradaPor: "roxana",
  cerradaEn: "2026-09-13T18:00:00.000Z",
  reabiertaPor: "daniel",
  reabiertaEn: "2026-09-16T12:00:00.000Z",
  motivoReabrir: "prueba",
  personas: 8,
  totalBruto: 1000,
  totalDeducciones: 100,
  totalNeto: 900,
  factorBase: 1,
  ...over,
});

describe("cuándo se puede eliminar una planilla", () => {
  it("una REABIERTA sin pagos de préstamo se puede borrar", () => {
    expect(sePuedeEliminar(base(), 0)).toBe(true);
    expect(porQueNoSePuedeEliminar(base(), 0)).toBeNull();
  });

  // 🔴 EL PRIMER FRENO. Reabrir es lo que devuelve los descuentos y deja escrito
  // el porqué; sin ese paso, borrar sería perder una firma de pago en un clic.
  it("una CERRADA no se borra: primero hay que reabrirla", () => {
    const c = base({ estado: "cerrada" });
    expect(sePuedeEliminar(c, 0)).toBe(false);
    expect(porQueNoSePuedeEliminar(c, 0)).toMatch(/reabrirla/i);
  });

  // 🩸 EL FRENO QUE IMPORTA, y es el mismo que la migración
  // `20261201120000_borrar_planillas_de_prueba.sql` puso a mano el 15-sep-2026:
  // «ABORTADO: hay N pago(s) de préstamo atados a estas cabeceras».
  it("una reabierta que le bajó la deuda a alguien NO se borra", () => {
    expect(sePuedeEliminar(base(), 1)).toBe(false);
    expect(porQueNoSePuedeEliminar(base(), 2)).toMatch(/2 colaboradores/);
  });

  // ⚠️ Que el pago esté revertido no cambia nada: la fila del amarre sigue
  // ahí, y es la constancia de que esa deuda se tocó.
  it("el conteo es de amarres, revertidos incluidos: 1 ya frena", () => {
    expect(porQueNoSePuedeEliminar(base(), 1)).toMatch(/un colaborador/);
  });

  it("una que se está cerrando en este momento tampoco se borra", () => {
    expect(sePuedeEliminar(base({ estado: "cerrando" }), 0)).toBe(false);
  });
});

describe("cuál reabierta se ofrece borrar", () => {
  // ⚠️ LA v2 VA PRIMERA A PROPÓSITO: con la mayor al final, «me quedo con la
  // última» daría el mismo resultado que «me quedo con la mayor» y este candado
  // no distinguiría las dos. La lectura real llega ordenada por fecha, no por
  // versión, así que el orden del arreglo no se puede dar por bueno.
  const cabeceras = [
    base({ id: "v2", version: 2, estado: "reabierta" }),
    base({ id: "v1", version: 1, estado: "reabierta" }),
    base({ id: "otra", desde: "2026-08-16", hasta: "2026-08-30" }),
    base({ id: "otraEmpresa", empresa: "vistana" }),
    base({ id: "cerrada", version: 3, estado: "cerrada" }),
  ];
  const rango = { desde: "2026-09-01", hasta: "2026-09-15" };

  it("gana la de versión más alta de ESE rango y ESA empresa", () => {
    expect(reabiertaDe("fashion_wear", rango, cabeceras)?.id).toBe("v2");
  });

  // 🔴 Rango EXACTO, nunca solapamiento: ofrecerle borrar «la que se pisa»
  // sería ofrecerle borrar un cuadro que no está mirando.
  it("un rango que no coincide exacto no trae nada", () => {
    expect(reabiertaDe("fashion_wear", { desde: "2026-09-01", hasta: "2026-09-10" }, cabeceras)).toBeNull();
  });

  it("no cruza empresas", () => {
    expect(reabiertaDe("joystep", rango, cabeceras)).toBeNull();
  });

  it("una CERRADA nunca sale por acá", () => {
    const soloCerrada = [base({ id: "c", estado: "cerrada" })];
    expect(reabiertaDe("fashion_wear", rango, soloCerrada)).toBeNull();
  });
});
