/* ─────────────────────────────────────────────────────────────────────────────
 * 🔴 CANDADO — NADA DE VOSEO EN LO QUE VE EL USUARIO
 *
 * Daniel, textual (1-sep-2026):
 *   «no soy argentino, ni a mi ni en el sistema pongas palabras argentinos,
 *    somos latinoamericanos normal… por ejemplo vi "elegi el periodo" es
 *    elige el periodo»
 *
 * Español latinoamericano neutro, TUTEO:
 *   elige · escribe · toca · revisa · guarda · cierra · aquí · mira · tienes ·
 *   puedes · tu/tus
 * Nunca:
 *   elegí · escribí · tocá · revisá · guardá · cerrá · acá · mirá · tenés ·
 *   podés · vos
 *
 * ── QUÉ BARRE, Y POR QUÉ ESE RECORTE ────────────────────────────────────────
 *
 * 1. `src/**` MENOS `src/__tests__/**`.
 *    Lo que se despliega es lo único que puede llegar a una pantalla, a un
 *    Excel o a un PDF. Un test no se le muestra a nadie y además guarda VIEJOS
 *    textos a propósito, como fixtures de «esto ya NO debe existir»
 *    (`poda-textos-*`, `guia-imprimir-escala`). Barrerlos daría falsos
 *    positivos que solo se apagan mutilando el fixture.
 *
 * 2. CON LOS COMENTARIOS BORRADOS.
 *    Un comentario no lo lee el usuario. El repo tiene ~1.700 «acá» en prosa
 *    de desarrollo; barrerlos sería ruido puro. Se borran los tres tipos:
 *    `//`, `/* … *\/`, y los `/* … *\/` de CSS dentro de un template literal
 *    (los `<style>{`…`}</style>` de las hojas de impresión).
 *
 * 3. TODO LO DEMÁS SÍ SE MIRA: los literales `'…'`, `"…"` y `` `…` ``, y
 *    también el TEXTO SUELTO DE JSX (`<p>Elige el período</p>`), que no es un
 *    literal y aun así se imprime en pantalla. Es a propósito más ancho que
 *    «solo strings»: en este repo las palabras con tilde no aparecen en
 *    identificadores, así que el costo de barrer de más es casi cero, y el de
 *    barrer de menos es un texto que se cuela.
 *
 * ── LO QUE NO SE PROHÍBE, A PROPÓSITO ───────────────────────────────────────
 *
 *   · «dale»  — en tuteo también es válido (dar + le: «dale un nombre»).
 *   · «vendí», «compré», «encontré» — son primera persona, y dos de ellas son
 *     rótulos vivos de Ventas › Referencia.
 *   · «fíjate», «déjalo», «anótalo», «bórrala» — CON tilde son el tuteo
 *     correcto. El voseo es el mismo verbo SIN tilde («fijate», «dejalo»,
 *     «borrala»), y esos sí están en la lista.
 *
 * ⚠️ La lista sí prohíbe formas que también son pretérito de 1.ª persona
 * («elegí», «escribí», «pedí»). No distingue, y es deliberado: en una pantalla
 * son siempre imperativos. Si algún día hace falta el pretérito, se reescribe
 * la frase — no se afloja el candado.
 * ────────────────────────────────────────────────────────────────────────── */

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const RAIZ = path.join(process.cwd(), "src");
const ESTE_ARCHIVO = "src/__tests__/lib/nada-de-voseo.test.ts";

/**
 * Formas de voseo prohibidas en texto de usuario.
 * Se comparan con frontera de palabra Unicode y sin distinguir mayúsculas.
 */
