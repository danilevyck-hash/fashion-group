/* ─────────────────────────────────────────────────────────────────────────────
 * 🔴 CANDADO — EN ETIQUETAS SE DICE «BULTO», NUNCA «CAJA» (20-sep-2026)
 *
 * Daniel, textual: «bultos en todos lados».
 *
 * El papel del tiquete ya lo decía desde el 19-sep-2026 (`ROTULO_BULTO`), pero
 * la PANTALLA seguía hablando de cajas: la columna «Cajas», el paso «Cuántas
 * cajas», «Una sola caja», «Ya etiquetada · 14 cajas», los errores de la
 * validación y hasta el nombre del PDF que se descarga
 * (`Etiquetas-…-caja-7.pdf`). Quedaban dos palabras para la misma cosa, y solo
 * una es la del resto de Guías —la lista, el papel de la guía, el Excel,
 * «Corregir bultos»—.
 *
 * 🔑 Y «bulto» es además la palabra CORRECTA: lo que se despacha puede ser una
 * caja, un saco o un rollo. «Caja» decía de menos.
 *
 * ── QUÉ BARRE, Y POR QUÉ ESE RECORTE ────────────────────────────────────────
 *
 * 1. Los archivos de la pestaña Etiquetas y nada más (`ARCHIVOS`). En el resto
 *    del sistema «caja» es una palabra viva y correcta: Caja Menuda es un
 *    módulo entero, y el Depurador tiene la columna «Cantidad por caja» de la
 *    plantilla de Switch.
 *
 * 2. Solo el TEXTO QUE SE VE: el contenido de los literales de cadena y el
 *    texto suelto de JSX. Los comentarios se blanquean antes de barrer —nadie
 *    los lee— y el CÓDIGO se mira aparte, con una lista cerrada de nombres
 *    permitidos.
 *
 * 3. 🔴 LOS IDENTIFICADORES NO SE TOCAN, A PROPÓSITO. `cajas` es la COLUMNA de
 *    la base (`guias_etiquetas.cajas`), el campo del API y el nombre de media
 *    docena de funciones. Renombrarlos sería una migración y un cambio de
 *    payload para arreglar una palabra de pantalla. Por eso este candado
 *    prohíbe la palabra en el TEXTO y la EXIGE intacta en el código: si alguien
 *    renombra la columna sin migración, `NOMBRES_DE_CODIGO` lo frena igual.
 * ────────────────────────────────────────────────────────────────────────── */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const RAIZ = path.join(process.cwd(), "src");
const leer = (rel: string) => readFileSync(path.join(RAIZ, rel), "utf8");

/** Los archivos de la pestaña Etiquetas: pantalla, reglas, papel y rutas. */
const ARCHIVOS = [
  "app/guias/components/EtiquetasView.tsx",
  "app/guias/components/EtiquetasPendientes.tsx",
  "lib/guias/etiquetas.ts",
  "lib/guias/etiquetas-server.ts",
  "lib/guias/pdf-etiquetas.ts",
  "lib/guias/anti-doble-captura.ts",
  "app/api/guias/etiquetas/route.ts",
  "app/api/guias/etiquetas/[id]/route.ts",
] as const;

/** La palabra prohibida, en cualquier caja y en singular o plural. */
const RE_CAJA = /(?<![\p{L}\p{M}])cajas?(?![\p{L}\p{M}])/giu;

/**
 * 🔴 LOS ÚNICOS «caja» QUE SÍ SIGUEN, UNO POR UNO. Son identificadores de
 * código o de base de datos, nunca texto: ninguno llega a una pantalla.
 *
 *   · `cajas` .............. la COLUMNA `guias_etiquetas.cajas` y el campo del
 *                            payload del API (POST y PATCH). Cambiarla pide
 *                            migración + versión nueva de la ruta.
 *   · `MIN_CAJAS` / `MAX_CAJAS` ... el tope 1..300, que el CHECK de la
 *                            migración repite palabra por palabra.
 *   · `validarCajas` ....... la validación compartida por pantalla y servidor.
 *   · `corregirCajas` ...... el UPDATE del PATCH.
 *   · `cajasDelJuego` ...... los números 1..N del juego completo.
 *   · `numeroDeCaja` ....... arma «3 de 14» (el ROTULO_BULTO va aparte).
 *   · `textoCajas` ......... «14 bultos» para las dos pantallas de la guía.
 *   · `setCajas` / `setCaja` / `cajaValida` ... estado de los formularios.
 *   · `caja` ............... el parámetro «cuál número de bulto» en el PDF.
 */
