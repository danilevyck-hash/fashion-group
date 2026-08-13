/**
 * CANDADO — en la pestaña Boston del CXC no vuelve a haber un monto ESCRITO A
 * MANO en el código.
 *
 * 🩸 Por qué existe. `BostonTab.tsx` tenía una 5ª tarjeta con esto adentro:
 *
 *     Cobrado julio
 *     $35,392.49 · 126          ← `fmt(35392.49)` y `· 126`, los dos literales
 *
 * Era la única de la fila que NO filtraba la lista, y estaba al lado de cuatro
 * cifras que sí se actualizan solas. Un número escrito a mano no envejece: se
 * queda quieto mientras los de al lado se mueven, así que en octubre alguien lo
 * iba a leer como el cobrado de octubre. Y el mes en el rótulo lo empeoraba —
 * decía "julio" para siempre.
 *
 * ⚠️ **NO se puede calcular, y eso es DISEÑO, no un olvido.** Los cobros de
 * `confecciones_boston` no entran a este sistema (`recibos: false` en
 * `EMPRESA_SYNC_CAPABILITIES`; su cartera se lleva por Brand It). O sea que la
 * única forma de "arreglar" la tarjeta era volver a escribir un número a mano,
 * o encender el sync de recibos de Boston — que es una decisión de negocio de
 * Daniel, no un arreglo de código. Por eso la tarjeta se quitó y este archivo
 * pone el build en ROJO si alguien la repone en cualquiera de sus disfraces:
 *
 *   (a) un formateador de plata llamado con un número literal,
 *   (b) un "$" pintado delante de dígitos en el JSX,
 *   (c) un nombre de mes escrito a mano en la pestaña,
 *   (d) la cuadrícula de píldoras quedando con un hueco al perder un elemento.
 *
 * El barrido es ESTÁTICO: lee los archivos, no renderiza nada.
 */

import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const RAIZ = process.cwd();

/** La pestaña y sus vecinas de la misma pantalla: todo lo que pinta plata del CXC. */
const SUPERFICIE_CXC = [
  "src/components/cxc/BostonTab.tsx",
  "src/app/admin/page.tsx",
  "src/app/admin/components/KpiCards.tsx",
  "src/app/admin/components/PanelCxcMobile.tsx",
  "src/app/admin/components/ClientTable.tsx",
  "src/app/admin/components/ClientRow.tsx",
  "src/app/admin/components/CompanySummary.tsx",
  "src/app/admin/components/ContactPanel.tsx",
  "src/app/admin/components/EstadoCuentaDrawer.tsx",
];

const LA_PESTANA = "src/components/cxc/BostonTab.tsx";

/**
 * Quita comentarios ANTES de buscar: este archivo y `BostonTab.tsx` CITAN el
 * anti-patrón para explicarlo. Sin esto, la explicación del bug sería el bug.
 */
const soloCodigo = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

const leer = (rel: string) => {
  const ruta = join(RAIZ, rel);
  expect(existsSync(ruta), `no encontré ${rel} — ¿se movió? actualizá la lista`).toBe(true);
  const texto = readFileSync(ruta, "utf8");
  // Guard contra el paso en falso: un archivo vacío hace pasar cualquier regex.
  expect(texto.length, `${rel} está vacío`).toBeGreaterThan(200);
  return { rel, codigo: soloCodigo(texto), crudo: texto };
};

const FUENTES = SUPERFICIE_CXC.map(leer);

// El barrido no puede quedarse sin archivos y seguir dando verde.
it("el barrido mira archivos de verdad", () => {
  expect(FUENTES.length).toBeGreaterThan(0);
  expect(FUENTES.map((f) => f.rel)).toContain(LA_PESTANA);
});

describe("ningún monto se escribe a mano en el CXC", () => {
  /**
   * (a) El disfraz exacto que tenía la tarjeta: `fmt(35392.49)`. Se listan los
   * formateadores de plata del repo — el que pinte un número tiene que
   * recibirlo de los datos, nunca tecleado.
   */
  it("ningún formateador de plata recibe un número literal", () => {
    const formateadores =
      "fmt|fmtMoney|fmtMoneyCompact|fmtMoneySigned|fmtMonto|fmtPrecio|fmtCompact";
    const patron = new RegExp(`\\b(?:${formateadores})\\(\\s*-?[0-9][0-9_.]*\\s*[,)]`);

    const culpables = FUENTES.filter((f) => patron.test(f.codigo)).map((f) => f.rel);
    expect(
      culpables,
      "Un monto escrito a mano en el CXC. Tiene que venir de los datos (la API / el estado), no del código: un número tecleado no se actualiza nunca y queda mintiendo al lado de los que sí.",
    ).toEqual([]);
  });

  /**
   * (b) El mismo bug sin pasar por el formateador: `$35,392.49` a pelo en el
   * JSX. Se mira el código sin comentarios, así que `// costó $10` no molesta.
   */
  it("ningún '$' va pegado a dígitos en el código", () => {
    const culpables = FUENTES.filter((f) => /\$[0-9]/.test(f.codigo)).map((f) => f.rel);
    expect(
      culpables,
      "Hay un monto pintado a mano (un '$' seguido de números) en el CXC. Si es un dato, tiene que salir de los datos.",
    ).toEqual([]);
  });
});

