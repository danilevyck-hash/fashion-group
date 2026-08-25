// ─────────────────────────────────────────────────────────────────────────────
// EL PERMISO DE HORAS — el candado
//
// Daniel, 25-ago-2026: la justificación *"gana rango de HORAS (de X a X),
// además del rango de días. Es para el que llega tarde con permiso
// justificado."*
//
// 🔴 LO QUE SE PRUEBA ACÁ, Y LA PRIMERA ES LA QUE PROTEGE OCHO HORAS DE SUELDO:
//
//   1. UN PERMISO DE HORAS **NO** JUSTIFICA EL DÍA ENTERO. Quien tiene permiso
//      de 8 a 10 y NO VINO sigue siendo una ausencia de día completo. Sin esto,
//      cargar «de 8 a 9» borraría el descuento de la jornada entera y nadie lo
//      vería hasta el día de pago.
//   2. SOLO SE PERDONA LO QUE SE SOLAPA CON EL ATRASO DE VERDAD. Un permiso de
//      la tarde no perdona haber llegado tarde en la mañana.
//   3. UNA JUSTIFICACIÓN SIN HORAS SE COMPORTA EXACTAMENTE COMO AYER. Es lo que
//      hace que las 5 justificaciones vivas de producción —ninguna tiene
//      horas— no se muevan un centavo.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import {
  horaASegundos,
  minutosPerdonados,
  segundosAHora,
  textoPermiso,
  ventanaDe,
  esColumnaPermisoHorasFaltante,
  COLS_PERMISO_HORAS,
} from "@/lib/asistencia/permiso-horas";
import { armarReporte, type Justificacion, type Marcacion } from "@/lib/asistencia/reporte";
import { REGLAS_DEFAULT } from "@/lib/asistencia/config";
import { armarLinea, jornadaDiariaMin, medirHoras, MANUALES_CERO, type FichaPlanilla } from "@/lib/asistencia/planilla";

// ── Ayudantes ────────────────────────────────────────────────────────────────

const CODIGO = "44";
const HORARIO = [{ empleado_codigo: CODIGO, entrada: "08:00", salida: "16:30", almuerzo_minutos: 30 }];
/** Miércoles y jueves hábiles. */
const DIA = "2026-07-01";
const DIA2 = "2026-07-02";

const marcasDe = (fecha: string, entrada: string): Marcacion[] => [
  { empleado_codigo: CODIGO, empleado_nombre: null, ocurrio_en: `${fecha}T${entrada}:00-05:00` },
  { empleado_codigo: CODIGO, empleado_nombre: null, ocurrio_en: `${fecha}T12:00:00-05:00` },
  { empleado_codigo: CODIGO, empleado_nombre: null, ocurrio_en: `${fecha}T12:30:00-05:00` },
  { empleado_codigo: CODIGO, empleado_nombre: null, ocurrio_en: `${fecha}T16:30:00-05:00` },
];

const reporte = (marcaciones: Marcacion[], justificaciones: Justificacion[]) =>
  armarReporte({
    marcaciones, horarios: HORARIO, justificaciones, feriados: new Map(),
    desde: DIA, hasta: DIA2, reglas: REGLAS_DEFAULT,
    nombres: new Map([[CODIGO, "CARLOS NOE RUIZ"]]), incluirNoHabiles: true,
  });

const FICHA: FichaPlanilla = {
  codigo: CODIGO, nombre: "CARLOS NOE RUIZ", salarioMensual: 523.47,
  jornadaSemanal: 40, empresa: "confecciones_boston",
};

const dineroDe = (marcaciones: Marcacion[], justificaciones: Justificacion[]) => {
  const [p] = reporte(marcaciones, justificaciones);
  const h = medirHoras(p, REGLAS_DEFAULT, jornadaDiariaMin(HORARIO[0]));
  return { horas: h, dinero: armarLinea(FICHA, h, MANUALES_CERO, REGLAS_DEFAULT).dinero! };
};

const permisoDe = (horaDesde: string | null, horaHasta: string | null): Justificacion => ({
  empleado_codigo: CODIGO, desde: DIA, hasta: DIA, motivo: "Escolares",
  hora_desde: horaDesde, hora_hasta: horaHasta,
});

