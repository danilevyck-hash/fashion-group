/**
 * Candados de "Vista General lee el gasto del MAYOR CONTABLE" (11-ago-2026).
 *
 * CONTEXTO. La carga manual de gastos se retiró (#467) y su tabla
 * (`empresa_gastos_mensuales`) tiene 0 filas para siempre. Todo lo que colgaba
 * de ella en Vista General —el gasto, la rentabilidad y el punto de equilibrio—
 * mostraba un estado vacío permanente que encima le pedía al usuario cargar
 * gastos en un módulo que ya no existe. Ahora el gasto sale del mayor de Switch.
 *
 * 🔑 LO QUE MÁS IMPORTA, y es lo que prueba la mitad de este archivo: **un mes
 * sin cerrar, incompleto o al que le falta la planilla NO puede mostrarse como
 * un número.** Un total corto y un total bueno se ven idénticos; si se pintara,
 * Daniel leería un gasto que es una fracción del verdadero.
 *
 * Los números de Vistana enero-2026 son los MEDIDOS contra Switch:
 * total $11.685,66, con `6.03.41` en −127,78 y `6.03.42` en −69,30.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  gastoMostrable,
  textoSinGasto,
  resumirMes,
  centAUsd,
  ETIQUETA_SIN_GASTO,
  type MotivoSinGasto,
} from "@/lib/mayor/gastos";
import { rentabilidadEmpresa } from "@/lib/vista-general-calc";
import type { MayorLinea } from "@/lib/mayor/parser";

const raiz = join(__dirname, "..", "..", "..");
const leer = (rel: string) => readFileSync(join(raiz, rel), "utf8");

const MES = "2026-01";
const COBERTURA_2026 = [{ desde: "2026-01-01", hasta: "2026-12-31" }];

let seq = 0;
function linea(p: Partial<MayorLinea> & { cuenta: string; debito?: number; credito?: number }): MayorLinea {
  const debitoCent = Math.round((p.debito ?? 0) * 100);
  const creditoCent = Math.round((p.credito ?? 0) * 100);
  return {
    asiento: p.asiento ?? "01-012026",
    descripcion: p.descripcion ?? "MOVIMIENTO",
    fecha: p.fecha ?? "2026-01-31",
    mes: MES,
    cuenta: p.cuenta,
    cuentaNombre: p.cuentaNombre ?? "",
    debitoCent,
    creditoCent,
    netoCent: debitoCent - creditoCent,
    linea: ++seq,
  };
}

const CIERRE = linea({
  cuenta: "1.01.01.00.00",
  descripcion: "ASIENTO VENTA 2026-01",
  debito: 1,
});

/** Vistana enero-2026, en chiquito pero con sus dos cuentas NEGATIVAS reales. */
const VISTANA_ENERO: MayorLinea[] = [
  CIERRE,
  linea({ cuenta: "6.01.01.00.00", cuentaNombre: "SALARIOS", debito: 8_000 }),
  linea({ cuenta: "6.03.01.00.00", cuentaNombre: "ALQUILER DE LOCAL", debito: 3_882.74 }),
  // Las dos que dan negativo, y son correctas.
  linea({ cuenta: "6.03.41.00.00", cuentaNombre: "FALTANTES DE INVENTARIO", credito: 127.78 }),
  linea({ cuenta: "6.03.42.00.00", cuentaNombre: "GASTO DE PERIODOS ANTERIORES", credito: 69.30 }),
  // Fuera del grupo 6: no es gasto y no puede sumar.
  linea({ cuenta: "5.01.01.00.00", cuentaNombre: "COSTO DE VENTA", debito: 50_000 }),
];

// ─────────────────────────────────────────────────────────────────────────────
// 1. Un mes CERRADO y completo sí da número — y con los signos correctos
// ─────────────────────────────────────────────────────────────────────────────

