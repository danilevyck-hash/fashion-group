/**
 * ─────────────────────────────────────────────────────────────────────────────
 * 🔴 LA MARCA REPETIDA SE OLVIDA SOLA (18-sep-2026)
 *
 * Daniel, textual:
 *
 *     «quiero que el sistema agarre la primera marcación y olvide la próxima si
 *      es en x cantidad de tiempo (esa x la quiero definir contigo)»
 *
 * y, después de ver la medición: **«1 minuto»**.
 *
 * 🩸 Ramón Miranda (21), 3-ago-2026: 07:58:36 · 07:58:37 · 13:55:43 · 14:22:04
 * · 17:10:43. El dedo tocó dos veces al entrar, la 2.ª marca dejó de ser la
 * salida a almorzar y el Reporte le medía 5 h 57 min de almuerzo (327 minutos
 * de exceso), con el día en ámbar frenando el cierre.
 *
 * 🔴 LO QUE ESTE CANDADO PROTEGE:
 *   A. la regla, en un módulo PURO con UNA constante: 60 s exactos se olvida,
 *      61 no; se conserva la PRIMERA; contra la última que CUENTA;
 *   B. el motor la aplica sobre las marcas que quedan DESPUÉS de las
 *      correcciones, por día (no cruza de un día a otro), y calcula todo sobre
 *      las buenas;
 *   C. SE VE: el día lleva la repetida con su porqué, y el Excel también;
 *   D. el freno del cierre cuenta DESPUÉS de olvidar;
 *   E. no se borra una fila de `asistencia_marcaciones`: ni un update, delete
 *      ni upsert nuevo, y el módulo no toca la base.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import {
  SEGUNDOS_MARCA_REPETIDA,
  avisoRepetidas,
  contarRepetidas,
  explicacionRepetida,
  olvidarRepetidas,
  segundosTexto,
  textoMarcaRepetida,
  textoTodasLasMarcasConRepetidas,
} from "@/lib/asistencia/marca-repetida";
import { armarReporte, type Marcacion } from "@/lib/asistencia/reporte";
import { aplicarCorrecciones, instantePanama, type Correccion } from "@/lib/asistencia/correcciones";
import { diasConMarcasImpares } from "@/lib/asistencia/marcas-impares";
import { textoTodasLasMarcas } from "@/lib/asistencia/marcas-del-dia";

const RAIZ = path.join(process.cwd(), "src");
const leer = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), "utf8");

const seg = (h: string) => {
  const [hh, mm, ss] = h.split(":").map(Number);
  return hh * 3600 + mm * 60 + (ss || 0);
};

/** El día real de Ramón Miranda (21), 3-ago-2026. */
const RAMON = ["07:58:36", "07:58:37", "13:55:43", "14:22:04", "17:10:43"];

// ─────────────────────────────────────────────────────────────────────────────
// A. LA REGLA, PURA
// ─────────────────────────────────────────────────────────────────────────────