const FORMAS_PROHIBIDAS = [
  // pronombres y presente
  "vos", "sos", "tenés", "podés", "querés", "sabés", "vivís", "venís",
  "equivocás", "quedás", "tocás", "creés", "hacés", "decís", "elegís",
  // imperativos en -á / -é / -í
  "elegí", "escribí", "tocá", "revisá", "guardá", "cerrá", "mirá", "poné",
  "andá", "vení", "dejá", "hacé", "decí", "volvé", "probá", "buscá", "agregá",
  "marcá", "seleccioná", "ingresá", "apretá", "usá", "activá", "verificá",
  "confirmá", "cargá", "creá", "editá", "borrá", "eliminá", "enviá", "abrí",
  "reabrí", "subí", "bajá", "pedí", "sumá", "restá", "ajustá", "aplicá",
  "avisá", "contá", "corregí", "anotá", "esperá", "seguí", "empezá", "terminá",
  "completá", "llená", "filtrá", "exportá", "imprimí", "descargá", "actualizá",
  "recargá", "intentá", "acercá", "afiná", "arrastrá", "recalibrá", "aprobá",
  "cambiá", "mandá", "llevá", "tirá", "sacá", "chequeá", "copiá", "pegá",
  // imperativo + pronombre pegado, SIN la tilde que exige el tuteo
  "elegilo", "elegila", "ponelo", "ponela", "dejalo", "dejala", "decidilo",
  "borralo", "borrala", "sacalo", "sacala", "sacalos", "revisalo", "revisala",
  "importalo", "importala", "agregalo", "agregala", "aprobalo", "aprobala",
  "restauralo", "restaurala", "escribilo", "escribila", "miralo", "mirala",
  "pegalo", "pegala", "cargale", "ponele", "decile", "hacele", "mandale",
  "pedile", "avisale", "sacale", "dejale", "mostrale", "cambiale", "agregale",
  "fijate", "acordate", "olvidate", "quedate", "apurate", "calmate",
  // imperativo + «me» pegado (5-sep-2026 — ver la nota de abajo)
  "avisame", "contame", "decime", "mandame", "mostrame", "pasame", "dejame",
  "sacame", "traeme", "llamame", "ayudame", "esperame", "escribime", "buscame",
  "mirame", "prestame", "regalame", "cuidame", "explicame", "mandamelo",
  // adverbio
  "acá",
];

/* ── 5-sep-2026 · el agujero de la familia «-me» ─────────────────────────────
 *
 * La lista tenía «avisale» (imperativo + LE) pero le faltaba entera la familia
 * imperativo + ME, y por ahí se colaron **26 «avisame»** en mensajes que
 * salían por Telegram: `cron-telemetry.ts` (el «Qué hacer:» de CASI TODA
 * alerta de cron), `api/cron/backup/route.ts` (5), `switch-reconciliacion` y
 * `alert-policy`. El tuteo es **«avísame»**, con tilde — así ya lo escribían
 * `alertas/silencio-de-datos.ts` y `alertas/cuadre-costo.ts`.
 *
 * Por qué el candado no los veía: es una lista literal, no una regla de
 * gramática. Solo caza lo que alguien escribió en ella.
 *
 * Falsos positivos revisados uno por uno antes de agregarlas: los únicos
 * «dejame» / «ayudame» del repo son citas TEXTUALES de Daniel dentro de
 * comentarios («solo dejame las 4 primeras…», «solo ayudame a borrar las
 * fotos esas»), y los comentarios se blanquean antes de barrer. Sus palabras
 * no se corrigen; se conservan verbatim.
 *
 * ⚠️ «dime», «dame», «ponme», «hazme» NO entran: son el tuteo CORRECTO.
 * El voseo de esos es «decime», «dame» (igual), «poneme», «haceme».
 * ────────────────────────────────────────────────────────────────────────── */

const RE_VOSEO = new RegExp(
  `(?<![\\p{L}\\p{M}])(${FORMAS_PROHIBIDAS.join("|")})(?![\\p{L}\\p{M}])`,
  "giu",
);

/**
 * Devuelve el mismo texto con los comentarios reemplazados por espacios.
 * Conserva la longitud y los saltos de línea, así que los números de línea del
 * archivo original siguen valiendo.
 *
 * Reconoce: `//` hasta el fin de línea, `/* … *\/`, y `/* … *\/` DENTRO de un
 * template literal (el CSS de las hojas de impresión). Los literales de cadena
 * y de expresión regular se saltan enteros para que un `//` de una URL o una
 * comilla dentro de un regex no descarrilen el barrido.
 */
