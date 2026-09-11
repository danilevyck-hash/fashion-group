/* ─────────────────────────────────────────────────────────────────────────────
 * EL CORTE de la quincena, el INTERRUPTOR, y el CABLEADO que no se puede mover.
 *
 * Daniel, textual: *«hay que cerrarla un dia por ejemplo 13 o 28 porque hay que
 * tener los pagos listos para el 15-30/31, asi que se calcula los dias de la
 * quincena restante sin horas extra como un dia normal y se le paga, y si esos
 * 2/3 dias llego tarde, ausencia o tuvo horas extra, se recalcula en la proxima
 * quincena»*.
 * ────────────────────────────────────────────────────────────────────────── */

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  CONCEPTOS_DEL_RELOJ,
  CORTE_SUGERIDO,
  ajusteDeDiasSinMedir,
  corteSugerido,
  corteValido,
  diasSinMedir,
  textoAjuste,
  textoCorte,
} from "@/lib/asistencia/corte-quincena";
import { quincena } from "@/lib/asistencia/planilla";
import { planillaUnidaPrendida } from "@/lib/asistencia/planilla-unida";
import { COLUMNAS_DEL_PAPEL, posicionDeFicha, cedulaDeFicha, SIN_POSICION } from "@/lib/asistencia/datos-del-papel";
import type { DineroLinea } from "@/lib/asistencia/planilla";

const raiz = process.cwd();
const leer = (p: string) => fs.readFileSync(path.join(raiz, p), "utf8");
/**
 * El mismo archivo, SIN COMENTARIOS. Es lo que hay que barrer cuando se busca
 * una forma PROHIBIDA: los comentarios de este repo nombran a propósito lo que
 * no se debe hacer («un `.eq("deleted", false)` PIERDE filas»), y buscarla
 * sobre el texto crudo la encuentra justo en la nota que la prohíbe.
 * Mismo criterio que `nada-de-voseo.test.ts`.
 */