describe("el gasto sale del mayor: grupo 6, débito − crédito", () => {
  it("Vistana enero-2026 da $11.685,66 (con las dos cuentas negativas restando)", () => {
    const r = resumirMes(MES, VISTANA_ENERO, COBERTURA_2026);
    const g = gastoMostrable(r);
    expect(g.usable).toBe(true);
    expect(centAUsd(g.totalCent!)).toBe(11_685.66);
  });

  it("🩸 tomar valor absoluto se nota: la diferencia da EXACTAMENTE el doble", () => {
    const r = resumirMes(MES, VISTANA_ENERO, COBERTURA_2026);
    const bueno = gastoMostrable(r).totalCent!;
    // El error clásico: ignorar el signo de las dos cuentas negativas.
    const conAbs = r.cuentas.reduce((s, c) => s + Math.abs(c.netoCent), 0);
    // 2 × (127,78 + 69,30) = 394,16 exacto, escrito como cifra para no
    // arrastrar el error de coma flotante dentro del propio test.
    expect(centAUsd(conAbs - bueno)).toBe(394.16);
  });

  it("el grupo 5 (costos) NO entra en el gasto", () => {
    const r = resumirMes(MES, VISTANA_ENERO, COBERTURA_2026);
    expect(r.cuentas.some((c) => c.cuenta.startsWith("5."))).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. 🔑 Lo que NO puede mostrarse como número
// ─────────────────────────────────────────────────────────────────────────────

describe("un mes que no está listo NUNCA se pinta como un monto", () => {
  it("mes sin cerrar (se pidió y vino vacío) → sin número", () => {
    const g = gastoMostrable(resumirMes("2026-06", [], COBERTURA_2026));
    expect(g.usable).toBe(false);
    expect(g.totalCent).toBeNull();
    expect(g.motivo).toBe("sin_cerrar");
  });

  it("mes nunca traído → sin número, y NO se confunde con 'sin cerrar'", () => {
    const g = gastoMostrable(resumirMes("2025-06", [], COBERTURA_2026));
    expect(g.usable).toBe(false);
    expect(g.motivo).toBe("sin_datos");
  });

  it("mes con movimientos sueltos pero sin asiento de cierre → incompleto", () => {
    const sueltas = [linea({ cuenta: "6.03.01.00.00", debito: 500, descripcion: "REGISTRA PRESTAMO" })];
    const g = gastoMostrable(resumirMes(MES, sueltas, COBERTURA_2026));
    expect(g.usable).toBe(false);
    expect(g.motivo).toBe("parcial");
  });

  it("🔴 mes CERRADO pero sin un peso de planilla → sin número (el total quedaría corto)", () => {
    const sinPlanilla = VISTANA_ENERO.filter((l) => !l.cuenta.startsWith("6.01"));
    const r = resumirMes(MES, sinPlanilla, COBERTURA_2026);
    expect(r.estado).toBe("cerrado"); // la contadora lo cerró…
    const g = gastoMostrable(r);
    expect(g.usable).toBe(false); // …y aun así no se muestra
    expect(g.motivo).toBe("sin_planilla");
    expect(g.totalCent).toBeNull();
  });

  it("un mes sin gasto NO es lo mismo que un mes sin contabilidad", () => {
    // Cerrado, con planilla, y sin ninguna otra cuenta: $8.000 es un dato real.
    const soloPlanilla = [CIERRE, linea({ cuenta: "6.01.01.00.00", debito: 8_000 })];
    const g = gastoMostrable(resumirMes(MES, soloPlanilla, COBERTURA_2026));
    expect(g.usable).toBe(true);
    expect(centAUsd(g.totalCent!)).toBe(8_000);
  });
});

describe("el texto que ve el usuario dice la verdad y no pide lo que no existe", () => {
  const MOTIVOS: MotivoSinGasto[] = ["sin_cerrar", "parcial", "sin_datos", "sin_planilla"];

  it("🔴 ningún texto le pide cargar gastos — la carga manual ya no existe", () => {
    for (const m of MOTIVOS) {
      for (const hasta of ["enero 2026", null]) {
        const t = textoSinGasto(m, hasta);
        expect(t.toLowerCase()).not.toMatch(/carg(a|á|ar)/);
        expect(t.length).toBeGreaterThan(20);
      }
    }
  });

  it("'sin cerrar' dice HASTA DÓNDE llega la contabilidad de esa empresa", () => {
    expect(textoSinGasto("sin_cerrar", "enero 2026")).toContain("enero 2026");
    // Sin ningún mes cerrado no se inventa una fecha.
    expect(textoSinGasto("sin_cerrar", null)).not.toMatch(/\d{4}/);
  });

  it("'falta planilla' explica que el total quedaría corto", () => {
    expect(textoSinGasto("sin_planilla", "enero 2026")).toMatch(/planilla/i);
  });

  it("cada motivo tiene su etiqueta corta, y son distintas entre sí", () => {
    const etiquetas = MOTIVOS.map((m) => ETIQUETA_SIN_GASTO[m]);
    expect(new Set(etiquetas).size).toBe(MOTIVOS.length);
    for (const e of etiquetas) expect(e.length).toBeLessThanOrEqual(16);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. La rentabilidad no mezcla universos
// ─────────────────────────────────────────────────────────────────────────────

describe("rentabilidadEmpresa: cada empresa contra LO SUYO", () => {
  it("🩸 es utilidad − gasto DE LA MISMA empresa", () => {
    const r = rentabilidadEmpresa({ ventas: 100_000, utilidad: 30_000, gasto: 20_000 })!;
    expect(r.monto).toBe(10_000);
    expect(r.pct).toBeCloseTo(10_000 / 100_000, 12);
  });

  it("🔴 sin gasto cargado devuelve null — NUNCA la utilidad bruta pelada", () => {
    // Es el error que da un número precioso y falso: tratar el gasto ausente
    // como cero deja `rentabilidad = utilidad`, indistinguible de una empresa
    // que de verdad gana plata.
    expect(rentabilidadEmpresa({ ventas: 50_000, utilidad: 20_000, gasto: null })).toBeNull();
  });

  it("gasto 0 SÍ cuenta (cero es un dato, null es la ausencia)", () => {
    const r = rentabilidadEmpresa({ ventas: 10, utilidad: 5, gasto: 0 })!;
    expect(r.monto).toBe(5);
  });

  it("sin ventas no se inventa un porcentaje", () => {
    const r = rentabilidadEmpresa({ ventas: 0, utilidad: 0, gasto: 500 })!;
    expect(r.monto).toBe(-500);
    expect(r.pct).toBeNull();
  });

  it("🔴 la función NO puede ver otras empresas: recibe UNA sola", () => {
    // El candado estructural de la regla de Daniel. `rentabilidadGrupo` recibía
    // un array y por eso podía sumar universos distintos; ésta recibe un objeto
    // con tres números y no tiene con qué mezclarlos con los de nadie.
    expect(rentabilidadEmpresa.length).toBe(1);
    const uno = rentabilidadEmpresa({ ventas: 100, utilidad: 30, gasto: 10 })!;
    const otro = rentabilidadEmpresa({ ventas: 900, utilidad: 300, gasto: 100 })!;
    // Los dos resultados son independientes: ninguno cambia por el otro.
    expect(uno.monto).toBe(20);
    expect(otro.monto).toBe(200);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Barridos estáticos: una sola fuente, y el copy imposible no vuelve
// ─────────────────────────────────────────────────────────────────────────────

// ⚠️ ESTE BLOQUE CAMBIÓ DE SUJETO EL 13-ago-2026 y no es un ajuste cosmético.
//
// Hasta ese día exigía que **Vista General leyera el MAYOR**. Daniel decidió lo
// contrario (*"no deberia de ser egresos varios y ya?"*), así que lo que aquel
// candado protegía pasó a ser justamente lo que no puede volver: el mayor va 7
// meses atrás y **no producía un número para ninguna empresa en ningún mes**.
// El mayor SIGUE VIVO para el módulo "Gastos" —eso es lo que se sigue probando
// acá abajo—; lo que se fue es su papel en el tablero del dueño.
describe("el mayor sigue siendo del módulo Gastos, y de nadie más", () => {
  const RUTA_VG = "src/app/api/dashboard/vista-general/route.ts";
  const RUTA_GASTOS = "src/app/api/gastos-contabilidad/resumen/route.ts";

  it("Vista General NO vuelve a leer la carga manual de gastos", () => {
    const vg = leer(RUTA_VG);
    expect(vg).not.toContain('.from("empresa_gastos_mensuales")');
    expect(vg).not.toContain('.from("gastos_categorias")');
    // Y sigue leyendo los saldos de banco: la Disponibilidad no se toca.
    expect(vg).toContain('.from("bancos_saldos")');
  });

  it("🔴 Vista General ya NO lee el mayor", () => {
    const vg = sinComentarios(leer(RUTA_VG));
    expect(vg).not.toContain("leerMayorMes");
    expect(vg).not.toMatch(/from\s+["']@\/lib\/mayor\//);
    expect(vg).not.toContain('.from("mayor_lineas")');
  });

  it("el módulo Gastos SÍ lo sigue leyendo, y por `leerMayorMes`", () => {
    const g = leer(RUTA_GASTOS);
    expect(g).toContain("leerMayorMes");
    expect(g).not.toContain('.from("mayor_lineas")');
  });

  it("🔴 la consulta al mayor vive en UN solo archivo", () => {
    // Dos consultas para el mismo gasto es como dos pantallas empiezan a decir
    // números distintos, y ahí Daniel deja de creerle a las dos.
    for (const rel of [RUTA_VG, RUTA_GASTOS]) {
      expect(leer(rel)).not.toContain('.from("mayor_lineas")');
    }
    expect(leer("src/lib/mayor/leer.ts")).toContain('.from("mayor_lineas")');
  });

  it("el mayor NO se borró: sus dos piezas siguen enteras", () => {
    expect(leer("src/lib/mayor/leer.ts")).toContain("resumirMes");
    expect(leer("src/lib/mayor/gastos.ts")).toContain("export function gastoMostrable");
  });
});

/** Barrido sobre CÓDIGO, no sobre comentarios: un comentario que explica por qué
 *  algo se fue contiene justamente las palabras que el barrido busca, y sin esto
 *  el candado se cumpliría a sí mismo. */
function sinComentarios(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

describe("el punto de equilibrio se retiró entero (no quedó a medias)", () => {
  it("no está en la pantalla", () => {
    const page = leer("src/app/vista-general/page.tsx");
    expect(page).not.toContain("Punto de equilibrio");
    expect(page).not.toContain("function Equilibrio");
    expect(page).not.toContain("para no perder");
  });

  it("no está en el payload de la ruta", () => {
    const vg = leer("src/app/api/dashboard/vista-general/route.ts");
    expect(vg).not.toContain("puntoEquilibrio");
    // Ni el cálculo ni la llave del JSON. (La palabra puede seguir en el
    // comentario que explica POR QUÉ se retiró; lo que no puede volver es el
    // campo.)
    expect(vg).not.toMatch(/equilibrio\s*[,:=]/);
  });

  it("🔴 el copy que pedía cargar gastos NO vuelve", () => {
    // Decía "Para calcularlo carga los gastos del mes en Gastos" y ya no hay
    // dónde cargar: el módulo de carga manual se retiró.
    const page = leer("src/app/vista-general/page.tsx");
    expect(page).not.toMatch(/carga los gastos/i);
    expect(page).not.toMatch(/Sin gastos cargados/);
  });
});