export function borrarComentarios(src: string): string {
  const out = src.split("");
  const n = src.length;
  const blanquear = (desde: number, hasta: number) => {
    for (let k = desde; k < hasta && k < n; k++) if (out[k] !== "\n") out[k] = " ";
  };
  let i = 0;
  let anterior = "";
  while (i < n) {
    const c = src[i];
    const d = src[i + 1];
    if (c === "/" && d === "/") {
      let j = i;
      while (j < n && src[j] !== "\n") j++;
      blanquear(i, j);
      i = j;
      continue;
    }
    if (c === "/" && d === "*") {
      let j = i + 2;
      while (j < n && !(src[j] === "*" && src[j + 1] === "/")) j++;
      blanquear(i, Math.min(j + 2, n));
      i = j + 2;
      continue;
    }
    if (c === "'" || c === '"') {
      let j = i + 1;
      while (j < n) {
        if (src[j] === "\\") { j += 2; continue; }
        if (src[j] === c || src[j] === "\n") break;
        j++;
      }
      i = j + 1;
      anterior = c;
      continue;
    }
    if (c === "`") {
      let j = i + 1;
      while (j < n) {
        if (src[j] === "\\") { j += 2; continue; }
        if (src[j] === "`") break;
        if (src[j] === "/" && src[j + 1] === "*") {
          // Comentario de CSS adentro de un <style>{`…`}</style>. Solo se
          // borra si el cierre aparece ANTES del fin del template: un `/*`
          // suelto en un texto no puede tragarse el resto del archivo.
          let k = j + 2;
          while (k < n && src[k] !== "`" && !(src[k] === "*" && src[k + 1] === "/")) k++;
          if (k < n && src[k] === "*") {
            blanquear(j, k + 2);
            j = k + 2;
            continue;
          }
        }
        if (src[j] === "$" && src[j + 1] === "{") {
          let hondo = 1;
          let k = j + 2;
          while (k < n && hondo > 0) {
            if (src[k] === "{") hondo++;
            else if (src[k] === "}") hondo--;
            else if (src[k] === "/" && src[k + 1] === "/") { while (k < n && src[k] !== "\n") k++; }
            k++;
          }
          j = k;
          continue;
        }
        j++;
      }
      i = j + 1;
      anterior = "`";
      continue;
    }
    if (c === "/" && (anterior === "" || /[(,=:[!&|?{};+\-*%~^]/.test(anterior))) {
      // Literal de expresión regular: se salta entero (su contenido SÍ se
      // barre después, porque no se blanquea — ahí viven los textos que los
      // componentes buscan en pantalla).
      let j = i + 1;
      let clase = false;
      while (j < n && src[j] !== "\n") {
        if (src[j] === "\\") { j += 2; continue; }
        if (src[j] === "[") clase = true;
        else if (src[j] === "]") clase = false;
        else if (src[j] === "/" && !clase) break;
        j++;
      }
      i = j + 1;
      anterior = "/";
      continue;
    }
    if (!/\s/.test(c)) anterior = c;
    i++;
  }
  return out.join("");
}

function archivosDeCodigo(dir: string, acc: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "__tests__") continue; // ver el encabezado, punto 1
      archivosDeCodigo(p, acc);
    } else if (/\.(ts|tsx)$/.test(e.name)) {
      acc.push(p);
    }
  }
  return acc;
}

type Hallazgo = { archivo: string; linea: number; palabra: string; texto: string };

function barrer(): { hallazgos: Hallazgo[]; archivos: number } {
  const archivos = archivosDeCodigo(RAIZ);
  const hallazgos: Hallazgo[] = [];
  for (const abs of archivos) {
    const rel = path.relative(process.cwd(), abs);
    if (rel === ESTE_ARCHIVO) continue;
    const original = fs.readFileSync(abs, "utf-8");
    RE_VOSEO.lastIndex = 0;
    if (!RE_VOSEO.test(original)) continue;
    const limpio = borrarComentarios(original).split("\n");
    const crudo = original.split("\n");
    limpio.forEach((linea, idx) => {
      let m: RegExpExecArray | null;
      RE_VOSEO.lastIndex = 0;
      while ((m = RE_VOSEO.exec(linea))) {
        hallazgos.push({ archivo: rel, linea: idx + 1, palabra: m[1], texto: crudo[idx].trim().slice(0, 140) });
      }
    });
  }
  return { hallazgos, archivos: archivos.length };
}

describe("🔴 nada de voseo en los textos que ve el usuario", () => {
  const { hallazgos, archivos } = barrer();

  it("el barrido llega a todo el código desplegable (no se quedó mudo)", () => {
    // Si un refactor mueve `src/` o rompe el walker, el candado pasaría vacío
    // sin protestar. Este piso es la alarma: hoy son ~1.000 archivos.
    expect(archivos).toBeGreaterThan(500);
  });

  it("ninguna forma de voseo llega a una pantalla, a un Excel ni a un PDF", () => {
    const detalle = hallazgos
      .map((h) => `  ${h.archivo}:${h.linea}  «${h.palabra}»  →  ${h.texto}`)
      .join("\n");
    expect(
      hallazgos,
      hallazgos.length === 0
        ? ""
        : `\n\nEste sistema habla español latinoamericano neutro, en TUTEO.\n` +
          `Cambia «elegí»→«elige», «escribí»→«escribe», «revisá»→«revisa»,\n` +
          `«acá»→«aquí», «tenés»→«tienes», «podés»→«puedes», «vos»→«tú».\n\n` +
          `${hallazgos.length} texto(s) con voseo:\n${detalle}\n`,
    ).toEqual([]);
  });

  it("la lista de formas prohibidas conserva las nueve que pidió Daniel", () => {
    // Que nadie la achique en un merge y el candado quede de adorno.
    for (const forma of ["elegí", "escribí", "tocá", "revisá", "guardá", "cerrá", "acá", "tenés", "podés"]) {
      expect(FORMAS_PROHIBIDAS, `falta «${forma}» en FORMAS_PROHIBIDAS`).toContain(forma);
    }
    expect(FORMAS_PROHIBIDAS.length).toBeGreaterThan(100);
  });
});

