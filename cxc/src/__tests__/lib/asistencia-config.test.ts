/* ─────────────────────────────────────────────────────────────────────────────
 * Candado de la CONFIGURACIÓN de asistencia.
 *
 * Tres cosas, y las tres se pagaron caras antes en este repo:
 *
 * 1. EL RANGO DE CADA NÚMERO, probado en las DOS direcciones: lo que el negocio
 *    usa de verdad tiene que seguir pasando, y la basura tiene que rebotar.
 * 2. EL 0 Y LA BASURA. `null`, `""`, `[]` y `{}` no pueden convertirse en 0 y
 *    colarse — con `Number(body.x)` afuera del validador, los cuatro llegan
 *    como 0 y un divisor 0 no da error: da `Infinity`.
 * 3. EL FALLBACK PRE-MIGRACIÓN. Los DDL los corre Daniel a mano; la pantalla
 *    tiene que decir qué falta en vez de romperse.
 * ────────────────────────────────────────────────────────────────────────── */

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import {
  REGLAS_DEFAULT,
  EMPRESAS_ASISTENCIA,
  JORNADAS,
  etiquetaEmpresa,
  validarNombre,
  validarSalario,
  validarJornada,
  validarEmpresa,
  validarPersona,
  validarTolerancia,
  validarMinutos,
  validarRecargo,
  validarPorcentaje,
  validarDivisorRata,
  validarHora,
  validarExcedenteHoras,
  validarRecargoExcedente,
  validarReglas,
  reglasDesdeFila,
  reglasHaciaFila,
  rataPorHora,
  valorMinuto,
  divisorDe,
  SALARIO_MAX,
  DIVISOR_RATA_MIN,
  RECARGO_MIN,
  esTablaFaltante,
  avisoMigracion,
  MIGRACION_CONFIGURACION,
} from "@/lib/asistencia/config";

import { armarReporte, TOLERANCIA_MIN, type Marcacion, type HorarioPersona } from "@/lib/asistencia/reporte";

const leer = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");
const MIGRACION = `supabase/migrations/${MIGRACION_CONFIGURACION}`;

/** Un cuerpo de reglas COMPLETO y válido, tal como lo manda el formulario. */
const REGLAS_COMPLETAS: Record<string, unknown> = {
  toleranciaTardanzaMin: "10",
  extraMinimoMin: "15",
  recargoExtraDiurno: "1.25",
  recargoExtraNocturno: "1.5",
  horaCorteNocturno: "18:00",
  recargoDomingoFeriado: "1.5",
  divisor40: "173.33",
  divisor48: "208",
  seguroSocialPct: "9.75",
  seguroEducativoPct: "1.25",
  excedenteHorasDia: "3",
  recargoExcedenteNocturnaMixta: "2.625",
};

/** La basura que un `Number()` afuera del validador convertiría en 0. */
const SE_VUELVEN_CERO: unknown[] = [null, undefined, "", "   ", [], {}, false];
const NO_SON_NUMEROS: unknown[] = [NaN, Infinity, -Infinity, "abc", "8 horas", {}, []];

// ── Los valores confirmados por la contable ─────────────────────────────────

