/* ─────────────────────────────────────────────────────────────────────────────
 * 🔴 «OTROS SERVICIOS» SALE DE LA FICHA — el candado (15-sep-2026).
 *
 * Daniel, textual: *«debería de haber un campo en la ficha que diga "otros
 * servicios", y a qué quincena se le aplica ese extra (debe de ser la misma en
 * la que trabajó)»* · *«que sea como está, el total, ya el detalle debería estar
 * en el perfil»* · *«sí»* al concepto obligatorio · *«no paga seguro social y
 * educativo»* · *«todos»* lo pueden registrar · *«no»* a editarlo o borrarlo con
 * la quincena ya cerrada.
 *
 * 🩸 EL CASO REAL: JULIO GARAY, 1–15 sep, $31.00 de mensajería y flete + $120.00
 * de una fiesta religiosa = $151.00. Hoy eso vive en una nota suelta del Excel
 * de la contadora.
 *
 * 🔴 LO QUE SE PROTEGE:
 *
 *   A. Monto y concepto, los dos OBLIGATORIOS. Y nada más.
 *   B. NO SE ELIGE FECHA NI QUINCENA: las pone el servidor con el día de Panamá.
 *   C. El total entra SOLO a la casilla, y lo escrito a mano manda.
 *   D. 🔴 SE SUMA AL NETO Y NADA MÁS: no toca el bruto, ni los seguros, ni el
 *      total de deducciones.
 *   E. 🔴 Con el sueldo repartido cae en UNA sola línea: la del reloj.
 *   F. El Excel gana su hoja (y no nace si nadie tiene nada); el comprobante
 *      gana una nota, sin mover el renglón ni el monto.
 *   G. Falla ABIERTA sin la migración, la tabla está en el respaldo, y con la
 *      quincena cerrada el servidor rechaza el borrado.
 * ─────────────────────────────────────────────────────────────────────────── */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

import {
  MIGRACION_OTROS_SERVICIOS,
  aplicarOtrosServiciosEnLinea,
  faltaParaGuardar,
  notaOtrosServicios,
  quincenaDeFecha,
  resumenSeccion,
  totalOtrosServicios,
  totalPorCodigo,
  validarOtroServicio,
  type OtroServicio,
} from "@/lib/asistencia/otros-servicios";
import {
  MANUALES_CERO,
  type DineroLinea,
  type LineaPlanilla,
  type ManualesLinea,
} from "@/lib/asistencia/planilla";
import { armarComprobante } from "@/lib/asistencia/comprobante";

const RAIZ = path.resolve(__dirname, "../../..");
const leer = (p: string) => fs.readFileSync(path.join(RAIZ, p), "utf8");
const sinComentarios = (p: string) =>
  leer(p)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

const DINERO = (o: Partial<DineroLinea> = {}): DineroLinea => ({
  rataHora: 4.62, valorMinuto: 0.077, salarioQuincenal: 400, baseSeguros: null,
  extraDiurno: 0, extraNocturno: 0, excedente: 0, domingos: 0, feriados: 0,
  ausencias: 0, ausenciaPorTardanza: 0, ausenciaDeDiaCompleto: 0, vacacionesYaPagadas: 0,
  tardanzas: 0, salidaTemprana: 0, totalBruto: 400, seguroSocial: 39, seguroEducativo: 5,
  isr: 0, prestamo: 0, terceros: 0, mercancia: 0,
  totalDeducciones: 44, otrosServicios: 0, netoPagar: 356, ...o,
});
const MANUAL = (o: Partial<ManualesLinea> = {}): ManualesLinea => ({ ...MANUALES_CERO, ...o });
const linea = (over: Partial<LineaPlanilla> = {}) =>
  ({
    codigo: "7", etiqueta: "JULIO GARAY", nombre: "JULIO GARAY",
    empresa: "vistana", empresaEtiqueta: "Vistana", horas: {},
    manuales: MANUAL(), dinero: DINERO(), parte: null, ...over,
  }) as unknown as LineaPlanilla;

/** El caso de Julio, tal cual. */
const JULIO: OtroServicio[] = [
  { id: "a", codigo: "7", quincena: "2026-09-1", fecha: "2026-09-08", monto: 31, concepto: "Mensajería y flete", anotadoPor: "daniel" },
  { id: "b", codigo: "7", quincena: "2026-09-1", fecha: "2026-09-12", monto: 120, concepto: "Fiesta religiosa", anotadoPor: "daniel" },
];

