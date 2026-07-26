import { describe, it, expect } from "vitest";

import {
  claveRecibo,
  diffRecibos,
  type ReciboComparable,
  type ReciboExistente,
} from "../../lib/switch-api/recibos-diff";

/**
 * CANDADO de la escritura selectiva de switch_recibos.
 *
 * El sync dejó de hacer DELETE+INSERT del mes entero 4×/día (18,3% de filas
 * muertas) y ahora escribe solo las diferencias. Lo que estos tests congelan:
 *
 *  1. EQUIVALENCIA: aplicar el plan al mes guardado da EXACTAMENTE el mismo
 *     conjunto que borrar todo y re-insertar lo que trajo Switch. Incluidas las
 *     BAJAS — un recibo que Switch anuló tiene que desaparecer, o se rompe la
 *     contabilidad.
 *  2. Que la comparación NO tenga falsos positivos: cualquier cambio en
 *     cualquier columna de negocio (incluidos total y es_retencion) obliga a
 *     reescribir la fila.
 *  3. Que `synced_at` NO cuente como cambio (si contara, el ahorro sería cero).
 */

const base: ReciboComparable = {
  fecha: "2026-07-15",
  fecha_creacion: "2026-07-15T10:23:45",
  cliente_switch_id: 4211,
  cliente_codigo: "D-170",
  cliente_nombre: "EL MACHETAZO",
  vendedor_registro: "REINALDO ESPINOSA",
  vendedor_cartera: "REINALDO ESPINOSA",
  total: 1250.5,
  es_retencion: false,
};

/** Lo que devuelve PostgREST al releer la misma fila. */
const comoLaGuardaLaBase = (r: ReciboComparable): ReciboComparable => ({
  ...r,
  fecha_creacion: r.fecha_creacion ? `${r.fecha_creacion}+00:00` : null,
  total: r.total == null ? null : Number(r.total).toFixed(4), // numeric(14,4) como texto
});

const existente = (id: string, r: ReciboComparable): ReciboExistente => ({
  id,
  ...comoLaGuardaLaBase(r),
});

/** Simula la escritura: aplica el plan y devuelve el mes resultante. */
function aplicar(guardadas: ReciboExistente[], deseadas: ReciboComparable[]) {
  const plan = diffRecibos(guardadas, deseadas);
  const borrar = new Set(plan.borrarIds);
  return {
    plan,
    final: [
      ...guardadas.filter((g) => !borrar.has(g.id)).map(claveRecibo),
      ...plan.insertar.map(claveRecibo),
    ].sort(),
  };
}

const esperado = (deseadas: ReciboComparable[]) => deseadas.map(claveRecibo).sort();

describe("claveRecibo — round-trip DB ↔ API", () => {
  it("una fila releída de la base tiene la misma clave que la que trajo el API", () => {
    expect(claveRecibo(comoLaGuardaLaBase(base))).toBe(claveRecibo(base));
  });

  it("el timestamptz con offset explícito y el ingenuo son el mismo instante", () => {
    expect(claveRecibo({ ...base, fecha_creacion: "2026-07-15T10:23:45+00:00" })).toBe(
      claveRecibo({ ...base, fecha_creacion: "2026-07-15T10:23:45" }),
    );
  });

  it("numeric(14,4) como texto o como número dan la misma clave", () => {
    expect(claveRecibo({ ...base, total: "1250.5000" })).toBe(claveRecibo({ ...base, total: 1250.5 }));
  });

  it("null y cadena vacía NO son lo mismo", () => {
    expect(claveRecibo({ ...base, cliente_codigo: null })).not.toBe(
      claveRecibo({ ...base, cliente_codigo: "" }),
    );
  });

  const cambios: [string, Partial<ReciboComparable>][] = [
    ["fecha", { fecha: "2026-07-16" }],
    ["fecha_creacion", { fecha_creacion: "2026-07-15T10:23:46" }],
    ["fecha_creacion por 1 hora", { fecha_creacion: "2026-07-15T11:23:45" }],
    ["cliente_switch_id", { cliente_switch_id: 4212 }],
    ["cliente_codigo", { cliente_codigo: "D-171" }],
    ["cliente_nombre", { cliente_nombre: "OTRO" }],
    ["vendedor_registro", { vendedor_registro: "OTRO" }],
    ["vendedor_cartera", { vendedor_cartera: "OTRO" }],
    ["total por un centavo", { total: 1250.51 }],
    ["total a cero (recibo anulado / aplicación)", { total: 0 }],
    ["es_retencion", { es_retencion: true }],
  ];
  it.each(cambios)("cambiar %s cambia la clave (sin falsos positivos)", (_n, patch) => {
    expect(claveRecibo({ ...base, ...patch })).not.toBe(claveRecibo(base));
  });

  it("total con más de 4 decimales colapsa al valor que guarda numeric(14,4)", () => {
    // No es un falso positivo: Postgres persiste los dos como 1250.5001.
    expect(claveRecibo({ ...base, total: 1250.50009 })).toBe(claveRecibo({ ...base, total: 1250.50011 }));
  });
});

