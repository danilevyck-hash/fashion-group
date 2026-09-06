// ============================================================================
// LA GUÍA COMO IMAGEN, para el grupo de WhatsApp.
//
// Daniel, 5-sep-2026: *«en el grupo de WhatsApp siempre ponen compartir cuando
// terminan (llega en pdf)»*. Una imagen se LEE dentro del chat; un PDF hay que
// abrirlo. El corte (hasta 6 renglones) vive en `compartir-formato.ts` con su
// medición: 94% de las guías entran.
//
// 🩸 TODO ACÁ ES SÍNCRONO, Y NO ES UN CAPRICHO. Safari en iOS solo abre la hoja
// de compartir DENTRO del gesto del toque: un solo `await` en el medio y el
// navegador deja de contarlo como gesto y la bloquea, sin decir por qué. Por
// eso se dibuja con el API 2D del canvas, se saca el PNG con `toDataURL`
// (síncrono — `toBlob` NO lo es) y el `data:` se pasa a bytes a mano.
//
// 🔑 LAS FIRMAS SE PRECARGAN, NO SE ESPERAN. `precargarFirmasGuia` se llama al
// ABRIR la guía (igual que el módulo del papel), así que para cuando alguien
// toca «Compartir» las dos imágenes ya están decodificadas y se dibujan sin
// esperar nada. Si por lo que sea no lo están, el recuadro sale con el nombre
// de quien firmó y nada más: **nunca se inventa una firma**, y el PDF completo
// sigue estando a un toque en «Imprimir».
//
// ⚠️ ESTA IMAGEN NO REEMPLAZA AL PAPEL. El documento legal es el PDF —con su
// texto legal y sus dos firmas— y no cambió ni un píxel. Esto es lo que se
// manda por chat.
// ============================================================================

import { fmtDate, fmtGuia } from "@/lib/format";
import { nombreDespachadoPor } from "./despachado-por";
import { facturasParaMostrar } from "./numero-factura";
import { observacionesVisibles } from "./observaciones";
import {
  ETIQUETA_TIPO_DESPACHO,
  esEntregaDirecta,
  numeroTranspImpreso,
  sinCeroPelado,
  tipoDespachoEfectivo,
} from "./modo-despacho";
import type { Guia } from "@/app/guias/components/types";

/** Ancho de la imagen. 1080 px es lo que WhatsApp deja pasar sin recomprimir feo. */
const ANCHO = 1080;
const MARGEN = 48;
const ANCHO_UTIL = ANCHO - MARGEN * 2;

const TINTA = "#111111";
const TINTA_SUAVE = "#6b7280";
const LINEA = "#d1d5db";
const FONDO = "#ffffff";
const FONDO_ENCABEZADO = "#f3f4f6";

const FUENTE = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

/** Caché de firmas ya decodificadas, por su `data:` URL. */
const firmas = new Map<string, HTMLImageElement>();

/**
 * Pide al navegador que decodifique las firmas de esta guía. Se llama al ABRIR
 * la guía, nunca dentro del clic: para eso existe.
 */
export function precargarFirmasGuia(g: { firma_base64?: string | null; firma_entregador_base64?: string | null }): void {
  if (typeof window === "undefined") return;
  for (const src of [g.firma_base64, g.firma_entregador_base64]) {
    const url = String(src ?? "");
    if (!url || firmas.has(url)) continue;
    const img = new Image();
    img.src = url;
    firmas.set(url, img);
  }
}

/** La firma YA decodificada, o `null`. Nunca espera. */
function firmaLista(src: string | null | undefined): HTMLImageElement | null {
  const url = String(src ?? "");
  if (!url) return null;
  const img = firmas.get(url);
  if (img && img.complete && img.naturalWidth > 0) return img;
  // No estaba pedida: se pide para la próxima vez, y esta vez se sale sin ella.
  if (!img) precargarFirmasGuia({ firma_base64: url });
  return null;
}

/** `data:image/png;base64,…` → bytes, sin `fetch` (que sería un `await`). */
function bytesDeDataUrl(dataUrl: string): Uint8Array {
  const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  const crudo = atob(base64);
  const bytes = new Uint8Array(crudo.length);
  for (let i = 0; i < crudo.length; i++) bytes[i] = crudo.charCodeAt(i);
  return bytes;
}

/** Recorta un texto al ancho dado, con «…». Nunca desborda su columna. */
function recortar(ctx: CanvasRenderingContext2D, texto: string, ancho: number): string {
  const t = String(texto ?? "");
  if (ctx.measureText(t).width <= ancho) return t;
  let corto = t;
  while (corto.length > 1 && ctx.measureText(`${corto}…`).width > ancho) {
    corto = corto.slice(0, -1);
  }
  return `${corto}…`;
}

