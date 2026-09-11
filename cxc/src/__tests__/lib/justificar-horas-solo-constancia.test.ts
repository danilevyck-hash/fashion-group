/* ─────────────────────────────────────────────────────────────────────────────
 * LAS HORAS SOLO VAN CON «CONSTANCIA» — el candado.
 *
 * Daniel, 11-sep-2026, textual: *«que se ponga rango de hora solamente en
 * constancia, porque no siempre es todo el día, sino unas horas»*.
 *
 * 🔴 LO QUE SE PROTEGE:
 *   1. La regla es UNA (`motivoAdmiteHoras`) y solo Constancia la pasa.
 *   2. `horasParaGuardar` vacía las horas de cualquier otro motivo: un
 *      «de/hasta» tecleado con Incapacidad no viaja.
 *   3. El formulario (`JustificarForm`, el que abren la ficha y la fila del
 *      día) dibuja «De»/«Hasta» SOLO con Constancia y manda lo que devuelve
 *      `horasParaGuardar`.
 *   4. La ruta rechaza con 400 un motivo de día completo que llegue con horas
 *      — nunca lo guarda a medias ni se las quita en silencio.
 *   5. La pestaña vieja (`JustificacionesTab`) se alinea a la misma regla.
 *   6. 🔴 EN EL MOTOR: una Constancia por horas descuenta SOLO lo que queda
 *      fuera del rango (la tardanza que no cubre el permiso) y no borra el día.
 * ─────────────────────────────────────────────────────────────────────────── */

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { MOTIVOS_JUSTIFICACION, MOTIVO_CONSTANCIA } from "@/lib/asistencia/motivos";
import { horasParaGuardar, motivoAdmiteHoras, ventanaDe } from "@/lib/asistencia/permiso-horas";
import { armarReporte, type Justificacion, type Marcacion } from "@/lib/asistencia/reporte";
import { REGLAS_DEFAULT } from "@/lib/asistencia/config";
import { armarLinea, jornadaDiariaMin, medirHoras, MANUALES_CERO, type FichaPlanilla } from "@/lib/asistencia/planilla";

