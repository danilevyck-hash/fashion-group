import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { requireAdminOSecretaria } from "@/lib/api-auth";
import { supabaseServer } from "@/lib/supabase-server";
import { FACTURA_BUCKET } from "@/lib/reclamos/factura-storage";
import { MODELO_LECTOR, MAX_TOKENS_LECTOR, PROMPT_LECTOR, parsearRespuestaLector } from "@/lib/reclamos/lector-factura";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// El prompt y el parser viven en `lib/reclamos/lector-factura.ts` (puro): los
// comparte con el backfill que relee los PDF viejos. Sonnet 4.6 lee el PDF
// (texto + visual), el mismo modelo que Marketing.

interface Body {
  path?: string;
}

// POST /api/reclamos/ia/leer-factura  { path }
// Descarga el PDF del bucket privado "reclamo-facturas", lo lee con la IA y
// devuelve la cabecera, la empresa facturada y los renglones. NUNCA inventa;
// campo ilegible → null, renglón sin referencia → no entra.
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
      model: MODELO_LECTOR,
      max_tokens: MAX_TOKENS_LECTOR,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "document",
              source: { type: "base64", media_type: "application/pdf", data: base64 },
            },
            { type: "text", text: PROMPT_LECTOR },
          ],
        },
      ],
    });

    const textBlock = msg.content.find((b) => b.type === "text");
    const raw = textBlock && textBlock.type === "text" ? textBlock.text : "";
    const extraido = parsearRespuestaLector(raw);
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