describe("los valores por defecto son los que confirmó la contable", () => {
  it("la tolerancia arranca en 10, no en los 5 que traía el código", () => {
    expect(REGLAS_DEFAULT.toleranciaTardanzaMin).toBe(10);
    // Y el motor del reporte lee ESE mismo número, no una copia suya.
    expect(TOLERANCIA_MIN).toBe(REGLAS_DEFAULT.toleranciaTardanzaMin);
  });

  it("los recargos, los divisores y los seguros", () => {
    expect(REGLAS_DEFAULT.recargoExtraDiurno).toBe(1.25);
    expect(REGLAS_DEFAULT.recargoExtraNocturno).toBe(1.5);
    expect(REGLAS_DEFAULT.horaCorteNocturno).toBe("18:00");
    expect(REGLAS_DEFAULT.recargoDomingoFeriado).toBe(1.5);
    expect(REGLAS_DEFAULT.divisor40).toBe(173.33);
    expect(REGLAS_DEFAULT.divisor48).toBe(208);
    expect(REGLAS_DEFAULT.seguroSocialPct).toBe(9.75);
    expect(REGLAS_DEFAULT.seguroEducativoPct).toBe(1.25);
    expect(REGLAS_DEFAULT.extraMinimoMin).toBe(15);
  });

  it("el excedente: 3 horas y factor 2.625 (= 1.5 × 1.75)", () => {
    expect(REGLAS_DEFAULT.excedenteHorasDia).toBe(3);
    expect(REGLAS_DEFAULT.recargoExcedenteNocturnaMixta).toBe(2.625);
    expect(1.5 * 1.75).toBeCloseTo(2.625, 10);
  });

  it("⏳ el excedente NO se usa para calcular: nadie fuera de la configuración lo lee", () => {
    // Si alguien construye el cálculo, este test se lo recuerda: la regla lleva
    // DOS condiciones (más de 3 horas extra Y jornada nocturna/mixta) y no es
    // lo que dice la columna "Exedente de 9 horas" del Excel viejo.
    for (const rel of [
      "src/lib/asistencia/reporte.ts",
      "src/lib/asistencia/exportar.ts",
    ]) {
      expect(leer(rel), `${rel} ya está usando el excedente`).not.toContain("recargoExcedenteNocturnaMixta");
    }
  });

  it("🔑 LA FRONTERA DE LA TARDE ES UNA SOLA: no hay un segundo campo de nocturna", () => {
    // Contable: "1.25 es hasta las 6 de la tarde, de las 6:01 en adelante y el
    // excedente". La misma hora decide el 1.25, el 1.50 y la nocturna del 2.625.
    // Dos campos para la misma frontera se separan solos: alguien mueve uno.
    expect(Object.keys(REGLAS_DEFAULT)).not.toContain("jornadaNocturnaDesde");
    for (const rel of [
      "src/lib/asistencia/config.ts",
      "src/app/asistencia/ConfiguracionTab.tsx",
      `supabase/migrations/${MIGRACION_CONFIGURACION}`,
    ]) {
      const src = leer(rel);
      expect(src, `${rel} declara una segunda frontera`).not.toMatch(
        /jornadaNocturnaDesde:|jornada_nocturna_desde\s+time/,
      );
    }
    // Y el porqué queda escrito donde se lee el campo.
    expect(leer("src/lib/asistencia/config.ts")).toContain("18:01");
  });

  it("⛔ la FORMA del cálculo NO es configurable, y está dicho dónde corresponde", () => {
    // Ausencia = horas × rata · quincena 1-15 y 16-30 · el 31 no se paga pero
    // sí se descuenta. Volverlas campos sería una perilla para romper la
    // planilla sin querer.
    for (const rel of [
      "src/lib/asistencia/config.ts",
      `supabase/migrations/${MIGRACION_CONFIGURACION}`,
    ]) {
      const src = leer(rel);
      expect(src, `${rel} no explica la ausencia`).toMatch(/AUSENCIA SE DESCUENTA/);
      expect(src, `${rel} no explica la quincena`).toMatch(/1 AL 15 Y DEL 16 AL 30/);
      expect(src, `${rel} no explica el día 31`).toMatch(/DÍA 31 NO SE PAGA/);
    }
    // Ninguna de las tres se coló como campo editable.
    const claves = Object.keys(REGLAS_DEFAULT).join(" ");
    expect(claves).not.toMatch(/quincena|dia31|dia_31|ausencia/i);
    // Y la pantalla se lo dice al usuario en vez de dejarlo adivinando.
    expect(leer("src/app/asistencia/ConfiguracionTab.tsx")).toContain("Esto no se cambia desde acá");
  });

  it("la migración documenta las DOS condiciones y la trampa del Excel viejo", () => {
    const sql = leer(MIGRACION);
    expect(sql).toContain("nocturna o mixta");
    expect(sql).toContain("Exedente de 9 horas");
    expect(sql).toContain("2.625");
    // El nombre de la columna lleva la condición adentro justamente para que
    // nadie la implemente como "excedente a secas".
    expect(sql).toContain("recargo_excedente_nocturna_mixta");
  });
});

// ── Empresas y jornadas ─────────────────────────────────────────────────────

describe("las tres empresas que comparten el reloj", () => {
  it("son exactamente Boston, Vistana y Fashion Wear", () => {
    expect([...EMPRESAS_ASISTENCIA]).toEqual(["confecciones_boston", "vistana", "fashion_wear"]);
  });

  it("ACS/Multifashion NO entra: usa otro reloj", () => {
    expect(validarEmpresa("american_classic").ok).toBe(false);
  });

  it("el nombre que ve la gente sale de empresa-mapping, no de una copia", () => {
    expect(etiquetaEmpresa("confecciones_boston")).toBe("Confecciones Boston");
    expect(etiquetaEmpresa("vistana")).toBe("Vistana International");
    expect(etiquetaEmpresa("fashion_wear")).toBe("Fashion Wear");
  });

  it("el CHECK de la migración dice lo MISMO que el código", () => {
    const sql = leer(MIGRACION);
    for (const e of EMPRESAS_ASISTENCIA) expect(sql, `falta ${e} en el CHECK`).toContain(`'${e}'`);
    expect(sql).toContain("jornada_semanal IN (40, 48)");
  });

  it.each(SE_VUELVEN_CERO)("la empresa vacía %p se rechaza", (v) => {
    expect(validarEmpresa(v).ok).toBe(false);
  });
});

describe("jornada semanal: solo 40 o 48", () => {
  it.each([...JORNADAS])("acepta %p", (j) => {
    const r = validarJornada(j);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.valor).toBe(j);
  });

  it("acepta el string, que es lo que manda un formulario", () => {
    const r = validarJornada("48");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.valor).toBe(48);
  });

  it.each([0, 44, 45, 39, 49, 80, -40, 40.5])("rechaza %p", (v) => {
    expect(validarJornada(v).ok).toBe(false);
  });

  it.each(SE_VUELVEN_CERO)("rechaza la basura %p (que como 0 pasaría por 'número finito')", (v) => {
    expect(validarJornada(v).ok).toBe(false);
  });
});

