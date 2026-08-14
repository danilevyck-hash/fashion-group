// ─────────────────────────────────────────────────────────────────────────────
// 🔴 EL LINK PÚBLICO NO PUEDE VER LA CARTERA DE CLIENTES (14-ago-2026)
//
// Era el miedo concreto de Daniel, textual: *"quiero que el que lo use pueda
// hacer su pedido… pero que el cliente/usuario no escoja el cliente (**ya que
// vería toda mi cartera de clientes**)"*.
//
// Hoy ya está bien resuelto —el link pide el nombre en TEXTO LIBRE y no toca el
// directorio— y este archivo existe para que siga así. Es la regla que ya tenía
// escrita `roles.ts` en `clienteSwitchRoles`: del selector de clientes se saca
// el rol legacy 'cliente' *porque darle el directorio ENTERO de clientes de la
// empresa a un comprador sería una fuga*.
//
// LO QUE SE BARRE: los archivos del camino público de las 4 marcas — el
// catálogo compartible, la pantalla del pedido, sus páginas y sus endpoints sin
// sesión. Ninguno puede nombrar el directorio de clientes ni sus endpoints.
//
// 🩸 LOS COMENTARIOS SE BORRAN PRIMERO. Este repo ya pagó CUATRO veces el
// candado que se cumple —o se rompe— con su propia explicación: el barrido del
// mayor contable, el `<h1>` de Saldos, el `revalidateOnFocus` de Reclamos y la
// línea de aporte de Metas. Este mismo archivo nombra `switch_clientes` en su
// cabecera, así que sin el stripper se acusaría a sí mismo.
//
// ⚠️ NO se barre `pedido-publico/[id]/confirmar`, que sí toca tablas del
// sistema: lo que se le prohíbe es LEER LA CARTERA, y eso se prueba por
// conducta en `catalogo-paridad-publico-switch.test.ts` (no consulta
// switch_clientes ni vendedores). Acá el barrido cubre lo que se le SIRVE al
// navegador de quien abre el link.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

const RAIZ = join(__dirname, "..", "..");

/** Archivos que el navegador de un desconocido puede llegar a ejecutar o pedir. */
const ARCHIVOS_PUBLICOS = [
  "components/catalogo/CatalogoPublicoPage.tsx",
  "components/catalogo/PedidoPublicoClient.tsx",
  "app/catalogo-publico/[marca]/page.tsx",
  "app/pedido-reebok/[id]/page.tsx",
  "app/pedido-joybees/[id]/page.tsx",
  "app/pedido-tommy/[id]/page.tsx",
  "app/pedido-calvin/[id]/page.tsx",
  "app/api/catalogo/[marca]/pedido-publico/route.ts",
  "app/api/catalogo/[marca]/pedido-publico/[id]/route.ts",
  "app/api/catalogo/[marca]/public/route.ts",
];

/**
 * Todo lo que sería una fuga de la cartera: las tablas del directorio, los
 * endpoints que las sirven y el selector que las pinta.
 */
const PROHIBIDO = [
  "switch_clientes",
  "clientes_master",
  "directorio_clientes",
  "clientes-switch",
  "clientes-search",
  "ClienteSwitchPicker",
  "ClientePicker",
  "useBusquedaClientes",
];

/** Sin comentarios: un candado no puede cumplirse con su propia explicación. */
function sinComentarios(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ")
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, " ");
}

describe("el flujo público no lee la cartera de clientes", () => {
  it("los archivos del barrido EXISTEN (un barrido sobre cero archivos pasa sin mirar nada)", () => {
    const faltan = ARCHIVOS_PUBLICOS.filter((r) => !existsSync(join(RAIZ, r)));
    expect(faltan).toEqual([]);
    expect(ARCHIVOS_PUBLICOS.length).toBeGreaterThanOrEqual(10);
  });

  for (const rel of ARCHIVOS_PUBLICOS) {
    it(`🔴 ${rel} no nombra el directorio de clientes`, () => {
      const src = sinComentarios(readFileSync(join(RAIZ, rel), "utf8"));
      for (const aguja of PROHIBIDO) {
        expect(src, `${rel} nombra "${aguja}"`).not.toContain(aguja);
      }
    });
  }

  it("🔴 el stripper de comentarios FUNCIONA (si no, el barrido no probaría nada)", () => {
    expect(sinComentarios("// switch_clientes\nconst a = 1;")).not.toContain("switch_clientes");
    expect(sinComentarios("/* clientes_master */ const a = 1;")).not.toContain("clientes_master");
    // …y no se come el código de verdad.
    expect(sinComentarios('const t = "switch_clientes";')).toContain("switch_clientes");
  });

  it("🔴 el nombre del cliente en el link es TEXTO LIBRE, y sigue siéndolo", () => {
    const src = readFileSync(join(RAIZ, "components/catalogo/PedidoPublicoClient.tsx"), "utf8");
    // El campo donde la persona escribe su nombre. Si esto desapareciera, el
    // link habría dejado de pedir el nombre — que es lo único que después dice
    // quién pidió.
    expect(src).toMatch(/cliente_nombre|clienteNombre/);
  });
});
