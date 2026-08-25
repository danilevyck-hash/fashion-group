// ─────────────────────────────────────────────────────────────────────────────
// PEDIDO O COTIZACIÓN — la regla y las palabras, en un solo lugar.
//
// Lo que este archivo protege NO es el texto por bonito: es que la advertencia
// que la pantalla tiene que dar ANTES de mandar exista, diga lo único que hay
// que decir (una cotización NO aparta mercancía) y esté escrita en español
// simple. Y que el valor que viaja al servidor no se pueda ensuciar desde el
// navegador.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import {
  DOCUMENTO_POR_DEFECTO,
  OPCIONES_DOCUMENTO,
  TEXTO_COTIZACION_DESPUES,
  TEXTO_NO_RESERVA,
  TEXTO_SI_RESERVA,
  esCotizacion,
  esDocumentoSwitch,
  etapaTelegram,
  etiquetaDocumento,
  normalizarDocumento,
  tituloCreadoEnSwitch,
  tituloEnviadoASwitch,
} from "@/lib/catalogo/documento-switch";

const SRC = (rel: string) => readFileSync(path.join(process.cwd(), rel), "utf8");

describe("normalizarDocumento — el servidor no confía en el navegador", () => {
  it("las dos salidas válidas pasan tal cual", () => {
    expect(normalizarDocumento("pedido")).toBe("pedido");
    expect(normalizarDocumento("cotizacion")).toBe("cotizacion");
  });

  it("🔴 cualquier otra cosa cae a PEDIDO, nunca a cotización", () => {
    // El modo de fallo aceptable es crear el documento de siempre. Si un valor
    // raro cayera a "cotizacion", un body malformado mandaría al ERP algo que
    // NO aparta mercancía sin que nadie lo haya elegido.
    for (const basura of [
      undefined, null, "", "factura", "COTIZACION", "Cotización", "cotizacion ",
      0, 1, true, {}, [], "pedido2",
    ]) {
      expect(normalizarDocumento(basura)).toBe("pedido");
    }
  });

  it("el default es PEDIDO — es lo que el sistema hacía antes de la elección", () => {
    expect(DOCUMENTO_POR_DEFECTO).toBe("pedido");
    expect(normalizarDocumento(undefined)).toBe(DOCUMENTO_POR_DEFECTO);
  });

  it("`esDocumentoSwitch` acepta exactamente dos valores, ni uno más", () => {
    expect(esDocumentoSwitch("pedido")).toBe(true);
    expect(esDocumentoSwitch("cotizacion")).toBe(true);
    expect(esDocumentoSwitch("cotización")).toBe(false); // con tilde NO es el valor
    expect(esDocumentoSwitch("nota")).toBe(false);
  });
});

describe("🔴 LA ADVERTENCIA — lo único que no se puede dejar de decir", () => {
  it("dice que NO aparta la mercancía, con esas palabras", () => {
    expect(TEXTO_NO_RESERVA).toMatch(/NO aparta la mercancía/);
    // Y explica la consecuencia, que es lo que hace entender: los pares le
    // siguen apareciendo disponibles a los demás.
    expect(TEXTO_NO_RESERVA).toMatch(/otros vendedores/);
    expect(TEXTO_NO_RESERVA).toMatch(/disponibles/);
  });

  it("está en español simple: sin jerga de sistemas", () => {
    const jerga = /\b(stock|inventario|reserva de stock|commit|SKU|backorder|hold)\b/i;
    for (const t of [TEXTO_NO_RESERVA, TEXTO_SI_RESERVA, TEXTO_COTIZACION_DESPUES]) {
      expect(t, `"${t}" usa jerga`).not.toMatch(jerga);
    }
  });

  it("el pedido dice lo contrario, con las MISMAS palabras (aparta / no aparta)", () => {
    expect(TEXTO_SI_RESERVA).toMatch(/Aparta la mercancía/);
  });

  it("dice qué hacer después de cotizar, para que el pedido no quede trabado", () => {
    // Un pedido admite UN envío no-fallido: si salió como cotización, el pedido
    // real se hace duplicando. Decirlo antes evita el llamado de después.
    expect(TEXTO_COTIZACION_DESPUES).toMatch(/duplica/i);
  });

  it("🔴 las dos opciones existen, en orden, y la de cotización TRAE la advertencia", () => {
    expect(OPCIONES_DOCUMENTO.map((o) => o.clave)).toEqual(["pedido", "cotizacion"]);
    const cot = OPCIONES_DOCUMENTO.find((o) => o.clave === "cotizacion")!;
    expect(cot.queHace).toBe(TEXTO_NO_RESERVA);
    expect(cot.detalle).toBe(TEXTO_COTIZACION_DESPUES);
    const ped = OPCIONES_DOCUMENTO.find((o) => o.clave === "pedido")!;
    expect(ped.queHace).toBe(TEXTO_SI_RESERVA);
    expect(ped.titulo).toBe("Pedido");
    expect(cot.titulo).toBe("Cotización");
  });
});