// ═════════════════════════════════════════════════════════════════════════════
describe("A. 🔴 monto y concepto, los dos obligatorios", () => {
  it("con los dos, se guarda", () => {
    const v = validarOtroServicio("31", "  Mensajería  y   flete ");
    expect(v).toEqual({ ok: true, monto: 31, concepto: "Mensajería y flete" });
  });

  it("sin concepto NO se guarda: es lo único que explica de dónde salió la plata", () => {
    const v = validarOtroServicio(31, "   ");
    expect(v.ok).toBe(false);
  });

  it("sin monto, o con 0, tampoco: se SUMA al neto, y un 0 no es un servicio", () => {
    expect(validarOtroServicio(0, "algo").ok).toBe(false);
    expect(validarOtroServicio("", "algo").ok).toBe(false);
    expect(validarOtroServicio(-5, "algo").ok).toBe(false);
    expect(validarOtroServicio("no es un número", "algo").ok).toBe(false);
  });

  it("y el botón DICE qué falta, no se apaga y ya", () => {
    expect(faltaParaGuardar("", "")).toBe("Falta: el monto y el concepto");
    expect(faltaParaGuardar("", "algo")).toBe("Falta: el monto");
    expect(faltaParaGuardar("31", "")).toBe("Falta: el concepto");
    expect(faltaParaGuardar("31", "algo")).toBeNull();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("B. 🔴 NO se elige fecha ni quincena", () => {
  it("la quincena sale de la fecha, con la MISMA clave de los montos a mano", () => {
    expect(quincenaDeFecha("2026-09-08")).toBe("2026-09-1");
    expect(quincenaDeFecha("2026-09-15")).toBe("2026-09-1");
    expect(quincenaDeFecha("2026-09-16")).toBe("2026-09-2");
    expect(quincenaDeFecha("2026-08-31")).toBe("2026-08-2");
  });

  it("una fecha que no sirve no cae en ninguna quincena", () => {
    expect(quincenaDeFecha("")).toBeNull();
    expect(quincenaDeFecha("08-09-2026")).toBeNull();
  });

  it("🔴 la RUTA la pone con el día de Panamá, y lo que venga en el cuerpo se ignora", () => {
    const ruta = sinComentarios("src/app/api/asistencia/otros-servicios/route.ts");
    expect(ruta).toContain("const fecha = hoyPanama();");
    expect(ruta).toContain("const quincena = quincenaDeFecha(fecha);");
    // El cuerpo solo trae estas tres cosas: ni fecha, ni quincena.
    expect(ruta).toContain("let body: { codigo?: unknown; monto?: unknown; concepto?: unknown }");
  });

  it("⚠️ y la pantalla no dibuja ningún campo de fecha", () => {
    const sec = sinComentarios("src/app/asistencia/colaboradores/SeccionOtrosServicios.tsx");
    expect(sec).not.toContain('type="date"');
    expect(sec).toContain("entra en la quincena que está abierta");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("C. 🔴 el total entra SOLO a la casilla, y lo escrito a mano manda", () => {
  it("con la casilla vacía entra el total de la ficha", () => {
    const con = aplicarOtrosServiciosEnLinea(linea(), totalOtrosServicios(JULIO));
    expect(con.dinero!.otrosServicios).toBe(151);
    expect(con.otrosServiciosDeFicha).toBe(151);
  });

  it("🔴 con un monto escrito a mano, NO se le suma nada encima", () => {
    const con = aplicarOtrosServiciosEnLinea(
      linea({ manuales: MANUAL({ otrosServicios: 200 }), dinero: DINERO({ otrosServicios: 200, netoPagar: 556 }) }),
      151,
    );
    expect(con.dinero!.otrosServicios).toBe(200);
    expect(con.dinero!.netoPagar).toBe(556);
    expect(con.otrosServiciosDeFicha).toBeUndefined();
  });

  it("sin nada en la ficha, la línea vuelve TAL CUAL (misma referencia)", () => {
    const l = linea();
    expect(aplicarOtrosServiciosEnLinea(l, 0)).toBe(l);
  });

  it("sin `dinero` no se toca nada: servicio profesional, «Tú decides»", () => {
    const l = linea({ dinero: null });
    expect(aplicarOtrosServiciosEnLinea(l, 151)).toBe(l);
  });

  it("🔴 la RUTA lo conecta: cada línea recibe el total de SU código", () => {
    // Sin esto, todo lo de arriba estaría bien probado y no le sumaría un
    // centavo a nadie — la regla existiría y no correría.
    const ruta = sinComentarios("src/app/api/asistencia/planilla/route.ts");
    expect(ruta).toContain("aplicarOtrosServiciosEnLinea(l, otrosPorCodigo.get(l.codigo) ?? 0)");
    expect(ruta).toContain("const otrosPorCodigo = totalPorCodigo(otrosRes.renglones);");
    // Y lo que se totaliza son las líneas YA con el pago adentro.
    expect(ruta).toContain("let lineasFinal = lineasConOtros;");
  });

  it("el total por código agrupa por CÓDIGO, nunca por nombre", () => {
    const m = totalPorCodigo([...JULIO, { ...JULIO[0], id: "c", codigo: "9" }]);
    expect(m.get("7")).toBe(151);
    expect(m.get("9")).toBe(31);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("D. 🔴 se SUMA al neto y nada más: no paga seguros", () => {
  it("el bruto, los seguros y el total de deducciones quedan IGUALES", () => {
    const antes = linea();
    const con = aplicarOtrosServiciosEnLinea(antes, 151);
    expect(con.dinero!.totalBruto).toBe(antes.dinero!.totalBruto);
    expect(con.dinero!.seguroSocial).toBe(antes.dinero!.seguroSocial);
    expect(con.dinero!.seguroEducativo).toBe(antes.dinero!.seguroEducativo);
    expect(con.dinero!.totalDeducciones).toBe(antes.dinero!.totalDeducciones);
  });

  it("y el neto sube EXACTAMENTE el total", () => {
    const con = aplicarOtrosServiciosEnLinea(linea(), 151);
    expect(con.dinero!.netoPagar).toBe(356 + 151);
  });

  it("todo a centavos: tres montos que suman raro no dejan medio centavo suelto", () => {
    expect(totalOtrosServicios([{ monto: 10.005 }, { monto: 0.1 }, { monto: 0.2 }])).toBe(10.31);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("E. 🔴 con el sueldo repartido, cae en UNA sola línea", () => {
  it("🩸 en la parte que NO lleva el reloj no entra nada — o Julio cobraría sus $151 DOS veces", () => {
    const l = linea({ parte: { empresa: "fashion_wear", salarioMensual: 200, pagaSeguros: false, llevaHorasExtra: true, llevaElReloj: false } as never });
    expect(aplicarOtrosServiciosEnLinea(l, 151)).toBe(l);
  });

  it("y en la parte que SÍ lo lleva, entra — es donde van todos los montos a mano", () => {
    const l = linea({ parte: { empresa: "vistana", salarioMensual: 800, pagaSeguros: true, llevaHorasExtra: false, llevaElReloj: true } as never });
    expect(aplicarOtrosServiciosEnLinea(l, 151).dinero!.otrosServicios).toBe(151);
  });

  it("sin reparto (`parte: null`) entra, que es el caso de casi todos", () => {
    expect(aplicarOtrosServiciosEnLinea(linea(), 151).dinero!.otrosServicios).toBe(151);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("F. lo que se LEE: la ficha, el Excel y el comprobante", () => {
  it("el resumen de la sección dice el total y cuántos conceptos", () => {
    expect(resumenSeccion(JULIO)).toBe("$151.00 en 2 conceptos");
    expect(resumenSeccion([JULIO[0]])).toBe("$31.00 en 1 concepto");
    expect(resumenSeccion([])).toBe("Nada esta quincena");
  });

  it("🔴 el comprobante gana una NOTA, y el renglón no se mueve ni cambia de monto", () => {
    const l = aplicarOtrosServiciosEnLinea(linea(), 151) as LineaPlanilla;
    const c = armarComprobante(
      { linea: l, otrosServicios: JULIO },
      { esQuincena: true, anio: 2026, mes: 9, n: 1, etiqueta: "1 al 15 de septiembre de 2026" },
    );
    const claves = c.renglones.map((r) => r.clave);
    // Sigue entre TOTAL DE DESCUENTOS y SALARIO A PAGAR, como siempre.
    expect(claves.indexOf("otrosServicios")).toBe(claves.indexOf("totalDescuentos") + 1);
    expect(claves.indexOf("salarioAPagar")).toBe(claves.indexOf("otrosServicios") + 1);
    const r = c.renglones.find((x) => x.clave === "otrosServicios")!;
    expect(r.monto).toBe(151);
    expect(r.nota).toBe("Mensajería y flete $31.00 · Fiesta religiosa $120.00");
  });

  it("⚠️ sin nada esa quincena sale en cero y SIN nota, como hoy", () => {
    const c = armarComprobante(
      { linea: linea() },
      { esQuincena: true, anio: 2026, mes: 9, n: 1, etiqueta: "x" },
    );
    const r = c.renglones.find((x) => x.clave === "otrosServicios")!;
    expect(r.monto).toBe(0);
    expect(r.nota).toBeNull();
    expect(notaOtrosServicios([])).toBeNull();
  });

  it("🔴 el Excel gana su hoja, y NO nace si nadie tiene nada", () => {
    const exp = sinComentarios("src/lib/asistencia/planilla-exportar.ts");
    expect(exp).toContain('{ name: "Otros servicios", ws: hojaOtros }');
    expect(exp).toContain("if (!renglones.length) return null;");
    // Las cinco columnas del mockup.
    for (const h of ["Colaborador", "Código", "Concepto", "Se aplica a", "Monto", "Lo anotó"]) {
      expect(exp).toContain(`header: "${h}"`);
    }
  });

  it("🩸 y la línea de «Cómo se calcula» que dejó de ser cierta se partió en dos", () => {
    const exp = leer("src/lib/asistencia/planilla-exportar.ts");
    expect(exp).not.toContain('["ISR, préstamo, terceros, mercancía y otros servicios", "No salen de ningún sistema');
    expect(exp).toContain('["ISR, préstamo, terceros y mercancía", "No salen de ningún sistema');
    expect(exp).toContain("Entra solo desde la ficha del colaborador");
  });

  it("la hoja de la ficha va entre Préstamos y Justificaciones", () => {
    const pag = sinComentarios("src/app/asistencia/colaboradores/PersonaPagina.tsx");
    const i = pag.indexOf("<SeccionPrestamos");
    const j = pag.indexOf("<SeccionOtrosServicios");
    const k = pag.indexOf("<SeccionJustificaciones");
    expect(i).toBeGreaterThan(-1);
    expect(j).toBeGreaterThan(i);
    expect(k).toBeGreaterThan(j);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("G. falla ABIERTA, se respalda, y la quincena cerrada frena", () => {
  it("sin la migración corrida se DICE con el nombre del archivo, y nada se rompe", () => {
    const srv = sinComentarios("src/lib/asistencia/otros-servicios-server.ts");
    expect(srv).toContain("esTablaFaltante(e, TABLA_OTROS_SERVICIOS)");
    expect(srv).toContain("return { renglones: [], faltaTabla: true };");
    expect(MIGRACION_OTROS_SERVICIOS).toBe("20261202120000_asistencia_otros_servicios.sql");
    expect(leer(`supabase/migrations/${MIGRACION_OTROS_SERVICIOS}`)).toContain(
      "CREATE TABLE IF NOT EXISTS asistencia_otros_servicios",
    );
  });

  it("🔴 SOFT DELETE FIRMADO, nunca un DELETE", () => {
    const srv = sinComentarios("src/lib/asistencia/otros-servicios-server.ts");
    expect(srv).toContain("deleted: true, deleted_por: opts.usuario");
    expect(srv).not.toMatch(/\.delete\(\)/);
  });

  it("🔴 con la quincena ya cerrada el servidor rechaza el borrado (Daniel: «no»)", () => {
    const ruta = sinComentarios("src/app/api/asistencia/otros-servicios/route.ts");
    expect(ruta).toContain("await quincenaYaPagada(fila.quincena)");
    expect(ruta).toContain("esCerrada(c.estado)");
    // Y se frena ANTES de escribir nada.
    expect(ruta.indexOf("quincenaYaPagada(fila.quincena)"))
      .toBeLessThan(ruta.indexOf("quitarOtroServicio({ id, usuario })"));
  });

  it("🔴 la firma sale de la SESIÓN, nunca del cuerpo", () => {
    const ruta = sinComentarios("src/app/api/asistencia/otros-servicios/route.ts");
    expect(ruta).toContain("String(auth.userName ?? \"\").trim()");
    expect(ruta).not.toMatch(/body\.(anotadoPor|usuario)/);
  });

  it("lo registra la MISMA lista de roles del módulo, sin una cuarta escrita a mano", () => {
    const ruta = sinComentarios("src/app/api/asistencia/otros-servicios/route.ts");
    expect((ruta.match(/requireAsistencia\(req, asistenciaRoles\(\)\)/g) ?? []).length).toBe(3);
    expect(ruta).not.toMatch(/\["admin"|\["contabilidad"/);
  });

  it("🔴 la tabla está en el respaldo: es plata que no se puede volver a conseguir", () => {
    expect(leer("src/lib/backup/tablas.ts")).toContain('"asistencia_otros_servicios"');
    expect(leer("src/app/api/cron/backup/route.ts")).toContain('{ table: "asistencia_otros_servicios" }');
  });

  it("⚠️ y en un rango que NO es quincena no se suma nada: se guardan por quincena", () => {
    const ruta = sinComentarios("src/app/api/asistencia/planilla/route.ts");
    expect(ruta).toContain("const otrosRes = claveQ");
  });
});
