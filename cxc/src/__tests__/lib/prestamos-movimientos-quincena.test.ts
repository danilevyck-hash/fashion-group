// ─────────────────────────────────────────────────────────────────────────────
// CANDADO — «Los movimientos de préstamos de una quincena» (17-sep-2026).
//
// Daniel, textual: *«quisiera que en préstamo tener como que un botón para ver
// el historial de las quincenas. Ya que para ver movimiento tengo que meterme a
// cada perfil. Pero para ver los movimientos de x quincena?»*
//
// Lo que este archivo NO deja que se rompa:
//
//   1. 🔴 Los dos bloques se DERIVAN de las listas que suman el saldo. Una
//      segunda lista de conceptos sería una segunda respuesta a «¿esto bajó o
//      subió la deuda?».
//   2. 🔴 Un concepto desconocido NO se cuenta por descarte: queda fuera de los
//      dos totales y se DICE cuántos son.
//   3. 🔴 La ventana llega hasta el 31: la quincena paga hasta el 30 y hay
//      movimientos el 31 (medido: 2, el 31-mar-2026). Sin esto, esa plata no
//      sale en NINGUNA quincena.
//   4. 🔴 La columna «Origen»: el amarre manda, un CARGO nunca es del cierre, y
//      un pago sin `origen_pago` —440 de 441 filas vivas— es de la quincena.
//   5. 🔴 Los números REALES de la quincena del 16 al 30 de agosto de 2026,
//      medidos contra producción el 17-sep-2026: 13 descuentos por $752,72 y
//      6 deudas nuevas por $1.410,00 → la deuda creció $657,28.
//   6. 🔴 El total sigue al filtro de empresa.
//   7. 🔴 Es una pantalla de LECTURA: su ruta no escribe nada.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

import {
  ETIQUETA_ORIGEN,
  NOMBRE_BLOQUE,
  PARAM_VISTA,
  VISTAS_PRESTAMOS,
  VISTA_DEUDA,
  VISTA_MOVIMIENTOS,
  agruparMovimientos,
  bloqueDeMovimiento,
  etiquetaDeOrigen,
  filaDeMovimiento,
  fraseDeLaVariacion,
  origenDelMovimiento,
  rotuloDeLaVariacion,
  ventanaDeLaQuincena,
  vistaDePrestamos,
  type DatosDeLaFicha,
  type FilaMovimiento,
  type MovimientoCrudo,
} from "@/lib/asistencia/movimientos-quincena";
import { CONCEPTOS_RESTAN, CONCEPTOS_SUMAN } from "@/lib/prestamos-saldo";
import { CONCEPTO_DANO, CONCEPTO_PAGO, CONCEPTO_PRESTAMO } from "@/lib/prestamos-conceptos";
import { quincena } from "@/lib/asistencia/planilla";
import { PRESTAMOS_PESTANA_ROLES } from "@/lib/prestamos-una-puerta";