describe("diffRecibos — equivalencia con DELETE+INSERT del mes entero", () => {
  it("mes sin cambios: no escribe NADA y el resultado es el mismo", () => {
    const deseadas = [base, { ...base, cliente_switch_id: 99, total: 10 }];
    const guardadas = deseadas.map((d, i) => existente(`id-${i}`, d));
    const { plan, final } = aplicar(guardadas, deseadas);
    expect(plan).toMatchObject({ insertar: [], borrarIds: [], sinCambio: 2 });
    expect(final).toEqual(esperado(deseadas));
  });

  it("ALTA: un recibo nuevo se inserta y nada más se toca", () => {
    const viejo = [base];
    const nuevo = { ...base, cliente_switch_id: 777, fecha_creacion: "2026-07-16T09:00:00" };
    const guardadas = [existente("id-0", base)];
    const { plan, final } = aplicar(guardadas, [...viejo, nuevo]);
    expect(plan.insertar).toHaveLength(1);
    expect(plan.borrarIds).toHaveLength(0);
    expect(plan.sinCambio).toBe(1);
    expect(final).toEqual(esperado([...viejo, nuevo]));
  });

  it("BAJA: un recibo que Switch anuló (ya no lo devuelve) SE BORRA", () => {
    const anulado = { ...base, cliente_switch_id: 555, total: 97.44 };
    const guardadas = [existente("id-vivo", base), existente("id-anulado", anulado)];
    const { plan, final } = aplicar(guardadas, [base]);
    expect(plan.borrarIds).toEqual(["id-anulado"]);
    expect(plan.insertar).toHaveLength(0);
    expect(final).toEqual(esperado([base]));
  });

  it("MODIFICACIÓN: cambió el total → borra la vieja e inserta la nueva", () => {
    const corregido = { ...base, total: 1300 };
    const guardadas = [existente("id-0", base)];
    const { plan, final } = aplicar(guardadas, [corregido]);
    expect(plan.borrarIds).toEqual(["id-0"]);
    expect(plan.insertar).toEqual([corregido]);
    expect(plan.sinCambio).toBe(0);
    expect(final).toEqual(esperado([corregido]));
  });

  it("mes que se vacía por completo: borra todo", () => {
    const guardadas = [existente("a", base), existente("b", { ...base, total: 5 })];
    const { plan, final } = aplicar(guardadas, []);
    expect(plan.borrarIds.sort()).toEqual(["a", "b"]);
    expect(final).toEqual([]);
  });

  it("mes que arranca vacío: inserta todo", () => {
    const deseadas = [base, { ...base, total: 5 }];
    const { plan, final } = aplicar([], deseadas);
    expect(plan.insertar).toHaveLength(2);
    expect(plan.borrarIds).toHaveLength(0);
    expect(final).toEqual(esperado(deseadas));
  });

  it("recibos IDÉNTICOS repetidos: se parean de a uno (multiconjunto)", () => {
    // Dos cobros iguales al mismo segundo son dos filas legítimas: el reporte de
    // Switch no trae id, así que no hay forma de distinguirlas — ni hace falta.
    const guardadas = [existente("a", base), existente("b", base), existente("c", base)];
    const { plan, final } = aplicar(guardadas, [base, base]);
    expect(plan.sinCambio).toBe(2);
    expect(plan.insertar).toHaveLength(0);
    expect(plan.borrarIds).toHaveLength(1); // sobraba una
    expect(final).toEqual(esperado([base, base]));
  });

  it("aparece un duplicado nuevo: se inserta uno solo", () => {
    const { plan, final } = aplicar([existente("a", base)], [base, base]);
    expect(plan.sinCambio).toBe(1);
    expect(plan.insertar).toHaveLength(1);
    expect(plan.borrarIds).toHaveLength(0);
    expect(final).toEqual(esperado([base, base]));
  });

  it("recibos en $0 (aplicación/cruce y anulados) se tratan como cualquier otro", () => {
    // Decisión de negocio 23-jul-2026: se persisten tal cual, NO se filtran.
    const cero = { ...base, total: 0, cliente_switch_id: 8 };
    const { plan, final } = aplicar([], [cero]);
    expect(plan.insertar).toEqual([cero]);
    expect(final).toEqual(esperado([cero]));
  });

  it("EQUIVALENCIA sobre un mes revuelto (altas + bajas + cambios + repetidos)", () => {
    const conservadas = Array.from({ length: 40 }, (_, i) => ({
      ...base,
      cliente_switch_id: i,
      fecha_creacion: `2026-07-1${i % 10}T08:00:0${i % 10}`,
      total: 100 + i,
    }));
    const bajas = Array.from({ length: 7 }, (_, i) => ({ ...base, cliente_switch_id: 900 + i }));
    const altas = Array.from({ length: 5 }, (_, i) => ({ ...base, cliente_switch_id: 500 + i }));
    const antesDelCambio = { ...base, cliente_switch_id: 42, total: 10, es_retencion: false };
    const despuesDelCambio = { ...antesDelCambio, es_retencion: true };

    const guardadas = [...conservadas, ...bajas, antesDelCambio, base, base].map((r, i) =>
      existente(`id-${i}`, r),
    );
    const deseadas = [...conservadas, ...altas, despuesDelCambio, base];

    const { plan, final } = aplicar(guardadas, deseadas);
    expect(final).toEqual(esperado(deseadas)); // ← la equivalencia, fila por fila
    expect(plan.sinCambio).toBe(41); // 40 conservadas + 1 de las dos `base`
    expect(plan.insertar).toHaveLength(6); // 5 altas + la fila modificada
    expect(plan.borrarIds).toHaveLength(9); // 7 bajas + la vieja modificada + la `base` sobrante
    // Lo que importa del ahorro: se escribió mucho menos que el mes entero.
    expect(plan.insertar.length + plan.borrarIds.length).toBeLessThan(guardadas.length);
  });

  it("el conjunto final NO depende del orden en que llegan las filas", () => {
    const deseadas = [base, { ...base, total: 1 }, { ...base, total: 2 }];
    const guardadas = [
      existente("x", { ...base, total: 2 }),
      existente("y", base),
      existente("z", { ...base, total: 9 }),
    ];
    const a = aplicar(guardadas, deseadas);
    const b = aplicar([...guardadas].reverse(), [...deseadas].reverse());
    expect(a.final).toEqual(esperado(deseadas));
    expect(b.final).toEqual(esperado(deseadas));
  });
});

describe("synced_at no participa de la comparación", () => {
  it("dos filas que solo difieren en synced_at son la misma fila", () => {
    // synced_at cambia en cada corrida por definición: si contara como
    // diferencia, el diff reescribiría el mes entero igual que antes.
    const conSello = { ...base, synced_at: "2026-07-26T19:15:00.000Z" } as ReciboComparable;
    const conOtroSello = { ...base, synced_at: "2026-07-26T23:15:00.000Z" } as ReciboComparable;
    expect(claveRecibo(conSello)).toBe(claveRecibo(conOtroSello));
    expect(diffRecibos([existente("a", conSello)], [conOtroSello])).toMatchObject({
      insertar: [],
      borrarIds: [],
      sinCambio: 1,
    });
  });
});
