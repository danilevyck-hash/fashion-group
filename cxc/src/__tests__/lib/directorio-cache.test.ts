// ─────────────────────────────────────────────────────────────────────────────
// El directorio de clientes se lee de la base UNA vez cada 60 s, no en cada
// llamada.
//
// 🩸 POR QUÉ (3-ago-2026). `GET /api/clientes` leía DOS tablas completas por
// llamada para devolver ~149 clientes:
//
//     clientes_master   5.062 filas vivas   → 6 viajes (páginas de 1.000)
//     switch_clientes   6.667 filas         → 7 viajes
//     ──────────────────────────────────────────────────────────────────
//     11.729 filas y 13 viajes a Supabase   POR LLAMADA
//
// El comentario del endpoint afirmaba que la tabla tenía "149 filas vivas" —
// falso: 149 es lo que queda DESPUÉS del filtro de mundos. Con ese número la
// lectura completa parecía barata y por eso nadie la tocó.
//
// ⚠️ EL RIESGO DE CACHEAR NO ES LA FRESCURA, ES LA MUTACIÓN. Antes cada llamada
// traía un array recién creado y el `sort` de presentación lo ordenaba en el
// lugar sin consecuencia. Con caché, ese mismo array queda compartido entre
// llamadas: ordenarlo muta estado global. El test lo fija.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

const leer = (rel: string) => readFileSync(path.join(process.cwd(), rel), "utf8");
const cache = leer("src/lib/clientes/directorio-cache.ts");
const route = leer("src/app/api/clientes/route.ts");
const patch = leer("src/app/api/clientes/[codigo]/route.ts");

describe("🔴 el endpoint ya no lee la base en cada llamada", () => {
  it("delega en el caché en vez de leer clientes_master directo", () => {
    expect(route).toContain("leerClientesDelGrupo(provincia)");
    expect(route).not.toContain('.from("clientes_master")');
  });

  it("el filtro de mundos también queda cacheado (es la mitad cara)", () => {
    // Si `soloClientesDelGrupo` quedara en el route, seguiría leyendo los 6.667
    // de switch_clientes en cada llamada aunque clientes_master viniera cacheado.
    expect(cache).toContain("soloClientesDelGrupo");
    expect(cache).toContain("mundosDeClientes()");
    expect(route).not.toContain("mundosDeClientes");
  });
});

describe("🔴 no mutar el array cacheado", () => {
  it("sin búsqueda se copia con .slice() antes de ordenar", () => {
    expect(route).toContain("visibles.slice()");
  });

  it("el sort nunca se aplica sobre `visibles` directamente", () => {
    expect(route).not.toMatch(/visibles\.sort\(/);
  });
});

describe("⚠️ frescura: que una edición no tarde un minuto en verse", () => {
  it("editar un cliente invalida el caché del servidor", () => {
    expect(patch).toContain("invalidarDirectorioServidor()");
  });

  it("el TTL es corto — acota la ventana en la instancia que no se invalidó", () => {
    expect(cache).toContain("TTL_MS = 60_000");
  });

  it("dice que el caché es POR INSTANCIA (en serverless no es compartido)", () => {
    expect(cache).toMatch(/POR INSTANCIA|por instancia/);
  });
});

describe("⚠️ que no se rompa en silencio", () => {
  it("sigue paginando con verificación contra el COUNT", () => {
    expect(cache).toContain("leerTodoPaginado");
  });

  it("cachea la PROMESA: tres pedidos a la vez no disparan tres lecturas", () => {
    expect(cache).toContain("datos: Promise<FilaCliente[]>");
  });

  it("un fallo borra la entrada en vez de envenenarla 60 s", () => {
    expect(cache).toContain("cache.delete(provincia)");
  });

  it("la provincia es parte de la clave (se filtra en la base)", () => {
    expect(cache).toContain("cache = new Map<string, Entrada>()");
    expect(cache).toContain("leerClientesDelGrupo(provincia = \"\")");
  });
});