// ── Salario ─────────────────────────────────────────────────────────────────

describe("salario mensual", () => {
  it.each([326, 850, 1200.5, 3000, SALARIO_MAX])("acepta %p", (v) => {
    expect(validarSalario(v).ok).toBe(true);
  });

  it("acepta la coma decimal, que es como se escribe en Panamá", () => {
    const r = validarSalario("1200,50");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.valor).toBe(1200.5);
  });

  it("🔴 el 0 se RECHAZA: la rata daría 0 y la planilla saldría en cero sin avisar", () => {
    const r = validarSalario(0);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/salario/i);
  });

  it.each([-1, -0.01, -850])("🔴 rechaza el negativo %p", (v) => {
    expect(validarSalario(v).ok).toBe(false);
  });

  it("rechaza el error de teclear centavos (300000 por 3.000,00)", () => {
    expect(validarSalario(300_000).ok).toBe(false);
  });

  it.each(NO_SON_NUMEROS)("rechaza el no-número %p", (v) => {
    expect(validarSalario(v).ok).toBe(false);
  });

  it("`null` y vacío SÍ pasan y valen null: es 'todavía no lo sé', no un cero", () => {
    for (const v of [null, undefined, "", "   "]) {
      const r = validarSalario(v);
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.valor).toBeNull();
    }
  });

  it("⚠️ `[]` NO es 'no lo sé': con Number() daría 0 y acá se rechaza", () => {
    expect(validarSalario([]).ok).toBe(false);
    expect(validarSalario({}).ok).toBe(false);
    expect(validarSalario(false).ok).toBe(false);
  });

  it("el CHECK de la migración prohíbe el 0 igual que el código", () => {
    expect(leer(MIGRACION)).toContain("salario_mensual > 0");
  });
});

describe("nombre", () => {
  it("obligatorio: el reloj lo manda VACÍO en las 3.287 marcaciones", () => {
    for (const v of [null, undefined, "", "   ", 5, []]) {
      expect(validarNombre(v).ok).toBe(false);
    }
  });

  it("normaliza los espacios de más", () => {
    const r = validarNombre("  Ángela   García ");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.valor).toBe("Ángela García");
  });

  it("rechaza un nombre absurdamente largo", () => {
    expect(validarNombre("x".repeat(200)).ok).toBe(false);
  });
});

// ── La persona completa ─────────────────────────────────────────────────────

describe("validarPersona — el cuerpo del PUT es la única fuente", () => {
  const bueno = {
    codigo: "6",
    nombre: "Kevin Lubo",
    salarioMensual: "850",
    jornadaSemanal: "48",
    empresa: "confecciones_boston",
  };

  it("acepta lo que manda el formulario, todo como texto", () => {
    const r = validarPersona(bueno);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.valor).toEqual({
        codigo: "6",
        nombre: "Kevin Lubo",
        salarioMensual: 850,
        jornadaSemanal: 48,
        empresa: "confecciones_boston",
      });
    }
  });

  it("sin código no se guarda nada: sería una ficha sin dueño", () => {
    expect(validarPersona({ ...bueno, codigo: "" }).ok).toBe(false);
    expect(validarPersona({ ...bueno, codigo: null }).ok).toBe(false);
  });

  it("un salario 0 tumba el guardado entero, no se guarda 'lo demás'", () => {
    expect(validarPersona({ ...bueno, salarioMensual: 0 }).ok).toBe(false);
    expect(validarPersona({ ...bueno, salarioMensual: -5 }).ok).toBe(false);
  });

  it("se puede guardar SIN salario (empresa sí, sueldo todavía no)", () => {
    const r = validarPersona({ ...bueno, salarioMensual: "" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.valor.salarioMensual).toBeNull();
  });

  it.each([null, undefined, "", 0, []])("un cuerpo sin nada (%p) no revienta, devuelve error", (v) => {
    const r = validarPersona(v);
    expect(r.ok).toBe(false);
  });

  it("los mensajes están en español simple, sin jerga ni nombres de tabla", () => {
    for (const malo of [
      { ...bueno, salarioMensual: 0 },
      { ...bueno, jornadaSemanal: 44 },
      { ...bueno, empresa: "joystep" },
      { ...bueno, nombre: "" },
    ]) {
      const r = validarPersona(malo);
      expect(r.ok).toBe(false);
      if (r.ok) continue;
      expect(r.error).not.toMatch(/null|undefined|NaN|constraint|numeric|asistencia_personas|PGRST/i);
    }
  });
});

// ── Las reglas ──────────────────────────────────────────────────────────────

