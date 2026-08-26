/**
 * ─────────────────────────────────────────────────────────────────────────────
 * LA FILA DE LA LISTA NO PUEDE APLASTAR UNA COLUMNA A CERO.
 *
 * 🩸 A 834 px (iPad vertical) el transportista medía **0 px** y el resumen de
 * clientes **5 px**: «Edwin» y «Entrega directa» se veían como una sola letra.
 * Las 15 filas de la primera pantalla, las 15 rotas. A 1024 el transportista
 * medía 35 px, que es lo mismo con otro número.
 *
 * 🔑 LA CAUSA — la misma que `FormulasConfig` (#639): columnas de ANCHO FIJO
 * que suman más que el hueco, y la única elástica declarada `flex-1`
 * (= `flex: 1 1 0%`). Con base 0 su tamaño sale del espacio SOBRANTE; cuando no
 * sobra nada NO se queda corta, se va a CERO — y el `truncate`
 * (`overflow-hidden`) le saca el piso de `min-width:auto` que la salvaría.
 *
 * ⚠️ ESTE ARCHIVO NO REEMPLAZA LA MEDICIÓN. El ancho real se mide en el
 * navegador con `scripts/_medir-guias-lista-834-y-buscador.mjs`, porque jsdom
 * no hace layout. Acá se congela la ARITMÉTICA y la FORMA que producen ese
 * resultado, que sí se pueden leer del fuente.
 *
 * ⚠️ EL BARRIDO VA SOBRE EL CÓDIGO SIN COMENTARIOS. En este repo ya pasó cuatro
 * veces que un candado de texto se cumpliera con el comentario que explicaba el
 * cambio — y acá arriba mismo está escrito `flex-1`.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const sinComentarios = (src: string) =>
  src
    .replace(/\{?\/\*[\s\S]*?\*\/\}?/g, "")
    .split("\n")
    .filter((l) => !l.trim().startsWith("//"))
    .join("\n");

const LISTA = sinComentarios(readFileSync(join(process.cwd(), "src/app/guias/components/GuiasList.tsx"), "utf8"));
const SIDEBAR = readFileSync(join(process.cwd(), "src/components/Sidebar.tsx"), "utf8");

/** La fila de escritorio, desde su `<div` hasta el cierre del bloque. */
const FILA = LISTA.slice(LISTA.indexOf('<div className="hidden lg:'), LISTA.indexOf('<div className="lg:hidden'));

describe("🔴 el corte tarjeta/fila está en `lg:`, no en `md:`", () => {
  it("la fila de escritorio empieza en lg y la tarjeta manda por debajo", () => {
    expect(LISTA).toContain('<div className="hidden lg:flex');
    expect(LISTA).toContain('<div className="lg:hidden px-4 py-3"');
  });

  it("🔴 y no vuelve a `md:` — ahí es donde el iPad vertical se rompía", () => {
    expect(LISTA).not.toContain('className="hidden md:flex items-center');
    expect(LISTA).not.toContain('className="md:hidden px-4 py-3"');
  });

  it("la aritmética de por qué 834 NO puede llevar la fila", () => {
    // La barra lateral es fija desde `md:` y se come 224 px.
    expect(SIDEBAR).toMatch(/const width = collapsed \? "w-16" : "w-56"/);
    expect(SIDEBAR).toContain("hidden md:flex fixed left-0");
    const BARRA = 224;
    const PADDING = 48;
    // Lo que queda a 834 no alcanza ni para las columnas FIJAS de la fila:
    //   n° 64 + fecha 112 + bultos 80 + estado 96 + flecha 16 = 368
    //   + 6 huecos de 12 = 72 + 32 de padding = 472
    // …y todavía faltan las DOS columnas de texto y hasta 250 px de chips.
    const disponible834 = 834 - BARRA - PADDING;
    expect(disponible834).toBe(562);
    const FIJAS = 368 + 72 + 32;
    expect(FIJAS).toBe(472);
    // Con 90 px para repartir entre transportista y clientes, no hay fila
    // posible: por eso a 834 manda la tarjeta.
    expect(disponible834 - FIJAS).toBeLessThan(120);
    // A 1024 sí sobra lo suficiente para las dos.
    expect(1024 - BARRA - PADDING - FIJAS).toBeGreaterThanOrEqual(280);
  });
});

describe("🔴 las columnas de texto tienen base propia: ninguna puede valer 0", () => {
  it("transportista y clientes reparten el sobrante, en vez de `flex-1` + ancho fijo", () => {
    expect(FILA).toContain("flex-[3_1_0]");
    expect(FILA).toContain("flex-[2_1_0]");
    // 🔴 `flex-1` es EXACTAMENTE el defecto: base 0 y nada que la sostenga.
    expect(FILA).not.toMatch(/className="flex-1 truncate"/);
    // Y el resumen de clientes ya no lleva ancho fijo.
    expect(FILA).not.toContain("w-40");
  });

  it("las dos truncan hacia adentro en vez de empujar la fila", () => {
    // Sin `min-w-0` un hijo de flex no baja de su contenido y la fila se
    // desborda: volvería el arrastre horizontal de la página.
    expect((FILA.match(/min-w-0 truncate/g) ?? []).length).toBe(2);
  });

  it("las clases van escritas COMPLETAS: Tailwind escanea texto, no evalúa", () => {
    // Un `flex-[${n}_1_0]` compila en TS y no genera NINGUNA clase: la columna
    // se quedaría sin base y volvería el cero. Se miran las dos celdas, no la
    // fila entera (la flecha sí lleva una interpolación, y está bien).
    const celdas = FILA.split("\n").filter((l) => /flex-\[\d_1_0\]/.test(l));
    expect(celdas).toHaveLength(2);
    for (const c of celdas) expect(c, c.trim()).not.toContain("${");
  });

  it("y lo que sí es de ancho fijo se aprieta entre lg y xl", () => {
    expect(FILA).toContain("w-28 xl:w-36");   // fecha
    expect(FILA).toContain("w-20 xl:w-24");   // bultos
    expect(LISTA).toContain("gap-3 xl:gap-4");
  });
});

describe("🔴 nada de esto reabre lo que se cerró esta semana", () => {
  it("el nombre del cliente se sigue diciendo UNA sola vez (#638)", () => {
    // El resumen de clientes sale una vez en la fila y una vez en la tarjeta,
    // y son layouts EXCLUYENTES: nunca los dos a la vez.
    expect((LISTA.match(/clientesSummary\(g\.guia_items \|\| \[\]\)/g) ?? []).length).toBe(3);
    expect(FILA.match(/clientesSummary/g)).toHaveLength(1);
  });
});
