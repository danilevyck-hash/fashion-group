// ─────────────────────────────────────────────────────────────────────────────
// LA REGLA DEL CLIENTE ELEGIDO — módulo puro, en las DOS direcciones.
//
// El candado que importa es el de CONDUCTA
// (`components/pedido-cliente-obligatorio.test.tsx`): renderiza las pantallas y
// cuenta qué sale por `fetch`. Este archivo cubre lo que aquél no puede ver de
// un vistazo — los bordes de la regla y el pedido del LINK, que es la excepción
// que NO se puede romper.
//
// ⚠️ El barrido estático del final borra los comentarios ANTES de mirar: en
// este repo ya fallaron cuatro candados por encontrar el texto que buscaban
// dentro de la explicación de por qué ese texto no debe estar.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import {
  LABEL_CONTADO,
  SIN_CLIENTE_ELEGIDO,
  esPedidoDelLink,
  faltaParaEnviar,
  textoFaltaEnviar,
  tieneClienteElegido,
} from "@/lib/catalogo/cliente-elegido";

const leer = (rel: string) => readFileSync(path.join(process.cwd(), rel), "utf8");
/** Sin comentarios: un candado no se puede cumplir con su propia explicación. */
const sinComentarios = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

describe("esPedidoDelLink", () => {
  it("lo reconoce por origen_original (así viaja en Reebok)", () => {
    expect(esPedidoDelLink({ origen_original: "link" })).toBe(true);
    expect(esPedidoDelLink({ origen_original: "mio" })).toBe(false);
  });

  it("🔴 y TAMBIÉN por origen_short_id — es lo único que traen las otras 3 marcas", () => {
    // Sin esto, Joybees/Tommy/Calvin leerían un pedido del link como interno y
    // le cerrarían el campo de nombre que la persona escribió.
    expect(esPedidoDelLink({ origen_short_id: "ab12cd34" })).toBe(true);
    expect(esPedidoDelLink({ origen_original: null, origen_short_id: "ab12cd34" })).toBe(true);
  });

  it("un pedido interno no se disfraza de link con un short_id vacío", () => {
    expect(esPedidoDelLink({ origen_short_id: "" })).toBe(false);
    expect(esPedidoDelLink({ origen_short_id: "   " })).toBe(false);
    expect(esPedidoDelLink({ origen_short_id: null })).toBe(false);
    expect(esPedidoDelLink({})).toBe(false);
    expect(esPedidoDelLink(null)).toBe(false);
  });
});

describe("tieneClienteElegido", () => {
  it("🩸 el caso PED-004: nombre escrito y NINGÚN cliente atrás → NO está elegido", () => {
    // Medido en producción: client_name = "CITY MALL PASO CANOA",
    // cliente_switch_id = null. El nombre en pantalla no es un cliente.
    expect(tieneClienteElegido({ cliente_switch_id: null })).toBe(false);
  });

  it("con un cliente del directorio, sí", () => {
    expect(tieneClienteElegido({ cliente_switch_id: 42 })).toBe(true);
  });

  it("🔴 el mostrador ES un cliente elegido: tiene id propio (TCKCTA = 1 en las 4 empresas)", () => {
    expect(tieneClienteElegido({ cliente_switch_id: 1 })).toBe(true);
  });

  it("un id imposible no cuenta como elección", () => {
    expect(tieneClienteElegido({ cliente_switch_id: 0 })).toBe(false);
    expect(tieneClienteElegido({ cliente_switch_id: -3 })).toBe(false);
    expect(tieneClienteElegido({ cliente_switch_id: 1.5 })).toBe(false);
    expect(tieneClienteElegido({})).toBe(false);
    expect(tieneClienteElegido(undefined)).toBe(false);
  });

  it("🔴 EL PEDIDO DEL LINK NO SE TRABA — su mostrador lo pone el sistema por regla", () => {
    // Medido: PED-022 vive con client_name "Nathalie". Bloquearlo dejaría los
    // pedidos del link sin poder salir a Switch nunca.
    expect(tieneClienteElegido({ origen_short_id: "ab12cd34", cliente_switch_id: null })).toBe(true);
    expect(tieneClienteElegido({ origen_original: "link", cliente_switch_id: null })).toBe(true);
    expect(tieneClienteElegido({ origen_short_id: "ab12cd34", cliente_switch_id: 1 })).toBe(true);
  });
});

