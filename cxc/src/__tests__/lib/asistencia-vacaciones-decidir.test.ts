// ─────────────────────────────────────────────────────────────────────────────
// EL CANDADO QUE FALTABA: QUIEN ESTÁ DE VACACIONES NO «LE FALTA UN DATO».
//
// 🩸 EL BUG, MEDIDO EN PRODUCCIÓN (25-ago-2026). Cuando las vacaciones se
// mudaron de `asistencia_justificaciones` a su propia tabla, el mapa de «por
// qué esta persona no marcó ni un día» estaba escrito A MANO en DOS lugares: la
// ruta `/api/asistencia/planilla` y el script de auditoría con el que se coteja
// el cuadro contra la contadora. La ruta aprendió a leer la tabla nueva; la
// copia no. Resultado, quincenas 2026-07-2 y 2026-08-1, fashion_wear:
//
//     ANTES:   decidirAMano=1  sinConfigurar=0
//     DESPUÉS: decidirAMano=0  sinConfigurar=1
//     ELOYN MENDOZA  29  SIN DINERO -> falta=[no marcó ni un día en esta quincena]
//
// O sea: pasó del cajón «Decidilo vos» (GRIS, con el motivo escrito al lado) al
// cajón «Falta un dato» (ÁMBAR, con el botón a Configuración). El color es la
// mitad del mensaje: ámbar dice *«arreglame»*, y ahí no hay nada que arreglar —
// la persona está de vacaciones y su vacación está bien cargada. Peor: el texto
// «no marcó ni un día» es el de "nadie cargó nada", el caso que SÍ manda a
// revisar.
//
// 🔴 LOS TESTS DE ENTONCES NO SE ENTERARON, y por eso este archivo tiene DOS
// mitades y la segunda es la que importa:
//
//   1. CONDUCTA — con la fila REAL de producción (ELOYN MENDOZA, código 29,
//      16-jul → 13-ago-2026): cero marcas + vacación viva NUNCA produce «no
//      marcó ni un día», cae en «decidir» y el texto NOMBRA las vacaciones.
//   2. BARRIDO — nadie vuelve a armar ese mapa a mano. Es lo único que caza al
//      archivo que TODAVÍA NO EXISTE, que es exactamente cómo se escapó.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";

import { armarReporte, type HorarioPersona } from "@/lib/asistencia/reporte";
import {
  armarPlanilla, jornadaDiariaMin, grupoDeLinea, totalizar, FALTA,
  type FichaPlanilla,
} from "@/lib/asistencia/planilla";
import { REGLAS_DEFAULT } from "@/lib/asistencia/config";
import { motivosDeQuienNoMarco } from "@/lib/asistencia/periodo";
import type { Vacacion } from "@/lib/asistencia/vacaciones";

const R = REGLAS_DEFAULT;

// ── LA FILA REAL DE PRODUCCIÓN ───────────────────────────────────────────────
const CODIGO = "29";
const NOMBRE = "ELOYN MENDOZA";
const VAC_DESDE = "2026-07-16";
const VAC_HASTA = "2026-08-13";
/** La quincena en la que se midió la regresión. */
const Q_DESDE = "2026-07-16";
const Q_HASTA = "2026-07-31";

const vacacionDeEloyn = (yaPagadas = false): Vacacion => ({
  empleado_codigo: CODIGO, desde: VAC_DESDE, hasta: VAC_HASTA, ya_pagadas: yaPagadas,
});

/** Su ficha, COMPLETA: no le falta nada que configurar. Es todo el punto. */
const ficha: FichaPlanilla = {
  codigo: CODIGO, nombre: NOMBRE,
  salarioMensual: 566.52, jornadaSemanal: 40, empresa: "fashion_wear",
};

const horarios: HorarioPersona[] = [
  { empleado_codigo: CODIGO, entrada: "08:00", salida: "17:00", almuerzo_minutos: 30 },
];

