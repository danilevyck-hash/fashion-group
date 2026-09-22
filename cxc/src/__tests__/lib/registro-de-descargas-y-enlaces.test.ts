/* ─────────────────────────────────────────────────────────────────────────────
 * 🔴 CANDADO — EL CONTADOR DE DESCARGAS Y DOS ENLACES QUE NO LLEGABAN
 * (18-sep-2026). Ninguna de las tres mueve plata.
 *
 *   1 · **El contador de descargas.** `activity_logs` no tiene NI UNA fila de
 *       ninguna acción `descarga_*` (medido contra producción el 18-sep-2026:
 *       3.011 filas en la tabla, 79 en los últimos 8 días, todas escritas por
 *       el SERVIDOR). 🩸 Hasta el 4-sep-2026 era imposible que la hubiera: el
 *       insert de `/api/activity` nombraba columnas que la tabla no tiene
 *       (`user_name`, `module`) y contestaba 500. El defecto vivió meses sin
 *       verse porque `logActivityClient` mandaba el POST y **se tragaba todo en
 *       silencio**, sin mirar siquiera si la respuesta era un error.
 *
 *       🔑 Lo que se arregla acá NO es la escritura —ya funciona, verificada de
 *       punta a punta— sino el SILENCIO: un cero se leía igual que «nadie lo
 *       usó», y son cosas distintas. De ese número depende una decisión (si
 *       «Tallas por bulto» y «Fotos a mi Excel» se quedan o se retiran).
 *
 *       🔄 22-sep-2026 — LA DECISIÓN SE TOMÓ, y este contador la sostuvo:
 *       `descarga_misfotos` seguía en CERO en toda la historia, así que
 *       «Fotos a mi Excel» se retiró de la pantalla (Daniel: *«si si borra
 *       ese»*) y «Tallas por bulto» se queda. Son CUATRO botones
 *       instrumentados desde entonces; el quinto vive en un archivo rotulado
 *       y sin lectores (`fotos-a-mi-excel-retirado.test.ts`).
 *
 *   2 · **El breadcrumb de Plantilla Switch caía en un 404.** El encabezado
 *       armaba el enlace del módulo recortando la URL a su primer tramo:
 *       `/productos/cargar` → `/productos`, que no existe. Lo mismo
 *       `/admin/usuarios` → `/admin`, que redirige a Cuentas por Cobrar, que es
 *       OTRO módulo. La dirección de un módulo la dice `modules.ts`.
 *
 *   3 · **El `?search=` de Préstamos no lo leía nadie.** El atajo de la
 *       búsqueda global decía «Buscar préstamos de "X"» y mandaba
 *       `/prestamos?search=X`; el parámetro viajaba entero por el middleware
 *       hasta una pantalla que lo ignora (la llave del buscador de la casa es
 *       `buscar`, nunca `search`). Mismo trato que los siete atajos de cheques
 *       del 5-sep-2026: el atajo se queda y DICE lo que hace.
 * ────────────────────────────────────────────────────────────────────────── */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync, existsSync } from "fs";
import path from "path";
import { hrefDelModulo } from "@/lib/navegacion/href-del-modulo";
import { ALL_MODULES } from "@/lib/modules";
import { PARAM_BUSCAR } from "@/lib/buscar-en-lista";

const RAIZ = process.cwd();
const leer = (rel: string) => readFileSync(path.join(RAIZ, rel), "utf8");
/** El código sin comentarios: las historias nombran a propósito lo retirado. */
const plano = (rel: string) =>
  leer(rel)
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/^[ \t]*\/\/.*$/gm, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, " ");

// ─────────────────────────────────────────────────────────────────────────────
// 1 · El contador de descargas
// ─────────────────────────────────────────────────────────────────────────────

