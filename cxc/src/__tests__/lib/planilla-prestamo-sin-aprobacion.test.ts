/* ─────────────────────────────────────────────────────────────────────────────
 * LA CUOTA DEL PRÉSTAMO ENTRA SOLA A LA PLANILLA — el candado del cableado.
 *
 * Daniel, 11-sep-2026, textual: *«quita lo de aprobación a préstamos, no es
 * necesario»*.
 *
 * Medido ese día sobre la quincena 1–15 sep de las 3 empresas
 * (`scripts/_medir-prestamo-sin-aprobacion.ts`): 10 colaboradores con $495 de
 * cuota que la planilla NO descontaba porque nadie había tocado «Aprobar».
 *
 * 🔴 LO QUE SE PROTEGE ACÁ (la regla pura vive en
 * `asistencia-prestamo-planilla.test.ts`):
 *
 *   1. La ruta de la planilla mete la cuota a la línea con
 *      `aplicarPrestamoEnLinea` ANTES del ajuste y de los totales, y ya no lee
 *      `asistencia_prestamo_aprobado`.
 *   2. La ruta `POST /api/asistencia/prestamos` (la que aprobaba) no existe.
 *   3. La pantalla no tiene el bloque «Préstamos por descontar» y la casilla
 *      muestra lo automático (`valorCasilla`) sin meterlo en `manuales`.
 *   4. El cierre ya no frena por préstamo.
 *   5. 🔴 La tabla NO SE DROPEA (patrón `mayor_lineas`) y sigue en el respaldo.
 *   6. 🩸 Los DOS lectores de «ya descontado» (la casilla y el cierre) miran el
 *      ORIGEN del pago: un abono de liquidación no es un descuento del sueldo.
 * ─────────────────────────────────────────────────────────────────────────── */

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const RAIZ = path.resolve(__dirname, "../../..");
const leer = (p: string) => fs.readFileSync(path.join(RAIZ, p), "utf8");
const existe = (p: string) => fs.existsSync(path.join(RAIZ, p));
const sinComentarios = (p: string) =>
  leer(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const RUTA = "src/app/api/asistencia/planilla/route.ts";
const SERVIDOR = "src/lib/asistencia/prestamos-planilla-server.ts";
const CIERRE = "src/lib/asistencia/cierre-prestamo-server.ts";
const PANTALLA = "src/app/asistencia/PlanillaTab.tsx";
const GUARDADA = "src/lib/asistencia/planilla-guardada.ts";
const TABLA = "asistencia_prestamo_aprobado";

describe("1. la ruta de la planilla: la cuota entra sola, y no se aprueba nada", () => {
  const ruta = sinComentarios(RUTA);

  it("mete la cuota con `aplicarPrestamoEnLinea` y los totales salen de ESAS líneas", () => {
    expect(ruta).toMatch(/lineas\.map\(\(l\) => aplicarPrestamoEnLinea\(l, sugerenciaDe\.get\(l\.codigo\)\)\)/);
    // El ajuste de la quincena anterior se aplica ENCIMA de la cuota, y los
    // totales se suman de `lineasFinal`, que arranca en `lineasConPrestamo`.
    expect(ruta).toMatch(/let lineasFinal = lineasConPrestamo;/);
    expect(ruta).toMatch(/lineasConPrestamo\.map\(\(l\) => aplicarAjusteEnLinea/);
    expect(ruta).toMatch(/totales: totalizar\(lineasFinal\)/);
  });

  it("🔴 ya no lee `asistencia_prestamo_aprobado` ni importa las funciones de aprobar", () => {
    expect(ruta).not.toContain(TABLA);
    expect(ruta).not.toMatch(/leerAprobacionesPrestamo|prestamosSinAprobar|textoPrestamoSinAprobar/);
    expect(sinComentarios(SERVIDOR)).not.toContain(TABLA);
    expect(sinComentarios(SERVIDOR)).not.toMatch(/leerAprobacionesPrestamo|guardarAprobacionesPrestamo/);
  });

  it("los avisos que viajan son la última cuota y quien no cobra aquí — con nombre", () => {
    expect(ruta).toMatch(/avisosDeUltimaCuota\(prestamos\)/);
    expect(ruta).toMatch(/prestamosDeQuienNoCobra\(\{ fichas: presRes\.fichas, fuera, nombreDe/);
    expect(ruta).toMatch(/avisoPrestamo: textoAvisoPrestamo\(prestamoAvisos\)/);
  });

  it("🔴 la ruta que aprobaba (`POST /api/asistencia/prestamos`) no existe", () => {
    expect(existe("src/app/api/asistencia/prestamos/route.ts")).toBe(false);
  });
});

describe("2. la pantalla: sin bloque de aprobación, y la casilla muestra lo automático", () => {
  const pantalla = sinComentarios(PANTALLA);

  it("el bloque «Préstamos por descontar» y su «Aprobar» se fueron", () => {
    expect(pantalla).not.toMatch(/PrestamosPorDescontar|aprobarPrestamo|Aprobar \{pendientes\.length\}/);
    expect(pantalla).not.toContain("/api/asistencia/prestamos\"");
  });

  it("🔴 la casilla lee `prestamoAutomatico` de la LÍNEA y solo si no hay nada escrito", () => {
    // ⚠️ CAMBIÓ DE DIRECCIÓN el 11-sep-2026 (migración 20261115120000): la
    // casilla tiene TRES estados y los decide `estadoCasilla` (módulo puro), no
    // un `escrito > 0` a mano. Lo que se protege sigue igual: lo escrito manda,
    // y lo automático se lee de la LÍNEA.
    expect(pantalla).toMatch(/function valorCasilla\(l: LineaPlanilla, campo: keyof ManualesLinea\): number \| null \{\s*const escrito = l\.manuales\[campo\];/);
    expect(pantalla).toMatch(/if \(estado === "escrita"\) return escrito;/);
    expect(pantalla).toMatch(/const auto = l\.prestamoAutomatico\?\.\[campo\] \?\? 0;/);
    // Las dos celdas (escritorio y tarjeta) la usan.
    expect((pantalla.match(/valor=\{valorCasilla\(l, campo\)\}/g) ?? []).length).toBe(2);
  });

  it("🔑 al guardar cualquier casilla se manda `linea.manuales` (la foto de la tabla), no lo automático", () => {
    // Si la cuota viviera en `manuales`, editar el ISR la congelaría como si
    // alguien la hubiera escrito. Por eso va en `dinero` y en `prestamoAutomatico`.
    expect(pantalla).toMatch(/\.\.\.linea\.manuales,\s*\[campo\]: limpio,/);
    // ⚠️ 11-sep-2026 (migración 20261115120000): `prestamoAutomatico` ahora
    // también lleva `sinDescontar` (la cuota saltada con un 0 a propósito); se
    // arma en `auto` y sigue yendo a la LÍNEA, nunca a `manuales`.
    expect(sinComentarios("src/lib/asistencia/prestamos-planilla.ts"))
      .toMatch(/return \{ \.\.\.linea, dinero, prestamoAutomatico: auto \};/);
  });

  it("el aviso ámbar que se pinta es `avisoPrestamo` (en la lista «Antes de cerrar»), y viaja al Excel y al PDF", () => {
    // ⚠️ 11-sep-2026, más tarde: la caja pasó a una línea de «Antes de cerrar»;
    // el texto es el mismo `avisoPrestamo` de la ruta (va a la lista y al papel).
    expect((pantalla.match(/avisoPrestamo: data\.avisos\.avisoPrestamo \?\? null,/g) ?? []).length).toBe(2);
    const exportar = sinComentarios("src/lib/asistencia/planilla-exportar.ts");
    expect(exportar).toMatch(/d\.avisoPrestamo/);
    expect(exportar).not.toMatch(/avisoPrestamoSinAprobar/);
  });
});

describe("3. el cierre ya no frena por préstamo", () => {
  it("`frenosParaCerrar` recibe SOLO las líneas y el único tipo es horas-extra", () => {
    const g = sinComentarios(GUARDADA);
    expect(g).toMatch(/export function frenosParaCerrar\(lineas: readonly LineaPlanilla\[\]\): FrenoCierre\[\]/);
    expect(g).toMatch(/tipo: "horas-extra";/);
    expect(g).not.toMatch(/prestamosSinAprobar|tipo: "prestamo"/);
    const cerrar = sinComentarios("src/app/api/asistencia/planilla-guardada/route.ts");
    expect(cerrar).toMatch(/frenosParaCerrar\(lineas\)/);
  });
});

describe("4. 🔴 la tabla NO se dropea y sigue en el respaldo (patrón mayor_lineas)", () => {
  it("ninguna migración la borra", () => {
    const dir = path.join(RAIZ, "supabase/migrations");
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith(".sql")) continue;
      const sql = fs.readFileSync(path.join(dir, f), "utf8");
      expect(sql, f).not.toMatch(new RegExp(`DROP\\s+TABLE[^;]*${TABLA}`, "i"));
    }
  });

  it("sigue clasificada en el respaldo", () => {
    expect(leer("src/lib/backup/tablas.ts")).toContain(`"${TABLA}"`);
  });
});

describe("5. 🩸 «ya descontado» mira el ORIGEN — en los DOS lectores", () => {
  it("la casilla y el cierre usan `esDescuentoDeQuincena` y piden `origen_pago`", () => {
    for (const p of [SERVIDOR, CIERRE]) {
      const s = sinComentarios(p);
      expect(s, p).toMatch(/if \(esDescuentoDeQuincena\(m\)\) \{/);
      expect(s, p).toMatch(/\.select\("id, empleado_id, fecha, concepto, monto, estado, deleted, cuenta, origen_pago"/);
      // Ninguno vuelve a decidir por el concepto pelado.
      expect(s, p).not.toMatch(/CONCEPTOS_PAGO_DE_CUENTA as readonly string\[\]\)\.includes/);
    }
  });
});
