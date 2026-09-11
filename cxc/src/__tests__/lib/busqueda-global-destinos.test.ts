/* ─────────────────────────────────────────────────────────────────────────────
 * 🔴 CANDADO — LO QUE ENCUENTRA LA BÚSQUEDA (⌘K) TIENE QUE LLEVARTE AHÍ
 *
 * 11-sep-2026. Cuatro de los ocho grupos de resultados no llegaban a destino.
 * Ninguno daba error: te dejaban en otra pantalla, que es peor, porque parece
 * que la búsqueda funcionó.
 *
 *   · GUÍA      → `/guias?id=<id>`, y el middleware tiene un redirect viejo que
 *                 convierte eso en `/guias/<id>/imprimir`: buscar una guía
 *                 abría la HOJA DE IMPRIMIR, no la guía. Ahora `/guias/<id>`.
 *                 ⚠️ El redirect NO se toca: cubre enlaces viejos de WhatsApp
 *                 y correo.
 *   · CLIENTE   → `/clientes` a secas, la lista de 148, aunque el resultado ya
 *                 traía el código y `/clientes/<codigo>` existe desde el
 *                 5-sep-2026. Ahora su FICHA.
 *   · VENTAS    → `/ventas?search=<nombre>`, un parámetro que no lee NADIE:
 *                 caía en la pestaña Resumen. Ahora `?tab=clientes&cliente=
 *                 <CÓDIGO>`, el deep link que Ventas › Clientes ya lee,
 *                 preselecciona y resalta.
 *   · CAJA      → `/caja?periodo=<id>`, otro parámetro sin lectores: dejaba en
 *                 la lista de períodos. Ahora `/caja/<id>`.
 *
 * 🔴 EL CÓDIGO DEL CLIENTE DE VENTAS NO SALE DEL NOMBRE. El puente es el de la
 * casa —`switch_facturas (empresa_key, cliente_switch_id)` → `switch_clientes`
 * → `codigo`—; unir por nombre es lo que un día publicó $2,55 millones de venta
 * que no existió. Sin código, el resultado abre la pestaña Clientes sin
 * preseleccionar: la pantalla correcta, sin inventar a quién.
 *
 * ⚠️ LO QUE QUEDA PENDIENTE, DICHO: el gasto de Caja encontrado abre su
 * PERÍODO, pero no queda resaltado dentro. Resaltarlo pide que la pantalla de
 * Caja lea un parámetro, y hoy no lee ninguno.
 * ────────────────────────────────────────────────────────────────────────── */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

const leer = (rel: string) => readFileSync(path.join(process.cwd(), rel), "utf8");
const sinComentarios = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^[ \t]*\/\/.*$/gm, "");

const BARRA = sinComentarios(leer("src/components/SearchBar.tsx"));
const API = sinComentarios(leer("src/app/api/search/route.ts"));

describe("🔴 los cuatro destinos que no llegaban", () => {
  it("una guía abre LA GUÍA, no su hoja de imprimir", () => {
    expect(BARRA).toContain("href: `/guias/${g.id}`");
    expect(BARRA).not.toContain("/guias?id=");
  });

  it("un cliente del Directorio abre SU FICHA", () => {
    expect(BARRA).toContain("/clientes/${encodeURIComponent(codigo)}");
    // Sin código se cae a la lista, nunca a una ficha inventada.
    expect(BARRA).toContain('codigo ? `/clientes/${encodeURIComponent(codigo)}` : "/clientes"');
  });

  it("un resultado de Ventas abre la pestaña Clientes con SU CÓDIGO", () => {
    expect(BARRA).toContain("/ventas?tab=clientes&cliente=${encodeURIComponent(v.codigo)}");
    expect(BARRA).not.toContain("/ventas?search=");
  });

  it("un gasto de Caja abre SU PERÍODO", () => {
    expect(BARRA).toContain("href: cj.periodo_id ? `/caja/${cj.periodo_id}` : \"/caja\"");
    expect(BARRA).not.toContain("/caja?periodo=");
  });
});

describe("🔴 el código del cliente sale del PUENTE, nunca del nombre", () => {
  it("la ruta pide el puente y lo resuelve contra switch_clientes", () => {
    expect(API).toContain("cliente_switch_id");
    expect(API).toContain('.from("switch_clientes")');
    expect(API).toMatch(/select\("empresa_key, cliente_switch_id, codigo"\)/);
    // La llave del mapa es el PAR, no el nombre.
    expect(API).toContain("`${row.empresa_key}|${row.cliente_switch_id}`");
  });

  it("y sigue acotando a las 6 del grupo por INCLUSIÓN", () => {
    expect(API).toContain("EMPRESAS_DEL_GRUPO");
    expect(API).not.toContain("empresa_key=neq");
  });

  it("el puente NO viaja al navegador: solo el código", () => {
    expect(API).toContain("switchId: _switchId");
    expect(leer("src/components/SearchBar.tsx")).toContain("codigo?: string");
  });
});

describe("CONTROL: lo que ya llegaba sigue llegando", () => {
  it("los tres atajos con parámetro que SÍ se leen no se tocaron", () => {
    expect(BARRA).toContain("/cxc?search=");
    expect(BARRA).toContain("/reclamos?empresa=");
    expect(BARRA).toContain("/guias?pendientes=1");
  });

  it("los resultados de CXC, reclamos y préstamos conservan su destino", () => {
    expect(BARRA).toContain("/reclamos?view=detail&id=${rec.id}");
    expect(BARRA).toContain("/prestamos/${p.id}");
  });

  it("el redirect viejo de `/guias?id=` sigue vivo en el middleware", () => {
    const mw = sinComentarios(leer("src/middleware.ts"));
    expect(mw).toContain('pathname === "/guias"');
    expect(mw).toContain("/imprimir");
  });
});