const NOMBRES_DE_CODIGO = new Set([
  "cajas",
  "caja",
  "MIN_CAJAS",
  "MAX_CAJAS",
  "validarCajas",
  "corregirCajas",
  "cajasDelJuego",
  "numeroDeCaja",
  "textoCajas",
  "setCajas",
  "setCaja",
  "cajaValida",
]);

/**
 * 🔴 LOS ÚNICOS LITERALES QUE PUEDEN DECIR «cajas», completos y exactos. Los
 * dos nombran la COLUMNA de la base, no le hablan a nadie:
 *
 *   · la lista de COLUMNAS que se le pide a Supabase, que es SQL escrito en una
 *     cadena y no una frase;
 *   · el `"cajas"` de un `Pick<EtiquetaFila, "cajas">`, que es un tipo.
 */
const LITERALES_EXENTOS = [
  "cliente_nombre, destino, cajas, creado_en, guia_item_id",
  "cajas",
];

/**
 * Parte el archivo en dos: el TEXTO de los literales (con los `${…}` afuera) y
 * el CÓDIGO. Los comentarios —`//`, `/* … *\/`— se blanquean y no caen en
 * ninguno de los dos: nadie los lee en una pantalla.
 *
 * No es un parser de TypeScript ni pretende serlo; es el mismo recorte que usa
 * `nada-de-voseo.test.ts`, suficiente para estos ocho archivos.
 */
export function partirEnTextoYCodigo(src: string): { texto: string[]; codigo: string } {
  const texto: string[] = [];
  const codigo: string[] = [];
  const n = src.length;
  let i = 0;
  while (i < n) {
    const c = src[i];
    const d = src[i + 1];

    // ── comentarios ──
    if (c === "/" && d === "/") {
      while (i < n && src[i] !== "\n") i++;
      continue;
    }
    if (c === "/" && d === "*") {
      i += 2;
      while (i < n && !(src[i] === "*" && src[i + 1] === "/")) i++;
      i += 2;
      continue;
    }

    // ── cadenas de comillas simples o dobles ──
    if (c === "'" || c === '"') {
      const cierre = c;
      let acc = "";
      i++;
      while (i < n && src[i] !== cierre) {
        if (src[i] === "\\") { i += 2; acc += " "; continue; }
        acc += src[i];
        i++;
      }
      i++;
      texto.push(acc);
      codigo.push(" ");
      continue;
    }

    // ── plantillas: el texto va a TEXTO, los `${…}` vuelven a CÓDIGO ──
    if (c === "`") {
      let acc = "";
      i++;
      while (i < n) {
        if (src[i] === "\\") { i += 2; acc += " "; continue; }
        if (src[i] === "`") { i++; break; }
        if (src[i] === "$" && src[i + 1] === "{") {
          texto.push(acc);
          acc = "";
          i += 2;
          let hondo = 1;
          const desde = i;
          while (i < n && hondo > 0) {
            if (src[i] === "{") hondo++;
            else if (src[i] === "}") hondo--;
            if (hondo > 0) i++;
          }
          codigo.push(" " + src.slice(desde, i) + " ");
          i++; // la `}` que cierra
          continue;
        }
        acc += src[i];
        i++;
      }
      texto.push(acc);
      codigo.push(" ");
      continue;
    }

    codigo.push(c);
    i++;
  }

  return { texto, codigo: codigo.join("") };
}

/**
 * El texto suelto de JSX: lo que va entre `>` o `}` y el siguiente `<` o `{`,
 * sin ninguno de esos cuatro adentro. `<span …>Bulto</span>` y
 * `{e.cajas} bultos` caen acá, y NO son literales de cadena: sin esto se
 * escaparían por el costado.
 *
 * ⚠️ Se descarta lo que traiga puntuación de código (`;` `:` `=` paréntesis,
 * corchetes o comillas). Sin ese filtro, dos trozos de TypeScript separados por
 * una llave y un `<` de genérico se leían como si fueran una frase.
 */
const PUNTUACION_DE_CODIGO = /[;:=()[\]"'`]/;

export function textoSueltoDeJsx(codigo: string): string[] {
  const sueltos: string[] = [];
  const re = /[>}]([^<>{}]*)[<{]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(codigo)) !== null) {
    const t = m[1];
    re.lastIndex = m.index + m[0].length - 1; // el cierre puede abrir el siguiente
    if (t.trim() && !PUNTUACION_DE_CODIGO.test(t)) sueltos.push(t);
  }
  return sueltos;
}

