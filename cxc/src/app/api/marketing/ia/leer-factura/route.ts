import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { supabaseServer } from "@/lib/supabase-server";
import { leerPdfConAnthropic } from "@/lib/ia/anthropic";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Modelo de lectura de facturas. El ID anterior (claude-sonnet-4-20250514) fue
// retirado por la API y devolvía 404 not_found_error → TODA factura fallaba con
// "No se pudo leer la factura con IA". Sonnet 4.6 lee el PDF (texto + visual).
const MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 1024;

// 🔴 La llamada a Anthropic pasa por `lib/ia/anthropic.ts`, el ÚNICO punto de
// llamada del sistema: es el que avisa por 🔧 SISTEMA cuando la llave no sirve,
// se acabó el crédito o la cuenta está topada (11-sep-2026). El prompt, el
// modelo y el parser de esta ruta NO cambiaron.

interface Body {
  path?: string;
}

interface FacturaExtraida {
  numero_factura: string | null;
  fecha_factura: string | null;
  proveedor: string | null;
  concepto: string | null;
  subtotal: number | null;
  itbms_pct: 0 | 7 | null;
}

const PROMPT = `Eres un asistente que extrae datos de facturas de proveedores panameños (español).
Devuelve SOLO un JSON válido con esta forma exacta, sin prosa alrededor:
{
  "numero_factura": string | null,
  "fecha_factura": string | null,   // formato YYYY-MM-DD
  "proveedor": string | null,       // nombre del emisor de la factura
  "concepto": string | null,        // descripción corta de los bienes/servicios (1 frase, max 120 caracteres)
  "subtotal": number | null,        // subtotal antes de ITBMS (sin impuesto)
  "itbms_pct": 0 | 7 | null         // porcentaje de ITBMS detectado. 0 si no hay impuesto, 7 si hay ~7%
}
Reglas:
- Si un campo no es legible o no aparece, usa null.
- No inventes datos. No devuelvas texto fuera del JSON.
- "subtotal" es el monto gravable antes del ITBMS, no el total.
- Detecta ITBMS solo como 0 o 7 (Panamá cobra 7% o exento).`;

function parsearRespuesta(texto: string): FacturaExtraida | null {
  const jsonMatch = texto.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;
  try {
    const obj = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
    return {
      numero_factura:
        typeof obj.numero_factura === "string" && obj.numero_factura.trim()
          ? obj.numero_factura.trim()
          : null,
      fecha_factura:
        typeof obj.fecha_factura === "string" &&
        /^\d{4}-\d{2}-\d{2}$/.test(obj.fecha_factura)
          ? obj.fecha_factura
          : null,
      proveedor:
        typeof obj.proveedor === "string" && obj.proveedor.trim()
          ? obj.proveedor.trim()
          : null,
      concepto:
        typeof obj.concepto === "string" && obj.concepto.trim()
          ? obj.concepto.trim().slice(0, 120)
          : null,
      subtotal:
        typeof obj.subtotal === "number" && Number.isFinite(obj.subtotal)
          ? obj.subtotal
          : null,
      itbms_pct:
        obj.itbms_pct === 0 || obj.itbms_pct === 7 ? (obj.itbms_pct as 0 | 7) : null,
    };
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  const auth = requireRole(req, ["admin", "secretaria"]);
  if (auth instanceof NextResponse) return auth;

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
      .from("marketing")
      .download(body.path);
    if (dlError || !fileData) {
      throw new Error(dlError?.message ?? "No se pudo descargar el PDF");
    }
    const arrayBuffer = await fileData.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString("base64");

    const raw = await leerPdfConAnthropic({
      origen: "marketing",
      modelo: MODEL,
      maxTokens: MAX_TOKENS,
      pdfBase64: base64,
      prompt: PROMPT,
    });
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
    console.error("marketing/ia/leer-factura POST:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