const leerSinComentarios = (p: string) =>
  leer(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const DINERO = (o: Partial<DineroLinea>): DineroLinea => ({
  rataHora: 3, valorMinuto: 0.05, salarioQuincenal: 40,
  extraDiurno: 0, extraNocturno: 0, excedente: 0,
  domingos: 0, feriados: 0, ausencias: 0,
  ausenciaPorTardanza: 0, ausenciaDeDiaCompleto: 0, vacacionesYaPagadas: 0,
  tardanzas: 0, totalBruto: 40, baseSeguros: null,
  seguroSocial: 0, seguroEducativo: 0, isr: 0,
  prestamo: 0, terceros: 0, mercancia: 0,
  totalDeducciones: 0, otrosServicios: 0, netoPagar: 40, ...o,
});

// ─────────────────────────────────────────────────────────────────────────────
describe("A. EL CORTE — se paga hasta el 15, pero se lee el reloj hasta el 13", () => {
  it("los días que Daniel nombró: 13 y 28", () => {
    expect(CORTE_SUGERIDO[1]).toBe(13);
    expect(CORTE_SUGERIDO[2]).toBe(28);
  });

  it("la primera quincena de agosto corta el 13; la segunda, el 28", () => {
    expect(corteSugerido(quincena(2026, 8, 1))).toBe("2026-08-13");
    expect(corteSugerido(quincena(2026, 8, 2))).toBe("2026-08-28");
  });

  // ⚠️ En febrero el 28 es el ÚLTIMO día: cortar ahí es lo mismo que no cortar,
  // así que no se propone nada en vez de proponer un corte que no corta.
  it("febrero no propone corte: el 28 ya es el final", () => {
    expect(corteSugerido(quincena(2026, 2, 2))).toBeNull();
  });

  it("los días que quedan sin medir son los de después del corte", () => {
    expect(diasSinMedir("2026-08-01", "2026-08-15", "2026-08-13"))
      .toEqual({ desde: "2026-08-14", hasta: "2026-08-15" });
  });

  it("sin corte no queda ningún día sin medir — es el comportamiento de siempre", () => {
    expect(diasSinMedir("2026-08-01", "2026-08-15", null)).toBeNull();
  });

  it("un corte fuera del rango, o justo al final, no vale", () => {
    expect(corteValido("2026-08-01", "2026-08-15", "2026-08-15")).toBe(false);
    expect(corteValido("2026-08-01", "2026-08-15", "2026-07-30")).toBe(false);
    expect(corteValido("2026-08-01", "2026-08-15", "no es fecha")).toBe(false);
    // 🔴 SIN corte SIEMPRE vale: es el valor de siempre.
    expect(corteValido("2026-08-01", "2026-08-15", null)).toBe(true);
  });

  it("el aviso dice hasta dónde se leyó y qué pasa con lo que falta", () => {
    const t = textoCorte("2026-08-15", "2026-08-13", 2)!;
    expect(t).toContain("2026-08-13");
    expect(t).toContain("2026-08-15");
    expect(t).toMatch(/días normales/);
    expect(t).toMatch(/quincena siguiente/);
    expect(textoCorte("2026-08-15", null, 0)).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("B. EL AJUSTE — solo lo que sale del RELOJ, y el sueldo NUNCA", () => {
  // 🔴 EL SUELDO NO SE PRORRATEA. Es la trampa entera: cerrar el cuadro con el
  // rango 1–13 haría que `factorBase` valga 13/15 y todo el mundo cobre un 13 %
  // menos. El corte recorta hasta dónde se MIRA el reloj, nada más.
  it("el salario quincenal NO entra al ajuste", () => {
    const a = ajusteDeDiasSinMedir(DINERO({ salarioQuincenal: 999, totalBruto: 999 }));
    expect(a).toBe(0);
  });

  it("una ausencia y una tardanza se DESCUENTAN en la siguiente", () => {
    expect(ajusteDeDiasSinMedir(DINERO({ ausencias: 24.16, tardanzas: 1.5 }))).toBeCloseTo(25.66, 2);
  });

  it("unas horas extra que no se pagaron se DEVUELVEN", () => {
    expect(ajusteDeDiasSinMedir(DINERO({ extraDiurno: 12.5 }))).toBeCloseTo(-12.5, 2);
  });

  it("días normales no producen ajuste", () => {
    expect(ajusteDeDiasSinMedir(DINERO({}))).toBe(0);
    expect(ajusteDeDiasSinMedir(null)).toBe(0);
  });

  // 🔴 LA LISTA ESTÁ A LA VISTA para que un concepto nuevo del motor obligue a
  // decidir de qué lado cae, en vez de quedarse afuera en silencio.
  // ⚠️ Eran SIETE hasta el 11-sep-2026. Daniel: *«la salida temprana incluirla»*
  // (nació el 10-sep, después del corte, y quedaba afuera). Cambió de número
  // con nota, no de regla: el sueldo sigue sin entrar nunca.
  it("son OCHO conceptos, con su signo — la salida temprana descuenta, como la tardanza", () => {
    expect(CONCEPTOS_DEL_RELOJ.map((c) => c.campo).sort()).toEqual(
      ["ausencias", "domingos", "excedente", "extraDiurno", "extraNocturno", "feriados", "salidaTemprana", "tardanzas"],
    );
    const suman = CONCEPTOS_DEL_RELOJ.filter((c) => c.signo === +1).map((c) => c.campo);
    expect(suman.sort()).toEqual(["ausencias", "salidaTemprana", "tardanzas"]);
  });

  it("el aviso de pantalla distingue descontar de devolver, y calla en cero", () => {
    expect(textoAjuste(12.5)).toMatch(/descuentan/);
    expect(textoAjuste(-8)).toMatch(/devuelven/);
    expect(textoAjuste(0)).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("C. EL INTERRUPTOR — apagado, el módulo es el de antes", () => {
  it("sin la variable, APAGADO", () => {
    const antes = process.env.NEXT_PUBLIC_PLANILLA_UNIDA;
    try {
      delete process.env.NEXT_PUBLIC_PLANILLA_UNIDA;
      expect(planillaUnidaPrendida()).toBe(false);
      process.env.NEXT_PUBLIC_PLANILLA_UNIDA = "0";
      expect(planillaUnidaPrendida()).toBe(false);
      process.env.NEXT_PUBLIC_PLANILLA_UNIDA = "1";
      expect(planillaUnidaPrendida()).toBe(true);
    } finally {
      if (antes === undefined) delete process.env.NEXT_PUBLIC_PLANILLA_UNIDA;
      else process.env.NEXT_PUBLIC_PLANILLA_UNIDA = antes;
    }
  });

  // 🔴 Las TRES puertas nuevas cuelgan del mismo interruptor. Si una se olvida,
  // apagarlo dejaría media función prendida.
  it("el cierre, la reapertura y las dos pantallas cuelgan de PLANILLA_UNIDA", () => {
    const ruta = leer("src/app/api/asistencia/planilla-guardada/route.ts");
    expect(ruta).toMatch(/if \(PLANILLA_UNIDA && r\.id\)/);
    expect(ruta).toMatch(/if \(PLANILLA_UNIDA\) \{\s*\n\s*const rev = await revertirPagosDelCierre/);
    expect(leer("src/app/asistencia/AsistenciaClient.tsx")).toMatch(/PLANILLA_UNIDA/);
    expect(leer("src/app/asistencia/PlanillaTab.tsx")).toMatch(/\{PLANILLA_UNIDA && \(/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("D. EL CABLEADO DEL CIERRE — el orden y el `await` no se mueven", () => {
  const ruta = leer("src/app/api/asistencia/planilla-guardada/route.ts");
  const servidor = leer("src/lib/asistencia/cierre-prestamo-server.ts");

  // 🔴 NADA DE FIRE-AND-FORGET. Esto mueve plata: un `.then().catch()` sería
  // una deuda que baja a veces.
  it("el pago se escribe con `await`, nunca con .then()", () => {
    expect(ruta).toMatch(/await escribirPagosDelCierre/);
    expect(ruta).toMatch(/await revertirPagosDelCierre/);
    expect(ruta).not.toMatch(/escribirPagosDelCierre\([^)]*\)\s*\.then/);
  });

  // 🔴 PRIMERO EL MOVIMIENTO, DESPUÉS EL AMARRE. Al revés, un fallo entre los
  // dos dejaría un amarre apuntando a un movimiento que no existe, y el próximo
  // cierre lo leería como «ya está pagado». Así, un fallo deja un movimiento sin
  // amarre: se ve, se arregla, y nadie deja de cobrar.
  it("el movimiento se inserta ANTES que el amarre", () => {
    const iMov = servidor.indexOf('.from("prestamos_movimientos")\n    .insert(');
    const iAmarre = servidor.indexOf("from(TABLA_AMARRE).insert(");
    expect(iMov).toBeGreaterThan(-1);
    expect(iAmarre).toBeGreaterThan(iMov);
  });

  // 🔴 SOFT DELETE, NUNCA UN `DELETE`. Lo que se pagó una vez se tiene que
  // poder leer después.
  it("reabrir NO borra: marca `deleted` y firma quién revirtió", () => {
    const codigo = leerSinComentarios("src/lib/asistencia/cierre-prestamo-server.ts");
    expect(codigo).toMatch(/\.update\(\{ deleted: true \}\)/);
    expect(codigo).toMatch(/revertido_en: ahora, revertido_por: opts\.usuario/);
    expect(codigo).not.toMatch(/\.delete\(\)/);
  });

  // 🔑 `deleted` es NULLABLE en préstamos: un `.eq("deleted", false)` PIERDE
  // filas, y perderlas acá es una deuda que no baja.
  it("las lecturas de préstamos usan `.or(deleted.is.null…)`, nunca `.eq`", () => {
    const codigo = leerSinComentarios("src/lib/asistencia/cierre-prestamo-server.ts");
    expect(codigo).toMatch(/\.or\("deleted\.is\.null,deleted\.eq\.false"\)/);
    expect(codigo).not.toMatch(/\.eq\("deleted", false\)/);
  });

  // 🔴 EL SALDO SE CALCULA EN UN SOLO LUGAR.
  it("el saldo sale de `calcularSaldoPrestamo` y no se recalcula acá", () => {
    expect(servidor).toMatch(/import \{[\s\S]*calcularSaldoPrestamo[\s\S]*\} from "@\/lib\/prestamos-saldo"/);
    expect(leer("src/lib/asistencia/cierre-prestamo.ts")).not.toMatch(/prestado\s*-\s*pagado/);
  });

  // 🔴 CERRAR DOS VECES NO COBRA DOS VECES, y el freno es un ÍNDICE, no un `if`.
  it("la migración crea el índice único del amarre", () => {
    const sql = leer("supabase/migrations/20261028120000_planilla_unida.sql");
    expect(sql).toMatch(/CREATE UNIQUE INDEX[\s\S]*asistencia_planilla_prestamo \(planilla_id, empleado_codigo, cuenta\)/);
    // Y es ADITIVA: nada de DROP.
    expect(sql).not.toMatch(/\bDROP\b/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("E. LOS DOS TEXTOS QUE SOLO EXISTEN PARA EL PAPEL", () => {
  it("son tres columnas, en un solo lugar", () => {
    expect([...COLUMNAS_DEL_PAPEL]).toEqual(["posicion", "cedula", "cedula_foto_path"]);
    // El `select` las pide desde esa misma constante, no escritas otra vez.
    expect(leer("src/lib/asistencia/config-server.ts")).toMatch(/COLUMNAS_DEL_PAPEL\.join\(", "\)/);
  });

  // 🔴 VACÍO ES `null`, NUNCA `""`. La base tiene un CHECK que lo rechaza.
  it("un campo vacío se guarda como `null`, no como cadena vacía", () => {
    expect(posicionDeFicha("")).toBeNull();
    expect(posicionDeFicha("   ")).toBeNull();
    expect(cedulaDeFicha(undefined)).toBeNull();
    expect(posicionDeFicha("  Asistente  de   Bodega ")).toBe("Asistente de Bodega");
  });

  it("sin cargo cargado, el papel dice un guion", () => {
    expect(SIN_POSICION).toBe("—");
  });

  it("el CHECK de la base rechaza la cadena vacía", () => {
    const sql = leer("supabase/migrations/20261028120000_planilla_unida.sql");
    expect(sql).toMatch(/posicion IS NULL OR btrim\(posicion\) <> ''/);
    expect(sql).toMatch(/cedula IS NULL OR btrim\(cedula\) <> ''/);
  });

  // 🔴 NINGUNO TOCA EL CÁLCULO: son textos que se imprimen.
  it("ni el cargo ni la cédula entran al motor de cálculo", () => {
    const motor = leerSinComentarios("src/lib/asistencia/planilla.ts");
    expect(motor).not.toMatch(/\bposicion\b/);
    expect(motor).not.toMatch(/\bcedula\b/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("F. LA SECRETARIA ENTRA A PRÉSTAMOS SOLO A VER", () => {
  const ruta = leer("src/app/api/asistencia/prestamos-deuda/route.ts");

  // 🔴 Las dos listas son DERIVADAS, no escritas a mano. Daniel: *«La secretaria
  // entra a Préstamos solo a VER»*.
  it("ver = asistenciaRoles(); anotar = cerrarPlanillaRoles()", () => {
    expect(ruta).toMatch(/export async function GET[\s\S]*requireAsistencia\(req, asistenciaRoles\(\)\)/);
    expect(ruta).toMatch(/export async function POST[\s\S]*requireAsistencia\(req, cerrarPlanillaRoles\(\)\)/);
  });

  it("y la pantalla no dibuja un botón que va a contestar 403", () => {
    expect(leer("src/app/asistencia/PrestamosTab.tsx")).toMatch(/puedeAnotar/);
    expect(ruta).toMatch(/puedeAnotar: cerrarPlanillaRoles\(\)\.includes/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("G. EN EL IPHONE (~390 px) LA PÁGINA NO SE DESLIZA DE LADO", () => {
  const tab = leer("src/app/asistencia/PrestamosTab.tsx");

  // 🔴 EL DESLIZAMIENTO VIVE ADENTRO DE LA TABLA, NUNCA EN LA PÁGINA. Una tabla
  // de 7 columnas en 390 px pide ~200 px de arrastre y nadie la lee: por eso
  // abajo de `lg` hay tarjetas, que es lo mismo que hace la lista de Guías.
  it("la tabla está escondida abajo de lg y va dentro de su propio overflow-x-auto", () => {
    expect(tab).toMatch(/className="hidden overflow-x-auto[^"]*lg:block"/);
    // Y hay tarjetas para el celular, con el `lg:hidden` que las apaga arriba.
    expect(tab).toMatch(/lg:hidden/);
  });

  // Nada de anchos fijos que empujen la página. El único ancho grande admitido
  // sería el de un contenedor con su propio scroll, y no hay ninguno.
  it("sin anchos fijos que no quepan en 390 px", () => {
    expect(tab).not.toMatch(/\b(?:min-)?w-\[\s*(?:[4-9]\d{2}|\d{4,})px\]/);
  });

  // 44 px es el mínimo tocable de iOS. Todo botón, input y select del módulo
  // nuevo lo lleva; sin eso, el dedo cae al lado del botón.
  it("todo lo que se toca mide 44 px de alto", () => {
    for (const archivo of ["src/app/asistencia/PrestamosTab.tsx"]) {
      const src = leer(archivo);
      // ⚠️ No se corta en el primer `>`: los `onClick={() => …}` traen un `>`
      // adentro y el elemento quedaría partido a la mitad. Se miran los 500
      // caracteres que siguen a la apertura, que es donde vive el `className`.
      const aperturas = [...src.matchAll(/<(?:button|input|select)\b/g)];
      expect(aperturas.length).toBeGreaterThan(5);
      for (const a of aperturas) {
        const trozo = src.slice(a.index!, a.index! + 500);
        expect(trozo).toMatch(/min-h-\[44px\]/);
      }
    }
  });

  // 🔴 `text-sm` es el piso para los DATOS (regla de la casa). Nada de 12 px.
  // ⚠️ El ÚNICO `text-xs` admitido es el encabezado de la tabla: es un rótulo
  // de columna en mayúsculas, no un dato, y es el mismo tamaño que usan las
  // demás tablas del sistema. Todo lo que ES un dato va en `text-sm` o más.
  it("ningún dato baja de text-sm", () => {
    expect(tab).not.toMatch(/text-\[1[0-3]px\]/);
    const xs = [...tab.matchAll(/\btext-xs\b/g)];
    for (const m of xs) {
      const contexto = tab.slice(Math.max(0, m.index! - 200), m.index!);
      expect(contexto).toMatch(/<thead/);
    }
  });

  // Plata con centavos y menos TIPOGRÁFICO (−), no un guion de teclado.
  it("la plata negativa lleva el menos tipográfico", () => {
    expect(tab).toMatch(/`−\$\$?\{abs\}`|−\$/);
    expect(tab).toMatch(/minimumFractionDigits: 2/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("H. EL CORTE Y EL AJUSTE, CABLEADOS (10-sep-2026)", () => {
  const ruta = leerSinComentarios("src/app/api/asistencia/planilla/route.ts");
  const cierre = leerSinComentarios("src/app/api/asistencia/planilla-guardada/route.ts");

  // 🔴 EL SUELDO NO SE PRORRATEA: el período (desde..hasta, factorBase) NO se
  // toca; lo único que se recorta es hasta dónde se MIDE el reloj (`hastaReloj`).
  it("el reloj se mide con `hastaReloj`, pero el período queda entero", () => {
    // El corte solo nace con el interruptor, en una quincena, y si es válido.
    expect(ruta).toMatch(/PLANILLA_UNIDA && q\.esQuincena && corteRaw && corteValido/);
    expect(ruta).toMatch(/const hastaReloj = corte \?\? q\.hasta;/);
    // La medición usa hastaReloj…
    expect(ruta).toMatch(/leerCorrecciones\(q\.desde, hastaReloj\)/);
    expect(ruta).toMatch(/leerVacaciones\(q\.desde, hastaReloj\)/);
    expect(ruta).toMatch(/hasta: hastaReloj,/);
    // …pero el factor y la clave de montos siguen saliendo del período entero.
    expect(ruta).toMatch(/factorBase: q\.factorBase/);
  });

  // 🔴 EL AJUSTE SOLO CORRE CON EL INTERRUPTOR, EN UNA QUINCENA Y CON EMPRESA.
  it("el ajuste cuelga de PLANILLA_UNIDA, la quincena y la empresa", () => {
    expect(ruta).toMatch(/if \(PLANILLA_UNIDA && q\.esQuincena && q\.quincena && empresa\)/);
    expect(ruta).toMatch(/medirAjusteAnterior\(req, empresa, q\.quincena\)/);
  });

  // 🔑 NO HAY RECURSIÓN: el rango corto que mide los días sin medir NO lleva
  // corte, así que su propio bloque de ajuste (que exige esQuincena) no corre.
  it("el rango que mide los días sin medir no se le pasa corte", () => {
    const bloque = ruta.slice(ruta.indexOf("async function medirAjusteAnterior"), ruta.indexOf("export async function GET"));
    expect(bloque).toMatch(/url\.searchParams\.set\("desde", restante\.desde\)/);
    expect(bloque).not.toMatch(/set\("corte"/);
    // 🔴 11-sep-2026: ya no reduce el dinero a UN número acá. Devuelve el
    // `dinero` de los días sin medir tal cual, y es `aplicarAjusteEnLinea` la
    // que lo reparte concepto por concepto (la contadora: «valen diferente»).
    expect(bloque).toMatch(/dinero\.set\(l\.codigo, l\.dinero\)/);
    expect(bloque).not.toMatch(/ajusteDeDiasSinMedir/);
    // ⚠️ 11-sep-2026: la llamada ganó un cuarto argumento —los porcentajes de los
    // seguros (Daniel: «los seguros, va»)— y se partió en varias líneas. La
    // regla que protege no cambió: el ajuste entra por `aplicarAjusteEnLinea`.
    expect(ruta).toMatch(/aplicarAjusteEnLinea\(\s*l, medido\.dinero\.get\(l\.codigo\), medido\.dias,/);
    // Y los totales salen de las líneas YA con el ajuste adentro.
    expect(ruta).toMatch(/totales: totalizar\(lineasFinal\)/);
  });

  // 🔴 EL CIERRE GUARDA EL CORTE Y LO PASA AL CÁLCULO.
  it("el cierre pasa el corte al cálculo y a la cabecera", () => {
    expect(cierre).toMatch(/PLANILLA_UNIDA && corteRaw && corteValido\(desde, hasta, corteRaw\)/);
    expect(cierre).toMatch(/if \(corte\) url\.searchParams\.set\("corte", corte\)/);
    expect(cierre).toMatch(/corte,\s*\n\s*\}\);/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("I. EL AJUSTE, LA CUENTA (pura)", () => {
  const DINERO = (o: Partial<import("@/lib/asistencia/planilla").DineroLinea>) =>
    ({ ...DINERO_BASE, ...o } as import("@/lib/asistencia/planilla").DineroLinea);

  // 🔴 UNA SOLA CUENTA para el neto real: netoPagar − ajuste. El motor no
  // conoce el ajuste; sin él, da idéntico.
  it("netoConAjuste resta el ajuste, y sin ajuste no cambia nada", async () => {
    const { netoConAjuste } = await import("@/lib/asistencia/corte-quincena");
    expect(netoConAjuste(229.95, 12.5)).toBeCloseTo(217.45, 2);   // descuenta
    expect(netoConAjuste(229.95, -8)).toBeCloseTo(237.95, 2);     // devuelve
    expect(netoConAjuste(229.95, 0)).toBeCloseTo(229.95, 2);
    expect(netoConAjuste(229.95, null)).toBeCloseTo(229.95, 2);
    expect(netoConAjuste(229.95, undefined)).toBeCloseTo(229.95, 2);
  });

  // 🔴 EL NETO GUARDADO ES EL QUE SE PAGA: `netoPagar` TAL CUAL.
  // Cambió de dirección el 11-sep-2026: hasta entonces restaba `ajusteAnterior`
  // porque el ajuste vivía FUERA de `dinero`. Ahora entra en las columnas
  // (`aplicarAjusteEnLinea`) y `netoPagar` ya lo trae; restarlo otra vez lo
  // cobraría dos veces. `ajusteAnterior` queda como testigo y NO mueve el total.
  it("totalesDe suma netoPagar tal cual, y el testigo `ajusteAnterior` no lo mueve", async () => {
    const { totalesDe } = await import("@/lib/asistencia/planilla-guardada");
    const base = { horas: {}, faltaConfigurar: [], fueraDePlanilla: false } as unknown as Record<string, unknown>;
    const linea = (neto: number, ajuste?: number) => ({
      ...base, codigo: "x", etiqueta: "X", dinero: DINERO({ netoPagar: neto, totalBruto: neto }),
      ajusteAnterior: ajuste,
    }) as unknown as import("@/lib/asistencia/planilla").LineaPlanilla;
    const t = totalesDe([linea(200, 15), linea(300)]);
    expect(t.totalNeto).toBeCloseTo(200 + 300, 2);
  });

  // La quincena anterior: la 2ª de un mes → la 1ª; la 1ª → la 2ª del mes pasado.
  it("quincenaAnterior encadena las quincenas, y cruza el año en enero", async () => {
    const { quincena, quincenaAnterior } = await import("@/lib/asistencia/planilla");
    expect(quincenaAnterior(quincena(2026, 8, 2)).clave).toBe("2026-08-1");
    expect(quincenaAnterior(quincena(2026, 8, 1)).clave).toBe("2026-07-2");
    expect(quincenaAnterior(quincena(2026, 1, 1)).clave).toBe("2025-12-2");
  });
});

const DINERO_BASE = {
  rataHora: 3, valorMinuto: 0.05, salarioQuincenal: 200,
  extraDiurno: 0, extraNocturno: 0, excedente: 0, domingos: 0, feriados: 0,
  ausencias: 0, ausenciaPorTardanza: 0, ausenciaDeDiaCompleto: 0, vacacionesYaPagadas: 0,
  tardanzas: 0, totalBruto: 200, baseSeguros: null, seguroSocial: 0, seguroEducativo: 0,
  isr: 0, prestamo: 0, terceros: 0, mercancia: 0, totalDeducciones: 0, otrosServicios: 0, netoPagar: 200,
};

// ─────────────────────────────────────────────────────────────────────────────
describe("J. EL CIERRE CONGELA EL CORTE Y EL AJUSTE", () => {
  // 🔴 `filaDeLinea` escribe el ajuste de cada línea, para que el cuadro
  // congelado sepa cuánto se le corrigió a cada persona.
  it("filaDeLinea escribe ajuste_anterior de la línea", async () => {
    const { filaDeLinea } = await import("@/lib/asistencia/planilla-guardada");
    const base = {
      codigo: "x", etiqueta: "X", nombre: "X", empresa: "vistana",
      empresaEtiqueta: "Vistana", salarioMensual: 500, jornadaSemanal: 48,
      horas: {} as never, faltaConfigurar: [], fueraDePlanilla: false,
      pagaSeguros: true, baseSeguros: null, noMarcaReloj: false, parte: null,
      decidirAMano: null, quincenalReferencia: null, extraMedido: null,
      extraNoAprobada: null, extraAprobada: true,
      dinero: null, manuales: { isr: 0, prestamo: 0, terceros: 0, mercancia: 0, otrosServicios: 0 },
    };
    const conAjuste = filaDeLinea("p1", "vistana", { ...base, ajusteAnterior: 12.5 } as never);
    expect(conAjuste.ajuste_anterior).toBe(12.5);
    // Sin ajuste, cero — el comportamiento de siempre.
    const sinAjuste = filaDeLinea("p1", "vistana", base as never);
    expect(sinAjuste.ajuste_anterior).toBe(0);
  });

  // 🔴 `cerrarPlanilla` inserta el corte en la cabecera (de ahí lo lee la
  // quincena siguiente para armar su ajuste). Barrido sobre el I/O.
  it("cerrarPlanilla escribe el corte en la cabecera", () => {
    const srv = leerSinComentarios("src/lib/asistencia/planilla-guardada-server.ts");
    expect(srv).toMatch(/corte: opts\.corte \?\? null/);
    // Y la cabecera LEE el corte (para encadenar las quincenas).
    expect(srv).toMatch(/corte: f\.corte \? String\(f\.corte\)/);
  });
});
