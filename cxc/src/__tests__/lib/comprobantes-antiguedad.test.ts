/**
 * ─────────────────────────────────────────────────────────────────────────────
 * CANDADO — «SIN MANDAR» DICE DESDE CUÁNDO (22-sep-2026)
 *
 * 🩸 QUÉ PASÓ. Medido contra producción el 22-sep-2026: **cinco comprobantes
 * vivos nunca llegaron a Switch, $32.208**, y ninguno se veía. Los cinco son
 * BORRADORES —así que la línea roja del 6-sep-2026 no los agarra, porque ésa
 * mira los TERMINADOS y de ésos hoy hay CERO— y salían con la frase gris de
 * siempre, del mismo tamaño que todo lo demás y sin decir hace cuánto:
 *
 *   PED-019 · reebok ·  $2.760,00 · 22-jul · 62 días
 *   TOM-005 · tommy  · $16.920,00 · 12-ago · 41 días
 *   TOM-006 · tommy  ·  $7.254,00 · 12-ago · 41 días
 *   CKP-007 · calvin ·  $1.704,00 · 12-ago · 41 días
 *   TOM-023 · tommy  ·  $3.570,00 · 20-ago · 33 días
 *
 * Lo que este archivo fija, y por qué cada cosa:
 *   1. Los días se cuentan en UN solo lugar y con el día de PANAMÁ, nunca con
 *      el reloj del navegador ni con el del servidor (Vercel corre en UTC).
 *   2. El umbral existe y vale 7, y NO se puede apagar (poner 0 o un número
 *      enorme deja de separar lo normal de lo olvidado).
 *   3. El texto del borrador lleva su antigüedad.
 *   4. Quién es «trabado» NO cambió: sigue saliendo del ENVÍO ACTIVO, no del
 *      `status` ni del número — la regla del módulo desde el 24-ago-2026.
 *
 * ⚠️ NOTA FECHADA. El candado de `comprobantes-rediseno.test.ts` (6-sep-2026)
 * decía «un BORRADOR conserva su frase gris». Sigue siendo cierto **el primer
 * día**; a partir de la semana se pinta como el trabado. Ese candado no se
 * tocó: su borrador de prueba nació hoy.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  CLASES_TONO,
  DIAS_SIN_MANDAR_VIEJO,
  diasSinLlegarASwitch,
  esSinMandar,
  textoNoLlegoASwitch,
  textoSinMandar,
  tonoSinLlegar,
} from "@/lib/catalogo/sin-mandar";
import { TEXTO_NO_ENVIADO } from "@/lib/catalogo/numeros-pedido";

const leer = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");
const sinComentarios = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^[ \t]*\/\/.*$/gm, "");

/** El día de Panamá del que se midió todo lo de arriba. */
const HOY = "2026-09-22";

