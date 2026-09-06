// ─────────────────────────────────────────────────────────────────────────────
// CANDADO: Referencia se ve UNA sola vez — el módulo /referencia — y NO puede
// volver a ser la 5ª pestaña de /ventas.
//
// 🩸 EL PROBLEMA QUE ESTE ARCHIVO EXISTE PARA QUE NO VUELVA: la MISMA pantalla
// estaba en dos lugares (la pestaña de Ventas, solo admin, y el módulo del menú
// para admin+vendedor+bodega). No eran dos copias de código —`ReferenciaView`
// siempre fue una sola— pero sí dos puertas para lo mismo, y la de Ventas era
// la que menos gente podía usar. Daniel: *"dejar solo la del menú y quitar la
// pestaña de Ventas"*.
//
// Se vigilan las DOS direcciones, y la segunda importa tanto como la primera:
//   (a) la pestaña no vuelve a /ventas, y
//   (b) /referencia sigue VIVA — con su vista, sus 3 roles y su entrada de menú.
//      Quitar la pestaña y llevarse la pantalla por delante sería mucho peor que
//      el duplicado que se vino a arreglar.
//
// Y el enlace viejo: `/ventas?tab=referencia` REDIRIGE a /referencia. Sin eso,
// un favorito guardado caía en una pestaña que ya no existe y Radix, con un
// `value` sin trigger, no dibuja NADA: pantalla en blanco, sin error.
//
// ⚠️ 25-ago-2026 — HUBO otra vez una 5ª pestaña, y no era ésta: Ventas ganó
// **Comisiones**.
//
// 🔁 5-sep-2026 — LA TIRA VOLVIÓ A **TRES**: Resumen · Clientes · Productos.
// «Comisiones» se fue a su módulo (Daniel: *«si quitala»*) y «Utilidad» pasó a
// ser un MODO de Clientes. Este archivo NO se aflojó en lo suyo —Referencia
// sigue sin poder volver y /referencia sigue viva—; lo que cambió es el número
// y los nombres de la tira, y el motivo está escrito en cada aserción que se
// movió. Lo nuevo vive en `ventas-tres-pestanas.test.tsx`.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "fs";
import path from "path";
import { REFERENCIA_ROLES } from "@/lib/ventas/referencia";
import { TABS_VENTAS, esTabVentas } from "@/lib/ventas/pestanas";

const raiz = path.resolve(__dirname, "../../..");
const src = path.join(raiz, "src");
const read = (p: string) => readFileSync(p, "utf8");

const shell = read(path.join(src, "app/ventas/VentasShell.tsx"));
const nextConfig = read(path.join(raiz, "next.config.js"));
const modulos = read(path.join(src, "lib/modules.ts"));

describe("la pestaña Referencia NO vuelve a /ventas", () => {
  it("el shell no monta ningún trigger, contenido ni import de Referencia", () => {
    expect(shell).not.toContain('value="referencia"');
    expect(shell).not.toContain("ReferenciaView");
    expect(shell).not.toContain("ScanSearch");
    // La rama que escondía el botón Excel en ese tab también se fue: si quedara,
    // sería la firma de que alguien piensa volver a montarla.
    expect(shell).not.toContain('tab !== "referencia"');
    // (La palabra sí aparece en el comentario que explica el redirect del enlace
    // viejo — eso es documentación, no una pestaña montada.)
  });

  it("la tira tiene EXACTAMENTE 3 pestañas, nombradas una por una", () => {
    // Una lista literal y no un `toContain`: si mañana aparece una cuarta sin
    // que nadie la haya decidido, el build se pone rojo. Y "referencia" no está.
    // 🔁 Eran cinco hasta el 5-sep-2026 (ver la cabecera).
    const tira = shell.slice(shell.indexOf("<TabsList"), shell.indexOf("</TabsList>"));
    const valores = [...tira.matchAll(/<TabsTrigger value="([a-z]+)"/g)].map((m) => m[1]);
    expect(valores).toEqual(["resumen", "clientes", "productos"]);

    // Un <TabsContent> huérfano (contenido sin pestaña que lo abra) es código
    // muerto que nadie puede ver: los dos lados tienen que coincidir.
    const contenidos = [...shell.matchAll(/<TabsContent value="([a-z]+)"/g)].map((m) => m[1]);
    expect(contenidos).toEqual(valores);
  });

  it("la lista TABS (la que valida el ?tab=) dice lo mismo que la tira", () => {
    // 🔁 5-sep-2026: la lista se mudó de `VentasShell` a `lib/ventas/pestanas.ts`
    // — un módulo puro. El motivo: `ClientesView` necesita la lista de modos y
    // el shell monta a `ClientesView` (import circular esperando), y un candado
    // que tiene que montar la pantalla entera para preguntar «¿a dónde va
    // `?tab=utilidad`?» es un candado que se salta cuando molesta.
    expect([...TABS_VENTAS]).toEqual(["resumen", "clientes", "productos"]);

    const tira = shell.slice(shell.indexOf("<TabsList"), shell.indexOf("</TabsList>"));
    const valores = [...tira.matchAll(/<TabsTrigger value="([a-z]+)"/g)].map((m) => m[1]);
    expect(valores).toEqual([...TABS_VENTAS]);
  });

  it("un ?tab= desconocido cae en la pestaña por defecto, nunca en blanco", () => {
    // Misma convención que /admin, /asistencia y el Depurador. Sin este filtro,
    // `?tab=loquesea` deja el Tabs con un value sin trigger → pantalla vacía.
    // 🔁 El filtro pasó a ser `esTabVentas` (la misma lista, con nombre).
    expect(esTabVentas("loquesea")).toBe(false);
    expect(esTabVentas("clientes")).toBe(true);
    expect(shell).toContain('esTabVentas(tabRaw) ? tabRaw : "resumen"');
    // Y el tab sigue viviendo en la URL (no se volvió useState con el cambio).
    expect(shell).toContain('useUrlState("tab"');
    expect(shell).not.toMatch(/\[tab(?:Raw)?, setTab\] = useState/);
  });

  it("con 3 pestañas la tira sigue entrando en 390 sin arrastrar nada", () => {
    const clase = /const TAB_TRIGGER_CLASS =\s*\n?\s*"([^"]+)"/.exec(shell);
    expect(clase).not.toBeNull();
    // 🩸 Con CINCO pestañas la tira pedía más de 390 px y la PÁGINA se iba para
    // el costado; por eso la letra baja a 13 px y el relleno a `px-2` bajo `sm`.
    // 🔁 Con TRES sobra ancho y aun así NO se revirtió nada (5-sep-2026):
    // devolverle el relleno grande sería volver a acercarse al borde por gusto,
    // en la pantalla donde Daniel de verdad la usa. Desde `sm` no cambia un
    // píxel, como siempre.
    expect(clase![1]).toContain("px-2 ");
    expect(clase![1]).toContain("sm:px-4");
    expect(clase![1]).toContain("text-[13px]");
    expect(clase![1]).toContain("sm:text-sm");

    const tira = shell.slice(shell.indexOf("<TabsList"), shell.indexOf("</TabsList>"));
    // 🔴 EL ICONO SIGUE ESCONDIDO BAJO `sm`, Y NO ES UN OLVIDO. Medido a 390 px
    // con cuatro pestañas: con icono suman 395 px y la tira arrastra 6; sin
    // icono, 315 y arrastra 0. Cada icono cuesta 20 px y ningún relleno los
    // devuelve. Es decorativo: el texto dice lo mismo.
    // 🔁 Son TRES desde el 5-sep-2026 (eran cinco).
    expect(tira.match(/hidden h-3\.5 w-3\.5 sm:block/g)?.length ?? 0).toBe(3);
    // Y lo que NO puede volver: la tira no scrollea a lo ancho (54 px de #375).
    // El objetivo sigue siendo que no haya NADA que arrastrar — ni la página ni
    // la tira—, no mover el arrastre de lugar.
    expect(tira).not.toContain("overflow-x-auto");
  });
});