describe("🔴 A. la regla: a 60 s o menos de la última que cuenta, no cuenta", () => {
  it("🔑 el número es UNO y es 60 (Daniel: «1 minuto»)", () => {
    expect(SEGUNDOS_MARCA_REPETIDA).toBe(60);
    // Y no hay otro 60 escondido: el motor y el Excel lo IMPORTAN, no lo copian.
    expect(leer("lib/asistencia/reporte.ts")).toContain('from "./marca-repetida"');
    expect(leer("lib/asistencia/exportar.ts")).toContain("SEGUNDOS_MARCA_REPETIDA");
    const fuente = leer("lib/asistencia/marca-repetida.ts");
    expect(fuente.match(/= 60;/g)).toHaveLength(1);
  });

  it("🩸 el día de Ramón: la 07:58:37 se olvida y quedan CUATRO", () => {
    const r = olvidarRepetidas(RAMON.map(seg));
    expect(r.buenas.map((s) => s)).toEqual(["07:58:36", "13:55:43", "14:22:04", "17:10:43"].map(seg));
    expect(r.olvidadas).toEqual([{ seg: seg("07:58:37"), despuesDeSeg: seg("07:58:36"), segundosDespues: 1 }]);
  });

  it("🔴 60 SEGUNDOS EXACTOS SE OLVIDA; 61 NO", () => {
    const a = olvidarRepetidas([seg("08:00:00"), seg("08:01:00")]);
    expect(a.buenas).toEqual([seg("08:00:00")]);
    expect(a.olvidadas[0]?.segundosDespues).toBe(60);
    const b = olvidarRepetidas([seg("08:00:00"), seg("08:01:01")]);
    expect(b.buenas).toEqual([seg("08:00:00"), seg("08:01:01")]);
    expect(b.olvidadas).toEqual([]);
  });

  it("🔴 SE CONSERVA LA PRIMERA, NO LA ÚLTIMA — también cuando el doble toque es a la salida", () => {
    const r = olvidarRepetidas([seg("08:00:00"), seg("12:00:00"), seg("12:30:00"), seg("17:00:33"), seg("17:00:34")]);
    expect(r.buenas).toEqual([seg("08:00:00"), seg("12:00:00"), seg("12:30:00"), seg("17:00:33")]);
    expect(r.olvidadas.map((o) => o.seg)).toEqual([seg("17:00:34")]);
  });

  it("🔑 se compara contra la última que CUENTA: una repetida no estira la ventana", () => {
    // 08:00:00 · 08:00:50 · 08:01:40 — la tercera está a 100 s de la PRIMERA.
    const r = olvidarRepetidas([seg("08:00:00"), seg("08:00:50"), seg("08:01:40")]);
    expect(r.buenas).toEqual([seg("08:00:00"), seg("08:01:40")]);
    expect(r.olvidadas.map((o) => o.despuesDeSeg)).toEqual([seg("08:00:00")]);
  });

  it("tres toques seguidos en 11 segundos dejan uno (el colaborador 40, 31-ago)", () => {
    const r = olvidarRepetidas([seg("18:27:46"), seg("18:27:49"), seg("18:27:57")]);
    expect(r.buenas).toEqual([seg("18:27:46")]);
    expect(r.olvidadas).toHaveLength(2);
  });

  it("el mismo segundo dos veces: se olvida una (0 s después); sin marcas, nada", () => {
    const r = olvidarRepetidas([seg("08:00:00"), seg("08:00:00")]);
    expect(r.buenas).toEqual([seg("08:00:00")]);
    expect(r.olvidadas[0]?.segundosDespues).toBe(0);
    expect(olvidarRepetidas([])).toEqual({ buenas: [], olvidadas: [] });
    expect(olvidarRepetidas([seg("08:00:00")])).toEqual({ buenas: [seg("08:00:00")], olvidadas: [] });
  });

  it("no muta lo que recibe y un día normal de 4 sale intacto", () => {
    const entrada = [seg("08:04:08"), seg("12:06:59"), seg("12:39:52"), seg("16:37:50")];
    const copia = [...entrada];
    const r = olvidarRepetidas(entrada);
    expect(entrada).toEqual(copia);
    expect(r.buenas).toEqual(copia);
    expect(r.olvidadas).toEqual([]);
  });

  it("los textos: el porqué, el del Excel y el aviso de arriba", () => {
    expect(segundosTexto(1)).toBe("1 s");
    expect(segundosTexto(60)).toBe("60 s");
    const r = { hora: "07:58:37", despuesDe: "07:58:36", segundosDespues: 1, id: "m1" };
    expect(explicacionRepetida(r)).toBe("repetida, 1 s después de 07:58:36 — no cuenta");
    expect(textoMarcaRepetida(r)).toBe("REPETIDA 07:58:37 (repetida, 1 s después de 07:58:36 — no cuenta)");
    expect(avisoRepetidas(0)).toBeNull();
    expect(avisoRepetidas(1)).toContain("1 marcación repetida del reloj se olvidó sola");
    expect(avisoRepetidas(3)).toContain("3 marcaciones repetidas del reloj se olvidaron solas");
    expect(avisoRepetidas(3)).toContain("60 s");
    expect(contarRepetidas([{ repetidas: [1, 2] }, { repetidas: [] }, { repetidas: [3] }])).toBe(3);
  });

  it("«Todas las marcas» con la repetida adentro, en su lugar por hora y dicha", () => {
    const marcas = ["07:58:36", "13:55:43", "14:22:04", "17:10:43"];
    const repetidas = [{ hora: "07:58:37" }];
    expect(textoTodasLasMarcasConRepetidas(marcas, repetidas)).toBe(
      "07:58:36 · 07:58:37 (repetida, no cuenta) · 13:55:43 · 14:22:04 · 17:10:43",
    );
    // Sin repetidas es EXACTAMENTE el texto de siempre.
    expect(textoTodasLasMarcasConRepetidas(marcas, [])).toBe(textoTodasLasMarcas(marcas));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// B. EL MOTOR
// ─────────────────────────────────────────────────────────────────────────────

const marca = (codigo: string, fecha: string, hora: string, id?: string): Marcacion & { id?: string } => ({
  empleado_codigo: codigo, empleado_nombre: null, ocurrio_en: instantePanama(fecha, hora), id,
});

function motor(marcaciones: readonly Marcacion[], desde = "2026-08-03", hasta = "2026-08-04") {
  return armarReporte({
    marcaciones, horarios: [{ empleado_codigo: "21", entrada: "08:00", salida: "17:00", almuerzo_minutos: 30 }],
    justificaciones: [], feriados: new Map(), desde, hasta,
  });
}

describe("🔴 B. el motor olvida la repetida y calcula TODO sobre las buenas", () => {
  it("🩸 Ramón, 3-ago: de 327 minutos de exceso a 0, y el día ya no está a revisar", () => {
    const [p] = motor(RAMON.map((h, i) => marca("21", "2026-08-03", h, `m${i}`)));
    const d = p.dias.find((x) => x.fecha === "2026-08-03")!;
    expect(d.marcas).toEqual(["07:58:36", "13:55:43", "14:22:04", "17:10:43"]);
    expect(d.marcasIds).toEqual(["m0", "m2", "m3", "m4"]);
    // 🔴 SE VE: la repetida viaja con su porqué y su id (la fila sigue en la base).
    expect(d.repetidas).toEqual([{ hora: "07:58:37", despuesDe: "07:58:36", segundosDespues: 1, id: "m1" }]);
    expect(d.excesoAlmuerzoMin).toBe(0);
    expect(d.entrada).toBe("07:58:36");
    expect(d.salida).toBe("17:10:43");
    expect(d.revisar).toBe(false);
    expect(p.resumen.marcasRepetidas).toBe(1);
    expect(p.resumen.diasARevisar).toBe(0);
  });

  it("⚠️ el mismo día SIN la repetida da los mismos números: nada más se movió", () => {
    const conRepetida = motor(RAMON.map((h) => marca("21", "2026-08-03", h)))[0].dias[0];
    const sinRepetida = motor(["07:58:36", "13:55:43", "14:22:04", "17:10:43"].map((h) => marca("21", "2026-08-03", h)))[0].dias[0];
    for (const k of ["tardeMin", "excesoAlmuerzoMin", "salidaTempranaMin", "extraMin", "trabajadoMin", "revisar", "entrada", "salida"] as const) {
      expect(conRepetida[k]).toEqual(sinRepetida[k]);
    }
    expect(sinRepetida.repetidas).toEqual([]);
  });

  it("🔴 NO CRUZA DE UN DÍA A OTRO: 23:59:59 y 00:00:00 del día siguiente son dos días", () => {
    const [p] = motor([
      marca("21", "2026-08-03", "08:00:00"), marca("21", "2026-08-03", "23:59:59"),
      marca("21", "2026-08-04", "00:00:00"), marca("21", "2026-08-04", "17:00:00"),
    ]);
    const d3 = p.dias.find((x) => x.fecha === "2026-08-03")!;
    const d4 = p.dias.find((x) => x.fecha === "2026-08-04")!;
    expect(d3.marcas).toEqual(["08:00:00", "23:59:59"]);
    expect(d4.marcas).toEqual(["00:00:00", "17:00:00"]);
    expect(d3.repetidas).toEqual([]);
    expect(d4.repetidas).toEqual([]);
  });

  it("🔴 se aplica DESPUÉS de las correcciones: una quitada a mano ya no está, y no cuenta dos veces", () => {
    const crudas = RAMON.map((h, i) => marca("21", "2026-08-03", h, `m${i}`));
    const quita: Correccion = {
      id: "c1", marcacionId: "m1", empleadoCodigo: "21", fecha: "2026-08-03", hora: "",
      motivo: "doble toque", creadaPor: "daniel", creadaEn: "2026-09-18T12:00:00Z", quita: true,
    };
    const efectivas = aplicarCorrecciones(crudas, [quita]);
    const [p] = armarReporte({
      marcaciones: efectivas.marcaciones, horarios: [], justificaciones: [], feriados: new Map(),
      desde: "2026-08-03", hasta: "2026-08-03", correccionesPorDia: efectivas.porDia,
    });
    const d = p.dias[0];
    expect(d.marcas).toEqual(["07:58:36", "13:55:43", "14:22:04", "17:10:43"]);
    expect(d.repetidas).toEqual([]);
    expect(d.correcciones.map((c) => c.quitada)).toEqual([true]);
  });

  it("🔑 la salida es la PRIMERA del doble toque: un día de 6 con dos repetidas queda en 4", () => {
    // Yeishka Irene Diaz Markham (54), 11-sep-2026.
    const YEISHKA = ["08:00:46", "08:00:48", "13:43:48", "14:11:15", "17:00:33", "17:00:34"];
    const [p] = motor(YEISHKA.map((h) => marca("21", "2026-08-03", h)));
    const d = p.dias[0];
    expect(d.marcas).toEqual(["08:00:46", "13:43:48", "14:11:15", "17:00:33"]);
    expect(d.salida).toBe("17:00:33");
    expect(d.repetidas.map((r) => r.hora)).toEqual(["08:00:48", "17:00:34"]);
    expect(d.revisar).toBe(false);
  });

  it("dos marcas a 30 s una de otra dejan UNA: entrada conocida, salida no", () => {
    const [p] = motor([marca("21", "2026-08-03", "08:00:00"), marca("21", "2026-08-03", "08:00:30")]);
    const d = p.dias[0];
    expect(d.marcas).toEqual(["08:00:00"]);
    expect(d.salida).toBeNull();
    expect(d.salidaTempranaMin).toBe(0);
    expect(d.repetidas).toHaveLength(1);
  });

  it("⚠️ vacaciones y fuera de vigencia: no se calcula nada y las marcas se muestran tal cual", () => {
    const marcas = RAMON.map((h) => marca("21", "2026-08-03", h));
    const [vac] = armarReporte({
      marcaciones: marcas, horarios: [], justificaciones: [], feriados: new Map(),
      desde: "2026-08-03", hasta: "2026-08-03",
      vacaciones: [{ empleado_codigo: "21", desde: "2026-08-03", hasta: "2026-08-03", ya_pagadas: false } as never],
    });
    expect(vac.dias[0].vacacion?.marcasIgnoradas).toEqual(RAMON);
    expect(vac.dias[0].repetidas).toEqual([]);
    const [fuera] = armarReporte({
      marcaciones: marcas, horarios: [], justificaciones: [], feriados: new Map(),
      desde: "2026-08-03", hasta: "2026-08-03",
      vigencias: new Map([["21", { fechaIngreso: "2026-09-01", fechaSalida: null } as never]]),
    });
    expect(fuera.dias[0].fueraDeVigencia).toBe(true);
    expect(fuera.dias[0].marcas).toEqual(RAMON);
    expect(fuera.dias[0].repetidas).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// C. SE VE — el Excel
// ─────────────────────────────────────────────────────────────────────────────

describe("🔴 C. el Excel lleva la repetida, dicha, y «Cuántas marcas» cuenta las que cuentan", () => {
  it("«Todas las marcas» dice «(repetida, no cuenta)» y «Cuántas marcas» da 4", async () => {
    const XLSX = await import("xlsx-js-style");
    const { construirExcel, COL_TODAS_LAS_MARCAS, COL_CUANTAS_MARCAS } = await import("@/lib/asistencia/exportar");
    const [p] = motor(RAMON.map((h) => marca("21", "2026-08-03", h)), "2026-08-03", "2026-08-03");
    const wb = construirExcel({ personas: [p], desde: "2026-08-03", hasta: "2026-08-03" });
    const h = wb.Sheets["Detalle"];
    const celda = (r: number, c: number) => h[XLSX.utils.encode_cell({ r, c })]?.v;
    expect(celda(1, COL_TODAS_LAS_MARCAS)).toBe(
      "07:58:36 · 07:58:37 (repetida, no cuenta) · 13:55:43 · 14:22:04 · 17:10:43",
    );
    expect(celda(1, COL_CUANTAS_MARCAS)).toBe(4);
    // Las cuatro de siempre, con las BUENAS.
    expect(celda(1, 3)).toBe("07:58:36");
    expect(celda(1, 4)).toBe("13:55:43");
    expect(celda(1, 5)).toBe("14:22:04");
    expect(celda(1, 6)).toBe("17:10:43");
    // Y «Revisar» va vacío: el día quedó en 4.
    expect(celda(1, 14)).toBe("");
    // La guía del archivo lo explica.
    const guia = wb.Sheets["Cómo se calcula"];
    const textos = Object.values(guia).map((c) => (c as { v?: unknown })?.v).filter((v) => typeof v === "string");
    expect(textos.some((t) => String(t).startsWith("Marca repetida"))).toBe(true);
    expect(textos.some((t) => String(t).includes("60 segundos o menos"))).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// D. EL FRENO DEL CIERRE CUENTA DESPUÉS DE OLVIDAR
// ─────────────────────────────────────────────────────────────────────────────

describe("🔴 D. el freno del cierre cuenta DESPUÉS de olvidar", () => {
  it("un día de 5 con una repetida deja de frenar; uno de 5 SIN repetida sigue frenando", () => {
    const [conRepetida] = motor(RAMON.map((h) => marca("21", "2026-08-03", h)), "2026-08-03", "2026-08-03");
    expect(diasConMarcasImpares(conRepetida.dias)).toEqual([]);
    const CINCO_REALES = ["07:58:36", "10:30:00", "13:55:43", "14:22:04", "17:10:43"];
    const [sinRepetida] = motor(CINCO_REALES.map((h) => marca("21", "2026-08-03", h)), "2026-08-03", "2026-08-03");
    expect(diasConMarcasImpares(sinRepetida.dias)).toEqual([{ fecha: "2026-08-03", marcas: 5 }]);
    expect(sinRepetida.dias[0].revisar).toBe(true);
  });

  it("el motor cuenta `revisar` sobre las buenas, no sobre las crudas", () => {
    expect(leer("lib/asistencia/reporte.ts")).toContain("const revisar = !enCurso && buenas.length !== 4;");
    expect(leer("lib/asistencia/reporte.ts")).toContain("marcas: buenas.map(fmt)");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// E. NADA SE BORRA
// ─────────────────────────────────────────────────────────────────────────────

describe("🔴 E. no se borra una fila de asistencia_marcaciones", () => {
  it("el módulo es PURO: no importa la base ni la red, y no nombra la tabla para escribirla", () => {
    // Sin comentarios: la cabecera DICE «sin `new Date()`», y eso no es código.
    const fuente = leer("lib/asistencia/marca-repetida.ts")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    expect(fuente).not.toMatch(/from ["']@\/lib\/supabase/);
    expect(fuente).not.toMatch(/\bfetch\(/);
    expect(fuente).not.toMatch(/new Date\(/);
    for (const prohibido of [".update(", ".delete(", ".upsert(", ".from("]) {
      expect(fuente).not.toContain(prohibido);
    }
  });

  it("el motor tampoco: ni un update, delete ni upsert en reporte.ts", () => {
    const fuente = leer("lib/asistencia/reporte.ts");
    for (const prohibido of [".update(", ".delete(", ".upsert(", "supabase"]) {
      expect(fuente).not.toContain(prohibido);
    }
  });

  it("la pantalla la muestra TACHADA con su porqué, en gris, y la cuenta arriba", () => {
    const tsx = leer("app/asistencia/ReporteTab.tsx");
    // `?? []`: un día sin el campo se dibuja igual (falla abierta).
    expect(tsx).toContain("(d.repetidas ?? []).map(");
    expect(contarRepetidas([{}, { repetidas: null }, { repetidas: [1] }])).toBe(1);
    expect(tsx).toContain("explicacionRepetida(r)");
    expect(tsx).toContain("line-through\">{r.hora}");
    expect(tsx).toContain("avisoRepetidas(");
  });
});
