/**
 * ─────────────────────────────────────────────────────────────────────────────
 * EL BUSCADOR DE GUÍAS MIRA LOS TRES NOMBRES.
 *
 * 🩸 Desde #638 la pantalla muestra el nombre del cliente ATADO, pero el filtro
 * solo miraba `guia_items.cliente` —el texto que tecleó bodega—, así que quien
 * leía la pantalla y escribía lo que veía NO encontraba la guía. Medido contra
 * producción el 26-ago-2026:
 *
 *     "Sporting Shoes N4"   (el tipeo GUARDADO)  → 15 guías
 *     "Sporting Shoes N 4"  (lo que SE VE)       → 13, y ninguna de las 21
 *                                                  líneas escritas "N4"
 *     "D-142"               (el código del chip) →  0
 *
 * 🔴 EL CASO DE ESTE ARCHIVO ES REAL: D-142 «Sporting Shoes N 4» (con espacio)
 * contra las 21 líneas escritas «Sporting Shoes N4» (sin espacio). Es el más
 * frecuente de los 31 renglones que difieren por un tipeo.
 *
 * 🔴 Y ES DE CONDUCTA: se monta la lista y se lee el DOM. Un barrido de texto
 * no puede ver qué filas quedan después de teclear.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import GuiasList from "@/app/guias/components/GuiasList";
import { coincideGuiaConBusqueda, camposBuscablesDeGuia } from "@/lib/guias/buscar-guia";
import type { Guia, GuiaItem } from "@/app/guias/components/types";

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({}) })));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** `D-XXX` → cómo se llama, tal como lo entrega el directorio del grupo. */
const NOMBRES = new Map<string, string>([
  ["D-142", "Sporting Shoes N 4"],
  ["D-25", "City Mall Paso Canoa"],
]);

const item = (over: Partial<GuiaItem> = {}): GuiaItem => ({
  id: "i1", orden: 1, cliente: "", cliente_codigo: "", direccion: "David",
  empresa: "Fashion Shoes", facturas: "2520", bultos: 4, numero_guia_transp: "725", ...over,
});

function guia(numero: number, items: GuiaItem[], over: Partial<Guia> = {}): Guia {
  return {
    id: `g${numero}`, numero, fecha: "2026-08-19", transportista: "Edwin",
    modo_entrega: "transportista", transportista_id: "t1", placa: "EK0700",
    observaciones: "", total_bultos: 4, item_count: items.length, monto_total: 0,
    estado: "Completada", entregado_por: "Julio", numero_guia_transp: "725",
    guia_items: items, ...over,
  } as Guia;
}

/** GT-101: el TIPEO guardado, atado a D-142. El caso de las 21 líneas. */
const CON_TIPEO = guia(101, [item({ cliente: "Sporting Shoes N4", cliente_codigo: "D-142" })]);
/** GT-102: la misma tienda, escrita bien. */
const BIEN_ESCRITA = guia(102, [item({ id: "i2", cliente: "Sporting Shoes N 4", cliente_codigo: "D-142" })]);
/** GT-103: otra tienda, para que "encontrar todo" no cuente como encontrar. */
const OTRA = guia(103, [item({ id: "i3", cliente: "City Mall", cliente_codigo: "D-25" })], {
  transportista: "Transporte Sol",
});

const TODAS = [CON_TIPEO, BIEN_ESCRITA, OTRA];

// ─────────────────────────────────────────────────────────────────────────────

describe("🔴 la regla, sobre el caso REAL de D-142", () => {
  const busca = (q: string) => TODAS.filter((g) => coincideGuiaConBusqueda(g, q, NOMBRES));

  it("el TIPEO guardado sigue encontrando — no se rompió lo que funcionaba", () => {
    expect(busca("Sporting Shoes N4").map((g) => g.numero)).toContain(101);
  });

  it("🔴 el NOMBRE OFICIAL —el que se VE en pantalla— encuentra la del tipeo", () => {
    // Éste es el que devolvía 0 para esta guía. Es el defecto entero.
    expect(busca("Sporting Shoes N 4").map((g) => g.numero)).toContain(101);
  });

  it("🔴 el CÓDIGO del chip encuentra las dos de esa tienda", () => {
    expect(busca("D-142").map((g) => g.numero).sort()).toEqual([101, 102]);
    // Y no arrastra la que no es.
    expect(busca("D-142").map((g) => g.numero)).not.toContain(103);
  });

  it("«D-25» encuentra las guías de City Mall Paso Canoa", () => {
    expect(busca("D-25").map((g) => g.numero)).toEqual([103]);
  });

  it("no encuentra TODO: una consulta que no es de nadie no devuelve nada", () => {
    expect(busca("zapateria imposible")).toEqual([]);
  });

  it("consulta vacía = no filtrar", () => {
    expect(busca("")).toHaveLength(3);
    expect(busca("   ")).toHaveLength(3);
  });
});