// ─────────────────────────────────────────────────────────────────────────────
describe("1. 🔴 los días salen de UN solo lugar y del día de PANAMÁ", () => {
  it("cuenta los cinco de producción tal como se midieron", () => {
    expect(diasSinLlegarASwitch("2026-07-22T19:47:58Z", HOY)).toBe(62); // PED-019
    expect(diasSinLlegarASwitch("2026-08-12T12:17:29Z", HOY)).toBe(41); // TOM-005
    expect(diasSinLlegarASwitch("2026-08-20T22:22:24Z", HOY)).toBe(33); // TOM-023
  });

  it("🔴 CKP-007 nació a las 02:35 UTC y es el 12-ago en PANAMÁ, no el 13", () => {
    // Contarlo en UTC diría 40 días; en Panamá (UTC−5) son 41. Es el defecto
    // clásico de este repo: el mismo comprobante diciendo dos números.
    expect(diasSinLlegarASwitch("2026-08-13T02:35:54Z", HOY)).toBe(41);
  });

  it("sin fecha, con una fecha ilegible o del futuro NO inventa un número", () => {
    expect(diasSinLlegarASwitch(null, HOY)).toBeNull();
    expect(diasSinLlegarASwitch(undefined, HOY)).toBeNull();
    expect(diasSinLlegarASwitch("no-es-fecha", HOY)).toBeNull();
    expect(diasSinLlegarASwitch("2026-10-01T12:00:00Z", HOY)).toBeNull();
  });

  it("🔴 el módulo sigue siendo PURO: no lee el reloj por su cuenta", () => {
    expect(sinComentarios(leer("src/lib/catalogo/sin-mandar.ts"))).not.toContain("new Date()");
  });

  it("🔴 y la fila tampoco: el «hoy» le llega por parámetro", () => {
    const fila = sinComentarios(leer("src/components/catalogo/comprobantes/FilaComprobante.tsx"));
    expect(fila).not.toContain("new Date()");
    expect(fila).not.toContain("Date.now()");
  });

  it("🔴 el «hoy» del panel es el de Panamá, no el del navegador", () => {
    const panel = sinComentarios(leer("src/components/catalogo/ComprobantesPanel.tsx"));
    expect(panel).toContain("hoyPanama()");
    expect(panel).not.toMatch(/const hoy = new Date/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("2. 🔴 el umbral existe, vale 7 y no se puede apagar", () => {
  it("son 7 días", () => {
    expect(DIAS_SIN_MANDAR_VIEJO).toBe(7);
  });

  it("🔴 tiene que separar de verdad: ni 0 (todo alarma) ni tan alto que nada suene", () => {
    // Medido: los 71 envíos activos salieron el MISMO día (máximo 4,38 h), y el
    // más NUEVO de los cinco trabados lleva 33. Un umbral fuera de ese hueco
    // deja de separar «recién hecho» de «se olvidó».
    expect(DIAS_SIN_MANDAR_VIEJO).toBeGreaterThan(0);
    expect(DIAS_SIN_MANDAR_VIEJO).toBeLessThan(33);
  });

  it("el borrador es calma antes del umbral y alerta a partir de él", () => {
    expect(tonoSinLlegar(false, 0)).toBe("calma");
    expect(tonoSinLlegar(false, DIAS_SIN_MANDAR_VIEJO - 1)).toBe("calma");
    expect(tonoSinLlegar(false, DIAS_SIN_MANDAR_VIEJO)).toBe("alerta");
    expect(tonoSinLlegar(false, 41)).toBe("alerta");
  });

  it("🔴 los cinco de producción caen los CINCO en alerta", () => {
    for (const d of [62, 41, 41, 41, 33]) expect(tonoSinLlegar(false, d)).toBe("alerta");
  });

  it("⚠️ el TERMINADO que no salió no espera la semana: está mal desde el día uno", () => {
    expect(tonoSinLlegar(true, 0)).toBe("alerta");
    expect(tonoSinLlegar(true, null)).toBe("alerta");
  });

  it("sin fecha no se levanta una alarma sobre un dato que no se tiene", () => {
    expect(tonoSinLlegar(false, null)).toBe("calma");
  });

  it("🔴 los dos tonos se distinguen: uno es gris y el otro rojo", () => {
    expect(CLASES_TONO.calma).toContain("gray");
    expect(CLASES_TONO.alerta).toContain("red");
    expect(CLASES_TONO.calma).not.toBe(CLASES_TONO.alerta);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("3. 🔴 el texto del borrador lleva la antigüedad", () => {
  it("dice las MISMAS palabras de siempre más los días", () => {
    expect(textoNoLlegoASwitch("2026-08-12T12:17:29Z", HOY)).toBe(`${TEXTO_NO_ENVIADO} · hace 41 días`);
    expect(textoNoLlegoASwitch("2026-07-22T19:47:58Z", HOY)).toBe(`${TEXTO_NO_ENVIADO} · hace 62 días`);
  });

  it("⚠️ el de HOY no dice «· hoy»: un borrador armado esta mañana no es noticia", () => {
    expect(textoNoLlegoASwitch("2026-09-22T12:00:00Z", HOY)).toBe(TEXTO_NO_ENVIADO);
  });

  it("el de ayer se dice con palabras", () => {
    expect(textoNoLlegoASwitch("2026-09-21T12:00:00Z", HOY)).toBe(`${TEXTO_NO_ENVIADO} · ayer`);
  });

  it("sin fecha legible dice la frase sola, nunca «hace NaN días»", () => {
    expect(textoNoLlegoASwitch("no-es-fecha", HOY)).toBe(TEXTO_NO_ENVIADO);
    expect(textoNoLlegoASwitch(null, HOY)).toBe(TEXTO_NO_ENVIADO);
  });

  it("y el del TERMINADO no cambió de forma", () => {
    expect(textoSinMandar("2026-07-04T12:00:00Z", "2026-09-07")).toBe("Sin mandar a Switch · hace 65 días");
    expect(textoSinMandar("2026-09-07T12:00:00Z", "2026-09-07")).toBe("Sin mandar a Switch · hoy");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("4. 🔴 quién es «trabado» NO cambió: lo decide el ENVÍO ACTIVO", () => {
  it("el terminado sin envío activo sigue siendo el trabado, y el borrador NO", () => {
    expect(esSinMandar({ status: "confirmado", enSwitch: false, fuente: "orders" })).toBe(true);
    expect(esSinMandar({ status: "borrador", enSwitch: false, fuente: "orders" })).toBe(false);
  });

  it("🔴 un envío activo SIN número sigue contando como que salió", () => {
    expect(esSinMandar({ status: "confirmado", enSwitch: true, switchNumero: null, fuente: "orders" })).toBe(false);
  });

  it("🔴 y el pedido del LINK sin convertir sigue afuera (su plazo es la ventana de 30 días)", () => {
    expect(esSinMandar({ status: null, enSwitch: false, fuente: "publicos" })).toBe(false);
  });
});