describe("el barrido en sí: qué mira y qué no", () => {
  const muestra = [
    '// Un comentario que dice acá y elegí no cuenta.',
    '/* Un bloque que dice tenés tampoco. */',
    'const saludo = "Hola";',
    'const css = `.x { color: red } /* acá el CSS tampoco cuenta */`;',
    'export function P() { return <p>Elige el período</p>; }',
  ].join("\n");

  it("no ve el voseo de los comentarios (de línea, de bloque y de CSS)", () => {
    const limpio = borrarComentarios(muestra);
    RE_VOSEO.lastIndex = 0;
    expect(limpio.match(RE_VOSEO)).toBeNull();
  });

  it("SÍ ve el voseo de un literal de cadena", () => {
    const limpio = borrarComentarios('const aviso = "Elegí el período";');
    RE_VOSEO.lastIndex = 0;
    expect(limpio.match(RE_VOSEO)).toEqual(["Elegí"]);
  });

  it("SÍ ve el voseo del texto suelto de JSX, que no es un literal", () => {
    const limpio = borrarComentarios("return <p>Revisá y corregí abajo</p>;");
    RE_VOSEO.lastIndex = 0;
    expect(limpio.match(RE_VOSEO)).toEqual(["Revisá", "corregí"]);
  });

  it("SÍ ve el voseo de un template literal y de un aria-label", () => {
    const limpio = borrarComentarios(
      'const a = `No se pudo. Volvé a intentar.`;\n<button aria-label="Cerrá la fila" />',
    );
    RE_VOSEO.lastIndex = 0;
    expect(limpio.match(RE_VOSEO)).toEqual(["Volvé", "Cerrá"]);
  });

  it("no confunde el tuteo correcto con voseo", () => {
    const limpio = borrarComentarios(
      'const ok = "Elige el período, fíjate en el total, déjalo y dale un nombre. Vendí 10.";',
    );
    RE_VOSEO.lastIndex = 0;
    expect(limpio.match(RE_VOSEO)).toBeNull();
  });

  // ── La familia «-me», el agujero del 5-sep-2026 ──────────────────────────
  it("SÍ ve «avisame» y sus hermanos de imperativo + me", () => {
    const limpio = borrarComentarios(
      'const t = "Qué hacer: avisame para revisarlo.";\n' +
        'const u = "Contame qué pasó, mandame el archivo y decime cuándo.";',
    );
    RE_VOSEO.lastIndex = 0;
    expect(limpio.match(RE_VOSEO)).toEqual(["avisame", "Contame", "mandame", "decime"]);
  });

  it("CONTROL: «avísame» con tilde es el tuteo correcto y NO se caza", () => {
    // Este es el texto que hoy sale por Telegram. Si algún día el candado lo
    // marcara, estaría prohibiendo justo lo que pide Daniel.
    const limpio = borrarComentarios(
      'const t = "Qué hacer: avísame para revisarlo.";\n' +
        'const u = "Dime qué falta, dame un minuto y ponme el total abajo.";',
    );
    RE_VOSEO.lastIndex = 0;
    expect(limpio.match(RE_VOSEO)).toBeNull();
  });

  it("la lista incluye la familia imperativo + me (que faltaba entera)", () => {
    for (const forma of ["avisame", "contame", "decime", "mandame", "mostrame", "dejame"]) {
      expect(FORMAS_PROHIBIDAS, `falta «${forma}» en FORMAS_PROHIBIDAS`).toContain(forma);
    }
    // «dime» es tuteo correcto: prohibirlo sería el falso positivo.
    expect(FORMAS_PROHIBIDAS).not.toContain("dime");
  });
});