describe("tolerancia de tardanza", () => {
  it("0 es válido: 'sin gracia' es una política, no un error", () => {
    const r = validarTolerancia(0);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.valor).toBe(0);
  });
  it.each([5, 10, 15, 30, 60])("acepta %p", (v) => expect(validarTolerancia(v).ok).toBe(true));
  it.each([-1, 61, 120, 10.5])("rechaza %p", (v) => expect(validarTolerancia(v).ok).toBe(false));
  it.each(NO_SON_NUMEROS)("rechaza la basura %p", (v) => expect(validarTolerancia(v).ok).toBe(false));
  it("no acepta decimales: los minutos de gracia son enteros", () => {
    const r = validarTolerancia("10.5");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/enteros/i);
  });
});

describe("minutos (mínimo de extra y almuerzo por defecto)", () => {
  it.each([0, 15, 30, 60, 240])("acepta %p", (v) =>
    expect(validarMinutos(v, "El almuerzo", "30").ok).toBe(true));
  it.each([-1, 241, 1000])("rechaza %p", (v) =>
    expect(validarMinutos(v, "El almuerzo", "30").ok).toBe(false));
});

describe("🔴 recargos — nunca por debajo de 1.00", () => {
  it.each([1, 1.25, 1.5, 1.75, 2.625, 5])("acepta %p", (v) =>
    expect(validarRecargo(v, "El recargo", "1.25").ok).toBe(true));

  it("rechaza 0.25 — es el 1.25 al que se le comió el 1", () => {
    const r = validarRecargo(0.25, "El recargo", "1.25");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("1.25");
  });

  it("rechaza 25 — el mismo error con el porcentaje escrito entero", () => {
    expect(validarRecargo(25, "El recargo", "1.25").ok).toBe(false);
    expect(validarRecargo(125, "El recargo", "1.25").ok).toBe(false);
  });

  it("rechaza el 0 y los negativos", () => {
    expect(validarRecargo(0, "El recargo", "1.25").ok).toBe(false);
    expect(validarRecargo(-1.25, "El recargo", "1.25").ok).toBe(false);
  });

  it("el piso es exactamente 1.00 y ese sí pasa (pagar la extra como normal)", () => {
    expect(validarRecargo(RECARGO_MIN, "El recargo", "1.25").ok).toBe(true);
  });

  it.each(SE_VUELVEN_CERO)("la basura %p no se cuela como 0", (v) =>
    expect(validarRecargo(v, "El recargo", "1.25").ok).toBe(false));

  it("el CHECK de la migración repite el mismo rango", () => {
    const sql = leer(MIGRACION);
    expect(sql).toContain("recargo_extra_diurno BETWEEN 1 AND 5");
    expect(sql).toContain("recargo_extra_nocturno BETWEEN 1 AND 5");
    expect(sql).toContain("recargo_domingo_feriado BETWEEN 1 AND 5");
  });
});

describe("porcentajes de seguro", () => {
  it.each([0, 1.25, 9.75, 50])("acepta %p", (v) =>
    expect(validarPorcentaje(v, "El seguro", "9.75").ok).toBe(true));
  it("rechaza 975 — el 9.75 sin el punto", () =>
    expect(validarPorcentaje(975, "El seguro", "9.75").ok).toBe(false));
  it.each([-1, 51, 100])("rechaza %p", (v) =>
    expect(validarPorcentaje(v, "El seguro", "9.75").ok).toBe(false));
});

