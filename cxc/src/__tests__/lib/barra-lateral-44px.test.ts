/**
 * Candado de la BARRA LATERAL a 44 px — y de que las filas SIGAN ENTRANDO.
 *
 * 🩸 POR QUÉ EXISTE. La barra aportaba los 26 últimos controles bajo 44 px del
 * sistema: 20 enlaces de módulo de **223×32**, 3 encabezados de grupo de
 * **223×41**, el logo 127×22, el colapsar 22×22 y el salir 22×22. Sale en las
 * 54 pantallas, así que cada píxel que falte acá se multiplica por toda la app.
 * Daniel lo aprobó sabiendo el costo: *"si vale la pena si"*.
 *
 * **EL RIESGO NO ERA PONER `min-h-[44px]`: ERA QUE DEJARAN DE ENTRAR.** Un
 * módulo que queda fuera de la vista y no se puede alcanzar es PEOR que un
 * target chico — es el mismo bug que se barrió todo el día en 12 pantallas.
 *
 * 🩸 LA MEDICIÓN QUE CAMBIÓ EL DIAGNÓSTICO. El primer barrido dijo "el nav
 * ocupa 1076 de 1076 px disponibles", o sea entra JUSTO y no cabe ni una fila
 * más. Eran dos errores de medición encima:
 *   1. `scrollHeight` NUNCA baja de `clientHeight`, así que un nav con 504 px
 *      de filas dentro de una caja de 1076 reporta 1076 y parece lleno. El alto
 *      real va de la primera fila a la última, más el padding.
 *   2. El acordeón es **EXCLUSIVO** (un grupo abierto a la vez) y los cerrados
 *      se esconden con `grid-template-rows: 0fr` + `overflow-hidden`. Los
 *      enlaces de adentro conservan su rect de 223×32 y su `opacity` computada
 *      vale 1 (la del padre no se hereda), así que un chequeo de visibilidad
 *      ingenuo contaba los 19 enlaces cuando en pantalla hay 7, 10 ó 2.
 *
 * Con las dos cosas corregidas, el peor caso real (grupo "Operación", 10
 * módulos) medía **504 px**, no 1076. Medido en el navegador contra el build de
 * producción (`scripts/_medir-barra-lateral.mjs`):
 *
 *   alto del contenido del nav (peor grupo)     504 → 641 px   (+137)
 *   controles bajo 44 px (peor caso)             17 → 0
 *   módulos inalcanzables                         0 → 0
 *
 *   espacio disponible      antes    después
 *   iPad 834×1194            1076     entra, sobran 435
 *   iPad 1024×1194           1076     entra, sobran 435
 *   escritorio 1440×900       782     entra, sobran 141
 *   1440×700 (ventana baja)   582     SCROLLEA +59, 0 inalcanzables
 *   1440×560 (peor caso)      442     SCROLLEA, 0 inalcanzables
 *
 * O sea: **no hizo falta comprimir nada**. Ni juntar las filas, ni achicar los
 * encabezados de grupo, ni sacar el separador. La barra ya tenía el aire; lo
 * que no se tenía era la medición.
 *
 * **El nav scrollea SOLO en ventanas de menos de ~760 px de alto**, y ahí no
 * recorta: `scripts/_verif-barra-alcanzable.mjs` scrollea el nav hasta el fondo
 * y exige que CADA módulo del grupo abierto llegue a ser visible **y con 44 px
 * de alto**, contra la lista real de módulos del grupo (no contra los que se
 * ven, que sería circular). 15 combinaciones ancho×alto×grupo, todas en verde.
 *
 * ⚠️ **LOS ENCABEZADOS DE GRUPO SÍ SON TOCABLES.** Parecen títulos pero son los
 * `<button aria-expanded>` que abren el acordeón: van a 44 como todo lo demás.
 * Lo que NO se agrandó por cumplir un número fue el rail COLAPSADO — ver abajo.
 *
 * Son assertions sobre el fuente a propósito: jsdom no calcula layout. Se
 * congela la CAUSA; la medición vive en los dos scripts.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const src = join(__dirname, "..", "..");
const read = (...p: string[]) => readFileSync(join(src, ...p), "utf8");

const sidebar = read("components", "Sidebar.tsx");
const periodoHeader = read("app", "caja", "components", "PeriodoDetailHeader.tsx");
const nuevoGasto = read("app", "caja", "[periodoId]", "nuevo", "page.tsx");
const periodoList = read("app", "caja", "components", "PeriodoList.tsx");

const veces = (t: string, re: RegExp) => (t.match(re) ?? []).length;

describe("Barra lateral · todo lo que se toca llega a 44 px", () => {
  it("los enlaces de módulo del acordeón (medían 223×32)", () => {
    expect(sidebar).toContain('w-full flex min-h-[44px] items-center gap-2.5 pl-12 pr-5 text-[13px]');
    expect(sidebar).not.toContain("gap-2.5 pl-12 pr-5 py-1.5");
  });

  it("los encabezados de grupo, expandido y colapsado (medían 223×41 y 64×41)", () => {
    // expandido: es el <button> que abre el acordeón, no un título
    expect(sidebar).toContain('w-full flex min-h-[44px] items-center gap-3 px-5 text-sm transition-all border-l-2 border-l-transparent');
    // rail colapsado
    expect(sidebar).toContain('w-full flex min-h-[44px] items-center justify-center px-0 text-sm transition-all border-l-2');
    expect(sidebar).not.toContain("px-0 py-2.5 text-sm transition-all");
  });

  it('el enlace "Inicio" (medía 223×41)', () => {
    expect(sidebar).toMatch(/w-full flex min-h-\[44px\] items-center \$\{collapsed \? "justify-center px-0" : "gap-3 px-5"\}/);
  });

  it("los enlaces del flyout del rail colapsado", () => {
    expect(sidebar).toContain('w-full flex min-h-[44px] items-center gap-2.5 px-3 text-[13px]');
    expect(sidebar).not.toContain("gap-2.5 px-3 py-1.5 text-[13px]");
  });

  it('el logo y el "Cerrar sesión" del pie (medían 127×22 y 22×22)', () => {
    expect(sidebar).toContain('flex min-h-[44px] items-center gap-2 hover:opacity-70');
    expect(sidebar).toContain("inline-flex h-11 w-11 flex-shrink-0 items-center justify-center text-gray-300 hover:text-red-500");
    expect(sidebar).not.toContain("hover:text-red-500 transition p-1 flex-shrink-0");
  });

  it("ninguna fila del nav vuelve a apoyarse en py-1.5 / py-2.5 para su alto", () => {
    // Es la causa exacta de los 32 y los 41 px. `min-h` es lo que garantiza el
    // piso aunque el contenido sea un ícono de 16.
    expect(sidebar).not.toMatch(/py-1\.5 text-\[13px\]/);
    expect(sidebar).not.toMatch(/py-2\.5 text-sm transition-all/);
  });
});

describe("Barra lateral · lo que NO se agrandó, y por qué", () => {
  it("el colapsar es 44×44 SOLO expandida — en un rail de 64 px no entran dos", () => {
    // Medido: colapsada la barra mide 64 y con `px-1.5` quedan 52 útiles; el
    // logo (22) más un botón de 44 dan 66. El ALTO sí llega a 44 en los dos
    // estados porque la fila del encabezado mide 57.
    expect(sidebar).toMatch(/inline-flex min-h-\[44px\] items-center justify-center text-gray-400 hover:text-gray-700 rounded transition \$\{\s*collapsed \? "w-8" : "w-11"/);
  });

  it("el ancho de la barra no cambió: 56 expandida, 16 colapsada", () => {
    // Agrandar filas es vertical. Si alguien toca el ancho, el cálculo de
    // "ancho útil" de TODOS los módulos (224 px menos) deja de valer.
    expect(sidebar).toContain('const width = collapsed ? "w-16" : "w-56"');
  });

  it("el nav sigue pudiendo scrollear — es lo que evita que un módulo quede fuera", () => {
    expect(sidebar).toContain('<nav className="flex-1 overflow-y-auto py-2">');
  });
});

describe("Caja · los 2 enlaces de volver (medían 70×18 y 71×18)", () => {
  // Los reporté como "migas de AppHeader" y estaba EQUIVOCADO: son enlaces
  // propios de Caja. Las migas de verdad ya se arreglaron en #377.
  it('"‹ Períodos" del detalle del período', () => {
    expect(periodoHeader).toContain('inline-flex min-h-[44px] items-center gap-1 text-xs mb-1 -mt-2');
    expect(periodoHeader).not.toContain('inline-flex items-center gap-1 text-xs mb-4');
  });

  it('"‹ Cancelar" del formulario de nuevo gasto', () => {
    expect(nuevoGasto).toContain('inline-flex min-h-[44px] items-center gap-1 text-xs mb-2 -mt-2');
    expect(nuevoGasto).not.toContain('inline-flex items-center gap-1 text-xs mb-5');
  });

  it('"Imprimir" y "Cerrar" de la fila del período (medían 68×28 y 57×28)', () => {
    // Entran gratis: la fila ya declara `minHeight: 56`.
    expect(veces(periodoList, /caja-row-action inline-flex min-h-\[44px\] items-center text-xs px-2 rounded-md/g)).toBe(2);
    expect(periodoList).not.toContain("caja-row-action text-xs px-2 h-7");
  });
});