/**
 * La planilla como la arma la ruta: sin UNA sola marcación de esta persona en
 * el período —que es el caso real— y con el mapa de motivos por la fuente única.
 */
function planilla(opts: { vacaciones?: Vacacion[]; justificaciones?: Array<{ empleado_codigo: string; desde: string; hasta: string; motivo: string }> } = {}) {
  const personas = armarReporte({
    // 🔴 CERO MARCACIONES. Con marcas la persona ni siquiera llega a este
    // camino: `armarPlanilla` solo mira el mapa cuando no hay ninguna.
    marcaciones: [],
    horarios,
    justificaciones: opts.justificaciones ?? [],
    vacaciones: opts.vacaciones,
    feriados: new Map(),
    desde: Q_DESDE, hasta: Q_HASTA, reglas: R,
    nombres: new Map([[CODIGO, NOMBRE]]),
    incluirNoHabiles: true,
  });
  const horarioDe = new Map(horarios.map((h) => [h.empleado_codigo, h]));
  return armarPlanilla({
    personas,
    fichas: new Map([[CODIGO, ficha]]),
    jornadaDiariaMin: (c) => jornadaDiariaMin(horarioDe.get(c)),
    reglas: R,
    empresa: "fashion_wear",
    justificados: motivosDeQuienNoMarco({
      justificaciones: opts.justificaciones,
      vacaciones: opts.vacaciones,
    }),
  });
}

const lineaDe = (opts: Parameters<typeof planilla>[0] = {}) =>
  planilla(opts).find((l) => l.codigo === CODIGO)!;

