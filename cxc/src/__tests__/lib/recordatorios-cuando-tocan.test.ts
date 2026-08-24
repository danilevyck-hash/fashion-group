// ─────────────────────────────────────────────────────────────────────────────
// RECORDATORIOS — cuándo toca uno, y qué dice el aviso.
//
// Daniel, textual (24-ago-2026): *"en el módulo de cheques, quisiera cambiarlo a
// recordatorios, ya que quisiera poner ahí en el calendario «recordar cobrar» y
// pongo la fecha así telegram me recuerda"*. Y a las tres preguntas: cliente
// *"sí, pero no debería de ser obligatorio"*, repetición *"puede ser, no
// siempre"*, quién lo ve *"admin y secre"*.
//
// 🔴 EL CASO QUE MÁS IMPORTA, y el que se salta EN SILENCIO si nadie lo escribe:
// un recordatorio MENSUAL puesto el **31** no existe en abril, junio,
// septiembre, noviembre ni febrero. Sin la regla de fin de mes, ese recordatorio
// **no suena 5 meses del año y nadie se entera**. Hay un test por cada uno de
// esos meses.
//
// Todas las fechas son FIJAS. Calendario de referencia (verificado con `date`):
//   2026-08-24 lunes · 08-28 viernes · 08-29 sábado · 08-30 domingo · 08-31 lunes
//   2026 NO es bisiesto (febrero tiene 28); 2028 SÍ (29).
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import {
  ETIQUETA_REPETICION,
  MIGRACION_RECORDATORIOS,
  REPETICIONES,
  TABLA_RECORDATORIOS,
  avisoMigracionRecordatorios,
  construirAvisoRecordatorios,
  diasDelMes,
  esTablaRecordatoriosFaltante,
  faltaParaGuardar,
  leerCuerpo,
  ocurreEn,
  ocurrenciasEnFechas,
  ocurrenciasPorDiaDelMes,
  proximaOcurrencia,
  unirAviso,
  type Recordatorio,
} from "@/lib/recordatorios/recordatorio";
import { ventanaAviso } from "@/lib/cheques-aviso-ventana";
import { ALL_MODULES } from "@/lib/modules";
import { RECORDATORIOS_MODULO_KEY, RECORDATORIOS_ROLES } from "@/lib/recordatorios/roles";

const leer = (rel: string) => readFileSync(path.join(process.cwd(), rel), "utf8");
/** Un archivo SIN comentarios. Este repo ya pagó CUATRO veces el candado que se
 *  cumple con su propia explicación. */
const plano = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
/**
 * SQL sin comentarios NI textos de `COMMENT ON`: los dos son documentación y
 * pueden nombrar cualquier cosa. Un barrido que los lea se cumple —o se
 * rompe— con su propia explicación: este repo ya lo pagó cuatro veces.
 */
const planoSql = (src: string) =>
  src
    .split("\n")
    .filter((l) => !l.trimStart().startsWith("--"))
    .join("\n")
    .replace(/COMMENT ON[\s\S]*?;/gi, "");

function rec(over: Partial<Recordatorio> = {}): Recordatorio {
  return {
    id: over.id ?? "r1",
    fecha: over.fecha ?? "2026-08-24",
    texto: over.texto ?? "Recordar cobrar",
    cliente: over.cliente ?? "",
    clienteCodigo: over.clienteCodigo ?? null,
    repeticion: over.repeticion ?? "una_vez",
    creadoPor: over.creadoPor ?? "Daniel",
    createdAt: over.createdAt ?? "2026-08-24T14:00:00.000Z",
  };
}

// ─────────────────────────────────────────────────────────────────────────────
describe("UNA SOLA VEZ — solo su día, ni antes ni después", () => {
  const r = rec({ fecha: "2026-08-24" });

  it("toca su propia fecha", () => {
    expect(ocurreEn(r, "2026-08-24")).toBe(true);
  });

  it("no toca el día anterior ni el siguiente", () => {
    expect(ocurreEn(r, "2026-08-23")).toBe(false);
    expect(ocurreEn(r, "2026-08-25")).toBe(false);
  });

  it("no toca el mismo día del mes siguiente (eso sería 'mensual')", () => {
    expect(ocurreEn(r, "2026-09-24")).toBe(false);
  });

  it("una fecha inválida no hace tocar nada (no revienta ni inventa un día)", () => {
    expect(ocurreEn(rec({ fecha: "2026-02-31" }), "2026-02-28")).toBe(false);
    expect(ocurreEn(r, "no-es-fecha")).toBe(false);
  });
});