describe("la pestaña de Boston no vuelve a decir un mes fijo", () => {
  const pestana = FUENTES.find((f) => f.rel === LA_PESTANA)!;

  /**
   * (c) El rótulo "Cobrado julio" era la mitad del daño: aunque el número se
   * calculara, un mes tecleado envejece igual. Los meses se formatean desde una
   * fecha (`toLocaleDateString`, `fmtMesAnio`…), no se escriben.
   */
  it("no hay un nombre de mes escrito a mano", () => {
    const meses =
      /\b(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)\b/i;
    const encontrados = pestana.codigo
      .split("\n")
      .map((l, i) => ({ n: i + 1, l }))
      .filter(({ l }) => meses.test(l));

    expect(
      encontrados,
      "Un mes escrito a mano en la pestaña de Boston. El mes se saca de una fecha; tecleado se queda fijo y en octubre se lee como si fuera de octubre.",
    ).toEqual([]);
  });

  /** La tarjeta concreta, por si vuelve con otro formato. */
  it("no vuelve la tarjeta 'Cobrado' de Boston", () => {
    expect(pestana.codigo).not.toMatch(/Cobrado/i);
    expect(pestana.codigo).not.toContain("35392");
    expect(pestana.codigo).not.toContain("35,392");
  });

  /**
   * 🔴 Y NO se arregla encendiendo el sync: los cobros de Boston están fuera de
   * este sistema a propósito (`recibos: false`). La pestaña no lee recibos.
   */
  it("la pestaña no empieza a leer recibos de Boston", () => {
    expect(pestana.codigo).not.toMatch(/switch_recibos|\/api\/cron\/sync-recibos/);
  });
});

describe("la cuadrícula de píldoras no queda con un hueco", () => {
  const pestana = FUENTES.find((f) => f.rel === LA_PESTANA)!;

  /**
   * (d) Al sacar un elemento, `grid-cols-3` con 4 píldoras deja 3 arriba y una
   * sola abajo con dos celdas vacías. Las columnas tienen que repartir las
   * píldoras EXACTO en los dos anchos.
   */
  it("las columnas reparten las píldoras exacto en celular y desde iPad", () => {
    const bloque = pestana.codigo.match(/const pills = \[([\s\S]*?)\n\s*\];/);
    expect(bloque, "no encontré el arreglo `pills` — ¿cambió de nombre?").toBeTruthy();
    const cuantas = (bloque![1].match(/\bkey:/g) ?? []).length;
    expect(cuantas).toBeGreaterThan(0);

    const clases = pestana.codigo.match(
      /className="grid grid-cols-(\d+) sm:grid-cols-(\d+)/,
    );
    expect(clases, "no encontré la cuadrícula de píldoras").toBeTruthy();
    const [celular, ipad] = [Number(clases![1]), Number(clases![2])];

    expect(
      ipad,
      `Desde iPad las ${cuantas} píldoras van en UNA línea: sm:grid-cols-${cuantas}.`,
    ).toBe(cuantas);
    expect(
      cuantas % celular,
      `En celular ${cuantas} píldoras en ${celular} columnas dejan ${celular - (cuantas % celular)} celda(s) vacía(s) en la última fila.`,
    ).toBe(0);
  });

  /**
   * Todas las píldoras de la fila FILTRAN. La que sobraba era justamente la que
   * no: un `<div>` suelto entre botones, que se veía igual y no hacía nada.
   */
  it("todo lo que está en la fila es un botón que filtra", () => {
    // La fila se dibuja SOLO con el map de `pills`; nada suelto al lado.
    const fila = pestana.codigo.match(
      /className="grid grid-cols-\d+ sm:grid-cols-\d+[^"]*">([\s\S]*?)\n      <\/div>/,
    );
    expect(fila, "no encontré el cuerpo de la fila de píldoras").toBeTruthy();
    const cuerpo = fila![1];

    expect(cuerpo).toContain("pills.map(");
    expect(
      (cuerpo.match(/<div\b/g) ?? []).length,
      "Hay un elemento suelto en la fila de píldoras. Si no filtra, no va acá: al lado de cuatro cifras vivas, una tarjeta muda se lee como un dato más.",
    ).toBe(0);
    // El único botón es el de la píldora, y lleva su estado de filtro.
    expect(cuerpo).toMatch(/aria-pressed=\{activa\}/);
    expect(cuerpo).toMatch(/onClick=\{\(\) => tocarPildora\(p\.key\)\}/);
  });
});
