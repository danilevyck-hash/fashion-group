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
import { existsSync, readFileSync } from "fs";
import path from "path";
import {
  DOCUMENTO_POR_DEFECTO,
  ESTADOS_EN_SWITCH,
  NOTA_COTIZACION,
  OPCIONES_DOCUMENTO,
  palabraDelPapel,
  palabraEnSwitch,
  esCotizacion,
  esDocumentoSwitch,
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
  it("🔴 el PÁRRAFO YA NO EXISTE, ni como constante muerta", () => {
    // 25-ago-2026. Daniel lo señaló en su captura de la confirmación, textual:
    // *"no siempre tiene que haber explicación, eso ensucia mi ERP"*. Se borró
    // `TEXTO_NO_RESERVA` entero. No se deja "por si acaso": una constante
    // muerta con el párrafo adentro es el párrafo esperando a que alguien la
    // vuelva a montar — el mismo motivo por el que `ElegirDocumentoSwitch` se
    // borró en vez de dejarse sin usar.
    const modulo = SRC("src/lib/catalogo/documento-switch.ts");
    expect(modulo).not.toMatch(/export const TEXTO_NO_RESERVA/);
    expect(modulo).not.toMatch(/si cotizas 500 pares/);
    // Y NINGUNA pantalla vuelve a dibujar el párrafo a mano.
    for (const rel of [
      "src/components/catalogo/ConfirmacionClient.tsx",
      "src/components/catalogo/CheckoutClient.tsx",
      "src/components/catalogo/PedidoDetalleClient.tsx",
      "src/components/catalogo/EnviarDocumentoSwitch.tsx",
    ]) {
      expect(SRC(rel), `${rel} volvió a explicar el párrafo`).not.toMatch(/500 pares/);
      expect(SRC(rel), `${rel} volvió a explicar el párrafo`).not.toMatch(/TEXTO_NO_RESERVA/);
    }
  });

  it("está en español simple: sin jerga de sistemas", () => {
    const jerga = /\b(stock|inventario|reserva de stock|commit|SKU|backorder|hold)\b/i;
    for (const t of [NOTA_COTIZACION]) {
      expect(t, `"${t}" usa jerga`).not.toMatch(jerga);
    }
  });

  it("🔴 la ETIQUETA dice lo mismo en tres palabras — y no puede volver a ser un párrafo", () => {
    // 25-ago-2026. Daniel: *"sin párrafo explicando, btw no siempre hay q estar
    // explicando todo, se vuelve tedioso"*. La elección es directa y de toda la
    // explicación queda SOLO el dato material, pegado a la opción. Si mañana
    // alguien le agrega media frase "para que se entienda mejor", vuelve a ser
    // el párrafo que Daniel sacó — por eso el largo es parte del candado.
    expect(NOTA_COTIZACION).toBe("no aparta mercancía");
    expect(NOTA_COTIZACION.split(/\s+/).length).toBeLessThanOrEqual(4);
    expect(NOTA_COTIZACION.length).toBeLessThanOrEqual(24);
    // Una etiqueta, no una oración: sin punto final y sin ejemplo adentro.
    expect(NOTA_COTIZACION).not.toMatch(/[.;]/);
    expect(NOTA_COTIZACION).not.toMatch(/500 pares/);
  });

  it("🔴 las dos opciones existen, en orden, y SOLO la cotización lleva etiqueta", () => {
    expect(OPCIONES_DOCUMENTO.map((o) => o.clave)).toEqual(["pedido", "cotizacion"]);
    const cot = OPCIONES_DOCUMENTO.find((o) => o.clave === "cotizacion")!;
    expect(cot.nota).toBe(NOTA_COTIZACION);
    const ped = OPCIONES_DOCUMENTO.find((o) => o.clave === "pedido")!;
    // El pedido NO lleva nota: es lo de todos los días y no hay nada que avisar.
    // Ponerle una vuelve a hacer gemelos a los dos botones.
    expect(ped.nota).toBeUndefined();
    expect(ped.titulo).toBe("Pedido");
    expect(cot.titulo).toBe("Cotización");
  });

  it("🔴 la advertencia vive DONDE SE DECIDE, y ya no en Telegram", () => {
    // 25-ago-2026, CAMBIO DE DIRECCIÓN. Este candado exigía que el aviso de
    // Telegram repitiera "No aparta mercancía". Daniel podó el aviso a dos
    // líneas —textual: ***"lo quiero más simple… solo quiero lo útil"***— y
    // esa línea fue lo primero que sacó: llega DESPUÉS de mandar, cuando ya no
    // evita nada, y él ya sabe qué es una cotización.
    //
    // Lo que el candado protege ahora es lo que SÍ evita el error: la etiqueta
    // pegada al botón, ANTES de mandar. Esa no se puede podar.
    expect(NOTA_COTIZACION).toBe("no aparta mercancía");
    const cot = OPCIONES_DOCUMENTO.find((o) => o.clave === "cotizacion")!;
    expect(cot.nota).toBe(NOTA_COTIZACION);
    // Y el aviso de Telegram NO la repite: dos líneas, y punto.
    const tg = SRC("src/lib/catalogo/telegram-pedido.ts");
    expect(tg).not.toMatch(/extras: \[\s*"No aparta mercancía/);
    expect(tg).toMatch(/etiquetaDocumento/);
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

  // 🔴 `etapaTelegram` SE BORRÓ el 25-ago-2026 junto con la etapa deletreada del
  // aviso ("— COTIZACIÓN enviada a Switch"). Lo que el canal necesita para
  // leerse de un vistazo lo da `etiquetaDocumento` («Cotización»/«Pedido») como
  // PRIMERA palabra del mensaje, más el emoji 📝/📦. El candado de eso vive en
  // telegram-pedido-origen.test.ts, que compara el mensaje entero.
  it("la palabra que grita cuál de las dos es sigue existiendo", () => {
    expect(etiquetaDocumento("cotizacion")).toBe("Cotización");
    expect(etiquetaDocumento("pedido")).toBe("Pedido");
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

  it("ninguna pantalla reescribe la advertencia ni la etiqueta a mano", () => {
    // Tres copias de una advertencia se separan solas, y la que quede vieja es
    // la que manda plata al ERP.
    for (const p of PANTALLAS) {
      const src = sinComentarios(SRC(p));
      expect(src, `${p} escribe la advertencia a mano`).not.toContain("NO aparta la mercancía");
      expect(src, `${p} escribe la etiqueta a mano`).not.toContain(NOTA_COTIZACION);
    }
  });

  it("las tres pantallas dibujan EL control compartido", () => {
    for (const p of PANTALLAS) {
      const src = sinComentarios(SRC(p));
      expect(src, `${p} no dibuja EnviarDocumentoSwitch`).toContain("<EnviarDocumentoSwitch");
    }
  });

  it("🔴 NINGUNA pantalla dice ya «Enviar a Switch» en un botón propio", () => {
    // 25-ago-2026: lo que se ofrece son las dos salidas, directo. Si alguna
    // pantalla se quedara con su botón viejo, ahí se perdería la etiqueta de
    // que la cotización no aparta mercancía — y ése es el camino que manda
    // plata al ERP.
    for (const p of PANTALLAS) {
      const src = sinComentarios(SRC(p));
      expect(src, `${p} conserva un botón "Enviar a Switch"`).not.toMatch(/>\s*(\{[^}]*)?"?Enviar a Switch/);
    }
  });

  it("🔴 el control dibuja las opciones DEL MÓDULO, no una lista propia", () => {
    const src = sinComentarios(SRC("src/components/catalogo/EnviarDocumentoSwitch.tsx"));
    expect(src).toContain("OPCIONES_DOCUMENTO.map");
    // 🔴 Y NO es un modal: la elección es DIRECTA, sin ventana en el medio. Si
    // volviera a abrirse un portal, volvería el paso que Daniel sacó.
    expect(src).not.toContain("createPortal");
    expect(src).not.toContain("useBodyScrollLock");
    expect(src).not.toContain("autoFocus");
    // La nota se dibuja desde la opción, no escrita a mano.
    expect(src).toContain("o.nota");
    expect(src).not.toContain(NOTA_COTIZACION);
  });

  it("🔴 el modal de elección ya no existe — no quedó una segunda forma de mandar", () => {
    expect(existsSync(path.join(process.cwd(), "src/components/catalogo/ElegirDocumentoSwitch.tsx")))
      .toBe(false);
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

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 LA PALABRA QUE ACOMPAÑA AL NÚMERO (25-ago-2026)
//
// Daniel mandó TOM-027 como COTIZACIÓN, Switch la aceptó, y la pantalla decía
// "Pedido TOM-027 guardado" en grande y el PDF "Pedido: TOM-027" en el
// encabezado. Textual: *"esto fue una cotización, porque dice pedidos en pdf?"*.
// Una cotización NO aparta mercancía: el papel que dice "Pedido" hace creer que
// sí, y ese papel se le manda al cliente.
// ─────────────────────────────────────────────────────────────────────────────
describe("🔴 palabraEnSwitch — la decide SWITCH, y hay un tercer caso", () => {
  it("una cotización se llama Cotización, un pedido se llama Pedido", () => {
    expect(palabraEnSwitch({ estado: "verificado", documento: "cotizacion" })).toBe("Cotización");
    expect(palabraEnSwitch({ estado: "enviado", documento: "cotizacion" })).toBe("Cotización");
    expect(palabraEnSwitch({ estado: "verificado", documento: "pedido" })).toBe("Pedido");
  });

  it("🔴 un pedido que TODAVÍA NO SALIÓ no es ninguna de las dos: null", () => {
    // No se le inventa etiqueta. Quien pinte decide con qué se queda.
    expect(palabraEnSwitch(null)).toBeNull();
    expect(palabraEnSwitch(undefined)).toBeNull();
    expect(palabraEnSwitch({ estado: "error", documento: "cotizacion" })).toBeNull();
    expect(palabraEnSwitch({ estado: "pendiente", documento: "cotizacion" })).toBeNull();
    expect(palabraEnSwitch({})).toBeNull();
  });

  it("es el MISMO criterio de 'está en Switch' que el candado de edición", () => {
    // Dos definiciones de lo mismo se separan solas: la que quede vieja le
    // miente a alguien sobre si la mercancía está apartada.
    expect([...ESTADOS_EN_SWITCH].sort()).toEqual(["enviado", "verificado"]);
    expect(SRC("src/lib/catalogo/switch-lock.ts")).toMatch(/ESTADOS_EN_SWITCH/);
  });

  it("con el DDL 20260824160000 pendiente (sin columna) sale PEDIDO, no se cae", () => {
    expect(palabraEnSwitch({ estado: "verificado" })).toBe("Pedido");
    expect(palabraEnSwitch({ estado: "verificado", documento: null })).toBe("Pedido");
    // Y un valor inventado tampoco se convierte en cotización.
    expect(palabraEnSwitch({ estado: "verificado", documento: "nota" })).toBe("Pedido");
  });

  it("palabraDelPapel: manda Switch; si no salió, la que la pantalla ya usaba", () => {
    expect(palabraDelPapel({ estado: "verificado", documento: "cotizacion" }, "Pedido")).toBe("Cotización");
    // 🩸 El caso de TOM-027: el pedido está `confirmado` acá (mandarlo a Switch
    // lo escribe) y aun así el papel dice Cotización.
    expect(palabraDelPapel({ estado: "enviado", documento: "cotizacion" }, "Pedido")).toBe("Cotización");
    expect(palabraDelPapel(null, "Pedido")).toBe("Pedido");
    expect(palabraDelPapel(null, "Cotización")).toBe("Cotización");
    expect(palabraDelPapel(null)).toBe("Pedido");
  });

  it("🔴 EL NÚMERO NUNCA CAMBIA — solo la palabra que lo acompaña", () => {
    // TOM-027 es el número de la casa y se llama así siempre. Ningún prefijo,
    // ningún renombre: lo que cambia es la PALABRA de al lado.
    for (const envio of [
      { estado: "verificado", documento: "cotizacion" },
      { estado: "verificado", documento: "pedido" },
      null,
    ]) {
      const palabra = palabraDelPapel(envio, "Pedido");
      expect(`${palabra}: TOM-027`).toMatch(/TOM-027$/);
    }
  });
});

describe("🔴 LAS SUPERFICIES: ninguna escribe la palabra a mano", () => {
  it("la CONFIRMACIÓN saca el título del módulo, no de un literal", () => {
    const src = SRC("src/components/catalogo/ConfirmacionClient.tsx");
    expect(src).toMatch(/palabraDelPapel/);
    // El literal viejo, el que mentía, no vuelve.
    expect(src).not.toMatch(/`Pedido \$\{order\.order_number\} guardado`/);
  });

  it("el PDF pinta la palabra que le pasan, y por defecto la de siempre", () => {
    const src = SRC("src/lib/catalogo/order-pdf-core.ts");
    expect(src).toMatch(/documentoLabel/);
    // Nunca más un "Pedido:" cableado en el encabezado del papel.
    expect(src).not.toMatch(/`Pedido: \$\{orderNumber\}`/);
  });

  it("las TRES salidas del PDF piden la palabra al módulo", () => {
    // El de la confirmación ("Ver PDF"), el que baja el detalle y el adjunto
    // del correo. Tres copias de la regla se separan solas.
    for (const rel of [
      "src/app/api/catalogo/[marca]/orders/[id]/pdf/route.ts",
      "src/app/api/catalogo/[marca]/send-order/route.ts",
    ]) {
      expect(SRC(rel), rel).toMatch(/palabraDelEnvioActivo/);
      expect(SRC(rel), rel).toMatch(/documentoLabel/);
    }
    // 🩸 EN EL DETALLE ESTO ES UN CANDADO DE FUENTE Y SE DICE DE FRENTE: bajo el
    // candado post-envío la pantalla NO dibuja "Compartir pedido"
    // (`switchLock ? null : …`), así que por "Descargar PDF" nunca se llega a la
    // rama de la cotización de Switch y ningún test de conducta puede tocarla.
    // Lo que sí se puede exigir es que la decisión NO vuelva a escribirse a
    // mano: el `status` solo es exactamente lo que bajaba "Pedido-TOM-027.pdf"
    // para una cotización, porque mandar a Switch escribe `confirmado`.
    const detalle = SRC("src/components/catalogo/PedidoDetalleClient.tsx");
    expect(detalle).toMatch(/const prefix = palabraDelPapel\(\s*\n\s*switchEnvio,/);
    expect(detalle).not.toMatch(/const prefix = order\.status ===/);
    expect(detalle).toMatch(/documentoLabel: prefix/);
  });

  it("🩸 el nombre del archivo del encabezado HTTP sobrevive a la tilde", () => {
    // "Cotización" lleva tilde y Content-Disposition es un encabezado HTTP: sin
    // RFC 6266 el navegador baja "CotizaciÃ³n-TOM-027.pdf".
    const src = SRC("src/app/api/catalogo/[marca]/orders/[id]/pdf/route.ts");
    expect(src).toMatch(/filename\*=UTF-8/);
    expect(src).not.toMatch(/inline; filename="\$\{documentoLabel/);
  });

  it("la LISTA del admin y el EXCEL ya lo decían — y lo siguen diciendo", () => {
    const numeros = SRC("src/lib/catalogo/numeros-pedido.ts");
    expect(numeros).toMatch(/etiquetaDocumento/);
    expect(SRC("src/lib/catalogos/pedidos-excel.ts")).toMatch(/switchDocumento/);
  });
});