describe("SEMANAL — el mismo día de la semana, y NUNCA antes de su fecha", () => {
  // 2026-08-24 es LUNES.
  const r = rec({ fecha: "2026-08-24", repeticion: "semanal" });

  it("toca su propio día y todos los lunes siguientes", () => {
    for (const d of ["2026-08-24", "2026-08-31", "2026-09-07", "2027-01-04"]) {
      expect(ocurreEn(r, d), d).toBe(true);
    }
  });

  it("no toca ningún otro día de la semana", () => {
    for (const d of ["2026-08-25", "2026-08-26", "2026-08-29", "2026-08-30"]) {
      expect(ocurreEn(r, d), d).toBe(false);
    }
  });

  it("🔴 NO suena antes de la fecha en que se puso, aunque sea lunes", () => {
    // Poner un recordatorio para el lunes que viene no puede hacerlo sonar hoy.
    expect(ocurreEn(r, "2026-08-17")).toBe(false); // lunes anterior
  });
});

describe("MENSUAL — el mismo día del mes", () => {
  const r = rec({ fecha: "2026-08-15", repeticion: "mensual" });

  it("toca el 15 de cada mes, desde el suyo", () => {
    for (const d of ["2026-08-15", "2026-09-15", "2026-12-15", "2027-03-15"]) {
      expect(ocurreEn(r, d), d).toBe(true);
    }
  });

  it("no toca ningún otro día del mes", () => {
    for (const d of ["2026-09-14", "2026-09-16", "2026-09-01", "2026-09-30"]) {
      expect(ocurreEn(r, d), d).toBe(false);
    }
  });

  it("🔴 NO suena antes de la fecha en que se puso", () => {
    expect(ocurreEn(r, "2026-07-15")).toBe(false);
  });
});

