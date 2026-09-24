// ─────────────────────────────────────────────────────────────────────────────
// 🔴 EL PERMISO DE HORAS PERDONA LAS TRES COLUMNAS (16-sep-2026)
//
// Daniel, textual:
//   *«1. El permiso perdona lo que se solape con la ventana, sea tardanza,
//   salida temprana o exceso de almuerzo. Una sola regla, tres columnas.
//   2. La columna muestra los minutos reales y, al lado, cuánto se perdonó.
//   Nada callado. — haslo»*
//   *«permiso justificado se paga»*
//   *«y si tuviese tardanza, deberia de salir en tardanza no callado»*
//
// 🩸 EL DEFECTO, medido contra producción el 16-sep-2026. `minutosPerdonados`
// solo sabía cruzar la ventana del permiso con el atraso de ENTRADA, así que:
//
//   ANDREA PEREZ (16)     1-sep  entró 08:04:03 (puntual), última marca
//                                12:07:32, Constancia de 12:00 a 17:00
//                                → se le descontaban 292,47 min ($16,43)
//                                  y el chip decía «Permiso 0 min»
//   BRICEIDA MONTERO (8)  7-sep  entró 08:05:29, última marca 12:32:57,
//                                Constancia de 12:30 a 16:30
//                                → se le descontaban 237,05 min ($12,92)
//
// 🔑 LO QUE NO PUEDE MOVERSE: los permisos de MAÑANA (el día de lluvia del
// 17-ago, nueve personas) seguían funcionando y tienen que seguir dando el
// mismo número, al segundo.
//
// Medido contra producción antes y después:
//   · 1-15 sep (corte 10-sep): SOLO 16 y 8 se mueven. Neto 11.286,36 →
//     11.314,29 (+27,93: +16,43 de Andrea y +11,50 de Briceida, que paga
//     seguros sobre el bruto que sube).
//   · 16-30 ago: **0 diferencias de plata** en las 46 líneas.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import {
  minutosPerdonados,
  minutosPerdonadosDe,
  ventanaDe,
  rangoPermiso,
  textoPerdon,
  textoPerdonDelPeriodo,
  textoPermisoDelDia,
  etiquetaPermisoDelDia,
  totalPerdonado,
  PERDON_CERO,
} from "@/lib/asistencia/permiso-horas";
import { armarReporte, type Justificacion, type Marcacion } from "@/lib/asistencia/reporte";
import { REGLAS_DEFAULT } from "@/lib/asistencia/config";
import { armarLinea, jornadaDiariaMin, medirHoras, MANUALES_CERO, type FichaPlanilla } from "@/lib/asistencia/planilla";

// ── Ayudantes ────────────────────────────────────────────────────────────────

/** "HH:MM:SS" → segundos del día. */
const H = (h: string) => {
  const [a, b, c] = h.split(":").map(Number);
  return a * 3600 + b * 60 + (c ?? 0);
};

const CODIGO = "16";
/** Martes hábil. */
const DIA = "2026-07-07";
const DIA2 = "2026-07-08";

const horario = (entrada: string, salida: string) => [
  { empleado_codigo: CODIGO, entrada, salida, almuerzo_minutos: 30 },
];

const marcas = (fecha: string, horas: readonly string[]): Marcacion[] =>
  horas.map((h) => ({
    empleado_codigo: CODIGO, empleado_nombre: null, ocurrio_en: `${fecha}T${h}-05:00`,
  }));

const permisoDe = (
  desde: string | null, hasta: string | null, motivo = "Constancia", fecha = DIA,
): Justificacion => ({
  empleado_codigo: CODIGO, desde: fecha, hasta: fecha, motivo,
  hora_desde: desde, hora_hasta: hasta,
});

