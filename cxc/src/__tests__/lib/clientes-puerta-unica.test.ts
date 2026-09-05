// ─────────────────────────────────────────────────────────────────────────────
// "CLIENTE" SE DEFINE EN UN SOLO LUGAR, Y LA PUERTA CORRECTA ES LA ÚNICA CÓMODA
//
// Daniel, textual: *"clientes de boston solo quiero verlos solo en su tab. igual
// que multifashion. esos no deben de convivir con el resto del sistema"*.
//
// 🩸 POR QUÉ HACE FALTA EL CANDADO (medido contra producción, 8-ago-2026).
// Los dos selectores de "más usados" no entraban por ninguna puerta: armaban su
// propia consulta a `clientes_master`. El de Cheques la hacía **sin paginar y
// sin `.order()`**, con un comentario que afirmaba *"son 149 filas vivas"*.
// Son **5.062** → PostgREST devolvía **1.000 EN SILENCIO**:
//
//   · **64 de los 146 clientes del grupo eran inofrecibles.**
//   · *"Jerusalem De Panamá"* —cliente de **12 de los 19 cheques**, o sea el que
//     SIEMPRE debió encabezar sus propios chips— no aparecía nunca.
//   · Ninguno de los dos filtraba por mundo: con 10 nombres compartidos entre el
//     grupo y Boston, un cheque podía resolver a un código de Boston.
//
// El test mira las DOS direcciones: que la definición no se afloje **y** que
// nadie vuelva a hacerse su propia consulta por el costado.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "fs";
import path from "path";

// `mundos.ts` importa Supabase para su lectura de `switch_clientes`; acá solo se
// prueba la parte PURA (la definición), así que se dobla el cliente.
vi.mock("@/lib/supabase-server", () => ({ supabaseServer: { from: () => ({}) } }));
vi.mock("@/lib/supabase-paginado", () => ({ leerTodoPaginado: async () => [] }));

import {
  EMPRESAS_DEL_GRUPO,
  EMPRESA_CARTERA_BOSTON,
  EMPRESA_MOSTRADOR_MULTIFASHION,
  CODIGO_MOSTRADOR,
  esCodigoDeCliente,
  esMostrador,
} from "@/lib/clientes/mundos";
import { B2B_EMPRESA_KEYS } from "@/lib/empresa-mapping";
import { empresasConCxc } from "@/lib/switch-api/empresas";

const leer = (rel: string) => readFileSync(path.join(process.cwd(), rel), "utf8");