describe("🔴 divisor de la rata — el 0 es el que revienta el cálculo", () => {
  it.each([173.33, 208, 1, 744])("acepta %p", (v) =>
    expect(validarDivisorRata(v, "El divisor", "208").ok).toBe(true));

  it("RECHAZA el 0: no da error, da Infinity, y una rata infinita se paga", () => {
    const r = validarDivisorRata(0, "El divisor", "208");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("0");
  });

  it.each([-1, -208, 0.5, 0.99, 745, 10000])("rechaza %p", (v) =>
    expect(validarDivisorRata(v, "El divisor", "208").ok).toBe(false));

  it.each(SE_VUELVEN_CERO)("🔑 la basura %p se rechaza, NO se convierte en 0", (v) => {
    expect(validarDivisorRata(v, "El divisor", "208").ok).toBe(false);
  });

  it("🔴 la palabra 'divisor' NO se le muestra a nadie: es jerga del código", () => {
    // 🩸 La contable revisó el cuadro entero, validó todo y se trabó justo acá:
    // *"no sé a qué se refiere eso de divisores"*. Es una de las tres personas
    // que usa la pantalla (contabilidad tiene el módulo), así que la etiqueta
    // estaba mal, no ella.
    const r = validarReglas({ ...REGLAS_COMPLETAS, divisor48: "0" });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).not.toMatch(/divisor/i);
      expect(r.error).toContain("horas al mes");
      // Y dice para qué sirve, en su idioma: ella ya piensa así ("la rata de
      // hora depende de la cantidad de horas laborables a la semana").
      expect(r.error).toContain("rata por hora");
    }
    for (const campo of ["divisor40", "divisor48"] as const) {
      const e = validarReglas({ ...REGLAS_COMPLETAS, [campo]: "abc" });
      expect(e.ok).toBe(false);
      if (!e.ok) expect(e.error, campo).not.toMatch(/divisor/i);
    }
  });

  it("la pantalla dice 'Horas que se trabajan al mes' con la jornada al lado", () => {
    const src = leer("src/app/asistencia/ConfiguracionTab.tsx");
    expect(src).toContain('titulo="Horas que se trabajan al mes"');
    expect(src).toContain('ayuda="El salario mensual se divide entre estas horas para sacar la rata por hora."');
    expect(src).toContain('label="40 horas por semana"');
    expect(src).toContain('label="48 horas por semana"');
    // Ninguna etiqueta visible conserva la palabra vieja.
    expect(src).not.toMatch(/label="Divisor/);
    expect(src).not.toMatch(/titulo="Valor de la hora"/);
  });

  it("⚠️ el nombre TÉCNICO no se tocó: renombrarlo pediría otra migración a mano", () => {
    // Solo cambió lo que se ve. Las columnas y los campos siguen igual, así que
    // el SQL que Daniel ya tiene para correr no cambia.
    expect(Object.keys(REGLAS_DEFAULT)).toContain("divisor40");
    expect(Object.keys(REGLAS_DEFAULT)).toContain("divisor48");
    const sql = leer(MIGRACION);
    expect(sql).toContain("divisor_40");
    expect(sql).toContain("divisor_48");
    // Y queda escrito POR QUÉ, para que nadie lo lea como un descuido.
    expect(leer("src/lib/asistencia/config.ts")).toMatch(/otra migración a mano/);
  });

  it("el piso del código y el de la migración son el mismo", () => {
    expect(DIVISOR_RATA_MIN).toBe(1);
    const sql = leer(MIGRACION);
    expect(sql).toContain("divisor_40 BETWEEN 1 AND 744");
    expect(sql).toContain("divisor_48 BETWEEN 1 AND 744");
  });
});

describe("hora de corte", () => {
  it.each(["18:00", "00:00", "23:59", "06:30"])("acepta %p", (v) =>
    expect(validarHora(v, "La hora").ok).toBe(true));
  it.each(["24:00", "18:60", "6:00", "18", "seis", "", null, 18])("rechaza %p", (v) =>
    expect(validarHora(v, "La hora").ok).toBe(false));
});

describe("excedente diario", () => {
  it.each([0, 3, 3.5, 12])("acepta %p horas", (v) =>
    expect(validarExcedenteHoras(v).ok).toBe(true));
  it.each([-1, 13, 24])("rechaza %p horas", (v) =>
    expect(validarExcedenteHoras(v).ok).toBe(false));
  it("el factor se valida como cualquier recargo, aunque hoy no se use", () => {
    expect(validarRecargoExcedente(2.625).ok).toBe(true);
    expect(validarRecargoExcedente(0.625).ok).toBe(false);
    expect(validarRecargoExcedente("").ok).toBe(false);
  });
});

describe("validarReglas — se guardan TODAS juntas", () => {
  const cuerpo: Record<string, unknown> = {
    toleranciaTardanzaMin: "10",
    extraMinimoMin: "15",
    recargoExtraDiurno: "1.25",
    recargoExtraNocturno: "1.50",
    horaCorteNocturno: "18:00",
    recargoDomingoFeriado: "1.50",
    divisor40: "173.33",
    divisor48: "208",
    seguroSocialPct: "9.75",
    seguroEducativoPct: "1.25",
    excedenteHorasDia: "3",
    recargoExcedenteNocturnaMixta: "2.625",
  };

  it("el formulario completo, todo texto, da exactamente los valores confirmados", () => {
    const r = validarReglas(cuerpo);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.valor).toEqual(REGLAS_DEFAULT);
  });

  it.each([
    ["divisor48", "0"],
    ["divisor40", ""],
    ["recargoExtraDiurno", "0.25"],
    ["seguroSocialPct", "975"],
    ["toleranciaTardanzaMin", "-5"],
    ["horaCorteNocturno", "seis de la tarde"],
  ])("un solo campo malo (%s = %s) tumba el guardado entero", (campo, valor) => {
    const r = validarReglas({ ...cuerpo, [campo]: valor });
    expect(r.ok).toBe(false);
  });

  it("un cuerpo vacío no revienta: devuelve un error legible", () => {
    for (const v of [null, undefined, {}, [], "x"]) {
      const r = validarReglas(v);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.length).toBeGreaterThan(10);
    }
  });

  it("ida y vuelta con la base: fila → objeto → fila, sin perder nada", () => {
    const fila = reglasHaciaFila(REGLAS_DEFAULT);
    expect(reglasDesdeFila(fila)).toEqual(REGLAS_DEFAULT);
  });

  it("Postgres devuelve `time` como '18:00:00' y el código lo recorta a HH:MM", () => {
    const r = reglasDesdeFila({ ...reglasHaciaFila(REGLAS_DEFAULT), hora_corte_nocturno: "18:00:00" });
    expect(r.horaCorteNocturno).toBe("18:00");
  });

  it("una fila incompleta cae a los valores por defecto, no a NaN", () => {
    expect(reglasDesdeFila({})).toEqual(REGLAS_DEFAULT);
    expect(reglasDesdeFila(null)).toEqual(REGLAS_DEFAULT);
    const parcial = reglasDesdeFila({ tolerancia_tardanza_min: 5 });
    expect(parcial.toleranciaTardanzaMin).toBe(5);
    expect(parcial.divisor48).toBe(208);
  });
});