/** Nombre del archivo: se ve en el chat, así que dice qué es. */
export function nombreImagenGuia(g: Guia): string {
  return `Guia-${fmtGuia(g.numero)}-${String(g.fecha ?? "").slice(0, 10)}.png`;
}

/**
 * Dibuja la guía y devuelve el archivo PNG. **Síncrono de punta a punta.**
 * `null` si el navegador no da un canvas 2D — quien llama cae al PDF, que es
 * el camino de siempre.
 */
export function construirPngGuia(g: Guia): File | null {
  if (typeof document === "undefined") return null;
  const items = (g.guia_items ?? []).filter((i) => i);
  const directa = esEntregaDirecta(g);

  // ── Alto: se calcula antes de dibujar, porque redimensionar borra el lienzo.
  const obs = observacionesVisibles(g.observaciones);
  const altoCabecera = 236;
  const altoFilas = 52;
  const altoTabla = 46 + items.length * altoFilas + altoFilas;
  const altoObs = obs ? 96 : 0;
  const altoFirmas = 190;
  const alto = altoCabecera + altoTabla + altoObs + altoFirmas + MARGEN;

  const canvas = document.createElement("canvas");
  canvas.width = ANCHO;
  canvas.height = alto;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.fillStyle = FONDO;
  ctx.fillRect(0, 0, ANCHO, alto);
  ctx.textBaseline = "alphabetic";

  let y = MARGEN + 16;

  // ── Encabezado ────────────────────────────────────────────────────────────
  ctx.fillStyle = TINTA;
  ctx.font = `700 34px ${FUENTE}`;
  ctx.fillText("FASHION GROUP", MARGEN, y + 12);
  ctx.font = `700 34px ${FUENTE}`;
  const titulo = fmtGuia(g.numero);
  ctx.fillText(titulo, ANCHO - MARGEN - ctx.measureText(titulo).width, y + 12);

  y += 30;
  ctx.font = `400 20px ${FUENTE}`;
  ctx.fillStyle = TINTA_SUAVE;
  ctx.fillText("Guía de transporte", MARGEN, y + 12);

  y += 34;
  ctx.strokeStyle = LINEA;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(MARGEN, y);
  ctx.lineTo(ANCHO - MARGEN, y);
  ctx.stroke();

  // ── Campos, dos columnas ──────────────────────────────────────────────────
  const campos: Array<[string, string]> = [
    ["Fecha", fmtDate(String(g.fecha ?? ""))],
    ["Cómo salió", ETIQUETA_TIPO_DESPACHO[tipoDespachoEfectivo(g)]],
  ];
  if (!directa) {
    campos.push(["Transportista", String(g.transportista ?? "")]);
    campos.push(["Placa", sinCeroPelado(g.placa)]);
  } else if (g.nombre_chofer) {
    campos.push(["Chofer", String(g.nombre_chofer)]);
  }
  campos.push(["Despachado por", nombreDespachadoPor(String(g.entregado_por ?? ""))]);
  campos.push(["Recibido por", String(g.receptor_nombre ?? "")]);

  y += 34;
  const colCampo = ANCHO_UTIL / 2;
  campos.forEach(([etiqueta, valor], i) => {
    const x = MARGEN + (i % 2) * colCampo;
    const fila = Math.floor(i / 2);
    const yy = y + fila * 34;
    ctx.font = `600 19px ${FUENTE}`;
    ctx.fillStyle = TINTA_SUAVE;
    ctx.fillText(`${etiqueta}:`, x, yy);
    const dx = ctx.measureText(`${etiqueta}: `).width;
    ctx.font = `400 19px ${FUENTE}`;
    ctx.fillStyle = TINTA;
    ctx.fillText(recortar(ctx, valor || "—", colCampo - dx - 16), x + dx, yy);
  });
  y += Math.ceil(campos.length / 2) * 34 + 18;

  // ── Tabla de envíos ───────────────────────────────────────────────────────
  // Los anchos suman ANCHO_UTIL exacto; sin la columna del transportista, su
  // espacio se lo reparten cliente y destino.
  const cols = directa
    ? [
        { titulo: "#", w: 44 },
        { titulo: "CLIENTE", w: 300 },
        { titulo: "DESTINO", w: 230 },
        { titulo: "EMPRESA", w: 210 },
        { titulo: "FACTURA(S)", w: 156 },
        { titulo: "BULTOS", w: 44 },
      ]
    : [
        { titulo: "#", w: 44 },
        { titulo: "CLIENTE", w: 250 },
        { titulo: "DESTINO", w: 180 },
        { titulo: "EMPRESA", w: 180 },
        { titulo: "FACTURA(S)", w: 140 },
        { titulo: "BULTOS", w: 80 },
        { titulo: "N° TRANSP.", w: 110 },
      ];

  const xDe = (i: number) => MARGEN + cols.slice(0, i).reduce((s, c) => s + c.w, 0);

  ctx.fillStyle = FONDO_ENCABEZADO;
  ctx.fillRect(MARGEN, y, ANCHO_UTIL, 46);
  ctx.fillStyle = TINTA;
  ctx.font = `600 17px ${FUENTE}`;
  cols.forEach((c, i) => ctx.fillText(c.titulo, xDe(i) + 10, y + 30));
  y += 46;

  const totalBultos = items.reduce((s, i) => s + (Number(i.bultos) || 0), 0);

  ctx.font = `400 19px ${FUENTE}`;
  items.forEach((it, idx) => {
    const valores = directa
      ? [
          String(idx + 1),
          String(it.cliente ?? ""),
          String(it.direccion ?? ""),
          String(it.empresa ?? ""),
          facturasParaMostrar(it.facturas),
          it.bultos ? String(it.bultos) : "",
        ]
      : [
          String(idx + 1),
          String(it.cliente ?? ""),
          String(it.direccion ?? ""),
          String(it.empresa ?? ""),
          facturasParaMostrar(it.facturas),
          it.bultos ? String(it.bultos) : "",
          numeroTranspImpreso(it.numero_guia_transp, g.numero_guia_transp),
        ];
    ctx.fillStyle = TINTA;
    valores.forEach((v, i) => {
      ctx.fillText(recortar(ctx, v, cols[i].w - 20), xDe(i) + 10, y + 34);
    });
    ctx.strokeStyle = LINEA;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(MARGEN, y + altoFilas);
    ctx.lineTo(ANCHO - MARGEN, y + altoFilas);
    ctx.stroke();
    y += altoFilas;
  });

  // Total
  ctx.font = `700 20px ${FUENTE}`;
  ctx.fillStyle = TINTA;
  const rotulo = "TOTAL DE BULTOS";
  ctx.fillText(rotulo, MARGEN + 10, y + 34);
  const nTotal = String(totalBultos);
  ctx.fillText(nTotal, ANCHO - MARGEN - 10 - ctx.measureText(nTotal).width, y + 34);
  y += altoFilas + 12;

  // ── Observaciones ─────────────────────────────────────────────────────────
  if (obs) {
    ctx.font = `600 17px ${FUENTE}`;
    ctx.fillStyle = TINTA_SUAVE;
    ctx.fillText("OBSERVACIONES", MARGEN, y + 20);
    ctx.font = `400 19px ${FUENTE}`;
    ctx.fillStyle = TINTA;
    ctx.fillText(recortar(ctx, obs.replace(/\n+/g, " · "), ANCHO_UTIL), MARGEN, y + 52);
    y += altoObs;
  }

  // ── Firmas ────────────────────────────────────────────────────────────────
  const anchoFirma = ANCHO_UTIL / 2 - 16;
  const cajas: Array<[string, string | undefined, string]> = [
    [
      directa ? "Firma del chofer" : "Firma del transportista",
      g.firma_base64,
      String(g.receptor_nombre ?? ""),
    ],
    [
      directa ? "Firma del cliente" : "Firma del entregador",
      g.firma_entregador_base64,
      nombreDespachadoPor(String(g.entregado_por ?? "")),
    ],
  ];
  cajas.forEach(([etiqueta, src, quien], i) => {
    const x = MARGEN + i * (anchoFirma + 32);
    ctx.strokeStyle = LINEA;
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, anchoFirma, 110);
    const img = firmaLista(src);
    if (img) {
      // Se dibuja dentro de la caja, conservando la proporción.
      const escala = Math.min((anchoFirma - 20) / img.naturalWidth, 90 / img.naturalHeight);
      ctx.drawImage(
        img,
        x + (anchoFirma - img.naturalWidth * escala) / 2,
        y + (110 - img.naturalHeight * escala) / 2,
        img.naturalWidth * escala,
        img.naturalHeight * escala,
      );
    }
    ctx.font = `400 17px ${FUENTE}`;
    ctx.fillStyle = TINTA_SUAVE;
    ctx.fillText(etiqueta, x, y + 138);
    ctx.font = `600 19px ${FUENTE}`;
    ctx.fillStyle = TINTA;
    ctx.fillText(recortar(ctx, quien || "", anchoFirma), x, y + 164);
  });

  const dataUrl = canvas.toDataURL("image/png");
  const bytes = bytesDeDataUrl(dataUrl);
  return new File([bytes.buffer as ArrayBuffer], nombreImagenGuia(g), { type: "image/png" });
}