describe("el enlace viejo /ventas?tab=referencia lleva a /referencia", () => {
  it("next.config.js tiene el redirect, acotado a ese valor de tab", () => {
    const bloque = nextConfig.slice(
      nextConfig.indexOf("async redirects()"),
      nextConfig.indexOf("experimental:"),
    );
    expect(bloque).toContain('source: "/ventas"');
    expect(bloque).toContain('has: [{ type: "query", key: "tab", value: "referencia" }]');
    expect(bloque).toContain('destination: "/referencia"');
    // Temporal (307), como los otros del archivo: no se quema en el caché del
    // navegador si algún día se decide otra cosa.
    const trozo = bloque.slice(bloque.indexOf('source: "/ventas"'));
    expect(trozo).toContain("permanent: false");
  });

  it("/ventas sin ese tab NO se redirige (las otras pestañas siguen abriendo)", () => {
    // Un redirect de `/ventas` a secas (sin `has`) apagaría el módulo entero.
    expect(nextConfig).not.toMatch(/\{\s*source:\s*"\/ventas",\s*destination:/);
  });
});

describe("/referencia sigue siendo la pantalla viva", () => {
  const pageRel = "app/referencia/page.tsx";
  const clientRel = "app/referencia/ReferenciaClient.tsx";
  const vistaRel = "components/ventas/ReferenciaView.tsx";

  it("los tres archivos existen", () => {
    for (const rel of [pageRel, clientRel, vistaRel]) {
      expect(existsSync(path.join(src, rel))).toBe(true);
    }
  });

  it("la ruta abre para admin, vendedor y bodega — con la lista ÚNICA", () => {
    // 4-sep-2026: la lista dejó de estar escrita en esta página. Vive en
    // `REFERENCIA_ROLES` y la comparten los tres lugares (página, búsqueda y el
    // botón «Actualizar datos de Switch»), porque tres copias a mano fue lo que
    // dejó el POST del botón en solo-admin mientras la pantalla estaba abierta.
    const page = read(path.join(src, pageRel));
    expect(page).toContain("REFERENCIA_ROLES");
    expect(page).toContain("REFERENCIA_ROLES.includes(role)");
    expect(page).toContain("redirect(\"/home\")");
    expect([...REFERENCIA_ROLES]).toEqual(["admin", "vendedor", "bodega"]);
  });

  it("la pantalla REUSA ReferenciaView (no una copia)", () => {
    const client = read(path.join(src, clientRel));
    expect(client).toContain('from "@/components/ventas/ReferenciaView"');
    expect(client).toContain("<ReferenciaView />");
  });

  it("el módulo del menú sigue en su grupo con los 3 roles", () => {
    const linea = modulos
      .split("\n")
      .find((l) => l.includes('key: "referencia"'));
    expect(linea).toBeDefined();
    expect(linea!).toContain('href: "/referencia"');
    expect(linea!).toContain('roles: ["admin", "vendedor", "bodega"]');
    expect(linea!).toContain('group: "ventas-clientes"');
  });
});
