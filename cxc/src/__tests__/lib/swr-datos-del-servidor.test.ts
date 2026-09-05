// ─────────────────────────────────────────────────────────────────────────────
// LO QUE EL SERVIDOR YA MANDÓ NO SE VUELVE A PEDIR
//
// 🩸 POR QUÉ (12-ago-2026). Ventas, Clientes, Multifashion y Reclamos pasaban
// los datos del server component como `fallbackData`, con comentarios que
// decían "sin re-fetch redundante". Era FALSO: `fallbackData` no puebla la
// caché de SWR, así que su default `revalidateIfStale: true` disparaba el fetch
// igual al montar. Medido contra el build de producción, una visita a /ventas:
// el HTML tardaba 1.070 ms y apenas llegaba, el cliente pedía OTRA VEZ
// `/api/ventas/resumen` (1.034 ms), `/api/multifashion/overview` (716 ms) y
// `/api/ventas/clientes-12m` (400 ms). **Cada visita costaba el doble de base
// de datos**, con Supabase en compute Micro.
//
// El candado mira las DOS direcciones, porque las dos formas de equivocarse
// hacen daño:
//   · sin `revalidateOnMount:false` vuelve la petición duplicada;
//   · con `revalidateOnMount:false` puesto A CIEGAS —sin dato del servidor— la
//     página 2 del directorio, una búsqueda o un año distinto quedan EN BLANCO
//     para siempre. Por eso las dos cosas viajan juntas en la misma función y
//     no se pueden separar por accidente.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { opcionesDelServidor } from "@/lib/swr-servidor";

const leer = (rel: string) => readFileSync(path.join(process.cwd(), rel), "utf8");
// 🩸 EL CÓDIGO, NO LOS COMENTARIOS. Verificado por mutación: los comentarios de
// estos archivos EXPLICAN el arreglo y por lo tanto nombran las mismas
// funciones que el candado busca — con el archivo entero, borrar la llamada de
// verdad seguía pasando en verde, satisfecho con su propia explicación.
const codigoDe = (rel: string) => leer(rel).replace(/\/\/.*$/gm, "");

// ⚠️ CLIENTES SALIÓ DE ESTA LISTA EL 5-sep-2026, y no por aflojarse: la lista de
// clientes **dejó de pedirse por SWR**. Con el rediseño se muestran los 150 de
// una (sin páginas y sin filtro de provincia), así que el server component los
// manda enteros y la pantalla los dibuja tal cual — cero peticiones, que es la
// forma FUERTE de lo que este bloque exige (no volver a pedir lo que el
// servidor ya mandó). Lo único que sigue por SWR ahí es la columna «Compró»,
// que va aparte a propósito. Hay un bloque propio más abajo que lo fija.
const SHELLS = [
  "src/app/ventas/VentasShell.tsx",
  "src/app/multifashion/MultifashionShell.tsx",
  "src/app/reclamos/ReclamosClient.tsx",
];

describe("las dos cosas van juntas o no van", () => {
  it("CON dato del servidor: se sirve y NO se re-pide", () => {
    const datos = { a: 1 };
    expect(opcionesDelServidor(datos)).toEqual({
      fallbackData: datos,
      revalidateOnMount: false,
    });
  });

  it("SIN dato del servidor: no se toca nada, SWR pide como siempre", () => {
    expect(opcionesDelServidor(undefined)).toEqual({});
  });

  it("nunca apaga la revalidación inicial sin dejar un dato en su lugar", () => {
    // La combinación peligrosa —`revalidateOnMount:false` con `fallbackData`
    // ausente— es una pantalla vacía permanente. No debe poder construirse.
    for (const entrada of [undefined, { x: 1 }, [] as unknown[], null, 0, ""]) {
      const o = opcionesDelServidor(entrada);
      if (o.revalidateOnMount === false) expect(o).toHaveProperty("fallbackData");
    }
  });

  it("un dato del servidor que es `null` o `0` SIGUE siendo un dato", () => {
    // Solo `undefined` significa "esta vista no recibió nada". Confundirlo con
    // un valor falsy volvería a pedir lo que el servidor sí mandó.
    expect(opcionesDelServidor(null).revalidateOnMount).toBe(false);
    expect(opcionesDelServidor(0).revalidateOnMount).toBe(false);
    expect(opcionesDelServidor([]).revalidateOnMount).toBe(false);
  });
});