describe("🔴 1 · lo que se descarga se anota, y si no se pudo anotar SE DICE", () => {
  let avisos: string[];
  let pedidos: { url: string; init: RequestInit }[];

  beforeEach(() => {
    avisos = [];
    pedidos = [];
    vi.spyOn(console, "warn").mockImplementation((...args: unknown[]) => {
      avisos.push(args.map(String).join(" "));
    });
  });
  afterEach(() => vi.restoreAllMocks());

  const conFetch = (responder: () => Promise<Response>) => {
    globalThis.fetch = ((url: string, init: RequestInit) => {
      pedidos.push({ url, init });
      return responder();
    }) as unknown as typeof fetch;
  };

  it("manda la acción a `/api/activity`, con su módulo y su detalle", async () => {
    conFetch(async () => ({ ok: true, status: 200 }) as Response);
    const { logActivityClient, RUTA_ACTIVIDAD } = await import("@/lib/logActivityClient");
    logActivityClient({ action: "descarga_excel", module: "ventas", details: { pestana: "resumen" } });
    await new Promise((r) => setTimeout(r, 0));

    expect(pedidos).toHaveLength(1);
    expect(pedidos[0].url).toBe(RUTA_ACTIVIDAD);
    expect(RUTA_ACTIVIDAD).toBe("/api/activity");
    expect(pedidos[0].init.method).toBe("POST");
    expect(JSON.parse(String(pedidos[0].init.body))).toEqual({
      action: "descarga_excel",
      module: "ventas",
      details: { pestana: "resumen" },
    });
  });

  it("el aviso sobrevive a que se cierre la pestaña (`keepalive`)", async () => {
    conFetch(async () => ({ ok: true, status: 200 }) as Response);
    const { logActivityClient } = await import("@/lib/logActivityClient");
    logActivityClient({ action: "descarga_tallas", module: "depurador" });
    await new Promise((r) => setTimeout(r, 0));
    expect(pedidos[0].init.keepalive).toBe(true);
  });

  it("🩸 un servidor que contesta mal NO se traga en silencio", async () => {
    conFetch(async () => ({ ok: false, status: 500 }) as Response);
    const { logActivityClient } = await import("@/lib/logActivityClient");
    logActivityClient({ action: "descarga_misfotos", module: "depurador" });
    await new Promise((r) => setTimeout(r, 0));

    expect(avisos.join(" ")).toContain("descarga_misfotos");
    expect(avisos.join(" ")).toContain("500");
  });

  it("una red caída tampoco se traga, y NUNCA rompe lo que la llamó", async () => {
    conFetch(() => Promise.reject(new Error("sin red")));
    const { logActivityClient } = await import("@/lib/logActivityClient");
    expect(() => logActivityClient({ action: "descarga_excel", module: "ventas" })).not.toThrow();
    await new Promise((r) => setTimeout(r, 0));
    expect(avisos.join(" ")).toContain("descarga_excel");
  });

  it("los CUATRO botones instrumentados que quedan en pantalla siguen anotando", () => {
    expect(plano("src/lib/ventas/descarga.ts")).toContain('"descarga_excel"');
    for (const rel of [
      "src/components/ventas/ResumenView.tsx",
      "src/components/ventas/ClientesView.tsx",
      "src/components/ventas/ProductosView.tsx",
    ]) {
      expect(plano(rel), `${rel} dejó de anotar su descarga`).toContain("anotarDescarga(");
    }
    expect(plano("src/app/productos/cargar/CurvasView.tsx")).toContain('"descarga_tallas"');
    // 🔄 22-sep-2026: el quinto era «Fotos a mi Excel», hoy retirado de la
    // pantalla. Su archivo rotulado lo vigila `fotos-a-mi-excel-retirado`.
  });
});