const RAIZ = path.resolve(__dirname, "../../..");
const leer = (p: string) => fs.readFileSync(path.join(RAIZ, p), "utf8");
const puro = (p: string) =>
  leer(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const RUTA = "src/app/api/asistencia/prestamos-movimientos/route.ts";
const PANTALLA = "src/app/asistencia/MovimientosQuincenaTab.tsx";
const PESTANA = "src/app/asistencia/PrestamosTab.tsx";

// ── Un ayudante para armar movimientos de mentira ────────────────────────────
let n = 0;
function mov(p: Partial<MovimientoCrudo> & { concepto: string; monto: number; fecha: string }): MovimientoCrudo {
  n += 1;
  return {
    id: p.id ?? `m${String(n).padStart(3, "0")}`,
    empleado_id: p.empleado_id ?? "f1",
    fecha: p.fecha,
    concepto: p.concepto,
    monto: p.monto,
    origen_pago: p.origen_pago ?? null,
  };
}

const FICHAS = new Map<string, DatosDeLaFicha>([
  ["f1", { nombre: "MARIA V. BETHANCOURTH G.", codigo: "7", empresa: "fashion_wear" }],
  ["f2", { nombre: "GABRIELA JARAMILLO", codigo: "12", empresa: "vistana_international" }],
]);

const fila = (m: MovimientoCrudo, amarrados?: Set<string>) => filaDeMovimiento(m, FICHAS, amarrados);

// ─────────────────────────────────────────────────────────────────────────────
describe("1. los bloques se derivan de las listas del saldo", () => {
  it("todo lo que RESTA de la deuda es un descuento", () => {
    expect(CONCEPTOS_RESTAN.length).toBeGreaterThan(0);
    for (const c of CONCEPTOS_RESTAN) expect(bloqueDeMovimiento(c)).toBe("descuento");
  });

  it("todo lo que SUMA a la deuda es una deuda nueva", () => {
    expect(CONCEPTOS_SUMAN.length).toBeGreaterThan(0);
    for (const c of CONCEPTOS_SUMAN) expect(bloqueDeMovimiento(c)).toBe("deuda");
  });

  it("un concepto que el sistema no conoce no cae en ningún bloque", () => {
    expect(bloqueDeMovimiento("Vale de comida")).toBeNull();
    expect(bloqueDeMovimiento("")).toBeNull();
  });

  it("los dos bloques se llaman como en el mockup aprobado", () => {
    expect(NOMBRE_BLOQUE.descuento).toBe("Descuentos");
    expect(NOMBRE_BLOQUE.deuda).toBe("Deudas nuevas");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("2. lo que no se sabe leer no se cuenta por descarte", () => {
  it("queda fuera de los dos totales y se dice cuántos son", () => {
    const filas = [
      fila(mov({ concepto: CONCEPTO_PAGO, monto: 50, fecha: "2026-08-30" })),
      fila(mov({ concepto: "Vale de comida", monto: 999, fecha: "2026-08-20" })),
    ];
    const { resumen, descuentos, deudas } = agruparMovimientos(filas);
    expect(resumen.descuentos).toEqual({ cuantos: 1, total: 50 });
    expect(resumen.deudas).toEqual({ cuantos: 0, total: 0 });
    expect(resumen.sinClasificar).toBe(1);
    expect(descuentos).toHaveLength(1);
    expect(deudas).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("3. ningún movimiento queda entre dos quincenas", () => {
  it("la segunda quincena de un mes de 31 días se LEE hasta el 31", () => {
    // 🩸 Medido: hay 2 movimientos el 31-mar-2026 ($180 de préstamo y $500 de
    // pago). La quincena PAGA hasta el 30 — leerla hasta ahí los perdería.
    const q = quincena(2026, 3, 2);
    expect(q.hasta).toBe("2026-03-30");
    expect(ventanaDeLaQuincena(q)).toEqual({ desde: "2026-03-16", hasta: "2026-03-31" });
  });

  it("un mes de 30 días no inventa un día 31", () => {
    expect(ventanaDeLaQuincena(quincena(2026, 9, 2))).toEqual({ desde: "2026-09-16", hasta: "2026-09-30" });
  });

  it("febrero cierra donde cierra", () => {
    expect(ventanaDeLaQuincena(quincena(2026, 2, 2))).toEqual({ desde: "2026-02-16", hasta: "2026-02-28" });
  });

  it("la primera quincena siempre termina el 15", () => {
    expect(ventanaDeLaQuincena(quincena(2026, 3, 1))).toEqual({ desde: "2026-03-01", hasta: "2026-03-15" });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("4. la columna «Origen»", () => {
  it("el amarre con la planilla cerrada manda sobre todo lo demás", () => {
    const m = mov({ id: "x1", concepto: CONCEPTO_PAGO, monto: 25, fecha: "2026-09-15", origen_pago: "Liquidación" });
    expect(origenDelMovimiento(m, new Set(["x1"]))).toBe("cierre");
    expect(origenDelMovimiento(m, new Set())).toBe("mano");
  });

  it("un CARGO nunca es del cierre, ni con origen «Quincena»", () => {
    // El cierre descuenta; no presta plata ni carga un daño.
    for (const c of CONCEPTOS_SUMAN) {
      const m = mov({ concepto: c, monto: 300, fecha: "2026-08-18", origen_pago: "Quincena" });
      expect(origenDelMovimiento(m, new Set())).toBe("mano");
    }
  });

  it("un pago SIN origen escrito es el descuento de la quincena", () => {
    // 🩸 440 de 441 movimientos vivos tienen `origen_pago` en NULL: el campo
    // nació el 8-sep-2026. Sin este peldaño la pantalla diría «a mano» de toda
    // la historia.
    const m = mov({ concepto: CONCEPTO_PAGO, monto: 50, fecha: "2026-08-30", origen_pago: null });
    expect(origenDelMovimiento(m, new Set())).toBe("cierre");
  });

  it("un pago de bolsillo es a mano y DICE de dónde salió", () => {
    const m = mov({ concepto: CONCEPTO_PAGO, monto: 125, fecha: "2026-09-07", origen_pago: "Liquidación" });
    expect(origenDelMovimiento(m, new Set())).toBe("mano");
    expect(fila(m).origenEtiqueta).toBe("a mano · Liquidación");
  });

  it("nunca se escribe «a mano · Quincena»: sería contradecirse en la celda", () => {
    expect(etiquetaDeOrigen("mano", "Quincena")).toBe("a mano");
    expect(etiquetaDeOrigen("mano", null)).toBe("a mano");
    expect(etiquetaDeOrigen("cierre", "Liquidación")).toBe("del cierre");
  });

  it("los dos rótulos son los del mockup aprobado", () => {
    expect(ETIQUETA_ORIGEN.cierre).toBe("del cierre");
    expect(ETIQUETA_ORIGEN.mano).toBe("a mano");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 LOS NÚMEROS REALES, medidos contra producción el 17-sep-2026 con
// `scripts/_medir-movimientos-quincena.ts`.
const AGOSTO_2: MovimientoCrudo[] = [
  // Los 13 descuentos: todos el día 30 y todos del cierre.
  ...([282.72, 60, 50, 50, 50, 50, 50, 45, 30, 25, 25, 25, 10] as const).map((monto) =>
    mov({ concepto: CONCEPTO_PAGO, monto, fecha: "2026-08-30" })),
  // Las 6 deudas nuevas: días 17, 18, 19, 20 y 24, todas a mano.
  mov({ concepto: CONCEPTO_PRESTAMO, monto: 400, fecha: "2026-08-18" }),
  mov({ concepto: CONCEPTO_PRESTAMO, monto: 300, fecha: "2026-08-17" }),
  mov({ concepto: CONCEPTO_PRESTAMO, monto: 300, fecha: "2026-08-24" }),
  mov({ concepto: CONCEPTO_PRESTAMO, monto: 180, fecha: "2026-08-18", empleado_id: "f2" }),
  mov({ concepto: CONCEPTO_PRESTAMO, monto: 180, fecha: "2026-08-19", empleado_id: "f2" }),
  mov({ concepto: CONCEPTO_PRESTAMO, monto: 50, fecha: "2026-08-20", empleado_id: "f2" }),
];

describe("5. la quincena del 16 al 30 de agosto de 2026, medida contra producción", () => {
  const agrupado = agruparMovimientos(AGOSTO_2.map((m) => fila(m)));

  it("13 descuentos por $752,72", () => {
    expect(agrupado.resumen.descuentos).toEqual({ cuantos: 13, total: 752.72 });
  });

  it("6 deudas nuevas por $1.410,00", () => {
    expect(agrupado.resumen.deudas).toEqual({ cuantos: 6, total: 1410 });
  });

  it("la deuda del grupo creció $657,28 — la línea que no existía", () => {
    expect(agrupado.resumen.variacion).toBe(657.28);
    expect(rotuloDeLaVariacion(agrupado.resumen.variacion)).toBe("La deuda creció");
  });

  it("los 13 descuentos son del cierre y las 6 deudas, a mano", () => {
    expect(agrupado.descuentos.every((f) => f.origen === "cierre")).toBe(true);
    expect(agrupado.deudas.every((f) => f.origen === "mano")).toBe(true);
  });

  it("el más grande va primero en los dos bloques", () => {
    expect(agrupado.descuentos[0].monto).toBe(282.72);
    expect(agrupado.deudas[0].monto).toBe(400);
  });

  it("el orden es ESTABLE: el empate lo rompe la fecha, no el azar del array", () => {
    const empatados = agrupado.deudas.filter((f) => f.monto === 180).map((f) => f.dia);
    expect(empatados).toEqual([18, 19]);
    // La misma lista al revés tiene que dar exactamente la misma hoja.
    const alReves = agruparMovimientos([...AGOSTO_2].reverse().map((m) => fila(m)));
    expect(alReves.deudas.map((f) => `${f.monto}|${f.fecha}`))
      .toEqual(agrupado.deudas.map((f) => `${f.monto}|${f.fecha}`));
  });

  it("el día es el del mes, que es lo único que cambia adentro de una quincena", () => {
    expect(new Set(agrupado.descuentos.map((f) => f.dia))).toEqual(new Set([30]));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("6. el total sigue al filtro", () => {
  it("sumar solo las filas que se ven da el total de esas filas", () => {
    const todas = AGOSTO_2.map((m) => fila(m));
    const soloVistana = todas.filter((f) => f.empresa === "vistana_international");
    const agrupado = agruparMovimientos(soloVistana);
    expect(agrupado.resumen.descuentos).toEqual({ cuantos: 0, total: 0 });
    expect(agrupado.resumen.deudas).toEqual({ cuantos: 3, total: 410 });
    expect(agrupado.resumen.variacion).toBe(410);
  });

  it("cada fila lleva la empresa de la persona atada", () => {
    expect(fila(mov({ concepto: CONCEPTO_PAGO, monto: 10, fecha: "2026-08-30" })).empresa).toBe("fashion_wear");
  });

  it("una ficha desconocida NO se descarta: el movimiento sigue contando", () => {
    const f = fila(mov({ concepto: CONCEPTO_PAGO, monto: 10, fecha: "2026-08-30", empleado_id: "fantasma" }));
    expect(f.nombre).toBe("");
    expect(f.codigo).toBeNull();
    expect(f.bloque).toBe("descuento");
    expect(agruparMovimientos([f]).resumen.descuentos.total).toBe(10);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("7. cómo se lee el pie", () => {
  it("el signo se dice con palabras y el monto va en positivo", () => {
    const plata = (x: number) => `$${x.toFixed(2)}`;
    expect(fraseDeLaVariacion(657.28, plata)).toBe("La deuda creció $657.28");
    expect(fraseDeLaVariacion(-420, plata)).toBe("La deuda bajó $420.00");
    expect(fraseDeLaVariacion(0, plata)).toBe("La deuda quedó igual");
  });

  it("medio centavo no es un cambio", () => {
    expect(rotuloDeLaVariacion(0.004)).toBe("La deuda quedó igual");
    expect(rotuloDeLaVariacion(0.01)).toBe("La deuda creció");
    expect(rotuloDeLaVariacion(-0.01)).toBe("La deuda bajó");
  });

  it("el concepto se lee como en pantalla: «Daño de mercancía»", () => {
    expect(fila(mov({ concepto: CONCEPTO_DANO, monto: 30, fecha: "2026-08-20" })).etiqueta)
      .toBe("Daño de mercancía");
    // ⚠️ El valor guardado NO cambia: renombrarlo movería el saldo en silencio.
    expect(fila(mov({ concepto: CONCEPTO_DANO, monto: 30, fecha: "2026-08-20" })).concepto)
      .toBe("Responsabilidad por daño");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("8. las dos vistas de la pestaña", () => {
  it("«Quiénes deben» es la que abre, y una clave rara cae ahí", () => {
    expect(vistaDePrestamos("")).toBe(VISTA_DEUDA);
    expect(vistaDePrestamos(null)).toBe(VISTA_DEUDA);
    expect(vistaDePrestamos("cualquier cosa")).toBe(VISTA_DEUDA);
    expect(vistaDePrestamos(VISTA_MOVIMIENTOS)).toBe(VISTA_MOVIMIENTOS);
  });

  it("son dos, en el orden del mockup", () => {
    expect(VISTAS_PRESTAMOS.map(([k]) => k)).toEqual([VISTA_DEUDA, VISTA_MOVIMIENTOS]);
    expect(VISTAS_PRESTAMOS.map(([, l]) => l)).toEqual(["Quiénes deben", "Movimientos"]);
  });

  it("la pestaña monta las dos vistas y conserva el selector de empresa", () => {
    const t = leer(PESTANA);
    expect(t).toContain("<MovimientosQuincenaTab empresa={props.empresa} />");
    expect(t).toContain("<ListaDeDeuda {...props} />");
    expect(t).toContain(`useUrlState(PARAM_VISTA, "")`);
  });

  it("la vista vive en la URL con la llave que dice el módulo puro", () => {
    expect(PARAM_VISTA).toBe("sub");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("9. es una pantalla de LECTURA, y su ruta lo demuestra", () => {
  const ruta = puro(RUTA);

  it("la ruta no escribe: no hay POST, PUT, PATCH ni DELETE", () => {
    for (const verbo of ["POST", "PUT", "PATCH", "DELETE"]) {
      expect(ruta).not.toMatch(new RegExp(`export\\s+async\\s+function\\s+${verbo}\\b`));
    }
    expect(ruta).toMatch(/export\s+async\s+function\s+GET\b/);
  });

  it("no toca la base para escribir", () => {
    for (const escritura of [".insert(", ".update(", ".upsert(", ".delete("]) {
      expect(ruta).not.toContain(escritura);
    }
  });

  it("la pantalla tampoco manda nada al servidor", () => {
    expect(puro(PANTALLA)).not.toMatch(/method:\s*["'](POST|PUT|PATCH|DELETE)["']/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("10. las dos trampas del repo, en la ruta", () => {
  const ruta = puro(RUTA);

  it("`deleted` es NULLABLE: se filtra con `.or`, nunca con `.eq`", () => {
    expect(ruta).toContain('.or("deleted.is.null,deleted.eq.false")');
    expect(ruta).not.toContain('.eq("deleted", false)');
  });

  it("nada se lee sin paginar: `db-max-rows` = 1000 y corta en silencio", () => {
    expect(ruta).toContain("leerTodoPaginado");
    expect(ruta).toContain('pedirCount ? { count: "exact" } : {}');
    // Tres lecturas paginadas: movimientos, fichas y el amarre.
    expect(ruta.match(/leerTodoPaginado</g) ?? []).toHaveLength(3);
    // Orden ESTABLE en las tres: sin él, paginar repite o saltea filas.
    expect(ruta.match(/\.order\("id", \{ ascending: true \}\)/g) ?? []).toHaveLength(3);
  });

  it("los amarres revertidos no cuentan: esa planilla se reabrió", () => {
    expect(ruta).toContain('.is("revertido_en", null)');
  });

  it("la ventana se pide, no se adivina: sin fechas válidas contesta 400", () => {
    expect(ruta).toContain("status: 400");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("11. los roles son los de la pestaña, no una lista nueva", () => {
  it("la ruta se autoriza con `PRESTAMOS_PESTANA_ROLES`", () => {
    const ruta = puro(RUTA);
    expect(ruta).toContain("PRESTAMOS_PESTANA_ROLES");
    // 🔴 Nada de `["admin", "contabilidad", "secretaria"]` tecleado a mano.
    expect(ruta).not.toMatch(/\["admin"/);
  });

  it("la secretaria mira y nadie más entra de arriba", () => {
    expect([...PRESTAMOS_PESTANA_ROLES].sort()).toEqual(["admin", "contabilidad", "secretaria"]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("12. la pantalla no vuelve a definir nada que ya exista", () => {
  it("la ventana sale del módulo puro, no de un `slice` a mano", () => {
    const t = puro(PANTALLA);
    expect(t).toContain("ventanaDeLaQuincena(quincena)");
    expect(t).toContain("agruparMovimientos(filtrarPorEmpresa(");
  });

  it("el Excel recibe lo YA agrupado: no vuelve a sumar", () => {
    const x = puro("src/lib/asistencia/movimientos-excel.ts");
    expect(x).toContain("agrupado");
    expect(x).not.toContain("reduce(");
    expect(x).toContain("workbookFromSheets");
  });

  it("una fila vacía no arma un Excel: el botón se apaga", () => {
    expect(puro(PANTALLA)).toContain("disabled={!hayAlgo}");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("13. nada de esto mueve plata", () => {
  it("agrupar no cambia ni un monto", () => {
    const filas: FilaMovimiento[] = AGOSTO_2.map((m) => fila(m));
    const antes = filas.map((f) => f.monto).sort((a, b) => a - b);
    const { descuentos, deudas } = agruparMovimientos(filas);
    const despues = [...descuentos, ...deudas].map((f) => f.monto).sort((a, b) => a - b);
    expect(despues).toEqual(antes);
  });

  it("la suma de los dos bloques es la suma de todos los montos", () => {
    const filas = AGOSTO_2.map((m) => fila(m));
    const { resumen } = agruparMovimientos(filas);
    const total = filas.reduce((a, f) => a + f.monto, 0);
    expect(Math.round((resumen.descuentos.total + resumen.deudas.total) * 100) / 100)
      .toBe(Math.round(total * 100) / 100);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("14. el Excel baja lo que está en pantalla", () => {
  const armar = async (filas: readonly FilaMovimiento[], empresa = "Todas") => {
    const { construirExcelMovimientos } = await import("@/lib/asistencia/movimientos-excel");
    return construirExcelMovimientos({
      agrupado: agruparMovimientos(filas),
      etiquetaQuincena: "16 al 30 de agosto de 2026",
      etiquetaEmpresa: empresa,
    }).Sheets["Movimientos"];
  };
  const textos = (ws: Record<string, unknown>) =>
    Object.entries(ws)
      .filter(([k]) => !k.startsWith("!"))
      .map(([, c]) => String((c as { v?: unknown }).v ?? ""));

  it("una fila por movimiento, con su bloque y su origen", async () => {
    const ws = await armar(AGOSTO_2.map((m) => fila(m)));
    const t = textos(ws);
    expect(t.filter((x) => x === NOMBRE_BLOQUE.descuento)).toHaveLength(13);
    expect(t.filter((x) => x === NOMBRE_BLOQUE.deuda)).toHaveLength(6);
    expect(t.filter((x) => x === "del cierre")).toHaveLength(13);
    expect(t.filter((x) => x === "a mano")).toHaveLength(6);
  });

  it("el pie dice cuánto se descontó, cuánto se prestó y cuánto creció la deuda", async () => {
    const ws = await armar(AGOSTO_2.map((m) => fila(m)));
    const t = textos(ws);
    expect(t.some((x) => x.includes("Descuentos $752.72 (13)"))).toBe(true);
    expect(t.some((x) => x.includes("Deudas nuevas $1,410.00 (6)"))).toBe(true);
    expect(t).toContain("La deuda creció");
    // La variación va como NÚMERO, nunca como texto: se suma en Excel.
    const montos = Object.entries(ws)
      .filter(([k]) => !k.startsWith("!"))
      .map(([, c]) => c as { v?: unknown })
      .filter((c) => typeof c.v === "number")
      .map((c) => c.v as number);
    expect(montos).toContain(657.28);
  });

  it("el filtro arranca en los encabezados y el pie queda AFUERA", async () => {
    const ws = await armar(AGOSTO_2.map((m) => fila(m)));
    const ref = (ws["!autofilter"] as { ref: string }).ref;
    // Con `titulo`, los encabezados bajan a la fila 3 (la 2 queda vacía).
    expect(ref.startsWith("A3:")).toBe(true);
    const finFiltro = Number(/A3:[A-Z]+(\d+)/.exec(ref)![1]);
    const filaDelPie = Object.keys(ws)
      .filter((k) => !k.startsWith("!"))
      .filter((k) => String((ws[k] as { v?: unknown }).v ?? "") === "Resumen")
      .map((k) => Number(/\d+/.exec(k)![0]))[0];
    expect(filaDelPie).toBeGreaterThan(finFiltro);
  });

  it("la empresa elegida va en el título del archivo", async () => {
    const ws = await armar(AGOSTO_2.map((m) => fila(m)), "Boston");
    expect(textos(ws).some((x) => x.includes("16 al 30 de agosto de 2026") && x.includes("Boston"))).toBe(true);
  });
});