describe("cómo se nombra cada salida en pantalla y en Telegram", () => {
  it("etiquetas", () => {
    expect(etiquetaDocumento("pedido")).toBe("Pedido");
    expect(etiquetaDocumento("cotizacion")).toBe("Cotización");
    expect(esCotizacion("cotizacion")).toBe(true);
    expect(esCotizacion("pedido")).toBe(false);
  });

  it("los títulos de estado nombran lo que REALMENTE está en Switch", () => {
    expect(tituloCreadoEnSwitch("pedido")).toBe("Pedido creado en Switch");
    expect(tituloCreadoEnSwitch("cotizacion")).toBe("Cotización creada en Switch");
    expect(tituloEnviadoASwitch("cotizacion")).toContain("Cotización");
  });

  it("la etapa de Telegram grita COTIZACIÓN — el canal se lee de un vistazo", () => {
    expect(etapaTelegram("cotizacion")).toContain("COTIZACIÓN");
    expect(etapaTelegram("pedido")).toBe("enviado a Switch");
  });
});

// ── Candados de estructura ───────────────────────────────────────────────────

describe("🔴 la advertencia y la elección viven en UN solo lugar", () => {
  /**
   * Los barridos estáticos de este repo BORRAN LOS COMENTARIOS PRIMERO: un
   * candado que se cumple con su propia explicación no es un candado. Este
   * archivo ya pagó esa lección cuatro veces.
   */
  const sinComentarios = (src: string) =>
    src
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split("\n")
      .map((l) => l.replace(/(^|[^:])\/\/.*$/, "$1"))
      .join("\n");

  const PANTALLAS = [
    "src/components/catalogo/CheckoutClient.tsx",
    "src/components/catalogo/PedidoDetalleClient.tsx",
    "src/components/catalogo/ConfirmacionClient.tsx",
  ];

  it("ninguna pantalla reescribe la advertencia a mano", () => {
    // Tres copias de una advertencia se separan solas, y la que quede vieja es
    // la que manda plata al ERP.
    for (const p of PANTALLAS) {
      const src = sinComentarios(SRC(p));
      expect(src, `${p} escribe la advertencia a mano`).not.toContain("NO aparta la mercancía");
    }
  });

  it("las tres pantallas dibujan EL selector compartido", () => {
    for (const p of PANTALLAS) {
      const src = sinComentarios(SRC(p));
      expect(src, `${p} no dibuja ElegirDocumentoSwitch`).toContain("<ElegirDocumentoSwitch");
    }
  });

  it("🔴 el selector dibuja las opciones DEL MÓDULO, no una lista propia", () => {
    const src = sinComentarios(SRC("src/components/catalogo/ElegirDocumentoSwitch.tsx"));
    expect(src).toContain("OPCIONES_DOCUMENTO.map");
    // Y el modal es el patrón del repo: portal + inset-0 + lock, sin autoFocus.
    expect(src).toContain("createPortal");
    expect(src).toContain("inset-0");
    expect(src).toContain("useBodyScrollLock");
    expect(src).not.toContain("autoFocus");
  });

  it("🔴 el servidor normaliza en LAS DOS rutas de envío", () => {
    for (const p of [
      "src/lib/catalogo/enviar-switch-route.ts",
      "src/app/api/catalogo/checkout/route.ts",
    ]) {
      const src = sinComentarios(SRC(p));
      expect(src, `${p} no normaliza el documento`).toContain("normalizarDocumento(body?.documento)");
    }
  });

  it("🔴 el candado del CLIENTE sigue ANTES del documento en la ruta del detalle", () => {
    // Si el 422 quedara después de resolver la salida, una cotización podría
    // colarse por un camino que el pedido no tiene. El orden es el candado.
    const src = sinComentarios(SRC("src/lib/catalogo/enviar-switch-route.ts"));
    const candado = src.indexOf("tieneClienteElegido(order)");
    const motor = src.indexOf("enviarPedidoSwitch({");
    expect(candado).toBeGreaterThan(-1);
    expect(motor).toBeGreaterThan(candado);
  });
});