// ── La rata ─────────────────────────────────────────────────────────────────

describe("la rata por hora y el valor del minuto", () => {
  it("48 h/semana: 850 ÷ 208 = 4.0865 la hora", () => {
    expect(rataPorHora(850, 48, REGLAS_DEFAULT)).toBeCloseTo(4.0865, 4);
    expect(valorMinuto(850, 48, REGLAS_DEFAULT)).toBeCloseTo(0.068108, 6);
  });

  it("40 h/semana: 850 ÷ 173.33 = 4.9040 la hora", () => {
    expect(rataPorHora(850, 40, REGLAS_DEFAULT)).toBeCloseTo(4.904, 3);
  });

  it("el minuto es SIEMPRE la rata ÷ 60", () => {
    for (const j of JORNADAS) {
      const rata = rataPorHora(1200, j, REGLAS_DEFAULT);
      const min = valorMinuto(1200, j, REGLAS_DEFAULT);
      expect(rata).not.toBeNull();
      expect(min).toBeCloseTo((rata as number) / 60, 6);
    }
  });

  it("🔑 sin salario no hay rata: devuelve null, NO cero", () => {
    expect(rataPorHora(null, 48, REGLAS_DEFAULT)).toBeNull();
    expect(rataPorHora(undefined, 48, REGLAS_DEFAULT)).toBeNull();
    expect(valorMinuto(null, 48, REGLAS_DEFAULT)).toBeNull();
  });

  it("🔴 NUNCA devuelve Infinity ni NaN, ni con la base envenenada a mano", () => {
    for (const d of [0, -1, NaN, Infinity]) {
      const reglas = { ...REGLAS_DEFAULT, divisor48: d };
      expect(divisorDe(48, reglas)).toBeNull();
      expect(rataPorHora(850, 48, reglas)).toBeNull();
      expect(valorMinuto(850, 48, reglas)).toBeNull();
    }
  });

  it("una jornada desconocida tampoco produce un número inventado", () => {
    expect(divisorDe(44, REGLAS_DEFAULT)).toBeNull();
    expect(rataPorHora(850, 44, REGLAS_DEFAULT)).toBeNull();
  });

  it("un salario 0 o negativo tampoco produce rata", () => {
    expect(rataPorHora(0, 48, REGLAS_DEFAULT)).toBeNull();
    expect(rataPorHora(-850, 48, REGLAS_DEFAULT)).toBeNull();
  });
});

// ── El fallback pre-migración ───────────────────────────────────────────────

describe("🔴 la migración NO está corrida — la pantalla avisa, no se rompe", () => {
  const NO_EXISTE_PGRST = {
    code: "PGRST205",
    message: "Could not find the table 'public.asistencia_personas' in the schema cache",
  };
  const NO_EXISTE_PG = {
    code: "42P01",
    message: 'relation "public.asistencia_reglas" does not exist',
  };

  it("reconoce el error de PostgREST (que es el que se ve de verdad)", () => {
    expect(esTablaFaltante(NO_EXISTE_PGRST, "asistencia_personas")).toBe(true);
  });

  it("reconoce el error crudo de Postgres", () => {
    expect(esTablaFaltante(NO_EXISTE_PG, "asistencia_reglas")).toBe(true);
  });

  it("reconoce el mensaje aunque no venga el código", () => {
    expect(
      esTablaFaltante(
        { message: 'relation "asistencia_personas" does not exist' },
        "asistencia_personas",
      ),
    ).toBe(true);
  });

  it("⚠️ NO se traga cualquier error: permisos, red y RLS tienen que seguir fallando", () => {
    const otros = [
      { code: "42501", message: "permission denied for table asistencia_personas" },
      { code: "PGRST301", message: "JWT expired" },
      { message: "fetch failed" },
      { message: "canceling statement due to statement timeout" },
      { code: "23514", message: 'new row violates check constraint "asistencia_personas_empresa_check"' },
    ];
    for (const e of otros) {
      expect(esTablaFaltante(e, "asistencia_personas"), JSON.stringify(e)).toBe(false);
    }
    expect(esTablaFaltante(null, "asistencia_personas")).toBe(false);
    expect(esTablaFaltante(undefined, "asistencia_personas")).toBe(false);
  });

  it("un error que nombra OTRA tabla no cuenta como esta faltando", () => {
    expect(esTablaFaltante(NO_EXISTE_PGRST, "asistencia_reglas")).toBe(false);
  });

  it("el aviso dice QUÉ archivo hay que correr, en español simple", () => {
    const msg = avisoMigracion();
    expect(msg).toContain(MIGRACION_CONFIGURACION);
    expect(msg).toMatch(/Daniel/);
    expect(msg).not.toMatch(/CREATE TABLE|PGRST|42P01|schema cache/i);
  });

  it("el archivo de la migración existe con ese nombre exacto", () => {
    expect(fs.existsSync(path.join(process.cwd(), MIGRACION))).toBe(true);
  });

  it("las rutas devuelven 503 (falta un paso), no 500 (algo se rompió)", () => {
    for (const rel of [
      "src/app/api/asistencia/configuracion/route.ts",
      "src/app/api/asistencia/configuracion/reglas/route.ts",
    ]) {
      const src = leer(rel);
      expect(src, `${rel} no contempla la tabla faltante`).toContain("esTablaFaltante");
      expect(src, `${rel} no responde 503`).toContain("status: 503");
    }
  });

  it("el reporte sigue saliendo sin la migración: lee las reglas con fallback", () => {
    const src = leer("src/app/api/asistencia/reporte/route.ts");
    expect(src).toContain("leerReglas");
    // Y `leerReglas` degrada a los valores por defecto en vez de tirar.
    const io = leer("src/lib/asistencia/config-server.ts");
    expect(io).toContain("REGLAS_DEFAULT");
    expect(io).toContain("faltaMigracion: true");
  });
});