describe("BARRIDO ESTÁTICO — las 4 pantallas entran por la misma puerta", () => {
  it.each(SHELLS)("%s usa opcionesDelServidor", (rel) => {
    expect(codigoDe(rel)).toContain("...opcionesDelServidor(");
  });

  it.each(SHELLS)("%s no escribe revalidateOnMount a mano", (rel) => {
    // A mano es donde se separa de su `fallbackData` y aparece la pantalla
    // vacía. La única forma de ponerlo es a través de la función.
    expect(leer(rel)).not.toContain("revalidateOnMount");
  });

  it.each(SHELLS)("%s siembra la caché con lo que manda el servidor", (rel) => {
    // Sin esto SÍ se perdería frescura: al volver por navegación del SPA, Next
    // vuelve a correr el server component (`staleTimes.dynamic` = 30 s) y manda
    // datos nuevos, pero `fallbackData` solo aplica con la caché VACÍA — la
    // pantalla se quedaría mostrando lo viejo sin revalidar nunca.
    expect(codigoDe(rel)).toContain("useSembrarDelServidor(");
  });

  it("sembrar la caché NO pide nada por red", () => {
    expect(codigoDe("src/lib/swr-servidor.ts")).toContain("mutate(datos, { revalidate: false })");
  });
});

describe("🔴 la frescura que SÍ depende del foco no se toca", () => {
  it("Reclamos conserva revalidateOnFocus:true", () => {
    // Los reclamos los editan varias personas y no hay realtime: volver a la
    // pestaña es cómo cada uno se entera de lo que hicieron los demás. Lo único
    // que se apagó es la petición INICIAL.
    expect(codigoDe("src/app/reclamos/ReclamosClient.tsx")).toContain("revalidateOnFocus: true");
  });

  it("la venta de HOY de Multifashion sigue revalidando al foco", () => {
    // Es el número que cambia con cada sync de Switch; su tarjeta tiene su
    // propio hook y no entra en este cambio.
    expect(codigoDe("src/components/multifashion/VentaHoyCard.tsx")).toContain("revalidateOnFocus: true");
  });
});

describe("🔁 la MISMA pantalla no pregunta lo mismo dos veces", () => {
  // Ventas monta `ResumenView` y `ResumenViewMobile` a la vez —una escondida con
  // CSS, pero montada— y las dos traen un `<SyncStatus>` con la MISMA URL.
  // Medido: `/api/sync-status` ×2 por visita, 733 ms sumados. Al CXC le pasa lo
  // mismo (`cxc/page.tsx` + `PanelCxcMobile`).
  const sync = leer("src/components/shared/SyncStatus.tsx");
  const syncCodigo = codigoDe("src/components/shared/SyncStatus.tsx");

  it("comparte la petición EN VUELO por URL", () => {
    expect(syncCodigo).toContain("const enVuelo = new Map<string, Promise<SyncStatusData>>()");
    expect(syncCodigo).toContain("pedirEstado(url)");
  });

  it("y la suelta apenas responde — NADA de caché con ventana de tiempo", () => {
    // Con TTL, el refresco tras "Actualizar ahora" (que dispara un `focus`
    // inmediato) devolvería lo viejo: justo el momento en que este banner tiene
    // que decir la verdad.
    expect(syncCodigo).toContain(".finally(() => { enVuelo.delete(url); })");
    expect(syncCodigo).not.toMatch(/expiraEn|setTimeout|Date\.now\(\)/);
  });

  it("sigue revalidando al volver a la pestaña", () => {
    expect(syncCodigo).toContain('window.addEventListener("focus", fetchStatus)');
    expect(syncCodigo).toContain('document.addEventListener("visibilitychange", onVisible)');
  });
});

describe("⚠️ las vistas SIN dato del servidor siguen pidiendo", () => {
  it("🔴 Clientes NO vuelve a pedir la lista que el servidor ya mandó", () => {
    // ⚠️ CAMBIÓ DE DIRECCIÓN EL 5-sep-2026. Antes esta pantalla paginaba de a 50
    // y solo podía dar por buenos los datos del servidor en la página 1 sin
    // filtros (`isInitialView`); todo lo demás lo pedía a `/api/clientes`.
    //
    // Ahora se muestran los 150 en una sola lista con scroll —sin páginas y sin
    // filtro de provincia (99 de 150 no la tienen; Daniel: «si, no sirve»)— y
    // el buscador y los chips filtran EN MEMORIA sobre lo que ya llegó. O sea
    // que la lista no se vuelve a pedir NUNCA: es la forma fuerte de la misma
    // regla, no una excepción a ella.
    const src = codigoDe("src/app/clientes/ClientesListClient.tsx");
    expect(src).not.toContain("/api/clientes?");
    expect(src).not.toContain("opcionesDelServidor");
    // Lo único que se pide por red es la columna «Compró», aparte a propósito:
    // leer las facturas del año de 150 clientes cuesta ~2.280 filas y la tabla
    // no tiene por qué esperarla.
    expect(src).toContain("/api/clientes/ytd?codigos=");
  });

  it("Ventas y Multifashion solo consideran del servidor el año inicial", () => {
    for (const rel of [
      "src/app/ventas/VentasShell.tsx",
      "src/app/multifashion/MultifashionShell.tsx",
    ]) {
      expect(leer(rel), rel).toContain("selectedYear === initialYear");
    }
  });
});