const RAIZ = path.resolve(__dirname, "../../..");
const leer = (p: string) => fs.readFileSync(path.join(RAIZ, p), "utf8");
const puro = (p: string) =>
  leer(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("1. la regla es una y solo Constancia la pasa", () => {
  it("Constancia sí; los otros cuatro no; basura no", () => {
    expect(motivoAdmiteHoras(MOTIVO_CONSTANCIA)).toBe(true);
    expect(motivoAdmiteHoras(" Constancia ")).toBe(true);
    for (const m of MOTIVOS_JUSTIFICACION) {
      if (m === MOTIVO_CONSTANCIA) continue;
      expect(motivoAdmiteHoras(m), m).toBe(false);
    }
    expect(motivoAdmiteHoras("")).toBe(false);
    expect(motivoAdmiteHoras(null)).toBe(false);
    expect(motivoAdmiteHoras(undefined)).toBe(false);
  });
});

describe("2. `horasParaGuardar` vacía las horas de cualquier otro motivo", () => {
  it("con Constancia viajan tal cual (recortadas); con Incapacidad, vacías", () => {
    expect(horasParaGuardar(MOTIVO_CONSTANCIA, " 08:00", "10:00 ")).toEqual({ horaDesde: "08:00", horaHasta: "10:00" });
    expect(horasParaGuardar("Incapacidad", "08:00", "10:00")).toEqual({ horaDesde: "", horaHasta: "" });
    expect(horasParaGuardar("Escolares", "08:00", "10:00")).toEqual({ horaDesde: "", horaHasta: "" });
    expect(horasParaGuardar(MOTIVO_CONSTANCIA, null, undefined)).toEqual({ horaDesde: "", horaHasta: "" });
  });
});

describe("3. el formulario: «De» y «Hasta» solo con Constancia, y manda lo de `horasParaGuardar`", () => {
  const form = puro("src/app/asistencia/JustificarForm.tsx");

  it("los dos selectores son `type=\"time\"` y cuelgan de `motivoAdmiteHoras(motivo)`", () => {
    expect(form).toMatch(/const conHoras = motivoAdmiteHoras\(motivo\);/);
    expect(form).toMatch(/\{conHoras && \(/);
    expect((form.match(/<input type="time"/g) ?? []).length).toBe(2);
    // Ningún input de texto para la hora.
    expect(form).not.toMatch(/placeholder="[^"]*\d{1,2}:\d{2}/);
  });

  it("lo que viaja sale de `horasParaGuardar(motivo, …)` y la ventana se valida con la función del motor", () => {
    expect(form).toMatch(/const horas = horasParaGuardar\(motivo, horaDesde, horaHasta\);/);
    expect(form).toMatch(/body: JSON\.stringify\(\{ codigo, desde, hasta, motivo, nota, \.\.\.horas \}\)/);
    expect(form).toMatch(/if \(pidioHoras && !ventanaDe\(horas\.horaDesde, horas\.horaHasta\)\)/);
  });

  it("y se dice antes de guardar que un permiso de horas NO justifica el día", () => {
    expect(leer("src/app/asistencia/JustificarForm.tsx")).toContain("el día se sigue descontando");
  });
});

describe("4. la ruta rechaza horas con un motivo de día completo", () => {
  it("400 con `motivoAdmiteHoras` ANTES de validar la ventana y de insertar", () => {
    const ruta = puro("src/app/api/asistencia/justificaciones/route.ts");
    const i = ruta.indexOf("if (pidioHoras && !motivoAdmiteHoras(motivo))");
    const j = ruta.indexOf("if (pidioHoras && !ventanaDe(horaDesde, horaHasta))");
    const k = ruta.indexOf('.from("asistencia_justificaciones").insert(');
    expect(i).toBeGreaterThan(-1);
    expect(j).toBeGreaterThan(i);
    expect(k).toBeGreaterThan(j);
    expect(ruta).toContain("Las horas solo van con Constancia");
    expect(ruta.slice(i, j)).toMatch(/status: 400/);
  });
});

describe("5. la pestaña vieja se alinea", () => {
  it("dibuja las horas solo con Constancia y manda `horasParaGuardar`", () => {
    const tab = puro("src/app/asistencia/JustificacionesTab.tsx");
    expect(tab).toMatch(/\{motivoAdmiteHoras\(motivo\) && \(/);
    expect(tab).toMatch(/const horas = horasParaGuardar\(motivo, horaDesde, horaHasta\);/);
    expect(tab).toMatch(/body: JSON\.stringify\(\{ codigo, desde, hasta, motivo, nota, \.\.\.horas \}\)/);
  });

  it("las listas (período y ficha) leen la constancia con sus horas por `textoPermiso`", () => {
    expect(puro("src/app/asistencia/JustificacionesDelPeriodo.tsx")).toMatch(/textoPermiso\(j\.motivo, j\.hora_desde, j\.hora_hasta\)/);
    expect(puro("src/app/asistencia/colaboradores/SeccionJustificaciones.tsx")).toMatch(/textoPermiso\(j\.motivo, j\.hora_desde, j\.hora_hasta\)/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("6. 🔴 en el motor: una Constancia por horas descuenta SOLO lo de fuera del rango", () => {
  const CODIGO = "44";
  const HORARIO = [{ empleado_codigo: CODIGO, entrada: "08:00", salida: "16:30", almuerzo_minutos: 30 }];
  const DIA = "2026-07-01";
  const DIA2 = "2026-07-02";
  const marcasDe = (fecha: string, entrada: string): Marcacion[] => [
    { empleado_codigo: CODIGO, empleado_nombre: null, ocurrio_en: `${fecha}T${entrada}:00-05:00` },
    { empleado_codigo: CODIGO, empleado_nombre: null, ocurrio_en: `${fecha}T12:00:00-05:00` },
    { empleado_codigo: CODIGO, empleado_nombre: null, ocurrio_en: `${fecha}T12:30:00-05:00` },
    { empleado_codigo: CODIGO, empleado_nombre: null, ocurrio_en: `${fecha}T16:30:00-05:00` },
  ];
  const FICHA: FichaPlanilla = {
    codigo: CODIGO, nombre: "CARLOS NOE RUIZ", salarioMensual: 523.47,
    jornadaSemanal: 40, empresa: "confecciones_boston",
  };
  const constancia = (horaDesde: string | null, horaHasta: string | null): Justificacion => ({
    empleado_codigo: CODIGO, desde: DIA, hasta: DIA, motivo: MOTIVO_CONSTANCIA,
    hora_desde: horaDesde, hora_hasta: horaHasta,
  });
  const dineroDe = (marcaciones: Marcacion[], justificaciones: Justificacion[]) => {
    const [p] = armarReporte({
      marcaciones, horarios: HORARIO, justificaciones, feriados: new Map(),
      desde: DIA, hasta: DIA2, reglas: REGLAS_DEFAULT,
      nombres: new Map([[CODIGO, "CARLOS NOE RUIZ"]]), incluirNoHabiles: true,
    });
    const h = medirHoras(p, REGLAS_DEFAULT, jornadaDiariaMin(HORARIO[0]));
    return { p, horas: h, dinero: armarLinea(FICHA, h, MANUALES_CERO, REGLAS_DEFAULT).dinero! };
  };

  it("constancia de 8 a 10, llegó 10:15 → se perdonan 120 min y se descuentan SOLO los 15 de afuera", () => {
    const tarde = marcasDe(DIA, "10:15");
    const sin = dineroDe(tarde, []);
    const con = dineroDe(tarde, [constancia("08:00", "10:00")]);
    expect(sin.horas.tardanzaMin).toBeCloseTo(135, 6);
    expect(con.horas.tardanzaMin).toBeCloseTo(15, 6);
    // Sin permiso los 135 min son una «tardanza grave» y van a Ausencias; con el
    // permiso quedan 15 min de tardanza común. Y es plata: el neto SUBE.
    expect(con.dinero.tardanzas).toBeGreaterThan(0);
    expect(con.dinero.ausenciaPorTardanza).toBe(0);
    expect(con.dinero.netoPagar).toBeGreaterThan(sin.dinero.netoPagar);
    const d = con.p.dias.find((x) => x.fecha === DIA)!;
    expect(d.permiso).toBe("Constancia — permiso de 08:00 a 10:00");
    expect(d.permisoPerdonaMin).toBeCloseTo(120, 6);
    // Y NO queda «justificado» el día: son excluyentes a propósito.
    expect(d.justificado).toBeNull();
  });

  it("🔴 una constancia por horas NO borra la ausencia de un día sin marcas", () => {
    const otroDia = marcasDe(DIA2, "08:00");
    const sinVenir = dineroDe(otroDia, [constancia("08:00", "10:00")]);
    expect(sinVenir.horas.ausenciaDias).toBeGreaterThan(0);
    expect(sinVenir.dinero.ausencias).toBeGreaterThan(0);
    // La constancia de DÍA COMPLETO (sin horas) sí la borra: así se paga.
    const entera = dineroDe(otroDia, [constancia(null, null)]);
    expect(entera.horas.ausenciaDias).toBe(0);
    expect(entera.dinero.ausencias).toBe(0);
  });

  it("sin horas, la constancia es de día completo (`ventanaDe` = null)", () => {
    expect(ventanaDe("", "")).toBeNull();
    expect(ventanaDe(null, null)).toBeNull();
  });
});
