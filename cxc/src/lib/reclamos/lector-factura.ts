// ─────────────────────────────────────────────────────────────────────────────
// RECLAMOS — LO QUE SE LE PIDE AL LECTOR DE FACTURAS, Y CÓMO SE LEE (puro).
//
// Lo usan DOS lugares: la ruta `/api/reclamos/ia/leer-factura` (al subir el
// PDF en Nuevo reclamo) y el backfill `scripts/_backfill-reclamos-fecha-factura`
// (relee los PDF que existen para llenar `fecha_factura`). Un solo prompt y un
// solo parser, para que los dos lean lo mismo.
//
// 🩸 Antes el lector YA sacaba `fecha_factura` y el formulario la descartaba
// (la ponía en «Fecha», que era otra cosa). Ahora se guarda en su columna.
//
// Lo que se agregó el 10-sep-2026: la EMPRESA FACTURADA (el «Cliente» del PDF)
// y los RENGLONES. Ver `lineas-factura.ts` para lo medido en los PDF reales.
// ─────────────────────────────────────────────────────────────────────────────

import { normalizarLineas, type LineaFactura } from "./lineas-factura";

export const MODELO_LECTOR = "claude-sonnet-4-6";
export const MAX_TOKENS_LECTOR = 8192;

export interface FacturaExtraida {
  proveedor: string | null;
  marca: string | null;
  nro_factura: string | null;
  fecha_factura: string | null;
  nro_orden_compra: string | null;
  /** A quién le facturaron: el «Cliente» / «Bill to» del PDF. */
  empresa_facturada: string | null;
  lineas: LineaFactura[];
}

export const PROMPT_LECTOR = `Eres un asistente que extrae datos de facturas de proveedores de moda en Panamá (español).
Devuelve SOLO un JSON válido con esta forma exacta, sin prosa alrededor:
{
  "proveedor": string | null,         // nombre del EMISOR de la factura (ej. "American Designer Fashion")
  "marca": string | null,             // marca de la mercancía (ej. "Calvin Klein", "Tommy Hilfiger", "Reebok")
  "nro_factura": string | null,       // número de la factura
  "fecha_factura": string | null,     // fecha de emisión, formato YYYY-MM-DD
  "nro_orden_compra": string | null,  // número de orden de compra / "Pedido" / "PO" / "Pedidos" de la factura
  "empresa_facturada": string | null, // a quién le facturan: el nombre del "Cliente" / "Bill to" (ej. "FASHION WEAR", "Active Shoes SA")
  "lineas": [                         // TODOS los renglones de mercancía de la factura, en orden
    {
      "referencia": string,           // el código / estilo / N° de artículo del renglón (ej. "DM0DM04410002", "100245427")
      "descripcion": string,          // la descripción y, si hay, el nombre del estilo (ej. "CAMISETA PARA CABALLERO · ORIGINAL VN KNIT SS")
      "talla": string | null,         // la talla SOLO si la factura la trae; null si no
      "cantidad": number,             // cantidad del renglón (número)
      "precio": number                // precio unitario (número, con punto decimal)
    }
  ]
}
Reglas:
- Si un campo no es legible o no aparece, usa null.
- No inventes datos. No devuelvas nada fuera del JSON.
- "proveedor" es quien EMITE la factura; "marca" es la marca de los productos; "empresa_facturada" es el CLIENTE al que le facturan.
- Los números pueden venir con coma decimal ("16,00"): devuélvelos con punto (16.00).
- Si un renglón trae un desglose por talla en la misma línea (por ejemplo "8.5 [2], 9 [2], 11 [1]", donde el corchete es la cantidad), devuelve UN renglón por talla con esa cantidad y el mismo precio, en vez del renglón junto.
- Si la factura no trae talla por renglón, "talla" va en null: no la deduzcas del código.
- Incluye todos los renglones, aunque sean cien. No resumas.`;

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

/** Saca el JSON de la respuesta del modelo; null si no se puede leer. */
export function parsearRespuestaLector(texto: string): FacturaExtraida | null {
  const m = texto.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const obj = JSON.parse(m[0]) as Record<string, unknown>;
    return {
      proveedor: str(obj.proveedor),
      marca: str(obj.marca),
      nro_factura: str(obj.nro_factura),
      fecha_factura:
        typeof obj.fecha_factura === "string" && /^\d{4}-\d{2}-\d{2}$/.test(obj.fecha_factura) ? obj.fecha_factura : null,
      nro_orden_compra: str(obj.nro_orden_compra),
      empresa_facturada: str(obj.empresa_facturada),
      lineas: normalizarLineas(obj.lineas),
    };
  } catch {
    return null;
  }
}
