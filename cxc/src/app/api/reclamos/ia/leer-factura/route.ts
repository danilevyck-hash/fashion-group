import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { requireAdminOSecretaria } from "@/lib/api-auth";
import { supabaseServer } from "@/lib/supabase-server";
import { FACTURA_BUCKET } from "@/lib/reclamos/factura-storage";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Sonnet 4.6 lee el PDF (texto + visual). Mismo modelo que Marketing.
const MODEL = "claude-sonnet-4-6";

interface Body {
  path?: string;
}

interface FacturaExtraida {
  proveedor: string | null;
  marca: string | null;
  nro_factura: string | null;
  fecha_factura: string | null;
  nro_orden_compra: string | null;
}

const PROMPT = `Eres un asistente que extrae datos de facturas de proveedores de moda en Panamá (español).
Devuelve SOLO un JSON válido con esta forma exacta, sin prosa alrededor:
{
  "proveedor": string | null,        // nombre del EMISOR de la factura (ej. "American Designer Fashion")
  "marca": string | null,            // marca de la mercancía (ej. "Calvin Klein", "Tommy Hilfiger", "Reebok")
  "nro_factura": string | null,      // número de la factura
  "fecha_factura": string | null,    // fecha de emisión, formato YYYY-MM-DD
  "nro_orden_compra": string | null  // número de orden de compra / "Pedido" / "PO" de la factura
}
Reglas:
- Si un campo no es legible o no aparece, usa null.
- No inventes datos. No devuelvas nada fuera del JSON.
- "proveedor" es quien EMITE la factura; "marca" es la marca de los productos.
- "nro_orden_compra" es el Pedido / Orden de Compra / PO que aparezca en la factura.`;

function parsearRespuesta(texto: string): FacturaExtraida | null {
  const jsonMatch = texto.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;
  try {
    const obj = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
    const str = (v: unknown): string | null =>
      typeof v === "string" && v.trim() ? v.trim() : null;
    return {
      proveedor: str(obj.proveedor),
      marca: str(obj.marca),
      nro_factura: str(obj.nro_factura),
      fecha_factura:
        typeof obj.fecha_factura === "string" &&
        /^\d{4}-\d{2}-\d{2}$/.test(obj.fecha_factura)
          ? obj.fecha_factura
          : null,
      nro_orden_compra: str(obj.nro_orden_compra),
    };
  } catch {
    return null;
  }
}

// POST /api/reclamos/ia/leer-factura  { path }
// Descarga el PDF del bucket privado "reclamo-facturas", lo lee con la IA y
// devuelve los campos de cabecera. NUNCA inventa; campo ilegible → null.
export async function POST(req: NextRequest) {
  const denied = requireAdminOSecretaria(req);
  if (denied) return denied;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY no configurada" },
      { status: 500 },
    );
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  if (!body.path) {
    return NextResponse.json({ error: "Falta path del PDF" }, { status: 400 });
  }

  try {
    const { data: fileData, error: dlError } = await supabaseServer.storage
      .from(FACTURA_BUCKET)
      .download(body.path);
    if (dlError || !fileData) {
      throw new Error(dlError?.message ?? "No se pudo descargar el PDF");
    }
    const arrayBuffer = await fileData.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString("base64");

    const client = new Anthropic({ apiKey });
    const msg = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "document",
              source: { type: "base64", media_type: "application/pdf", data: base64 },
            },
            { type: "text", text: PROMPT },
          ],
        },
      ],
    });

    const textBlock = msg.content.find((b) => b.type === "text");
    const raw = textBlock && textBlock.type === "text" ? textBlock.text : "";
    const extraido = parsearRespuesta(raw);
    if (!extraido) {
      return NextResponse.json(
        { error: "No se pudo interpretar la respuesta del modelo" },
        { status: 502 },
      );
    }

    return NextResponse.json(extraido);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Error leyendo la factura";
    console.error("reclamos/ia/leer-factura POST:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
