/**
 * ─────────────────────────────────────────────────────────────────────────────
 * EL PANEL DE GUÍAS — LO QUE DECIDEN LOS MÓDULOS PUROS (5-sep-2026).
 *
 * Daniel aprobó seis cambios de golpe: *«no, mándalo así»*. Dos de ellos se
 * deciden acá, con fechas FIJAS y sin tocar el DOM:
 *
 *   · **La ventana del último mes.** La lista se traía las 222 guías vivas y
 *     mostraba 15 con un «Ver más» que había que tocar 14 veces. Medido:
 *     **46 guías en el último mes**.
 *   · **Lo que espera algo va arriba, y se dice en una línea.** Medido: de
 *     **222 guías, 221 «Completada» y UNA «Pendiente Bodega»** (GT-239, del
 *     1-sep). Si no hay ninguna, la línea NO aparece.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, it, expect } from "vitest";
import { partirGuiasPorVentana, DIAS_VENTANA_GUIAS } from "@/lib/guias/ventana-lista";
import { separarPendientes, resumenPendientes } from "@/lib/guias/pendientes-arriba";

/** 5-sep-2026, 15:00 UTC = 10 a.m. en Panamá. */
const AHORA = new Date("2026-09-05T15:00:00Z");

const g = (numero: number, fecha: string | null, estado = "Completada") => ({
  id: `g${numero}`,
  numero,
  fecha,
  estado,
});

describe("🔴 la lista abre con el último mes", () => {
  it("son 30 días, y el corte es por FECHA — no por cantidad", () => {
    expect(DIAS_VENTANA_GUIAS).toBe(30);
  });

  it("lo de este mes se muestra; lo de hace tres, detrás del botón", () => {
    const { recientes, viejas } = partirGuiasPorVentana(
      [g(240, "2026-09-01"), g(200, "2026-08-20"), g(120, "2026-06-15"), g(9, "2026-03-02")],
      AHORA,
    );
    expect(recientes.map((x) => x.numero)).toEqual([240, 200]);
    expect(viejas.map((x) => x.numero)).toEqual([120, 9]);
  });

  it("el borde exacto: el día 30 entra, el 31 no", () => {
    const { recientes, viejas } = partirGuiasPorVentana(
      [g(1, "2026-08-06"), g(2, "2026-08-05")],
      AHORA,
    );
    expect(recientes.map((x) => x.numero)).toEqual([1]);
    expect(viejas.map((x) => x.numero)).toEqual([2]);
  });

  it("🔴 una guía SIN fecha se MUESTRA — esconderla por un dato roto sería peor", () => {
    const { recientes, viejas } = partirGuiasPorVentana([g(7, null), g(8, "no es fecha")], AHORA);
    expect(recientes.map((x) => x.numero)).toEqual([7, 8]);
    expect(viejas).toHaveLength(0);
  });

  it("no pierde ni duplica ninguna guía", () => {
    const todas = [g(1, "2026-09-01"), g(2, "2026-01-01"), g(3, null), g(4, "2026-08-30")];
    const { recientes, viejas } = partirGuiasPorVentana(todas, AHORA);
    expect(recientes.length + viejas.length).toBe(todas.length);
  });
});

describe("🔴 lo que espera algo va arriba", () => {
  const PRODUCCION = [
    g(239, "2026-09-01", "Pendiente Bodega"),
    g(240, "2026-09-04"),
    g(238, "2026-08-31"),
  ];

  it("las pendientes salen aparte, de la MÁS VIEJA a la más nueva", () => {
    const { pendientes, resto } = separarPendientes(
      [...PRODUCCION, g(100, "2026-07-01", "Pendiente Bodega")],
      (x) => x.estado === "Pendiente Bodega",
    );
    expect(pendientes.map((x) => x.numero)).toEqual([100, 239]);
    expect(resto.map((x) => x.numero)).toEqual([240, 238]);
  });

  it("una pendiente SIN fecha va primero: es la que más hay que mirar", () => {
    const { pendientes } = separarPendientes(
      [g(1, "2026-09-01", "Pendiente Bodega"), g(2, null, "Pendiente Bodega")],
      (x) => x.estado === "Pendiente Bodega",
    );
    expect(pendientes.map((x) => x.numero)).toEqual([2, 1]);
  });

  it("🔴 el caso REAL de producción: «1 guía sin despachar — hace 4 días»", () => {
    // GT-239 es del 1-sep; el «hoy» de Panamá para AHORA es el 5-sep.
    const { pendientes } = separarPendientes(PRODUCCION, (x) => x.estado === "Pendiente Bodega");
    const r = resumenPendientes(pendientes, AHORA);
    expect(r).not.toBeNull();
    expect(r!.texto).toBe("1 guía sin despachar — hace 4 días");
    expect(r!.guiaId).toBe("g239");
  });

  it("🔴 SIN pendientes, la línea NO existe — nada de un cero grande", () => {
    const { pendientes } = separarPendientes([g(240, "2026-09-04")], (x) => x.estado === "Pendiente Bodega");
    expect(pendientes).toHaveLength(0);
    expect(resumenPendientes(pendientes, AHORA)).toBeNull();
  });

  it("con varias dice cuántas son y la antigüedad de la MÁS VIEJA", () => {
    const pend = [g(100, "2026-07-01", "Pendiente Bodega"), g(239, "2026-09-01", "Pendiente Bodega")];
    const r = resumenPendientes(pend, AHORA)!;
    expect(r.texto).toBe("2 guías sin despachar — la más vieja, hace 66 días");
    expect(r.guiaId).toBe("g100");
  });

  it("la de hoy dice «hoy», y la de ayer «hace 1 día» — sin plurales rotos", () => {
    expect(resumenPendientes([g(1, "2026-09-05", "Pendiente Bodega")], AHORA)!.texto)
      .toBe("1 guía sin despachar — hoy");
    expect(resumenPendientes([g(1, "2026-09-04", "Pendiente Bodega")], AHORA)!.texto)
      .toBe("1 guía sin despachar — hace 1 día");
  });

  it("🔴 sin fecha legible NO se inventa una antigüedad", () => {
    const r = resumenPendientes([g(1, null, "Pendiente Bodega")], AHORA)!;
    expect(r.texto).toBe("1 guía sin despachar");
    expect(r.guiaId).toBe("g1");
  });
});
