// ============================================================================
// CANDADO — MARKETING, LA VISTA DE TIENDA Y EL BUSCADOR (22-sep-2026).
//
// Daniel: *«debería estar organizado: ver por cliente, busco el cliente o
// proyecto y ver adentro la info (por marca etc.)»*.
//
// Lo que este archivo no deja aflojar:
//
//   1. LA VISTA AGRUPA POR MARCA Y EL TOTAL ES SOLO DE LO REPORTADO. Lo
//      apagado se ve y NO suma, ni en la marca ni en el total de la tienda.
//   2. LA TIENDA SE RESUELVE POR CÓDIGO, NUNCA POR NOMBRE — la misma regla
//      del CXC y del Directorio. La lectura pregunta `clientes_master.codigo`
//      y en ningún lado une por `nombre`.
//   3. «NOVA» NO TRAE «RENOVACIÓN». El texto se compara por PALABRA; el
//      número de factura sigue por subcadena, y eso está medido.
//   4. EL RESULTADO DE ⌘K APUNTA A `/marketing/tienda/<código>`, y esa
//      dirección se escribe en UN SOLO LUGAR (`vista-tienda.ts`).
//   5. EL INTERRUPTOR EN `false` = NADA CAMBIA: la pantalla no existe, las
//      rutas contestan 404, la búsqueda global no ofrece Marketing y el
//      buscador de proyectos vuelve a su `includes`.
//
// MEDIDO CONTRA PRODUCCIÓN el 22-sep-2026 (solo lectura, por REST):
//   · 25 proyectos. Con `includes`, «nova» traía 2 (Nova Lux **y**
//     Renovación) y «d» traía 21 de 25. Por palabra: 1 y 6. Los otros 12
//     términos probados dan EXACTAMENTE lo mismo con las dos reglas.
//   · 108 facturas, 79 con ceros a la izquierda («0000064948»): buscar
//     «64948» por palabra no encontraría nada — por eso el número se queda
//     por subcadena (4 de 5 números probados quedaban en cero).
//   · 17 tiendas con gasto + el cajón «General». D-24 suma $37.460,92, que
//     es exactamente lo que muestra hoy «Reportes por tienda».
// ============================================================================
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

import {
  CODIGO_GENERAL,
  VISTA_TIENDA,
  agruparPorMarca,
  esCodigoGeneral,
  hrefDeTienda,
  rotuloDeFila,
  rotuloDeLaTienda,
  rotuloDelPeriodo,
  totalDeLaTienda,
  type FilaDeTienda,
} from "@/lib/marketing/vista-tienda";
import { ROTULO_DE_TIPO, TIENDA_GENERAL } from "@/lib/marketing/gasto";
import {
  algunoCoincidePorPalabra,
  coincidePorPalabra,
  coincideSubcadena,
  normalizarBusqueda,
} from "@/lib/search/texto";
import { buscarTiendas, hrefDelResultado } from "@/lib/search/marketing";

const RAIZ = path.resolve(__dirname, "../../..");
const leer = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), "utf8");
function sinComentarios(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, " ")
    .replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
}
const codigo = (rel: string) => sinComentarios(leer(rel));

const RUTA_DATOS = "src/app/api/marketing/tienda/[codigo]/datos.ts";
const RUTA_API = "src/app/api/marketing/tienda/[codigo]/route.ts";
const RUTA_FOTOS = "src/app/api/marketing/tienda/[codigo]/fotos/route.ts";
const RUTA_PAGINA = "src/app/marketing/tienda/[codigo]/page.tsx";
// 23-sep-2026 · NOTA FECHADA — `VistaTienda.tsx` pasó a ser el envoltorio
// (la sesión y el interruptor `MARKETING_TIENDAS_Y_MARCAS`); las DOS pantallas
// que dibujan la plata son la de antes (`VistaTiendaAnterior.tsx`, una tabla
// por marca) y la ficha nueva (`FichaTienda.tsx`, una sola lista). La regla
// —no sumar por su cuenta— se exige en las dos.
const RUTAS_VISTA = [
  "src/app/marketing/tienda/[codigo]/VistaTiendaAnterior.tsx",
  "src/app/marketing/tienda/[codigo]/FichaTienda.tsx",
];
const RUTA_BUSCADOR = "src/app/api/search/route.ts";
const RUTA_SEARCHBAR = "src/components/SearchBar.tsx";
const RUTA_PROYECTOS = "src/app/api/marketing/proyectos-lista/route.ts";
const RUTA_FOTOS_SECTION = "src/app/marketing/components/FotosSection.tsx";

