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
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "fs";
import path from "path";

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

  it("la tira tiene EXACTAMENTE 4 pestañas, y son las cuatro de siempre", () => {
    const tira = shell.slice(shell.indexOf("<TabsList"), shell.indexOf("</TabsList>"));
    const valores = [...tira.matchAll(/<TabsTrigger value="([a-z]+)"/g)].map((m) => m[1]);
    expect(valores).toEqual(["resumen", "clientes", "productos", "utilidad"]);

    // Un <TabsContent> huérfano (contenido sin pestaña que lo abra) es código
    // muerto que nadie puede ver: los dos lados tienen que coincidir.
    const contenidos = [...shell.matchAll(/<TabsContent value="([a-z]+)"/g)].map((m) => m[1]);
    expect(contenidos).toEqual(valores);
  });

  it("la lista TABS (la que valida el ?tab=) dice lo mismo que la tira", () => {
    const m = /const TABS = \[([^\]]+)\]/.exec(shell);
    expect(m).not.toBeNull();
    const declarados = [...m![1].matchAll(/"([a-z]+)"/g)].map((x) => x[1]);
    expect(declarados).toEqual(["resumen", "clientes", "productos", "utilidad"]);
  });

  it("un ?tab= desconocido cae en la pestaña por defecto, nunca en blanco", () => {
    // Misma convención que /admin, /asistencia y el Depurador. Sin este filtro,
    // `?tab=loquesea` deja el Tabs con un value sin trigger → pantalla vacía.
    expect(shell).toContain("TABS.some((t) => t === tabRaw) ? tabRaw : \"resumen\"");
    // Y el tab sigue viviendo en la URL (no se volvió useState con el cambio).
    expect(shell).toContain('useUrlState("tab"');
    expect(shell).not.toMatch(/\[tab(?:Raw)?, setTab\] = useState/);
  });

  it("con 4 pestañas se revirtió lo que se PUDO del apretujamiento de la 5ª", () => {
    const clase = /const TAB_TRIGGER_CLASS =\s*\n?\s*"([^"]+)"/.exec(shell);
    expect(clase).not.toBeNull();
    // La letra vuelve al text-sm del sistema (la 5ª la había bajado a 13 px) y
    // el relleno de celular al px-2.5 medido en #375.
    expect(clase![1]).toContain("px-2.5");
    expect(clase![1]).not.toContain("text-[13px]");
    expect(clase![1]).not.toContain("sm:text-sm");

    const tira = shell.slice(shell.indexOf("<TabsList"), shell.indexOf("</TabsList>"));
    // 🔴 EL ICONO SIGUE ESCONDIDO BAJO `sm`, Y NO ES UN OLVIDO. Medido a 390 px
    // con las cuatro pestañas: con icono suman 395 px y la tira arrastra 6; sin
    // icono, 315 y arrastra 0. Cada icono cuesta 20 px (80 en total) y ningún
    // relleno los devuelve — px-1.5 recupera 32 y encima aprieta. Es decorativo:
    // el texto de la pestaña dice exactamente lo mismo.
    expect(tira.match(/hidden h-3\.5 w-3\.5 sm:block/g)?.length ?? 0).toBe(4);
    // Y lo que NO puede volver: la tira no scrollea a lo ancho (54 px de #375).
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

  it("/ventas sin ese tab NO se redirige (las otras 4 pestañas siguen abriendo)", () => {
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

  it("la ruta abre para admin, vendedor y bodega", () => {
    const page = read(path.join(src, pageRel));
    expect(page).toContain('const ROLES_REFERENCIA = ["admin", "vendedor", "bodega"]');
    expect(page).toContain("redirect(\"/home\")");
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