describe("🔴 1b · el servidor escribe en las columnas que la tabla TIENE", () => {
  it("el insert usa `entity_type` y mete el nombre adentro de `details`", async () => {
    const filas: Record<string, unknown>[] = [];
    vi.resetModules();
    vi.doMock("@/lib/supabase-server", () => ({
      supabaseServer: {
        from: () => ({
          insert: (fila: Record<string, unknown>) => {
            filas.push(fila);
            return Promise.resolve({ error: null });
          },
        }),
      },
      HAS_SERVICE_ROLE: true,
    }));
    process.env.SESSION_SECRET = "candado-18-sep";
    const { signSession } = await import("@/lib/session-cookie");
    const cookie = signSession({ role: "admin", userName: "daniel", sessionToken: "tok" });
    const { POST } = await import("@/app/api/activity/route");

    const req = {
      cookies: { get: (n: string) => (n === "cxc_session" ? { value: cookie } : undefined) },
      json: async () => ({ action: "descarga_excel", module: "ventas", details: { pestana: "resumen" } }),
    } as never;
    const res = (await POST(req)) as Response;

    expect(res.status).toBe(200);
    expect(filas).toHaveLength(1);
    const fila = filas[0];
    // 🩸 Las columnas REALES. El insert viejo nombraba `module` y `user_name`.
    expect(Object.keys(fila).sort()).toEqual(["action", "details", "entity_type", "user_role"]);
    expect(fila.entity_type).toBe("ventas");
    expect(fila.action).toBe("descarga_excel");
    expect(JSON.parse(String(fila.details))).toEqual({ pestana: "resumen", user_name: "daniel" });
    vi.doUnmock("@/lib/supabase-server");
    vi.resetModules();
  });

  it("y si el insert falla, la ruta lo DICE en el servidor", () => {
    expect(plano("src/app/api/activity/route.ts")).toContain("console.error");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2 · El breadcrumb lleva a la dirección del módulo
// ─────────────────────────────────────────────────────────────────────────────

describe("🔴 2 · el nombre del módulo en el breadcrumb lleva al módulo", () => {
  it("🩸 Plantilla Switch ya no apunta a `/productos`, que no existe", () => {
    expect(hrefDelModulo("/productos/cargar")).toBe("/productos/cargar");
    expect(hrefDelModulo("/productos/cargar")).not.toBe("/productos");
  });

  it("🩸 Usuarios ya no apunta a `/admin`, que redirige a Cuentas por Cobrar", () => {
    expect(hrefDelModulo("/admin/usuarios")).toBe("/admin/usuarios");
  });

  it("TODO módulo se apunta a sí mismo — la lista se DERIVA, no se teclea", () => {
    for (const m of ALL_MODULES) {
      expect(hrefDelModulo(m.href), `${m.key} no lleva a su propia dirección`).toBe(m.href);
      expect(hrefDelModulo(`${m.href}/algo`), `${m.key} desde adentro`).toBe(m.href);
    }
  });

  it("desde una pantalla de adentro sigue subiendo al módulo", () => {
    expect(hrefDelModulo("/guias/123")).toBe("/guias");
    expect(hrefDelModulo("/clientes/D-25")).toBe("/clientes");
  });

  it("🔑 falla ABIERTA: una ruta que no es de ningún módulo se resuelve como antes", () => {
    expect(hrefDelModulo("/catalogo/reebok/pedidos")).toBe("/catalogo");
    expect(hrefDelModulo("/pantalla/que/no/es/de/nadie")).toBe("/pantalla");
    // Sin dirección no se queda sin enlace: cae al Inicio.
    expect(hrefDelModulo("")).toBe("/home");
  });

  it("el encabezado usa la función y dejó de recortar la dirección", () => {
    const src = plano("src/components/AppHeader.tsx");
    expect(src).toContain("hrefDelModulo(pathname)");
    expect(src, "volvió a adivinar la dirección recortando la URL").not.toContain(
      'pathname.split("/").slice(0, 2)',
    );
  });

  it("y `/productos` a secas deja de ser un callejón, como `/catalogos`", () => {
    const cfg = leer("next.config.js");
    expect(cfg).toContain('source: "/productos", destination: "/productos/cargar"');
    expect(cfg, "el redirect se comió /productos/cargar").not.toContain('source: "/productos/:path*"');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3 · El `?search=` de Préstamos
// ─────────────────────────────────────────────────────────────────────────────

describe("🔴 3 · el atajo de Préstamos dice lo que hace", () => {
  it("🩸 ya no manda un `?search=` que nadie lee", () => {
    const barra = plano("src/components/SearchBar.tsx");
    expect(barra).not.toContain("/prestamos?search=");
    expect(barra).toContain('href: "/prestamos"');
  });

  it("y el rótulo dejó de prometer una búsqueda", () => {
    const barra = plano("src/components/SearchBar.tsx");
    expect(barra).toContain("Ir a Préstamos");
    expect(barra).not.toContain("Buscar préstamos de");
  });

  it("⚠️ la llave del buscador de la casa es `buscar`, nunca `search`", () => {
    expect(PARAM_BUSCAR).toBe("buscar");
    const pestana = plano("src/app/asistencia/PrestamosTab.tsx");
    expect(pestana).toContain("PARAM_BUSCAR");
    expect(pestana, "Préstamos empezó a leer `search`").not.toContain('"search"');
  });

  it("nadie en Préstamos lee `search` — ni la pestaña, ni la página de movimientos", () => {
    for (const rel of ["src/app/asistencia/PrestamosTab.tsx", "src/app/prestamos/[id]/page.tsx"]) {
      if (!existsSync(path.join(RAIZ, rel))) continue;
      expect(plano(rel), `${rel} lee un parámetro que nadie manda`).not.toContain(
        'searchParams.get("search")',
      );
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CONTROL · lo que ya servía sigue igual
// ─────────────────────────────────────────────────────────────────────────────

describe("CONTROL: lo que sí funcionaba no se tocó", () => {
  it("el `?search=` de Cuentas por Cobrar se queda: ESE sí se lee", () => {
    const barra = plano("src/components/SearchBar.tsx");
    // Los DOS: el atajo «cuánto debe X» y el resultado de un cliente.
    expect(barra).toContain("href: `/cxc?search=${encodeURIComponent(client)}`");
    expect(barra).toContain("href: `/cxc?search=${encodeURIComponent(c.nombre_normalized)}`");
    expect(plano("src/app/cxc/page.tsx")).toContain('searchParams.get("search")');
  });

  it("los otros atajos de la búsqueda global siguen en pie", () => {
    const barra = plano("src/components/SearchBar.tsx");
    for (const destino of ["/recordatorios", "/reclamos?empresa=", "/guias?pendientes=1", "/caja"]) {
      expect(barra, `se perdió el atajo a ${destino}`).toContain(destino);
    }
  });

  it("los redirects del 17-sep-2026 siguen vivos", () => {
    const cfg = leer("next.config.js");
    expect(cfg).toContain('source: "/catalogo", destination: "/catalogos/marcas"');
    expect(cfg).toContain('source: "/catalogos", destination: "/catalogos/marcas"');
  });

  it("CONTROL de que el barrido no mira archivos vacíos", () => {
    for (const rel of [
      "src/lib/logActivityClient.ts",
      "src/lib/navegacion/href-del-modulo.ts",
      "src/components/AppHeader.tsx",
      "src/components/SearchBar.tsx",
      "src/app/api/activity/route.ts",
    ]) {
      expect(existsSync(path.join(RAIZ, rel)), rel).toBe(true);
      expect(leer(rel).length, rel).toBeGreaterThan(200);
    }
  });
});