// ─────────────────────────────────────────────────────────────────────────────
describe("las 3 listas de las 6 empresas no pueden divergir", () => {
  // Son tres declaraciones independientes del MISMO hecho, en tres archivos.
  // Es exactamente el defecto que ya costó $15.262 de cobros invisibles cuando
  // `joystep` estaba en una lista y no en las otras dos.
  it("EMPRESAS_DEL_GRUPO ≡ B2B_EMPRESA_KEYS", () => {
    expect([...EMPRESAS_DEL_GRUPO].sort()).toEqual([...B2B_EMPRESA_KEYS].sort());
  });

  it("EMPRESAS_DEL_GRUPO ≡ empresasConCxc()", () => {
    expect([...EMPRESAS_DEL_GRUPO].sort()).toEqual(empresasConCxc().sort());
  });

  it("son las 6, y ni Boston ni Multifashion están adentro", () => {
    expect(EMPRESAS_DEL_GRUPO).toHaveLength(6);
    expect(EMPRESAS_DEL_GRUPO as readonly string[]).not.toContain(EMPRESA_CARTERA_BOSTON);
    expect(EMPRESAS_DEL_GRUPO as readonly string[]).not.toContain(EMPRESA_MOSTRADOR_MULTIFASHION);
  });

  it("las dos puertas de al lado tienen nombre propio", () => {
    expect(EMPRESA_CARTERA_BOSTON).toBe("confecciones_boston");
    expect(EMPRESA_MOSTRADOR_MULTIFASHION).toBe("american_classic");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("el criterio del código D-XXX", () => {
  it("acepta los códigos del grupo", () => {
    for (const c of ["D-1", "D-26", "D-80", "D-134", "D-170", "D-201", "d-99"]) {
      expect(esCodigoDeCliente(c), c).toBe(true);
    }
  });

  it("rechaza los códigos numéricos de Boston y de intercompañía", () => {
    // Medidos en producción: Boston usa números pelados y 12188 es
    // "ACTIVE SHOES, S.A." comprándose a sí misma.
    for (const c of ["181", "191", "12188", "111380", "132144", "643"]) {
      expect(esCodigoDeCliente(c), c).toBe(false);
    }
  });

  it("rechaza el mostrador y la basura", () => {
    for (const c of ["TCKCTA", "", "   ", "D-", "D-abc", "DX-1", "XD-1", null, undefined]) {
      expect(esCodigoDeCliente(c), String(c)).toBe(false);
    }
  });

  it("tolera espacios alrededor (vienen así de Switch)", () => {
    expect(esCodigoDeCliente("  D-134  ")).toBe(true);
  });

  it("el mostrador se reconoce por CÓDIGO, nunca por nombre", () => {
    // El nombre cambia por empresa: Contado / VENTAS / VENTAS LOCA (medido).
    expect(CODIGO_MOSTRADOR).toBe("TCKCTA");
    expect(esMostrador("TCKCTA")).toBe(true);
    expect(esMostrador("  tckcta ")).toBe(true);
    for (const n of ["Contado", "VENTAS", "VENTAS LOCA", "D-80", "", null]) {
      expect(esMostrador(n), String(n)).toBe(false);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("BARRIDO ESTÁTICO — nadie se hace su propia lista de clientes", () => {
  // Los archivos que tienen permitido tocar `clientes_master` para LISTAR.
  // Cualquier otro que lo haga es un módulo que se olvidó de filtrar.
  const PUERTA = "src/lib/clientes/directorio-cache.ts";

  const CONSUMIDORES = [
    "src/app/api/clientes/route.ts",
    "src/app/api/cheques/frecuencias/route.ts",
    "src/app/api/guias/frecuencias/route.ts",
    // 12-ago-2026: la PANTALLA del directorio también. Tenía su propia copia de
    // la lectura (11.700 filas, 13 viajes, sin caché) mientras el endpoint que
    // hace lo mismo ya cacheaba 60 s. Estar en esta lista es lo que impide que
    // vuelva a abrirse por el costado.
    "src/app/clientes/page.tsx",
  ];

  it("la puerta existe y se llama por su nombre", () => {
    expect(leer(PUERTA)).toContain("export function leerClientesDelGrupo");
  });

  it("la puerta pagina — no puede volver a truncar en 1.000", () => {
    const src = leer(PUERTA);
    expect(src).toContain("leerTodoPaginado");
    expect(src).toContain("soloClientesDelGrupo");
  });

  it.each(CONSUMIDORES)("%s entra por la puerta", (rel) => {
    expect(leer(rel)).toContain("leerClientesDelGrupo");
  });

  it.each(CONSUMIDORES)("%s NO se arma su propia consulta a clientes_master", (rel) => {
    expect(leer(rel)).not.toContain('.from("clientes_master")');
  });

  it("el primer render del Directorio no hace NINGUNA lectura propia de clientes", () => {
    // Las provincias del desplegable salían de una consulta aparte, sin paginar
    // y sin filtro de mundo: 1.000 de 5.062 filas, casi todas de Boston.
    //
    // Y desde el 12-ago-2026 la lista tampoco se lee acá: la pantalla entra por
    // la misma puerta cacheada que `/api/clientes`. Antes era UNA consulta
    // propia; ahora tienen que ser CERO.
    //
    // ⚠️ CAMBIÓ DE DIRECCIÓN EL 5-sep-2026, en el rediseño de Clientes: el
    // desplegable de provincia SE RETIRÓ (99 de los 150 clientes no la tienen;
    // Daniel: «si, no sirve»), así que ya no hay `provincias` que derivar. Lo
    // que el candado protege sigue igual: **cero lecturas propias de la lista de
    // clientes**. La única consulta que la pantalla hace por su cuenta es el
    // SALDO (`switch_estadocuenta_aging`, 211 filas, acotado a las 6 en la misma
    // cadena), que no es una lista de clientes y no puede traer a nadie de más:
    // solo pone un número al lado de los que la puerta ya devolvió.
    const src = leer("src/app/clientes/page.tsx");
    expect((src.match(/\.from\("clientes_master"\)/g) ?? []).length).toBe(0);
    expect((src.match(/\.from\("switch_clientes"\)/g) ?? []).length).toBe(0);
    expect(src).toContain("leerClientesDelGrupo");
    // El saldo, si se lee, entra acotado a las 6 en la MISMA cadena.
    if (src.includes('.from("switch_estadocuenta_aging")')) {
      expect(src).toMatch(/switch_estadocuenta_aging[\s\S]{0,300}\.in\("company_key", \[\.\.\.B2B_EMPRESA_KEYS\]\)/);
    }
    // Y el desplegable de provincia no volvió por la puerta de atrás.
    expect(src).not.toContain("provincias");
  });

  it("el Directorio COPIA la lista antes de ordenarla (el array es del caché)", () => {
    // `sort` ordena EN EL LUGAR y `leerClientesDelGrupo` devuelve el MISMO array
    // que guarda el caché en memoria: sin la copia, la pantalla mutaría estado
    // compartido entre requests. Es el mismo cuidado que ya tomaba el endpoint.
    //
    // ⚠️ 5-sep-2026: la copia ahora la hace la cadena `.filter(...).map(...)`,
    // que devuelve arrays NUEVOS, y recién sobre el último se aplica `.sort()`.
    // El candado exige que entre la puerta y el `sort` haya al menos un paso que
    // copie — nunca un `sort` directo sobre lo que devolvió la puerta.
    const src = leer("src/app/clientes/page.tsx");
    const iPuerta = src.indexOf("await leerClientesDelGrupo(");
    const iCopia = Math.min(
      ...[".slice()", ".filter(", ".map("]
        .map((t) => src.indexOf(t, iPuerta))
        .filter((i) => i > -1),
    );
    const iSort = src.indexOf(".sort(", iPuerta);
    expect(iPuerta).toBeGreaterThan(-1);
    expect(iCopia).toBeGreaterThan(iPuerta);
    expect(iSort).toBeGreaterThan(iCopia);
  });

  it("la puerta lee las DOS tablas en paralelo, no una detrás de la otra", () => {
    // Son 6 viajes paginados a clientes_master y 7 a switch_clientes; en serie
    // son 13 esperas de red seguidas y no dependen entre sí.
    expect(leer(PUERTA)).toContain("await Promise.all([");
  });

  it("ningún consumidor repite la lista de las 6 a mano", () => {
    for (const rel of CONSUMIDORES) {
      const src = leer(rel);
      expect(src, rel).not.toMatch(/"vistana"[\s\S]{0,120}"fashion_wear"/);
    }
  });
});