describe("🔴 MENSUAL EN FIN DE MES — el 31 no puede saltearse 5 meses del año", () => {
  const r = rec({ fecha: "2026-01-31", repeticion: "mensual" });

  it("los meses que SÍ tienen 31 tocan el 31", () => {
    for (const d of ["2026-01-31", "2026-03-31", "2026-05-31", "2026-07-31", "2026-08-31"]) {
      expect(ocurreEn(r, d), d).toBe(true);
    }
  });

  it("los meses de 30 tocan el 30 (abril, junio, septiembre y noviembre)", () => {
    for (const d of ["2026-04-30", "2026-06-30", "2026-09-30", "2026-11-30"]) {
      expect(ocurreEn(r, d), d).toBe(true);
    }
    // Y NO tocan el 29: cae en el ÚLTIMO día, no en cualquier día cercano.
    for (const d of ["2026-04-29", "2026-06-29", "2026-09-29", "2026-11-29"]) {
      expect(ocurreEn(r, d), d).toBe(false);
    }
  });

  it("febrero toca el 28, y en año bisiesto el 29", () => {
    expect(ocurreEn(r, "2026-02-28")).toBe(true); // 2026 no es bisiesto
    expect(ocurreEn(r, "2026-02-27")).toBe(false);
    expect(ocurreEn(r, "2028-02-29")).toBe(true); // 2028 SÍ es bisiesto
    expect(ocurreEn(r, "2028-02-28")).toBe(false);
  });

  it("el 30 tampoco se pierde en febrero", () => {
    const r30 = rec({ fecha: "2026-01-30", repeticion: "mensual" });
    expect(ocurreEn(r30, "2026-02-28")).toBe(true);
    // …pero en abril (30 días) toca el 30, no el 29.
    expect(ocurreEn(r30, "2026-04-30")).toBe(true);
    expect(ocurreEn(r30, "2026-04-29")).toBe(false);
  });

  it("un día que SÍ cabe nunca se corre al último del mes", () => {
    // El defecto simétrico: si "cae en el último" se aplicara de más, un
    // recordatorio del 15 sonaría también el 30 de cada mes.
    const r15 = rec({ fecha: "2026-01-15", repeticion: "mensual" });
    expect(ocurreEn(r15, "2026-04-30")).toBe(false);
    expect(ocurreEn(r15, "2026-02-28")).toBe(false);
  });

  it("`diasDelMes` conoce los bisiestos (es de donde sale la regla)", () => {
    expect(diasDelMes(2026, 2)).toBe(28);
    expect(diasDelMes(2028, 2)).toBe(29);
    expect(diasDelMes(2026, 4)).toBe(30);
    expect(diasDelMes(2026, 12)).toBe(31);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("🔴 LA VENTANA ES LA DE LOS CHEQUES — un recordatorio del SÁBADO no se pierde", () => {
  it("el VIERNES la ventana cubre sábado, domingo y lunes", () => {
    const { habil, fechas } = ventanaAviso("2026-08-28"); // viernes
    expect(habil).toBe(true);
    expect(fechas).toEqual(["2026-08-28", "2026-08-29", "2026-08-30", "2026-08-31"]);
  });

  it("un recordatorio del sábado ENTRA en el aviso del viernes", () => {
    // Si se avisara solo el día exacto, éste no sonaría NUNCA: sábado y domingo
    // el cron no manda nada y el lunes ya pasó.
    const sabado = rec({ id: "s", fecha: "2026-08-29", texto: "Recordar cobrar" });
    const { fechas } = ventanaAviso("2026-08-28");
    const o = ocurrenciasEnFechas([sabado], fechas);
    expect(o).toHaveLength(1);
    expect(o[0].fecha).toBe("2026-08-29");
    // El viernes, el sábado es MAÑANA — es la misma etiqueta que ya usan los
    // cheques (`etiquetaVencimiento`), y se reusa a propósito: dos formas de
    // decir la misma fecha en el MISMO mensaje se leerían como un error.
    expect(construirAvisoRecordatorios(o, "2026-08-28")).toContain("— MAÑANA");

    // Y el del LUNES, que el viernes está a tres días, se nombra con su día.
    const lunes = rec({ id: "l", fecha: "2026-08-31", texto: "Pagar el alquiler" });
    const oLunes = ocurrenciasEnFechas([lunes], fechas);
    expect(construirAvisoRecordatorios(oLunes, "2026-08-28")).toContain("el lunes 31 ago");
  });

  it("las ocurrencias salen ORDENADAS por fecha", () => {
    const { fechas } = ventanaAviso("2026-08-28");
    const o = ocurrenciasEnFechas(
      [rec({ id: "lunes", fecha: "2026-08-31" }), rec({ id: "hoy", fecha: "2026-08-28" })],
      fechas,
    );
    expect(o.map((x) => x.rec.id)).toEqual(["hoy", "lunes"]);
  });

  it("un recordatorio fuera de la ventana no entra", () => {
    const { fechas } = ventanaAviso("2026-08-24"); // lunes → [lunes, martes]
    expect(ocurrenciasEnFechas([rec({ fecha: "2026-08-31" })], fechas)).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("el texto del aviso — lo que se lee en el celular", () => {
  it("la PRIMERA línea dice cuántos son (es lo único visible sin abrir la notificación)", () => {
    const { fechas } = ventanaAviso("2026-08-24");
    const o = ocurrenciasEnFechas(
      [rec({ id: "a", fecha: "2026-08-24", texto: "Recordar cobrar" }), rec({ id: "b", fecha: "2026-08-25", texto: "Llamar al banco" })],
      fechas,
    );
    const texto = construirAvisoRecordatorios(o, "2026-08-24");
    expect(texto.split("\n")[0]).toBe("🔔 2 recordatorios");
    expect(texto).toContain("• Recordar cobrar — HOY");
    expect(texto).toContain("• Llamar al banco — MAÑANA");
  });

  it("uno solo va en singular", () => {
    const o = ocurrenciasEnFechas([rec({ fecha: "2026-08-24" })], ["2026-08-24"]);
    expect(construirAvisoRecordatorios(o, "2026-08-24").split("\n")[0]).toBe("🔔 1 recordatorio");
  });

  it("el cliente aparece solo si lo hay, y la repetición solo si repite", () => {
    const conTodo = ocurrenciasEnFechas(
      [rec({ fecha: "2026-08-24", texto: "Cobrar", cliente: "City Mall Paso Canoa", repeticion: "mensual" })],
      ["2026-08-24"],
    );
    expect(construirAvisoRecordatorios(conTodo, "2026-08-24")).toContain(
      "• Cobrar — HOY · City Mall Paso Canoa · cada mes",
    );

    const pelado = ocurrenciasEnFechas([rec({ fecha: "2026-08-24", texto: "Cobrar" })], ["2026-08-24"]);
    expect(construirAvisoRecordatorios(pelado, "2026-08-24")).toBe("🔔 1 recordatorio\n• Cobrar — HOY");
  });

  it("🔴 sin recordatorios devuelve CADENA VACÍA — un 'hoy no hay nada' diario es ruido", () => {
    expect(construirAvisoRecordatorios([], "2026-08-24")).toBe("");
  });
});

describe("unirAviso — los cheques primero, y su texto NO se toca", () => {
  const CHEQUES = "⚠️ 1 cheque por vencer — $1,000.00\n• X (Vistana) $1,000.00 — HOY";
  const RECS = "🔔 1 recordatorio\n• Cobrar — HOY";

  it("con los dos, el bloque de cheques va PRIMERO y entero", () => {
    const t = unirAviso(CHEQUES, RECS);
    expect(t.startsWith(CHEQUES)).toBe(true);
    expect(t).toBe(`${CHEQUES}\n\n${RECS}`);
  });

  it("solo cheques → el mensaje es EXACTAMENTE el de siempre", () => {
    expect(unirAviso(CHEQUES, "")).toBe(CHEQUES);
  });

  it("solo recordatorios → sale el bloque solo, sin líneas en blanco de más", () => {
    expect(unirAviso("", RECS)).toBe(RECS);
  });

  it("ninguno de los dos → vacío, y el cron no manda nada", () => {
    expect(unirAviso("", "")).toBe("");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("proximaOcurrencia — con qué fecha se muestra en la lista", () => {
  it("uno de una sola vez que ya pasó no tiene próxima (se muestra en pasado)", () => {
    expect(proximaOcurrencia(rec({ fecha: "2026-08-01" }), "2026-08-24")).toBeNull();
  });

  it("uno de una sola vez que es HOY devuelve hoy", () => {
    expect(proximaOcurrencia(rec({ fecha: "2026-08-24" }), "2026-08-24")).toBe("2026-08-24");
  });

  it("un semanal viejo devuelve el PRÓXIMO, no el que se puso", () => {
    // Puesto un lunes de julio; hoy es martes 25-ago → el próximo es el 31.
    const r = rec({ fecha: "2026-07-06", repeticion: "semanal" });
    expect(proximaOcurrencia(r, "2026-08-25")).toBe("2026-08-31");
  });

  it("un mensual del 31 devuelve el último día del mes cuando toca", () => {
    const r = rec({ fecha: "2026-01-31", repeticion: "mensual" });
    expect(proximaOcurrencia(r, "2026-09-01")).toBe("2026-09-30");
  });

  it("uno futuro devuelve su propia fecha, no hoy", () => {
    const r = rec({ fecha: "2026-12-01", repeticion: "mensual" });
    expect(proximaOcurrencia(r, "2026-08-24")).toBe("2026-12-01");
  });
});

describe("ocurrenciasPorDiaDelMes — lo que dibuja el calendario", () => {
  it("un mensual del 31 aparece el 30 en septiembre", () => {
    const mapa = ocurrenciasPorDiaDelMes([rec({ fecha: "2026-01-31", repeticion: "mensual" })], 2026, 9);
    expect(Object.keys(mapa)).toEqual(["30"]);
  });

  it("un semanal aparece en TODOS sus días del mes", () => {
    // Lunes de agosto 2026: 3, 10, 17, 24, 31.
    const mapa = ocurrenciasPorDiaDelMes([rec({ fecha: "2026-08-03", repeticion: "semanal" })], 2026, 8);
    expect(Object.keys(mapa).map(Number).sort((a, b) => a - b)).toEqual([3, 10, 17, 24, 31]);
  });

  it("un mes anterior a su fecha queda vacío", () => {
    expect(ocurrenciasPorDiaDelMes([rec({ fecha: "2026-08-24", repeticion: "semanal" })], 2026, 7)).toEqual({});
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("🔴 QUÉ ES OBLIGATORIO — y qué NO, que es lo que decidió Daniel", () => {
  it("fecha y texto son lo único que se exige", () => {
    expect(faltaParaGuardar({ fecha: "2026-08-24", texto: "Cobrar" })).toEqual([]);
  });

  it("sin texto (o con puros espacios) no se puede guardar", () => {
    expect(faltaParaGuardar({ fecha: "2026-08-24", texto: "" })).toEqual(["qué hay que recordar"]);
    expect(faltaParaGuardar({ fecha: "2026-08-24", texto: "   " })).toEqual(["qué hay que recordar"]);
  });

  it("sin fecha, o con una que no existe, tampoco", () => {
    expect(faltaParaGuardar({ fecha: "", texto: "Cobrar" })).toEqual(["la fecha"]);
    expect(faltaParaGuardar({ fecha: "2026-02-31", texto: "Cobrar" })).toEqual(["la fecha"]);
  });

  it("faltando las dos, las dice las dos (el botón dice qué falta, no un toast por vez)", () => {
    expect(faltaParaGuardar({ fecha: "", texto: "" })).toEqual(["la fecha", "qué hay que recordar"]);
  });

  it("🔴 EL CLIENTE NO ES OBLIGATORIO — Daniel: «no debería de ser obligatorio»", () => {
    const cuerpo = leerCuerpo({ fecha: "2026-08-24", texto: "Cobrar" });
    expect(cuerpo.cliente).toBe("");
    expect(cuerpo.clienteCodigo).toBeNull();
    expect(faltaParaGuardar(cuerpo)).toEqual([]);
  });

  it("🔴 LA REPETICIÓN TAMPOCO — Daniel: «puede ser, no siempre». Default: una sola vez", () => {
    expect(leerCuerpo({ fecha: "2026-08-24", texto: "Cobrar" }).repeticion).toBe("una_vez");
    // Un valor inventado NO se guarda: caería en un recordatorio que no vuelve
    // a sonar nunca y nadie se enteraría.
    expect(leerCuerpo({ fecha: "x", texto: "y", repeticion: "cada_luna_llena" }).repeticion).toBe("una_vez");
  });

  it('"sin vincular" queda en NULL, nunca en cadena vacía', () => {
    // Un "" haría que `cliente_codigo IS NOT NULL` contara los que no están
    // atados a nadie — el mismo cuidado que ya tiene `cheques.cliente_codigo`.
    for (const v of ["", "   ", null, undefined, 7]) {
      expect(leerCuerpo({ fecha: "2026-08-24", texto: "x", cliente_codigo: v }).clienteCodigo).toBeNull();
    }
    expect(leerCuerpo({ fecha: "2026-08-24", texto: "x", cliente_codigo: " D-25 " }).clienteCodigo).toBe("D-25");
  });

  it("las tres repeticiones son las tres, y todas tienen su etiqueta en español", () => {
    expect([...REPETICIONES]).toEqual(["una_vez", "semanal", "mensual"]);
    for (const r of REPETICIONES) {
      expect(ETIQUETA_REPETICION[r], r).toBeTruthy();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('🔴 "todavía no corrió el DDL" tiene que NOMBRAR la tabla', () => {
  it("el error REAL de producción se reconoce", () => {
    // Medido el 24-ago-2026 contra la base de producción, con la DDL sin correr.
    expect(
      esTablaRecordatoriosFaltante({
        code: "PGRST205",
        message: "Could not find the table 'public.recordatorios' in the schema cache",
        hint: "Perhaps you meant the table 'public.reclamos'",
      }),
    ).toBe(true);
    expect(esTablaRecordatoriosFaltante({ code: "42P01", message: 'relation "recordatorios" does not exist' })).toBe(true);
  });

  it("🔴 un problema REAL NO se lee como migración faltante", () => {
    // Tragarse cualquier error convertiría permisos, red o RLS en "no hay
    // recordatorios" — la peor forma de fallar: la pantalla se ve normal y
    // vacía, y el aviso de Telegram deja de sonar sin que nadie lo note.
    for (const e of [
      { code: "42501", message: "permission denied for table recordatorios" },
      { code: "57014", message: "canceling statement due to statement timeout" },
      { message: "fetch failed" },
      { code: "42P01", message: 'relation "reclamos" does not exist' },
      null,
      undefined,
    ]) {
      expect(esTablaRecordatoriosFaltante(e), JSON.stringify(e)).toBe(false);
    }
  });

  it("el aviso que ve la gente nombra el archivo y NO tiene jerga de base de datos", () => {
    const aviso = avisoMigracionRecordatorios();
    expect(aviso).toContain(MIGRACION_RECORDATORIOS);
    for (const jerga of ["PGRST", "schema cache", "42P01", "RLS", "null"]) {
      expect(aviso, jerga).not.toContain(jerga);
    }
    // Y dice lo que importa: que los cheques siguen funcionando.
    expect(aviso.toLowerCase()).toContain("cheques funcionan igual");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("🔴 LA `key` DEL MÓDULO NO CAMBIÓ — solo el label", () => {
  it("sigue siendo `cheques`, con su href y sus roles intactos", () => {
    // Está en `role_permissions` y en `fg_users.modulos_override`: renombrarla
    // rompe permisos y overrides sin comprar nada. Misma decisión que
    // "Asistencia y Planilla".
    const m = ALL_MODULES.find((x) => x.key === "cheques");
    expect(m, "el módulo `cheques` no puede desaparecer del catálogo").toBeTruthy();
    expect(m!.href).toBe("/cheques");
    expect([...m!.roles].sort()).toEqual(["admin", "secretaria"]);
    expect(RECORDATORIOS_MODULO_KEY).toBe("cheques");
  });

  it("el label visible dice Recordatorios", () => {
    expect(ALL_MODULES.find((x) => x.key === "cheques")!.label).toBe("Recordatorios");
    // Y ninguna ficha se llama "Cheques" a secas: el módulo es UNO.
    expect(ALL_MODULES.filter((x) => x.label === "Cheques")).toHaveLength(0);
  });

  it("no aparece una key nueva `recordatorios` (sería un módulo sin permisos)", () => {
    expect(ALL_MODULES.some((x) => x.key === "recordatorios")).toBe(false);
  });

  it("los roles son EXACTAMENTE admin y secretaria, en un solo lugar", () => {
    expect([...RECORDATORIOS_ROLES]).toEqual(["admin", "secretaria"]);
    // Y son los MISMOS que ya usaban los cheques: si se separan, una pantalla
    // deja entrar a alguien que la otra rechaza.
    const rutaCheques = plano(leer("src/app/api/cheques/route.ts"));
    expect(rutaCheques).toContain('const CHEQUES_ROLES = ["admin", "secretaria"]');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("BARRIDO — la migración es ADITIVA y no toca los cheques", () => {
  const SQL = planoSql(leer(`supabase/migrations/${MIGRACION_RECORDATORIOS}`));

  it("crea la tabla y nada más: ni DROP, ni DELETE, ni ALTER de otra tabla", () => {
    expect(SQL).toContain(`CREATE TABLE IF NOT EXISTS ${TABLA_RECORDATORIOS}`);
    expect(SQL).not.toMatch(/\bDROP\b/i);
    expect(SQL).not.toMatch(/\bDELETE\s+FROM\b/i);
    expect(SQL).not.toMatch(/\bTRUNCATE\b/i);
    expect(SQL).not.toMatch(/\bUPDATE\s+\w/i);
  });

  it("🔴 NO TOCA `cheques` — los 19 cheques vivos no se rozan", () => {
    expect(SQL).not.toMatch(/\bcheques\b/i);
  });

  it("el único ALTER es el RLS de la tabla nueva", () => {
    const alters = SQL.match(/ALTER TABLE\s+(\w+)/gi) ?? [];
    expect(alters.map((a) => a.split(/\s+/).pop())).toEqual([TABLA_RECORDATORIOS]);
    expect(SQL).toContain("ENABLE ROW LEVEL SECURITY");
  });

  it("soft delete, y la repetición es una lista CERRADA", () => {
    expect(SQL).toMatch(/deleted\s+boolean\s+NOT NULL\s+DEFAULT false/);
    expect(SQL).toContain("CHECK (repeticion IN ('una_vez', 'semanal', 'mensual'))");
    // Y el CHECK de la base admite EXACTAMENTE lo que admite el código.
    for (const r of REPETICIONES) expect(SQL, r).toContain(`'${r}'`);
  });

  it("🔴 el texto no puede ser vacío ni espacios (NOT NULL solo no alcanza)", () => {
    expect(SQL).toContain("CHECK (btrim(texto) <> '')");
  });
});