// ═════════════════════════════════════════════════════════════════════════════
describe("🔴 ELOYN MENDOZA, la fila real: vacación viva y cero marcas", () => {
  it("⛔ NUNCA dice «no marcó ni un día» — ése es el texto de «nadie cargó nada»", () => {
    const l = lineaDe({ vacaciones: [vacacionDeEloyn()] });
    expect(l.faltaConfigurar).not.toContain(FALTA.sinMarcaciones);
    expect(l.faltaConfigurar).toEqual([]);
  });

  it("cae en «Decidilo vos» (gris), NO en «Falta un dato» (ámbar)", () => {
    // El color es la mitad del mensaje: ámbar manda a Configuración, y ahí no
    // hay nada que arreglarle.
    expect(grupoDeLinea(lineaDe({ vacaciones: [vacacionDeEloyn()] }))).toBe("decidir");
  });

  it("🔴 y el renglón NOMBRA las vacaciones, con su rango", () => {
    expect(lineaDe({ vacaciones: [vacacionDeEloyn()] }).decidirAMano)
      .toBe("Vacaciones del 16 jul 2026 al 13 ago 2026");
  });

  it("marcada «ya se le pagó», lo dice — sigue siendo «decidir», no un pendiente", () => {
    const l = lineaDe({ vacaciones: [vacacionDeEloyn(true)] });
    expect(l.decidirAMano).toBe("Vacaciones (ya pagadas) del 16 jul 2026 al 13 ago 2026");
    expect(grupoDeLinea(l)).toBe("decidir");
    expect(l.faltaConfigurar).toEqual([]);
  });

  it("los totales la cuentan en `decidirAMano`, no en `sinConfigurar`", () => {
    // 🩸 Son los DOS números que se movieron en producción. Se comparan los dos
    // a la vez: mirar solo uno deja pasar que la línea se haya ido a un tercer
    // cajón.
    const t = totalizar(planilla({ vacaciones: [vacacionDeEloyn()] }));
    expect({ decidirAMano: t.decidirAMano, sinConfigurar: t.sinConfigurar })
      .toEqual({ decidirAMano: 1, sinConfigurar: 0 });
  });

  it("🩸 SIN la vacación cargada sí es un pendiente — la vara de que el test mide algo", () => {
    // Sin este caso, un `armarPlanilla` que nunca marque pendientes pasaría en
    // verde sin haber mirado nada.
    const l = lineaDe();
    expect(l.faltaConfigurar).toContain(FALTA.sinMarcaciones);
    expect(grupoDeLinea(l)).toBe("falta");
    const t = totalizar(planilla());
    expect({ decidirAMano: t.decidirAMano, sinConfigurar: t.sinConfigurar })
      .toEqual({ decidirAMano: 0, sinConfigurar: 1 });
  });

  it("🔑 la vacación produce lo MISMO que producía como justificación", () => {
    // Es la definición de «mudarla no cambia su comportamiento»: mismo cajón,
    // misma ausencia de pendientes, mismo quincenal de referencia. Lo único que
    // cambia es el texto, que ahora dice «Vacaciones» sin la palabra "ausencia".
    const comoVacacion = lineaDe({ vacaciones: [vacacionDeEloyn()] });
    const comoJustificacion = lineaDe({
      justificaciones: [{ empleado_codigo: CODIGO, desde: VAC_DESDE, hasta: VAC_HASTA, motivo: "Vacaciones" }],
    });
    expect(grupoDeLinea(comoVacacion)).toBe(grupoDeLinea(comoJustificacion));
    expect(comoVacacion.faltaConfigurar).toEqual(comoJustificacion.faltaConfigurar);
    expect(comoVacacion.quincenalReferencia).toBe(comoJustificacion.quincenalReferencia);
    expect(comoVacacion.dinero).toBe(comoJustificacion.dinero); // los dos `null`
  });

  it("una justificación Y una vacación en el mismo período: se dicen las dos", () => {
    const l = lineaDe({
      vacaciones: [vacacionDeEloyn()],
      justificaciones: [{ empleado_codigo: CODIGO, desde: "2026-07-20", hasta: "2026-07-21", motivo: "Incapacidad" }],
    });
    expect(l.decidirAMano).toContain("Incapacidad");
    expect(l.decidirAMano).toContain("Vacaciones");
    expect(grupoDeLinea(l)).toBe("decidir");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("la fuente única del mapa de «por qué no marcó»", () => {
  it("junta justificaciones y vacaciones bajo el mismo código", () => {
    const m = motivosDeQuienNoMarco({
      justificaciones: [{ empleado_codigo: "13", desde: "2026-08-01", hasta: "2026-08-13", motivo: "Trabajo fuera de la oficina" }],
      vacaciones: [vacacionDeEloyn()],
    });
    expect(m.get("13")).toBe("Trabajo fuera de la oficina del 1 ago 2026 al 13 ago 2026");
    expect(m.get("29")).toBe("Vacaciones del 16 jul 2026 al 13 ago 2026");
  });

  it("sin nada devuelve un mapa vacío, y no explota", () => {
    expect(motivosDeQuienNoMarco({}).size).toBe(0);
    expect(motivosDeQuienNoMarco({ justificaciones: [], vacaciones: [] }).size).toBe(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 🔴 EL BARRIDO — lo único que caza el archivo que todavía no existe
//
// 🩸 Un test que nombre a mano «la ruta y el script» caza lo que ya se conoce y
// NO puede cazar lo que alguien escriba mañana — que es exactamente cómo se
// escapó este bug. Estos dos barridos no tienen lista de archivos: recorren
// `src/` y `scripts/` enteros.
// ═════════════════════════════════════════════════════════════════════════════

const RAIZ = join(__dirname, "..", "..", "..");

function archivos(dir: string, ext = [".ts", ".tsx"]): string[] {
  const out: string[] = [];
  const caminar = (d: string) => {
    for (const n of readdirSync(d)) {
      if (n === "node_modules" || n === ".next" || n === "__tests__") continue;
      const p = join(d, n);
      if (statSync(p).isDirectory()) caminar(p);
      else if (ext.some((e) => n.endsWith(e))) out.push(p);
    }
  };
  caminar(dir);
  return out;
}

/**
 * El objeto literal que CONTIENE cada aparición de `clave` (p. ej.
 * `justificaciones:`), completo — desde su `{` hasta su `}`.
 *
 * 🩸 POR QUÉ NO ALCANZA CON MIRAR ADENTRO DE `armarReporte(`: la mitad de estos
 * scripts no le pasan un literal al motor, le pasan `{ ...argsReporte }`. El
 * objeto de verdad se arma cien líneas antes. Y tampoco alcanza con un
 * `includes` sobre el archivo: medido por mutación, esa versión pasaba en verde
 * con las vacaciones llegando SOLO al mapa de motivos y NUNCA al motor.
 *
 * 🔑 Se cuentan las llaves en los dos sentidos para encontrar los bordes de
 * VERDAD; con un `indexOf("}")` el objeto se cortaría en el primer `new Map(...)`
 * anidado.
 */
function objetoQueContiene(src: string, clave: string): string[] {
  const out: string[] = [];
  let desde = 0;
  for (;;) {
    const i = src.indexOf(clave, desde);
    if (i === -1) break;
    desde = i + clave.length;
    // Atrás hasta la `{` que abre este objeto.
    let nivel = 0;
    let ini = i;
    while (ini > 0) {
      ini -= 1;
      if (src[ini] === "}") nivel += 1;
      else if (src[ini] === "{") {
        if (nivel === 0) break;
        nivel -= 1;
      }
    }
    // Adelante hasta su `}`.
    nivel = 0;
    let fin = i;
    while (fin < src.length) {
      if (src[fin] === "{") nivel += 1;
      else if (src[fin] === "}") {
        if (nivel === 0) break;
        nivel -= 1;
      }
      fin += 1;
    }
    out.push(src.slice(ini, fin + 1));
  }
  return out;
}

/** El código sin comentarios: un candado no se cumple con su explicación. */
const sinComentarios = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").filter((l) => !l.trimStart().startsWith("//")).join("\n");

describe("🔴 BARRIDO 1 · nadie arma a mano el mapa de «por qué no marcó»", () => {
  const fuentes = [
    ...archivos(join(RAIZ, "src")),
    ...archivos(join(RAIZ, "..", "cxc", "scripts")),
  ];

  it("el barrido encuentra archivos — un recorrido roto pasaría en verde sin mirar nada", () => {
    expect(fuentes.length).toBeGreaterThan(200);
    expect(fuentes.some((f) => f.endsWith("planilla/route.ts"))).toBe(true);
    expect(fuentes.some((f) => f.includes("_diag-planilla-vs-contadora"))).toBe(true);
  });

  it("⛔ `textoJustificacion(` solo se llama DENTRO de la fuente única", () => {
    // 🔴 ES EL MECANISMO EXACTO DEL BUG. Quien llama a `textoJustificacion` está
    // armando ese mapa por su cuenta, y el día que aparezca una tercera clase de
    // «por qué no marcó» se va a enterar la fuente única y él no.
    const culpables = fuentes.filter((f) => {
      if (f.endsWith(join("lib", "asistencia", "periodo.ts"))) return false;
      return /textoJustificacion\s*\(/.test(sinComentarios(readFileSync(f, "utf8")));
    });
    expect(culpables.map((f) => f.replace(RAIZ, ""))).toEqual([]);
  });

  it("⛔ ni `textoVacacion(` — misma regla, la otra mitad", () => {
    const culpables = fuentes.filter((f) => {
      if (f.endsWith(join("lib", "asistencia", "periodo.ts"))) return false;
      if (f.endsWith(join("lib", "asistencia", "vacaciones.ts"))) return false;
      return /textoVacacion\s*\(/.test(sinComentarios(readFileSync(f, "utf8")));
    });
    expect(culpables.map((f) => f.replace(RAIZ, ""))).toEqual([]);
  });
});

describe("🔴 BARRIDO 2 · quien arma la planilla contra PRODUCCIÓN lee las vacaciones", () => {
  /** Los que llaman `armarPlanilla` Y leen la base. Son los que pagan. */
  const contraProduccion = [
    ...archivos(join(RAIZ, "src")),
    ...archivos(join(RAIZ, "..", "cxc", "scripts")),
  ].filter((f) => {
    const s = sinComentarios(readFileSync(f, "utf8"));
    // 🩸 Se busca también `.from("asistencia_…")`: dos de los scripts se
    // arman su propio cliente (`const db = createClient(...)`) y NO nombran a
    // `supabaseServer`. Con el filtro angosto se escapaban del barrido —
    // medido: leían producción y armaban el mapa a mano igual.
    return /armarPlanilla\s*\(/.test(s)
      && /supabaseServer|leerPersonas\s*\(|\.from\(\s*["']asistencia_/.test(s);
  });

  it("el lector de objetos funciona — si devolviera vacío, todo pasaría en verde", () => {
    const ejemplo = 'const base = { marcaciones, justificaciones: j, feriados: new Map(x.map((y) => ({ a: y }))), vacaciones: v };';
    const objs = objetoQueContiene(ejemplo, "justificaciones:");
    expect(objs).toHaveLength(1);
    // 🩸 Llega hasta el final: con un `indexOf("}")` se habría cortado en el
    // `({ a: y })` anidado y `vacaciones:` no aparecería.
    expect(objs[0]).toContain("vacaciones: v");
    // Y detecta la falta, que es para lo que existe.
    expect(objetoQueContiene('f({ justificaciones: j, feriados: m })', "justificaciones:")[0])
      .not.toContain("vacaciones:");
  });

  it("los encuentra: la ruta y el script de auditoría, como mínimo", () => {
    const nombres = contraProduccion.map((f) => f.replace(RAIZ, ""));
    expect(nombres.some((n) => n.includes("planilla/route.ts"))).toBe(true);
    expect(nombres.some((n) => n.includes("_diag-planilla-vs-contadora"))).toBe(true);
    // Y los que se arman su propio cliente, que es como se escaparon la
    // primera vez que se escribió este barrido.
    expect(nombres.some((n) => n.includes("_verif-ausencia-calculada"))).toBe(true);
    expect(contraProduccion.length).toBeGreaterThanOrEqual(4);
  });

  it("⛔ TODOS leen `leerVacaciones` — sin excepciones y sin lista de permitidos", () => {
    // 🩸 Una lista de excepciones es una lista que se queda vieja. Acá no hace
    // falta: son tres archivos y los tres leen la tabla. El día que alguien
    // escriba el cuarto, este test se lo dice antes de que la contadora vea un
    // «no marcó ni un día» sobre alguien que está de vacaciones.
    const sinVacaciones = contraProduccion.filter(
      (f) => !/leerVacaciones\s*\(/.test(sinComentarios(readFileSync(f, "utf8"))),
    );
    expect(sinVacaciones.map((f) => f.replace(RAIZ, ""))).toEqual([]);
  });

  it("⛔ DONDE VAN LAS JUSTIFICACIONES AL MOTOR, VAN LAS VACACIONES", () => {
    // 🔑 La regla en una frase, y sin depender de la forma: todo objeto que le
    // entrega `justificaciones:` al motor tiene que entregarle `vacaciones:`.
    // Leerlas y no pasarlas es el mismo bug con un paso más — los días de
    // vacaciones volverían a contarse como ausencia.
    const huerfanos: string[] = [];
    for (const f of contraProduccion) {
      const objs = objetoQueContiene(sinComentarios(readFileSync(f, "utf8")), "justificaciones:");
      // Un archivo que arma la planilla contra producción y NUNCA le pasa
      // justificaciones al motor es sospechoso de otra cosa, no de esto.
      expect(objs.length).toBeGreaterThan(0);
      for (const o of objs) if (!/vacaciones:\s*\w/.test(o)) huerfanos.push(f.replace(RAIZ, ""));
    }
    expect([...new Set(huerfanos)]).toEqual([]);
  });
});