function fila(over: Partial<FilaDeTienda> = {}): FilaDeTienda {
  return {
    id: "1",
    tipo: "factura",
    marcaCodigo: "TH",
    marcaNombre: "Tommy Hilfiger",
    proveedor: "Impresora Comercial",
    detalle: "N° 0000064948",
    monto: 100,
    fecha: "2026-06-01",
    seReporta: true,
    estadoPeriodo: "abierto",
    periodoNombre: "Período 2026",
    ...over,
  };
}

// ─── 1. AGRUPA POR MARCA, Y EL TOTAL EXCLUYE LO NO REPORTADO ────────────────

describe("1. la vista agrupa por marca y el total es solo de lo reportado", () => {
  it("junta las filas de cada marca y no mezcla dos marcas en un grupo", () => {
    const grupos = agruparPorMarca([
      fila({ id: "a", marcaCodigo: "TH", marcaNombre: "Tommy Hilfiger", monto: 100 }),
      fila({ id: "b", marcaCodigo: "CK", marcaNombre: "Calvin Klein", monto: 300 }),
      fila({ id: "c", marcaCodigo: "TH", marcaNombre: "Tommy Hilfiger", monto: 50 }),
    ]);
    expect(grupos.map((g) => g.marcaCodigo)).toEqual(["CK", "TH"]); // más plata primero
    expect(grupos.find((g) => g.marcaCodigo === "TH")!.filas).toHaveLength(2);
    expect(grupos.find((g) => g.marcaCodigo === "CK")!.filas).toHaveLength(1);
  });

  it("un gasto apagado SE VE pero NO suma en su marca", () => {
    const grupos = agruparPorMarca([
      fila({ id: "a", monto: 100, seReporta: true }),
      fila({ id: "b", monto: 900, seReporta: false }),
    ]);
    const th = grupos[0];
    expect(th.filas).toHaveLength(2); // se ve
    expect(th.totales.reportado).toBe(100); // no suma
    expect(th.totales.noReportado).toBe(900);
    expect(th.totales.cantidadNoReportada).toBe(1);
  });

  it("el total de la tienda es la SUMA DE LO REPORTADO de sus marcas", () => {
    const grupos = agruparPorMarca([
      fila({ id: "a", marcaCodigo: "TH", monto: 100 }),
      fila({ id: "b", marcaCodigo: "CK", marcaNombre: "Calvin Klein", monto: 250.5 }),
      fila({ id: "c", marcaCodigo: "CK", marcaNombre: "Calvin Klein", monto: 1000, seReporta: false }),
    ]);
    const t = totalDeLaTienda(grupos);
    expect(t.reportado).toBe(350.5);
    expect(t.noReportado).toBe(1000);
    expect(t.cantidadReportada).toBe(2);
    expect(t.cantidadNoReportada).toBe(1);
  });

  it("el tipo de cada fila sale de `gasto.ts`, no de un rótulo escrito aparte", () => {
    expect(rotuloDeFila(fila({ tipo: "mueble" }))).toBe(ROTULO_DE_TIPO.mueble);
    expect(rotuloDeFila(fila({ tipo: "impulsadora" }))).toBe(ROTULO_DE_TIPO.impulsadora);
  });

  it("cada fila dice en qué estado está su período, y «Sin período» si no quedó sellada", () => {
    expect(rotuloDelPeriodo(fila({ estadoPeriodo: "cerrado", periodoNombre: "mid 2026" }))).toBe(
      "mid 2026 · Cerrado",
    );
    expect(rotuloDelPeriodo(fila({ estadoPeriodo: null, periodoNombre: null }))).toBe("Sin período");
  });

  it("la pantalla no suma por su cuenta: el total sale de `totalDeLaTienda`", () => {
    for (const ruta of RUTAS_VISTA) {
      const src = codigo(ruta);
      expect(src, ruta).toMatch(/totales\.reportado/);
      expect(src, ruta).not.toMatch(/\.reduce\(/); // ninguna suma a mano en la vista
    }
    const datos = codigo(RUTA_DATOS);
    expect(datos).toMatch(/totalDeLaTienda\(/);
    expect(datos).toMatch(/agruparPorMarca\(/);
  });
});

// ─── 2. LA TIENDA, POR CÓDIGO Y NUNCA POR NOMBRE ────────────────────────────

describe("2. la tienda se resuelve por código, nunca por nombre", () => {
  it("la lectura pregunta `clientes_master` por CÓDIGO", () => {
    const src = codigo(RUTA_DATOS);
    expect(src).toMatch(/from\("clientes_master"\)/);
    expect(src).toMatch(/\.eq\("codigo",\s*codigo\)/);
  });

  it("NINGÚN filtro ni join de la lectura usa el nombre del cliente", () => {
    const src = codigo(RUTA_DATOS);
    expect(src).not.toMatch(/\.eq\("nombre"/);
    expect(src).not.toMatch(/\.ilike\("nombre"/);
    expect(src).not.toMatch(/nombre_normalized/);
  });

  it("el rótulo usa el nombre del directorio, y sin él el CÓDIGO", () => {
    expect(rotuloDeLaTienda({ codigo: "D-25", nombre: "City Mall Paso Canoa" })).toBe(
      "City Mall Paso Canoa",
    );
    expect(rotuloDeLaTienda({ codigo: "D-25", nombre: null })).toBe("D-25");
    expect(rotuloDeLaTienda({ codigo: null, nombre: null })).toBe(TIENDA_GENERAL);
  });

  it("«General» es su propio cajón y se reconoce por igualdad, no por parecido", () => {
    expect(esCodigoGeneral(CODIGO_GENERAL)).toBe(true);
    expect(esCodigoGeneral("General")).toBe(true);
    expect(esCodigoGeneral("generales")).toBe(false);
    expect(esCodigoGeneral("D-25")).toBe(false);
  });
});

// ─── 3. «NOVA» NO TRAE «RENOVACIÓN» ─────────────────────────────────────────

describe("3. el texto se compara por palabra: «nova» no trae «Renovación»", () => {
  it("encuentra Nova Lux y deja fuera Renovación", () => {
    expect(coincidePorPalabra("Nova Lux, S.a.", "nova")).toBe(true);
    expect(coincidePorPalabra("Renovacion", "nova")).toBe(false);
    expect(coincidePorPalabra("Renovación", "nova")).toBe(false);
  });

  it("los 25 proyectos reales: «nova» pasa de 2 a 1, y los demás términos no cambian", () => {
    // Los nombres y tiendas tal como están en producción el 22-sep-2026.
    const proyectos: Array<{ nombre: string; tienda: string }> = [
      { nombre: "French Connection", tienda: "La Frontera Duty Free" },
      { nombre: "Muebles", tienda: "Changalo" },
      { nombre: "Remodelacion", tienda: "Hanna Calzados" },
      { nombre: "Remodelacion", tienda: "Outlet Dutty Free N2" },
      { nombre: "Remodelacion", tienda: "City Mall David" },
      { nombre: "Remodelacion", tienda: "Outlet Duty Free N3, S.a." },
      { nombre: "Remodelacion", tienda: "Wolf Mall Center Int" },
      { nombre: "Remodelacion", tienda: "La Nueva Reina Chorrera" },
      { nombre: "Remodelacion", tienda: "Kheridinne" },
      { nombre: "Renovacion", tienda: "La Frontera Dutty Free" },
      { nombre: "Remodelacion", tienda: "City Mall Pasocanoa" },
      { nombre: "Remodelacion", tienda: "I Fashion Boutique" },
      { nombre: "Remodelacion", tienda: "Jerusalem Pasocanoa" },
      { nombre: "Remodelacion", tienda: "Zona Sur Rio Sereno" },
      { nombre: "Remodelacion", tienda: "Hanna Santiago Mall" },
      { nombre: "Remodelacion", tienda: "Shopping Center" },
      { nombre: "Remodelacion", tienda: "Multifashion" },
      { nombre: "Viaticos Mensuales", tienda: "Impulsadoras" },
      { nombre: "Viaticos Mensuales", tienda: "Impulsadoras" },
      { nombre: "Remodelacion", tienda: "City Mall Paso Canoa" },
      { nombre: "Remodelacion", tienda: "Multifashion Holdings" },
      { nombre: "Apertura", tienda: "Nova Lux, S.a." },
      { nombre: "D", tienda: "D" },
      { nombre: "J", tienda: "J" },
      { nombre: "Plaza los Angeles", tienda: "Plaza los Angeles" },
    ];
    const conIncludes = (t: string) =>
      proyectos.filter(
        (p) =>
          normalizarBusqueda(p.nombre).includes(normalizarBusqueda(t)) ||
          normalizarBusqueda(p.tienda).includes(normalizarBusqueda(t)),
      ).length;
    const porPalabra = (t: string) =>
      proyectos.filter((p) => algunoCoincidePorPalabra([p.nombre, p.tienda], t)).length;

    expect(conIncludes("nova")).toBe(2); // lo de hoy: trae Renovación
    expect(porPalabra("nova")).toBe(1); // solo Nova Lux
    expect(conIncludes("d")).toBe(21);
    expect(porPalabra("d")).toBe(6);

    // Los que no cambian: la regla nueva no le quita nada a nadie.
    for (const t of [
      "remodel", "city", "frontera", "mall", "lux", "j", "plaza",
      "impulsadora", "hanna", "renovacion", "muebles", "apertura",
    ]) {
      expect(porPalabra(t)).toBe(conIncludes(t));
    }
  });

  it("una consulta de varias palabras sigue funcionando, y puede empezar en cualquier palabra", () => {
    expect(coincidePorPalabra("City Mall David", "city mall")).toBe(true);
    // Empieza en la segunda palabra: vale. Lo que NO vale es empezar en la
    // MITAD de una palabra, que es lo que traía «Renovación» con «nova».
    expect(coincidePorPalabra("City Mall David", "mall david")).toBe(true);
    expect(coincidePorPalabra("City Mall David", "ity mall")).toBe(false);
  });

  it("el CÓDIGO se compara igual: «D-25» encuentra D-25", () => {
    expect(coincidePorPalabra("D-25", "D-25")).toBe(true);
    expect(coincidePorPalabra("D-25", "d-2")).toBe(true);
    // Es un buscador: lo escrito es el PRINCIPIO, así que «d-25» también
    // encontraría un D-251 si existiera. Lo que no pasa es lo de «nova».
    expect(coincidePorPalabra("D-251", "d-25")).toBe(true);
    expect(coincidePorPalabra("D-25", "25")).toBe(true);
    expect(coincidePorPalabra("Renovacion D-25", "enova")).toBe(false);
  });

  it("⚠️ EL NÚMERO DE FACTURA SIGUE POR SUBCADENA (79 de 108 con ceros al frente)", () => {
    expect(coincideSubcadena("0000064948", "64948")).toBe(true);
    expect(coincidePorPalabra("0000064948", "64948")).toBe(false);
  });

  it("el buscador de proyectos usa la regla nueva para el TEXTO y la vieja para el NÚMERO", () => {
    const src = codigo(RUTA_PROYECTOS);
    expect(src).toMatch(/coincidePorPalabra\(/);
    expect(src).toMatch(/coincideSubcadena\(/);
    expect(src).toMatch(/matchNumero\(f\.numero_factura\)/);
    expect(src).toMatch(/matchTexto\(f\.concepto\)/);
  });

  it("nada se compara por parecido: no hay distancia de edición ni fonética", () => {
    const src = codigo("src/lib/search/texto.ts");
    expect(src).not.toMatch(/levenshtein|similarity|fuzzy|soundex/i);
  });
});

// ─── 4. EL RESULTADO DE ⌘K LLEVA A LA TIENDA ────────────────────────────────

describe("4. el resultado de ⌘K apunta a /marketing/tienda/<código>", () => {
  it("la dirección es la de la tienda, y «General» tiene la suya", () => {
    expect(hrefDeTienda("D-25")).toBe("/marketing/tienda/D-25");
    expect(hrefDeTienda(null)).toBe(`/marketing/tienda/${CODIGO_GENERAL}`);
    expect(hrefDelResultado({ codigo: "D-170" })).toBe("/marketing/tienda/D-170");
  });

  it("la dirección se escribe en UN SOLO LUGAR", () => {
    const enElCimiento = codigo("src/lib/marketing/vista-tienda.ts");
    expect(enElCimiento).toMatch(/\/marketing\/tienda\//);
    // Ni la búsqueda ni la barra la arman a mano.
    expect(codigo("src/lib/search/marketing.ts")).not.toMatch(/["'`]\/marketing\/tienda\//);
    expect(codigo(RUTA_SEARCHBAR)).not.toMatch(/["'`]\/marketing\/tienda\//);
    expect(codigo(RUTA_SEARCHBAR)).toMatch(/hrefDelResultado\(/);
  });

  it("busca por nombre o por código, por palabra, y ordena por plata", () => {
    const tiendas = [
      { codigo: "D-170", nombre: "Nova Lux, S.A.", gastos: 7, monto: 12261.16 },
      { codigo: "D-87", nombre: "La Frontera Duty Free", gastos: 7, monto: 4333.49 },
      { codigo: null, nombre: TIENDA_GENERAL, gastos: 22, monto: 37778.12 },
    ];
    expect(buscarTiendas("nova", tiendas).map((t) => t.codigo)).toEqual(["D-170"]);
    expect(buscarTiendas("D-87", tiendas).map((t) => t.codigo)).toEqual(["D-87"]);
    expect(buscarTiendas("general", tiendas).map((t) => t.nombre)).toEqual([TIENDA_GENERAL]);
    expect(buscarTiendas("frontera", tiendas)).toHaveLength(1);
    expect(buscarTiendas("", tiendas)).toEqual([]);
  });

  it("solo lo ve quien ve el módulo Marketing (admin y secretaria)", () => {
    const src = codigo(RUTA_BUSCADOR);
    expect(src).toMatch(/auth\.role === "admin" \|\| auth\.role === "secretaria"/);
    expect(src).toMatch(/marketing: \[\]/); // el resto lo recibe vacío
  });
});

// ─── 5. EL INTERRUPTOR EN `false` = NADA CAMBIA ─────────────────────────────

describe("5. con el interruptor apagado no cambia nada", () => {
  it("hoy está prendido, y es UNA constante", () => {
    expect(VISTA_TIENDA).toBe(true);
    expect(codigo("src/lib/marketing/vista-tienda.ts")).toMatch(
      /export const VISTA_TIENDA = (true|false);/,
    );
  });

  it("la pantalla no existe: 404 propio", () => {
    expect(codigo(RUTA_PAGINA)).toMatch(/if \(!VISTA_TIENDA\) notFound\(\);/);
  });

  it("las dos rutas de la tienda contestan 404", () => {
    for (const r of [RUTA_API, RUTA_FOTOS]) {
      const src = codigo(r);
      expect(src).toMatch(/if \(!VISTA_TIENDA\)/);
      expect(src).toMatch(/status: 404/);
    }
  });

  it("la búsqueda global no ofrece Marketing", () => {
    expect(codigo(RUTA_BUSCADOR)).toMatch(/VISTA_TIENDA && puedeMarketing/);
  });

  it("el buscador de proyectos vuelve a su `includes` de siempre", () => {
    const src = codigo(RUTA_PROYECTOS);
    expect(src).toMatch(/VISTA_TIENDA\s*\n?\s*\?\s*coincidePorPalabra/);
    expect(src).toMatch(/toLowerCase\(\)\.includes\(term\)/);
  });
});

// ─── 6. LAS FOTOS CUELGAN DE LA TIENDA, Y TODO FALLA ABIERTO ────────────────

describe("6. las fotos cuelgan de la tienda y la lectura falla abierta", () => {
  it("FotosSection sirve a las dos puertas sin romper la del proyecto", () => {
    const src = codigo(RUTA_FOTOS_SECTION);
    expect(src).toMatch(/tiendaCodigo\?: string/);
    expect(src).toMatch(/api\/marketing\/tienda\/\$\{encodeURIComponent\(tiendaCodigo\)\}\/fotos/);
    expect(src).toMatch(/api\/marketing\/proyectos\/\$\{proyectoId\}\/fotos/); // la vieja sigue
  });

  it("las fotos de la tienda se leen por `tienda_codigo`", () => {
    const src = codigo(RUTA_FOTOS);
    expect(src).toMatch(/\.eq\("tienda_codigo"/);
    expect(src).toMatch(/\.eq\("tipo", "foto_proyecto"\)/);
  });

  it("toda lectura del rediseño pasa por `columnas-opcionales` y falla ABIERTA", () => {
    for (const r of [RUTA_DATOS, RUTA_FOTOS, "src/lib/search/marketing-server.ts"]) {
      expect(codigo(r)).toMatch(/esColumnaAusente/);
    }
    expect(codigo(RUTA_DATOS)).toMatch(/completarGasto\(/);
  });

  it("la lectura no escribe nada: ni insert, ni update, ni delete", () => {
    const src = codigo(RUTA_DATOS);
    expect(src).not.toMatch(/\.insert\(|\.update\(|\.delete\(|\.upsert\(/);
  });
});