describe("Etiquetas dice BULTO, nunca CAJA", () => {
  it("🔴 ningún literal de texto de la pestaña dice «caja» ni «cajas»", () => {
    const culpables: string[] = [];
    for (const rel of ARCHIVOS) {
      const { texto } = partirEnTextoYCodigo(leer(rel));
      for (const t of texto) {
        if (LITERALES_EXENTOS.includes(t)) continue;
        if (RE_CAJA.test(t)) culpables.push(`${rel}: ${t.trim().slice(0, 90)}`);
        RE_CAJA.lastIndex = 0;
      }
    }
    expect(culpables).toEqual([]);
  });

  it("🔴 ningún texto suelto de JSX dice «caja» ni «cajas»", () => {
    const culpables: string[] = [];
    for (const rel of ARCHIVOS.filter((f) => f.endsWith(".tsx"))) {
      const { codigo } = partirEnTextoYCodigo(leer(rel));
      for (const t of textoSueltoDeJsx(codigo)) {
        if (RE_CAJA.test(t)) culpables.push(`${rel}: ${t.trim().slice(0, 90)}`);
        RE_CAJA.lastIndex = 0;
      }
    }
    expect(culpables).toEqual([]);
  });

  it("🔴 en el código solo quedan los nombres de la lista: columna, API y funciones", () => {
    const culpables: string[] = [];
    for (const rel of ARCHIVOS) {
      const { codigo } = partirEnTextoYCodigo(leer(rel));
      for (const m of codigo.matchAll(/[A-Za-z_$][\w$]*/g)) {
        if (!/caja/i.test(m[0])) continue;
        if (!NOMBRES_DE_CODIGO.has(m[0])) culpables.push(`${rel}: ${m[0]}`);
      }
    }
    expect(culpables).toEqual([]);
  });

  it("y el candado de verdad barre: una «caja» plantada en cualquiera de los tres lugares se caza", () => {
    // Literal de cadena.
    const enLiteral = partirEnTextoYCodigo('const t = "14 cajas";');
    expect(enLiteral.texto.some((t) => RE_CAJA.test(t))).toBe(true);
    RE_CAJA.lastIndex = 0;

    // Texto suelto de JSX, con una expresión al lado (el caso que se escapaba).
    const { codigo } = partirEnTextoYCodigo("<p>{e.cajas} cajas</p>");
    expect(textoSueltoDeJsx(codigo).some((t) => RE_CAJA.test(t))).toBe(true);
    RE_CAJA.lastIndex = 0;

    // Un `${…}` dentro de una plantilla NO es texto, y el resto SÍ lo es.
    const p = partirEnTextoYCodigo("const t = `Ya etiquetada · ${e.cajas} cajas`;");
    expect(p.texto.some((t) => RE_CAJA.test(t))).toBe(true);
    RE_CAJA.lastIndex = 0;

    // Un nombre nuevo de código tampoco pasa solo.
    const nuevo = partirEnTextoYCodigo("const totalDeCajas = 3;");
    const nombres = [...nuevo.codigo.matchAll(/[A-Za-z_$][\w$]*/g)]
      .map((m) => m[0])
      .filter((s) => /caja/i.test(s) && !NOMBRES_DE_CODIGO.has(s));
    expect(nombres).toEqual(["totalDeCajas"]);
  });

  it("control: un comentario con «caja» NO cuenta, y el texto sano pasa limpio", () => {
    const { texto, codigo } = partirEnTextoYCodigo(
      '// esto era 14 cajas\nconst t = "14 bultos"; /* y esta caja tampoco */',
    );
    expect(texto.some((t) => RE_CAJA.test(t))).toBe(false);
    RE_CAJA.lastIndex = 0;
    expect(RE_CAJA.test(codigo)).toBe(false);
    RE_CAJA.lastIndex = 0;
  });

  it("el PDF que se descarga se llama «bulto», y el rótulo del papel no cambió", async () => {
    const { ROTULO_BULTO, nombreArchivoEtiquetas } = await import("@/lib/guias/etiquetas");
    expect(ROTULO_BULTO).toBe("BULTO");
    expect(nombreArchivoEtiquetas({ secuencial: "11-000002558" }, 7)).toBe(
      "Etiquetas-11-000002558-bulto-7.pdf",
    );
    expect(nombreArchivoEtiquetas({ secuencial: "11-000002558" })).toBe(
      "Etiquetas-11-000002558.pdf",
    );
  });
});