// ── El motor del reporte usa lo configurado ─────────────────────────────────

describe("🔴 la tolerancia es CONFIGURABLE de punta a punta", () => {
  const marca = (hhmm: string): Marcacion => ({
    empleado_codigo: "6",
    empleado_nombre: "KEVIN LUBO",
    ocurrio_en: new Date(`2026-07-13T${hhmm}:00-05:00`).toISOString(),
  });
  const horario: HorarioPersona = {
    empleado_codigo: "6", entrada: "08:00", salida: "17:00", almuerzo_minutos: 30,
  };
  const correr = (entrada: string, reglas?: Parameters<typeof armarReporte>[0]["reglas"]) =>
    armarReporte({
      marcaciones: [marca(entrada), marca("17:00")],
      horarios: [horario], justificaciones: [], feriados: new Map(),
      desde: "2026-07-13", hasta: "2026-07-13", reglas,
    })[0].dias[0];

  it("con los 10 confirmados, 8:09 no es tarde y 8:11 son 11 minutos", () => {
    expect(correr("08:09").tardeMin).toBe(0);
    expect(correr("08:11").tardeMin).toBe(11);
  });

  it("bajarla a 5 en la base cambia el resultado sin tocar el código", () => {
    expect(correr("08:09", { toleranciaTardanzaMin: 5 }).tardeMin).toBe(9);
  });

  it("subirla a 20 también", () => {
    expect(correr("08:11", { toleranciaTardanzaMin: 20 }).tardeMin).toBe(0);
  });

  it("con 0 de tolerancia, un minuto es un minuto", () => {
    expect(correr("08:01", { toleranciaTardanzaMin: 0 }).tardeMin).toBe(1);
  });

  it("🔑 una regla corrupta NO desarma el cálculo: cae al valor por defecto", () => {
    // Con NaN de tolerancia, `ent > entradaProg + NaN` es SIEMPRE false y
    // NADIE llegaría tarde nunca. Un fallo silencioso que se paga en planilla.
    for (const basura of [NaN, -1, undefined]) {
      expect(
        correr("08:11", { toleranciaTardanzaMin: basura as number }).tardeMin,
        `tolerancia ${basura}`,
      ).toBe(11);
    }
  });

  it("el mínimo de hora extra también es configurable", () => {
    const conExtra = (salida: string, reglas?: Parameters<typeof armarReporte>[0]["reglas"]) =>
      armarReporte({
        marcaciones: [marca("08:00"), marca(salida)],
        horarios: [horario], justificaciones: [], feriados: new Map(),
        desde: "2026-07-13", hasta: "2026-07-13", reglas,
      })[0].dias[0].extraMin;
    expect(conExtra("17:10")).toBe(0);                                  // 10 < 15
    expect(conExtra("17:10", { extraMinimoMin: 5 })).toBe(10);
    expect(conExtra("17:20")).toBe(20);
    expect(conExtra("17:20", { extraMinimoMin: 30 })).toBe(0);
  });

  // 🔴 EL ALMUERZO YA NO ES CONFIGURABLE (13-ago-2026). Era la única regla que
  // vivía en DOS lugares —la casilla de «Reglas del cálculo» y la columna por
  // persona— y Daniel la fijó en 30 para todos. Acá se prueba lo contrario de
  // antes: que mandarlo por `reglas` NO cambie nada.
  it("el almuerzo NO se puede cambiar por reglas: siempre 30", () => {
    const sinHorarioPropio = (reglas?: Parameters<typeof armarReporte>[0]["reglas"]) =>
      armarReporte({
        marcaciones: [marca("08:00"), marca("12:00"), marca("13:00"), marca("17:00")],
        horarios: [], justificaciones: [], feriados: new Map(),
        desde: "2026-07-13", hasta: "2026-07-13", reglas,
      })[0].dias[0].excesoAlmuerzoMin;
    expect(sinHorarioPropio()).toBe(30); // 60 tomados − 30
    // Aunque alguien meta el campo viejo en el cuerpo, se ignora.
    expect(
      sinHorarioPropio({ almuerzoDefaultMin: 60 } as Parameters<typeof armarReporte>[0]["reglas"]),
    ).toBe(30);
  });
});