// ─────────────────────────────────────────────────────────────────────────────
describe("la ventana: las dos horas viajan juntas", () => {
  it("con una sola hora NO hay ventana — media regla sobre un pago no se guarda", () => {
    expect(ventanaDe("08:00", null)).toBeNull();
    expect(ventanaDe(null, "10:00")).toBeNull();
    expect(ventanaDe(null, null)).toBeNull();
    expect(ventanaDe("", "")).toBeNull();
  });

  it("una ventana al revés o de duración cero NO perdona nada", () => {
    // 🩸 Perdonar "hasta el final del día" por dos horas tecleadas al revés
    // sería regalar una jornada. Ante la duda no se perdona nada.
    expect(ventanaDe("10:00", "08:00")).toBeNull();
    expect(ventanaDe("08:00", "08:00")).toBeNull();
  });

  it("una hora imposible no se lee como una hora", () => {
    for (const mala of ["25:00", "08:60", "8", "ocho", "08:00:99", " ", "2026-08-01"]) {
      expect(horaASegundos(mala)).toBeNull();
    }
    expect(horaASegundos("08:00")).toBe(8 * 3600);
    expect(horaASegundos("8:05:30")).toBe(8 * 3600 + 5 * 60 + 30);
    expect(segundosAHora(8 * 3600 + 5 * 60)).toBe("08:05");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("🔴 SOLO SE PERDONA LO QUE SE SOLAPA CON EL ATRASO DE VERDAD", () => {
  const ENTRADA = 8 * 3600;
  it("permiso de 8 a 10, llegó 10:15 → perdona 120 min, quedan 15", () => {
    const v = ventanaDe("08:00", "10:00");
    expect(minutosPerdonados(v, ENTRADA, 10 * 3600 + 15 * 60)).toBeCloseTo(120, 6);
  });

  it("🩸 un permiso de la TARDE no perdona una tardanza de la mañana", () => {
    const v = ventanaDe("14:00", "16:00");
    expect(minutosPerdonados(v, ENTRADA, 8 * 3600 + 45 * 60)).toBe(0);
  });

  it("no perdona más de lo que se llegó tarde", () => {
    // Permiso de 8 a 12 pero llegó 9:00: se perdona 1 hora, no 4.
    const v = ventanaDe("08:00", "12:00");
    expect(minutosPerdonados(v, ENTRADA, 9 * 3600)).toBeCloseTo(60, 6);
  });

  it("quien llegó a tiempo no necesita que le perdonen nada", () => {
    const v = ventanaDe("08:00", "10:00");
    expect(minutosPerdonados(v, ENTRADA, ENTRADA)).toBe(0);
    expect(minutosPerdonados(v, ENTRADA, ENTRADA - 600)).toBe(0);
  });

  it("sin permiso, cero — y nunca un negativo", () => {
    expect(minutosPerdonados(null, ENTRADA, 10 * 3600)).toBe(0);
    expect(minutosPerdonados(ventanaDe("08:00", "10:00"), NaN, 10 * 3600)).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("🔴 EN EL MOTOR, Y EN DÓLARES", () => {
  it("el permiso baja la tardanza del día y con ella el descuento", () => {
    const tarde = marcasDe(DIA, "10:15");
    const sinPermiso = dineroDe(tarde, []);
    const conPermiso = dineroDe(tarde, [permisoDe("08:00", "10:00")]);

    // Sin permiso: 135 minutos tarde. Con permiso: 15.
    expect(sinPermiso.horas.tardanzaMin).toBeCloseTo(135, 6);
    expect(conPermiso.horas.tardanzaMin).toBeCloseTo(15, 6);
    // Y eso es plata: el neto SUBE, porque se descuenta menos.
    expect(conPermiso.dinero.netoPagar).toBeGreaterThan(sinPermiso.dinero.netoPagar);
    // 🔑 Y NADA MÁS se movió: el quincenal y los extras son los mismos.
    expect(conPermiso.dinero.salarioQuincenal).toBe(sinPermiso.dinero.salarioQuincenal);
    expect(conPermiso.dinero.extraDiurno).toBe(sinPermiso.dinero.extraDiurno);
  });

  it("🔴 UN PERMISO DE HORAS NO BORRA LA AUSENCIA DE UN DÍA SIN MARCAS", () => {
    // 🩸 ÉSTE ES EL TEST QUE PROTEGE OCHO HORAS DE SUELDO. Si el permiso
    // justificara el día, cargar «de 8 a 9» le perdonaría la jornada entera a
    // quien no vino, y nadie lo vería hasta el día de pago.
    // 🩸 Se marca el SEGUNDO día: sin una sola marcación la persona no llega a
    // existir en el reporte y el test mediría `undefined`, no una ausencia.
    const otroDia = marcasDe(DIA2, "08:00");
    const sinVenir = dineroDe(otroDia, [permisoDe("08:00", "09:00")]);
    expect(sinVenir.horas.ausenciaDias).toBeGreaterThan(0);
    expect(sinVenir.dinero.ausencias).toBeGreaterThan(0);

    // Y la comparación directa: una justificación de DÍA ENTERO sí la borra.
    const diaEntero = dineroDe(otroDia, [{ ...permisoDe(null, null) }]);
    expect(diaEntero.horas.ausenciaDias).toBe(0);
    expect(diaEntero.dinero.ausencias).toBe(0);
  });

  it("🔴 SIN HORAS, TODO SE COMPORTA EXACTAMENTE COMO AYER", () => {
    // Es lo que hace que las 5 justificaciones vivas de producción —ninguna
    // tiene horas— no se muevan un centavo el día que esto sale.
    const tarde = marcasDe(DIA, "09:30");
    const sinJustificacion = dineroDe(tarde, []);
    const conDiaEntero = dineroDe(tarde, [permisoDe(null, null)]);
    // Un día CON marcas no cambia por tener una justificación de día entero:
    // eso ya era así antes de este PR y sigue igual.
    expect(conDiaEntero.dinero).toEqual(sinJustificacion.dinero);
  });

  it("una ventana mal cargada cae en «día entero», nunca en «perdona todo»", () => {
    const tarde = marcasDe(DIA, "10:15");
    const alReves = dineroDe(tarde, [permisoDe("10:00", "08:00")]);
    const diaEntero = dineroDe(tarde, [permisoDe(null, null)]);
    expect(alReves.dinero).toEqual(diaEntero.dinero);
    // Y el atraso se cobra entero: no se perdonó ni un minuto por una hora
    // tecleada al revés.
    expect(alReves.horas.tardanzaMin).toBeCloseTo(135, 6);
  });

  it("el día trae el permiso escrito y cuántos minutos perdonó", () => {
    const [p] = reporte(marcasDe(DIA, "10:15"), [permisoDe("08:00", "10:00")]);
    const d = p.dias.find((x) => x.fecha === DIA)!;
    expect(d.permiso).toBe("Escolares — permiso de 08:00 a 10:00");
    expect(d.permisoPerdonaMin).toBeCloseTo(120, 6);
    // 🔑 Y NO queda «justificado»: si lo estuviera, un día sin marcas dejaría
    // de ser ausencia. Son excluyentes a propósito.
    expect(d.justificado).toBeNull();
    expect(p.resumen.diasConPermiso).toBe(1);
    expect(p.resumen.minutosPerdonadosPorPermiso).toBeCloseTo(120, 6);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("las palabras y la migración", () => {
  it("el permiso se lee igual en la pantalla y en el papel", () => {
    expect(textoPermiso("Escolares", "08:00", "10:00")).toBe("Escolares — permiso de 08:00 a 10:00");
    // Sin ventana, solo el motivo: no se inventa un permiso que no existe.
    expect(textoPermiso("Incapacidad", null, null)).toBe("Incapacidad");
    expect(textoPermiso("Incapacidad", "10:00", "08:00")).toBe("Incapacidad");
  });

  it("la detección de «faltan las columnas» exige que el error las NOMBRE", () => {
    expect(esColumnaPermisoHorasFaltante({
      code: "PGRST204", message: `Could not find the '${COLS_PERMISO_HORAS[0]}' column`,
    })).toBe(true);
    expect(esColumnaPermisoHorasFaltante({
      code: "42703", message: "column asistencia_justificaciones.hora_hasta does not exist",
    })).toBe(true);
    // 🩸 Un problema real NO puede leerse como "falta la migración".
    expect(esColumnaPermisoHorasFaltante({ code: "42501", message: "permission denied" })).toBe(false);
    expect(esColumnaPermisoHorasFaltante({ message: "fetch failed" })).toBe(false);
    expect(esColumnaPermisoHorasFaltante({ code: "42703", message: "column otra does not exist" })).toBe(false);
  });
});