function diaDe(opts: {
  entrada?: string; salida?: string;
  horas: readonly string[];
  justificaciones?: readonly Justificacion[];
  fecha?: string;
}) {
  const hor = horario(opts.entrada ?? "08:00", opts.salida ?? "17:00");
  const [p] = armarReporte({
    marcaciones: marcas(opts.fecha ?? DIA, opts.horas),
    horarios: hor,
    justificaciones: opts.justificaciones ?? [],
    // 🔴 24-sep-2026: sin gracia del almuerzo A PROPÓSITO. Este archivo prueba
    // el PERDÓN del permiso sobre un exceso de 2 min 37 s; con la gracia de 5
    // minutos ese exceso no existiría y no habría nada que perdonar. La gracia
    // tiene su propio candado (`gracia-almuerzo.test.ts`).
    feriados: new Map(), desde: DIA, hasta: DIA2, reglas: { ...REGLAS_DEFAULT, graciaAlmuerzoMin: 0 },
    nombres: new Map([[CODIGO, "ANDREA PEREZ"]]), incluirNoHabiles: true,
  });
  return { persona: p, dia: p.dias.find((d) => d.fecha === (opts.fecha ?? DIA))!, horario: hor };
}

/** El mismo día, pero en dólares. */
function dineroDe(opts: Parameters<typeof diaDe>[0]) {
  const { persona, horario: hor } = diaDe(opts);
  const ficha: FichaPlanilla = {
    codigo: CODIGO, nombre: "ANDREA PEREZ", salarioMensual: 700,
    jornadaSemanal: 40, empresa: "vistana",
  };
  const h = medirHoras(persona, REGLAS_DEFAULT, jornadaDiariaMin(hor[0]));
  return armarLinea(ficha, h, MANUALES_CERO, REGLAS_DEFAULT).dinero!;
}