describe("la pantalla y los archivos dicen los MISMOS números que el motor", () => {
  it("el reporte devuelve las reglas que usó", () => {
    expect(leer("src/app/api/asistencia/reporte/route.ts")).toMatch(/reglas,/);
  });

  it("ningún texto de la app repite la tolerancia a mano", () => {
    for (const rel of [
      "src/app/asistencia/ReporteTab.tsx",
      "src/app/asistencia/ComoFuncionaTab.tsx",
      "src/lib/asistencia/exportar.ts",
    ]) {
      const src = leer(rel);
      expect(src, `${rel} tiene la tolerancia escrita a mano`).not.toMatch(
        /5 (minutos|min) de tolerancia|con 5 de tolerancia|hasta las 8:05/,
      );
    }
  });

  it("el Excel y el PDF reciben las reglas del reporte", () => {
    const tab = leer("src/app/asistencia/ReporteTab.tsx");
    expect(tab).toContain("construirExcel({ personas, desde, hasta, reglas");
    expect(tab).toContain("construirPdf({ personas, desde, hasta, reglas");
  });
});

// ── Higiene del módulo ──────────────────────────────────────────────────────

describe("higiene", () => {
  it("el módulo de configuración es PURO: sin base, sin red, sin env", () => {
    const src = leer("src/lib/asistencia/config.ts");
    expect(src).not.toMatch(/supabase|fetch\(|process\.env|require\(/);
  });

  it("las rutas usan la fuente única de roles, no una lista a mano", () => {
    for (const rel of [
      "src/app/api/asistencia/configuracion/route.ts",
      "src/app/api/asistencia/configuracion/reglas/route.ts",
    ]) {
      const src = leer(rel);
      expect(src, `${rel} no usa asistenciaRoles()`).toContain("asistenciaRoles()");
      expect(src, `${rel} escribe la lista de roles a mano`).not.toMatch(
        /\[\s*"admin"\s*,\s*"secretaria"/,
      );
    }
  });

  it("las rutas validan en el SERVIDOR y no hacen Number() antes de validar", () => {
    const personas = leer("src/app/api/asistencia/configuracion/route.ts");
    expect(personas).toContain("validarPersona(body)");
    expect(personas).not.toMatch(/Number\(body\./);
    const reglas = leer("src/app/api/asistencia/configuracion/reglas/route.ts");
    expect(reglas).toContain("validarReglas(body)");
    expect(reglas).not.toMatch(/Number\(body\./);
  });

  it("la pantalla manda el texto crudo, no un Number() ya hecho", () => {
    const src = leer("src/app/asistencia/ConfiguracionTab.tsx");
    expect(src).not.toMatch(/Number\(bSalario\)|parseFloat\(/);
  });

  it("los blancos táctiles de la pantalla son de 44 px", () => {
    const src = leer("src/app/asistencia/ConfiguracionTab.tsx");
    expect(src).toContain("min-h-[44px]");
    // Nada por debajo de 44 en esta pantalla.
    expect(src).not.toMatch(/min-h-\[(3\d|4[0-3])px\]/);
  });

  it("la pestaña está enchufada en el módulo", () => {
    const src = leer("src/app/asistencia/AsistenciaClient.tsx");
    expect(src).toContain('["configuracion", "Configuración"]');
    expect(src).toContain("<ConfiguracionTab />");
  });

  it("la migración es aditiva e idempotente (no toca nada existente)", () => {
    const sql = leer(MIGRACION);
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS asistencia_personas");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS asistencia_reglas");
    expect(sql).toContain("ON CONFLICT (id) DO NOTHING");
    expect(sql).not.toMatch(/DROP TABLE|DROP COLUMN|TRUNCATE|DELETE FROM/i);
    // Salarios en la tabla: RLS encendida, como el resto del sistema.
    expect(sql).toContain("ALTER TABLE asistencia_personas ENABLE ROW LEVEL SECURITY");
    expect(sql).toContain("ALTER TABLE asistencia_reglas ENABLE ROW LEVEL SECURITY");
  });

  it("un solo renglón de reglas: dos serían dos verdades posibles", () => {
    expect(leer(MIGRACION)).toContain("CHECK (id = 1)");
  });
});