describe("faltaParaEnviar / textoFaltaEnviar", () => {
  const completo = { clienteElegido: true, vendedorElegido: true, hayItems: true, preordersEnCarrito: 0 };

  it("con todo puesto no falta nada", () => {
    expect(faltaParaEnviar(completo)).toEqual([]);
    expect(textoFaltaEnviar([])).toBe("");
  });

  it("🔴 sin cliente, lo dice", () => {
    expect(faltaParaEnviar({ ...completo, clienteElegido: false })).toEqual(["elegir el cliente"]);
    expect(textoFaltaEnviar(["elegir el cliente"])).toBe("Falta: elegir el cliente");
  });

  it("faltando varias cosas se nombran TODAS de una vez, no una por toque", () => {
    const falta = faltaParaEnviar({ clienteElegido: false, vendedorElegido: false, hayItems: false, preordersEnCarrito: 2 });
    expect(falta).toEqual(["agregar productos", "elegir el cliente", "elegir el vendedor", "quitar los productos en preventa"]);
    expect(textoFaltaEnviar(falta))
      .toBe("Falta: agregar productos, elegir el cliente, elegir el vendedor y quitar los productos en preventa");
  });

  it('se lee como se habla: "y" antes del último', () => {
    expect(textoFaltaEnviar(["elegir el cliente", "elegir el vendedor"]))
      .toBe("Falta: elegir el cliente y elegir el vendedor");
  });
});

describe("los textos", () => {
  it("🔴 lo que se muestra sin cliente NO dice Contado", () => {
    // Decirlo sería volver a poner el default silencioso, esta vez de mentira.
    expect(SIN_CLIENTE_ELEGIDO).not.toMatch(/contado/i);
    expect(SIN_CLIENTE_ELEGIDO).toBe("Elige el cliente");
  });

  it("🔴 la venta de mostrador se dice con todas las letras", () => {
    // "Contado" a secas se leía como un valor técnico de relleno.
    expect(LABEL_CONTADO).toBe("Contado (venta de mostrador)");
  });
});

describe("BARRIDO — el default no puede volver por la puerta de atrás", () => {
  const CHECKOUT = "src/components/catalogo/CheckoutClient.tsx";
  const DETALLE = "src/components/catalogo/PedidoDetalleClient.tsx";

  it("🔴 el checkout NO puede arrancar con un cliente puesto", () => {
    const src = sinComentarios(leer(CHECKOUT));
    // El estado del cliente nace vacío. Cualquier otra cosa (CONTADO, un
    // objeto literal, el primero de la lista) es el bug de vuelta.
    expect(src).toMatch(/useState<Cliente \| undefined>\(undefined\)/);
    expect(src).not.toMatch(/useState<Cliente>\(\s*CONTADO\s*\)/);
  });

  it("🔴 las dos pantallas derivan la regla del módulo único, no la reescriben", () => {
    for (const f of [CHECKOUT, DETALLE]) {
      expect(sinComentarios(leer(f))).toMatch(/from "@\/lib\/catalogo\/cliente-elegido"/);
    }
  });

  // ⚠️ Que el selector no preseleccione el mostrador NO se vigila acá: se
  // verifica RENDERIZÁNDOLO, en `pedido-cliente-obligatorio.test.tsx`
  // ("el selector abre SIN NADA marcado"). El primer intento fue un barrido de
  // texto y pasaba con la mutación puesta — su regex no cruzaba la llave del
  // objeto y no matcheaba nunca.
});
