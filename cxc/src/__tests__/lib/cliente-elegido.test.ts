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
  ID_CONTADO_RESPALDO,
  LABEL_CONTADO,
  NOMBRE_CONTADO_GUARDADO,
  SIN_CLIENTE_ELEGIDO,
  clienteParaCheckout,
  esClienteDeMostrador,
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

  // 🔴 CAMBIÓ DE DIRECCIÓN EL 14-ago-2026 (2ª vuelta), y es el punto del cambio.
  //
  // Antes este test exigía que un pedido del LINK pasara SIEMPRE, con el
  // argumento de que su mostrador lo pone el sistema por regla. Daniel pidió lo
  // contrario, textual: *"pueda entrar al sistema interno, escoger, editar
  // precio, agregar o quitar y ponerle el nombre del cliente para así mandarlo
  // a Switch"*. Medido: PED-022 "Nathalie" salió SOLO a Switch a nombre del
  // mostrador y quedó bloqueado para editar — lo que él quiere hacer con ese
  // pedido no se podía.
  it("🔴 EL PEDIDO DEL LINK TAMBIÉN EXIGE CLIENTE — el origen ya no lo exime", () => {
    expect(tieneClienteElegido({ origen_short_id: "ab12cd34", cliente_switch_id: null })).toBe(false);
    expect(tieneClienteElegido({ origen_original: "link", cliente_switch_id: null })).toBe(false);
  });

  it("🔴 y con cliente puesto sale igual que uno interno (incluido el mostrador)", () => {
    expect(tieneClienteElegido({ origen_short_id: "ab12cd34", cliente_switch_id: 1 })).toBe(true);
    expect(tieneClienteElegido({ origen_original: "link", cliente_switch_id: 42 })).toBe(true);
  });

  it("🔴 la regla NO mira el origen: mismo cliente, mismo veredicto", () => {
    for (const id of [null, 0, 1, 42]) {
      const interno = tieneClienteElegido({ cliente_switch_id: id });
      expect(tieneClienteElegido({ cliente_switch_id: id, origen_short_id: "ab12cd34" })).toBe(interno);
      expect(tieneClienteElegido({ cliente_switch_id: id, origen_original: "link" })).toBe(interno);
    }
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

// ─────────────────────────────────────────────────────────────────────────────
// DE LO QUE DEVUELVE EL SELECTOR ÚNICO A LO QUE VIAJA EN EL CHECKOUT
//
// 🔴 17-ago-2026: el checkout dejó de tener su lista propia. Lo único suyo que
// quedaba —convertir lo elegido en `{ id, nombre }`— se mudó acá. El servidor
// exige id entero > 0 y nombre no vacío (si no, 400), así que estos bordes son
// la diferencia entre un pedido que sale y uno que se traba con el cliente ya
// elegido en pantalla.
// ─────────────────────────────────────────────────────────────────────────────

describe("esClienteDeMostrador / clienteParaCheckout", () => {
  const MOSTRADOR = { id: 1, codigo: "TCKCTA", nombre: "VENTAS LOCA" };
  const REAL = { id: 42, codigo: "D-42", nombre: "Sporting Shoes" };

  it("🔴 el mostrador se reconoce por CÓDIGO, no por nombre", () => {
    // En Switch cada empresa lo llama distinto: "Contado" · "VENTAS" ·
    // "VENTAS LOCA". Comparar por nombre habría sido un colador.
    expect(esClienteDeMostrador(MOSTRADOR)).toBe(true);
    expect(esClienteDeMostrador({ id: 908, codigo: "tckcta", nombre: "VENTAS" })).toBe(true);
    expect(esClienteDeMostrador({ id: 5, codigo: " TCKCTA ", nombre: "Contado" })).toBe(true);
    expect(esClienteDeMostrador(REAL)).toBe(false);
    // Ojo: un cliente que SE LLAME "Contado" pero tenga otro código NO lo es.
    expect(esClienteDeMostrador({ id: 9, codigo: "D-9", nombre: "Contado" })).toBe(false);
    expect(esClienteDeMostrador(null)).toBe(false);
  });

  it("sin id resuelto también es el mostrador (es su opción, con el respaldo)", () => {
    expect(esClienteDeMostrador({ id: null, codigo: null, nombre: LABEL_CONTADO })).toBe(true);
  });

  it("🔴 el mostrador viaja con el nombre literal de siempre, no con la etiqueta de pantalla", () => {
    // Cambiar lo que se ESCRIBE cambiaría el dato de los pedidos nuevos.
    expect(clienteParaCheckout(MOSTRADOR)).toEqual({ id: 1, nombre: NOMBRE_CONTADO_GUARDADO });
    expect(NOMBRE_CONTADO_GUARDADO).toBe("Contado");
    expect(NOMBRE_CONTADO_GUARDADO).not.toBe(LABEL_CONTADO);
  });

  it("🔴 y con el id REAL de SU empresa, no con un número escrito a mano", () => {
    expect(clienteParaCheckout({ id: 908, codigo: "TCKCTA", nombre: "VENTAS" }).id).toBe(908);
  });

  it("🔴 si el directorio no resolvió el mostrador, la elección NO se pierde", () => {
    // Ante la duda se conserva lo que tocó la persona. Mandar id 0/null haría
    // que el servidor conteste 400 con el cliente ya elegido en pantalla.
    expect(clienteParaCheckout({ id: null, codigo: null, nombre: LABEL_CONTADO }))
      .toEqual({ id: ID_CONTADO_RESPALDO, nombre: NOMBRE_CONTADO_GUARDADO });
    expect(ID_CONTADO_RESPALDO).toBe(1);
  });

  it("un cliente real viaja tal cual", () => {
    expect(clienteParaCheckout(REAL)).toEqual({ id: 42, nombre: "Sporting Shoes" });
  });

  it("🔴 el nombre nunca queda vacío (el servidor lo rechazaría con 400)", () => {
    expect(clienteParaCheckout({ id: 42, codigo: "D-42", nombre: null }))
      .toEqual({ id: 42, nombre: "D-42" });
    expect(clienteParaCheckout({ id: 42, codigo: "  ", nombre: "   " }))
      .toEqual({ id: 42, nombre: "Cliente 42" });
  });

  it("lo que sale de acá SIEMPRE pasa el candado del servidor", () => {
    const casos = [
      MOSTRADOR, REAL,
      { id: null, codigo: null, nombre: null },
      { id: 908, codigo: "TCKCTA", nombre: "VENTAS" },
      { id: 7, codigo: null, nombre: "" },
    ];
    for (const c of casos) {
      const { id, nombre } = clienteParaCheckout(c);
      expect(Number.isInteger(id) && id > 0, JSON.stringify(c)).toBe(true);
      expect(nombre.trim().length, JSON.stringify(c)).toBeGreaterThan(0);
    }
  });
});

describe("BARRIDO — el default no puede volver por la puerta de atrás", () => {
  const CHECKOUT = "src/components/catalogo/CheckoutClient.tsx";
  const DETALLE = "src/components/catalogo/PedidoDetalleClient.tsx";

  it("🔴 el checkout NO puede arrancar con un cliente puesto", () => {
    const src = sinComentarios(leer(CHECKOUT));
    // El estado del cliente nace vacío. Cualquier otra cosa (CONTADO, un
    // objeto literal, el primero de la lista) es el bug de vuelta.
    // (El tipo pasó a ser el del selector único el 17-ago-2026.)
    expect(src).toMatch(/useState<ClienteSwitchOpcion \| undefined>\(undefined\)/);
    expect(src).not.toMatch(/useState<ClienteSwitchOpcion>\(/);
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