// ─────────────────────────────────────────────────────────────────────────────
describe("🩸 ANDREA PEREZ (16), 1-sep-2026 — el caso que abrió el encargo", () => {
  // Entró 08:04:03 (dentro de la tolerancia) y su última marca es 12:07:32.
  // Horario 08:00 a 17:00. Constancia de 12:00 a 17:00: cubre exactamente lo
  // que pasó.
  const HORAS = ["08:04:03", "12:07:32"];
  const PERMISO = permisoDe("12:00:00", "17:00:00");

  it("SIN permiso se le descuentan los 292,47 minutos — eso no cambió", () => {
    const { dia } = diaDe({ horas: HORAS });
    expect(dia.salidaTempranaMin).toBeCloseTo(292 + 28 / 60, 4);
    expect(dia.tardeMin).toBe(0);
  });

  it("🔴 CON el permiso no se le descuenta NI UN MINUTO de salida temprana", () => {
    const { dia } = diaDe({ horas: HORAS, justificaciones: [PERMISO] });
    expect(dia.salidaTempranaMin).toBe(0);
    expect(dia.permisoPerdonaSalidaMin).toBeCloseTo(292 + 28 / 60, 4);
    // Y no se le inventó nada en las otras dos columnas.
    expect(dia.permisoPerdonaMin).toBe(0);
    expect(dia.permisoPerdonaAlmuerzoMin).toBe(0);
  });

  it("🔴 Y ESO ES PLATA: el neto SUBE, y solo por la salida temprana", () => {
    const sin = dineroDe({ horas: HORAS });
    const con = dineroDe({ horas: HORAS, justificaciones: [PERMISO] });
    expect(sin.salidaTemprana).toBeGreaterThan(0);
    expect(con.salidaTemprana).toBe(0);
    expect(con.netoPagar).toBeGreaterThan(sin.netoPagar);
    // 🔑 Nada más se movió: el quincenal, las ausencias y los extras son los
    // mismos. Perdonar una columna no puede tocar otra.
    expect(con.salarioQuincenal).toBe(sin.salarioQuincenal);
    expect(con.ausencias).toBe(sin.ausencias);
    expect(con.extraDiurno).toBe(sin.extraDiurno);
  });

  it("🔴 NADA CALLADO: el chip dice qué cubre y cuánto perdonó de verdad", () => {
    const { dia } = diaDe({ horas: HORAS, justificaciones: [PERMISO] });
    expect(dia.permisoRango).toBe("12:00–17:00");
    const texto = etiquetaPermisoDelDia(dia.permisoRango, {
      tardeMin: dia.permisoPerdonaMin,
      salidaTempranaMin: dia.permisoPerdonaSalidaMin,
      almuerzoMin: dia.permisoPerdonaAlmuerzoMin,
    });
    expect(texto).toBe("Permiso 12:00–17:00 · perdona 292 min de salida temprana");
    // 🩸 Lo que decía antes, y que es justamente lo que Daniel no quiere.
    expect(texto).not.toContain("Permiso 0 min");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("🩸 BRICEIDA MONTERO (8), 7-sep-2026", () => {
  // Horario 08:00 a 16:30. Entró 08:05:29 y su última marca es 12:32:57, con
  // Constancia de 12:30 a 16:30.
  const HORAS = ["08:05:29", "12:32:57"];

  it("237,05 minutos de salida temprana, perdonados enteros", () => {
    const sin = diaDe({ salida: "16:30", horas: HORAS });
    expect(sin.dia.salidaTempranaMin).toBeCloseTo(237 + 3 / 60, 4);

    const con = diaDe({
      salida: "16:30", horas: HORAS,
      justificaciones: [permisoDe("12:30:00", "16:30:00")],
    });
    expect(con.dia.salidaTempranaMin).toBe(0);
    expect(con.dia.permisoPerdonaSalidaMin).toBeCloseTo(237 + 3 / 60, 4);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("🔑 EL DÍA DE LLUVIA DEL 17-AGO NO SE MUEVE", () => {
  // Andrea, ese día: entró 08:10:24 con permiso de 08:00 a 08:10. La regla del
  // MISMO MINUTO se la perdona entera, y eso vale desde el 27-ago-2026.
  const HORAS = ["08:10:24", "12:30:00", "13:00:00", "17:00:00"];

  it("la tardanza se perdona entera, al segundo, como antes", () => {
    const { dia } = diaDe({
      horas: HORAS, justificaciones: [permisoDe("08:00:00", "08:10:00", "Catástrofe")],
    });
    expect(dia.tardeMin).toBe(0);
    expect(dia.permisoPerdonaMin).toBeCloseTo(10 + 24 / 60, 6);
  });

  it("⛔ y NO le perdona de paso el almuerzo ni la salida: no se solapan", () => {
    const largo = ["08:10:24", "12:30:00", "13:10:00", "16:00:00"];
    const { dia } = diaDe({
      horas: largo, justificaciones: [permisoDe("08:00:00", "08:10:00", "Catástrofe")],
    });
    expect(dia.excesoAlmuerzoMin).toBeCloseTo(10, 6);
    expect(dia.permisoPerdonaAlmuerzoMin).toBe(0);
    expect(dia.salidaTempranaMin).toBeCloseTo(60, 6);
    expect(dia.permisoPerdonaSalidaMin).toBe(0);
  });

  it("🔑 CONTROL: `minutosPerdonados` da exactamente lo de siempre", () => {
    // Los nueve casos reales del 17 de agosto, con la firma vieja.
    const CASOS: Array<[string, string]> = [
      ["08:10:24", "08:10:00"], ["08:18:01", "08:18:00"], ["08:44:06", "08:44:00"],
      ["08:41:12", "08:41:00"], ["08:22:21", "08:22:00"], ["08:49:23", "08:49:00"],
      ["08:13:24", "08:13:00"], ["08:12:32", "08:12:00"], ["08:21:38", "08:21:00"],
    ];
    for (const [llego, hasta] of CASOS) {
      expect(minutosPerdonados(ventanaDe("08:00:00", hasta), H("08:00:00"), H(llego)))
        .toBeCloseTo((H(llego) - H("08:00:00")) / 60, 6);
    }
    // Y el principio NO se corre hacia atrás: un permiso de 08:05 a 08:10 no
    // perdona el atraso de 08:00 a 08:05.
    expect(minutosPerdonados(ventanaDe("08:05:00", "08:10:00"), H("08:00:00"), H("08:10:24")))
      .toBeCloseTo(5 + 24 / 60, 6);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("🔴 EL EXCESO DE ALMUERZO, con la misma regla", () => {
  it("un permiso que cubre el almuerzo perdona el exceso", () => {
    // Almuerzo de 12:43:37 a 13:16:14 = 32:37. Permitido 30 → exceso 2:37.
    const horas = ["08:00:00", "12:43:37", "13:16:14", "17:00:00"];
    const sin = diaDe({ horas });
    expect(sin.dia.excesoAlmuerzoMin).toBeCloseTo(2 + 37 / 60, 6);

    const con = diaDe({ horas, justificaciones: [permisoDe("12:00:00", "14:00:00")] });
    expect(con.dia.excesoAlmuerzoMin).toBe(0);
    expect(con.dia.permisoPerdonaAlmuerzoMin).toBeCloseTo(2 + 37 / 60, 6);
  });

  it("perdona SOLO lo que se solapa, ni un minuto más", () => {
    // Exceso de 13:13:37 a 13:16:14. El permiso corta a las 13:15.
    const horas = ["08:00:00", "12:43:37", "13:16:14", "17:00:00"];
    const { dia } = diaDe({ horas, justificaciones: [permisoDe("12:00:00", "13:15:00")] });
    expect(dia.permisoPerdonaAlmuerzoMin).toBeCloseTo(13 * 60 + 15 - (13 * 60 + 13 + 37 / 60), 6);
    expect(dia.excesoAlmuerzoMin).toBeCloseTo(2 + 37 / 60 - dia.permisoPerdonaAlmuerzoMin, 6);
  });

  it("⚠️ con 2 marcas NO se inventa un almuerzo que perdonar", () => {
    const { dia } = diaDe({
      horas: ["08:00:00", "17:00:00"],
      justificaciones: [permisoDe("00:00:00", "23:59:00")],
    });
    expect(dia.excesoAlmuerzoMin).toBe(0);
    expect(dia.permisoPerdonaAlmuerzoMin).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("🔴 EL BORDE DEL MISMO MINUTO, en la columna que corresponde", () => {
  it("en salida temprana se estira el PRINCIPIO del permiso", () => {
    // 🔑 El espejo del caso de la lluvia. Allá la marca CIERRA el atraso y el
    // permiso se queda corto por segundos; acá la marca ABRE la ventana y el
    // que se queda corto es el principio del permiso. Se fue 12:07:32 con un
    // permiso que arranca 12:07:50: los 18 segundos caen en el MISMO MINUTO y
    // no se le descuentan.
    const { dia } = diaDe({
      horas: ["08:00:00", "12:07:32"],
      justificaciones: [permisoDe("12:07:50", "17:00:00")],
    });
    expect(dia.permisoPerdonaSalidaMin).toBeCloseTo(292 + 28 / 60, 4);
    expect(dia.salidaTempranaMin).toBe(0);
  });

  it("⛔ y NO se regala el minuto anterior: «desde las 12:09» deja 88 segundos", () => {
    const { dia } = diaDe({
      horas: ["08:00:00", "12:07:32"],
      justificaciones: [permisoDe("12:09:00", "17:00:00")],
    });
    // 12:07:32 → 12:09:00 son 88 segundos que el permiso NO cubre.
    expect(dia.salidaTempranaMin).toBeCloseTo(88 / 60, 6);
  });

  it("🔑 el borde que NO mira a una marca no se corre", () => {
    // Tardanza: el que se estira es el FINAL, nunca el principio.
    expect(minutosPerdonadosDe(ventanaDe("08:05:00", "08:10:00"), {
      desdeSeg: H("08:00:00"), hastaSeg: H("08:10:24"), bordeDelReloj: "fin",
    })).toBeCloseTo(5 + 24 / 60, 6);
    // Salida temprana: el que se estira es el PRINCIPIO, nunca el final.
    expect(minutosPerdonadosDe(ventanaDe("12:00:00", "16:30:00"), {
      desdeSeg: H("12:00:00"), hastaSeg: H("17:00:00"), bordeDelReloj: "inicio",
    })).toBeCloseTo(4 * 60 + 30, 6);
  });

  it("🔴 SE ESTIRA UNO SOLO: con `inicio`, el FINAL se queda donde está", () => {
    // 🩸 Si el estiramiento del final no mirara `bordeDelReloj`, acá el permiso
    // llegaría hasta 16:30:45 en vez de hasta su propio 16:30:30 y regalaría 15
    // segundos que nadie autorizó. Un borde estirado por vez, y el que se
    // estira es SIEMPRE el que mira a la marca.
    expect(minutosPerdonadosDe(ventanaDe("12:00:00", "16:30:30"), {
      desdeSeg: H("12:07:32"), hastaSeg: H("16:30:45"), bordeDelReloj: "inicio",
    })).toBeCloseTo((H("16:30:30") - H("12:07:32")) / 60, 6);
  });

  it("🔴 y con `fin`, el PRINCIPIO se queda donde está", () => {
    expect(minutosPerdonadosDe(ventanaDe("08:00:20", "08:10:00"), {
      desdeSeg: H("08:00:00"), hastaSeg: H("08:09:00"), bordeDelReloj: "fin",
    })).toBeCloseTo((H("08:09:00") - H("08:00:20")) / 60, 6);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("los bordes: sin solape, de más, de duración cero y sin marcas", () => {
  it("un permiso de la MAÑANA no perdona una salida temprana de la tarde", () => {
    const { dia } = diaDe({
      horas: ["08:00:00", "12:00:00"],
      justificaciones: [permisoDe("08:00:00", "09:00:00")],
    });
    expect(dia.salidaTempranaMin).toBeCloseTo(300, 6);
    expect(dia.permisoPerdonaSalidaMin).toBe(0);
  });

  it("un permiso que cubre de más NO perdona más de lo que se incumplió", () => {
    // Permiso del día entero, pero solo se fue 60 minutos antes.
    const { dia } = diaDe({
      horas: ["08:00:00", "16:00:00"],
      justificaciones: [permisoDe("00:00:00", "23:59:00")],
    });
    expect(dia.permisoPerdonaSalidaMin).toBeCloseTo(60, 6);
    expect(dia.salidaTempranaMin).toBe(0);
  });

  it("una ventana de duración CERO o al revés no perdona nada", () => {
    for (const [d, h] of [["12:00:00", "12:00:00"], ["17:00:00", "12:00:00"]]) {
      const { dia } = diaDe({ horas: ["08:00:00", "12:07:32"], justificaciones: [permisoDe(d, h)] });
      expect(dia.permisoPerdonaSalidaMin).toBe(0);
      expect(dia.salidaTempranaMin).toBeGreaterThan(290);
      // Y cae en «día entero», que es la conducta de siempre.
      expect(dia.permiso).toBeNull();
      expect(dia.justificado).toBe("Constancia");
    }
  });

  it("🔴 UN DÍA SIN MARCAS SIGUE SIENDO AUSENCIA, y sin perdones", () => {
    // 🩸 La regla que protege ocho horas de sueldo: dos horas de permiso no
    // explican no haber venido. Se marca el OTRO día para que la persona
    // exista en el reporte.
    const { persona } = diaDe({
      fecha: DIA2, horas: ["08:00:00", "12:00:00", "12:30:00", "17:00:00"],
      justificaciones: [permisoDe("08:00:00", "17:00:00")],
    });
    const vacio = persona.dias.find((d) => d.fecha === DIA)!;
    expect(vacio.marcas).toHaveLength(0);
    expect(vacio.ausente).toBe(true);
    expect(vacio.permisoPerdonaMin).toBe(0);
    expect(vacio.permisoPerdonaSalidaMin).toBe(0);
    expect(vacio.permisoPerdonaAlmuerzoMin).toBe(0);
  });

  it("con UNA sola marca no se inventa una salida que perdonar", () => {
    const { dia } = diaDe({
      horas: ["08:00:00"],
      justificaciones: [permisoDe("00:00:00", "23:59:00")],
    });
    expect(dia.salidaTempranaMin).toBe(0);
    expect(dia.permisoPerdonaSalidaMin).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("🔴 EL RESUMEN POR PERSONA SUMA LOS TRES", () => {
  it("cada columna por su lado, y el total es la suma", () => {
    // Un día con las tres cosas: llegó 09:00 (60 tarde), almorzó 45 (15 de
    // exceso) y se fue 16:00 (60 temprano), con permiso del día entero.
    const { persona, dia } = diaDe({
      horas: ["09:00:00", "12:00:00", "12:45:00", "16:00:00"],
      justificaciones: [permisoDe("00:00:00", "23:59:00")],
    });
    expect(dia.permisoPerdonaMin).toBeCloseTo(60, 6);
    expect(dia.permisoPerdonaAlmuerzoMin).toBeCloseTo(15, 6);
    expect(dia.permisoPerdonaSalidaMin).toBeCloseTo(60, 6);
    // Las tres columnas quedan en cero: justificar significa que se paga.
    expect(dia.tardeMin).toBe(0);
    expect(dia.excesoAlmuerzoMin).toBe(0);
    expect(dia.salidaTempranaMin).toBe(0);

    const r = persona.resumen;
    expect(r.minutosPerdonadosTarde).toBeCloseTo(60, 6);
    expect(r.minutosPerdonadosAlmuerzo).toBeCloseTo(15, 6);
    expect(r.minutosPerdonadosSalidaTemprana).toBeCloseTo(60, 6);
    expect(r.minutosPerdonadosPorPermiso).toBeCloseTo(135, 6);
    // Y el número de la planilla queda en cero: no se descuenta lo perdonado.
    expect(r.tiempoNoTrabajadoMin).toBe(0);
  });

  it("🔑 CONTROL: con un permiso de TARDANZA el total es el de siempre", () => {
    const { persona } = diaDe({
      horas: ["10:15:00", "12:00:00", "12:30:00", "17:00:00"],
      justificaciones: [permisoDe("08:00:00", "10:00:00")],
    });
    // Perdona 120 de tardanza y nada más: el total sigue siendo 120, igual que
    // antes del 16-sep-2026.
    expect(persona.resumen.minutosPerdonadosPorPermiso).toBeCloseTo(120, 6);
    expect(persona.resumen.minutosPerdonadosSalidaTemprana).toBe(0);
    expect(persona.resumen.minutosPerdonadosAlmuerzo).toBe(0);
    expect(persona.resumen.minutosTarde).toBeCloseTo(15, 6);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("las palabras — el texto sale de un módulo PURO", () => {
  it("el rango se lee como un rango", () => {
    expect(rangoPermiso("12:00", "17:00")).toBe("12:00–17:00");
    expect(rangoPermiso("12:00", null)).toBeNull();
    expect(rangoPermiso("17:00", "12:00")).toBeNull();
  });

  it("dice qué perdonó, columna por columna y en el orden del día", () => {
    expect(textoPerdon({ tardeMin: 0, salidaTempranaMin: 292.47, almuerzoMin: 0 }))
      .toBe("perdona 292 min de salida temprana");
    expect(textoPerdon({ tardeMin: 12, salidaTempranaMin: 0, almuerzoMin: 3 }))
      .toBe("perdona 12 min de tardanza y 3 min de exceso de almuerzo");
    expect(textoPerdon({ tardeMin: 60, salidaTempranaMin: 60, almuerzoMin: 15 }))
      .toBe("perdona 60 min de tardanza, 15 min de exceso de almuerzo y 60 min de salida temprana");
  });

  it("un permiso que no se solapó con nada lo DICE, no se calla", () => {
    expect(textoPerdon(PERDON_CERO)).toBe("no perdona minutos de este día");
    expect(etiquetaPermisoDelDia("08:00–09:00", PERDON_CERO))
      .toBe("Permiso 08:00–09:00 · no perdona minutos de este día");
    expect(totalPerdonado(PERDON_CERO)).toBe(0);
  });

  it("el texto largo —el título y el Excel— lleva el permiso entero", () => {
    expect(textoPermisoDelDia("Constancia — permiso de 12:00 a 17:00", {
      tardeMin: 0, salidaTempranaMin: 292.47, almuerzoMin: 0,
    })).toBe("Constancia — permiso de 12:00 a 17:00 · perdona 292 min de salida temprana");
  });

  it("la línea del período, y NADA cuando no hubo nada que perdonar", () => {
    expect(textoPerdonDelPeriodo(PERDON_CERO)).toBeNull();
    expect(textoPerdonDelPeriodo({ tardeMin: 10, salidaTempranaMin: 0, almuerzoMin: 0 }))
      .toBe("Los permisos de horas perdonaron 10 min de tardanza. Esos minutos ya NO se descuentan.");
  });

  it("⚠️ nada de voseo en los textos de este módulo", () => {
    const textos = [
      textoPerdon({ tardeMin: 1, salidaTempranaMin: 1, almuerzoMin: 1 }),
      textoPerdonDelPeriodo({ tardeMin: 1, salidaTempranaMin: 0, almuerzoMin: 0 }) ?? "",
      etiquetaPermisoDelDia("08:00–09:00", PERDON_CERO),
    ].join(" ");
    expect(textos).not.toMatch(/\b(elegí|escribí|revisá|guardá|tocá|mirá|acá|tenés|podés|vos)\b/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("la pantalla y el papel dicen lo MISMO", () => {
  const puro = (ruta: string) =>
    require("node:fs").readFileSync(ruta, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

  it("🔴 el chip del día NO escribe su texto a mano", () => {
    const tsx = puro("src/app/asistencia/ReporteTab.tsx");
    expect(tsx).toMatch(/etiquetaPermisoDelDia\(/);
    expect(tsx).toMatch(/textoPermisoDelDia\(/);
    // 🩸 Lo que había antes: el texto cosido dentro del `.tsx`.
    expect(tsx).not.toMatch(/Permiso \{fmtMin\(d\.permisoPerdonaMin\)\} min/);
  });

  it("🔴 el Excel usa el MISMO módulo puro", () => {
    const ts = puro("src/lib/asistencia/exportar.ts");
    expect(ts).toMatch(/textoPermisoDelDia\(/);
    expect(ts).not.toMatch(/perdona \$\{n0\(d\.permisoPerdonaMin\)\} min/);
  });

  it("🔴 el resumen de la persona dice cuánto se perdonó", () => {
    const tsx = puro("src/app/asistencia/ReporteTab.tsx");
    expect(tsx).toMatch(/textoPerdonDelPeriodo\(/);
    // 🔑 Y se DIBUJA: la línea cuelga del dato, de nada más. Un `false &&`
    // delante la apagaría sin borrar una sola llamada.
    expect(tsx).toMatch(/\{perdonDelPeriodo\(r\) && \(/);
    expect(tsx).toMatch(/\{d\.permiso && \(/);
  });
});