describe("🔴 lo que ya andaba, sigue andando", () => {
  const busca = (q: string) => TODAS.filter((g) => coincideGuiaConBusqueda(g, q, NOMBRES));

  it("el número interno: «101», «GT-101» y «gt101»", () => {
    for (const q of ["101", "GT-101", "gt101"]) {
      expect(busca(q).map((g) => g.numero), q).toContain(101);
    }
  });

  it("🔴 el substring del número NO se perdió: «01» encuentra la 101", () => {
    // Es lo que se rompería si acá se usara `coincideBusqueda`, que por debajo
    // de 3 caracteres exige PREFIJO. Por eso este módulo usa el normalizador
    // y no esa política.
    expect(busca("01").map((g) => g.numero)).toContain(101);
  });

  it("el transportista", () => {
    expect(busca("Transporte Sol").map((g) => g.numero)).toEqual([103]);
  });

  it("las facturas y el N° del transportista de las líneas", () => {
    expect(busca("2520").length).toBe(3);
    expect(busca("725").length).toBe(3);
  });
});

describe("🔴 qué arregla el normalizador solo, y qué arregla el directorio", () => {
  // 🔑 Vale la pena separarlo, porque son dos defectos distintos.
  //
  //   · Los 31 tipeos de ESPACIO/PUNTUACIÓN ("N4" vs "N 4") los arregla el
  //     NORMALIZADOR: las dos formas caen en "sportingshoesn4". No hace falta
  //     el directorio, y por eso la búsqueda sigue andando si no cargó.
  //   · Los 27 del ALIAS de D-108 son otra cosa: en la guía dice "Multi Fashion
  //     Holding" y el chip dice "American Classics Store". Ahí NO hay
  //     normalización que valga — hace falta el nombre del directorio.

  const CON_ALIAS = guia(104, [
    item({ id: "i4", cliente: "Multi Fashion Holding", cliente_codigo: "D-108" }),
  ]);
  const CON_D108 = new Map(NOMBRES).set("D-108", "American Classics Store");

  it("el tipeo del espacio lo arregla el normalizador, SIN directorio", () => {
    const sinDir = (q: string) => TODAS.filter((g) => coincideGuiaConBusqueda(g, q));
    expect(sinDir("Sporting Shoes N4").map((g) => g.numero)).toContain(101);
    expect(sinDir("Sporting Shoes N 4").map((g) => g.numero)).toContain(101);
    expect(sinDir("D-142").map((g) => g.numero)).toContain(101);
  });

  it("🔴 el ALIAS solo lo arregla el directorio — y sin él, no se inventa nada", () => {
    expect(coincideGuiaConBusqueda(CON_ALIAS, "American Classics Store", CON_D108)).toBe(true);
    // Sin el mapa, ese nombre no está en ningún lado de la guía: no aparece.
    expect(coincideGuiaConBusqueda(CON_ALIAS, "American Classics Store")).toBe(false);
    // Y lo que SÍ está guardado sigue encontrando en los dos casos.
    expect(coincideGuiaConBusqueda(CON_ALIAS, "Multi Fashion Holding")).toBe(true);
  });

  it("los campos buscables incluyen los TRES, y el texto escrito es uno de ellos", () => {
    const campos = camposBuscablesDeGuia(CON_TIPEO, NOMBRES);
    expect(campos).toContain("sportingshoesn4"); // texto Y nombre atado, ya normalizados
    expect(campos).toContain("d142");
    expect(campos).toContain("edwin");
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("🔴 EN LA PANTALLA: teclear el nombre oficial deja la guía del tipeo", () => {
  function pintar(search: string) {
    return render(
      <GuiasList
        guias={TODAS} loading={false} error={null} search={search} setSearch={() => {}}
        showPending={false} setShowPending={() => {}} role="admin" onNewGuia={() => {}}
        expandedId={null} expandedGuia={null} expandedLoading={false} onToggleExpand={() => {}}
        onEditar={() => {}} onDespachar={() => {}} onDelete={() => {}}
        nombresPorCodigo={NOMBRES}
      />,
    );
  }

  /** Los `GT-###` que quedaron en pantalla, sin duplicar por los dos layouts. */
  const enPantalla = () =>
    [...new Set(screen.queryAllByText(/^GT-\d+$/).map((e) => e.textContent!))].sort();

  it("sin buscar, están las tres", () => {
    pintar("");
    expect(enPantalla()).toEqual(["GT-101", "GT-102", "GT-103"]);
  });

  it("🔴 «Sporting Shoes N 4» deja las DOS de esa tienda — incluida la del tipeo", () => {
    pintar("Sporting Shoes N 4");
    expect(enPantalla()).toEqual(["GT-101", "GT-102"]);
  });

  it("«D-142» hace lo mismo desde el código del chip", () => {
    pintar("D-142");
    expect(enPantalla()).toEqual(["GT-101", "GT-102"]);
  });

  it("y una consulta que no es de nadie deja la lista vacía", () => {
    pintar("zapateria imposible");
    expect(enPantalla()).toEqual([]);
    expect(document.body.textContent).toContain("No hay guías");
  });
});
