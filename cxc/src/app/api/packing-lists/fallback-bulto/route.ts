/**
 * POST /api/packing-lists/fallback-bulto
 *
 * Nivel 3 del parser de PLs: cuando el parser determinístico no puede
 * reconciliar un bulto (sum_estilos != header total_piezas), invocamos
 * Claude Haiku 4.5 con el texto crudo del bulto para recuperar el
 * desglose correcto.
 *
 * Request body:
 *   {
 *     bultoText: string,      // texto crudo del bulto (PLBulto.rawText)
 *     totalEsperado: number   // "Total piezas: X" del header del PDF
 *   }
 *
 * Response OK:
 *   {
 *     ok: true,
 *     estilos: [
 *       { sku, color, nombre, qty_por_talla: {S:10,...}, qty_total: 100 },
 *       ...
 *     ],
 *     total_bulto: 100
 *   }
 *
 * Response fail (no cuadra tras Claude):
 *   { ok: false, error: string, claude_response?: any }
 *
 * El prompt es verbatim del diseño original. Claude devuelve SOLO JSON
 * sin markdown/preámbulo. Post-procesamos y validamos que la suma cuadre.
 */

import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";

export const dynamic = "force-dynamic";

const MODEL = "claude-haiku-4-5-20251001";

interface FallbackEstilo {
  sku: string;
  color?: string;
  nombre?: string;
  qty_por_talla?: Record<string, number>;
  qty_total: number;
}

interface FallbackResponse {
  estilos: FallbackEstilo[];
  total_bulto: number;
}

function buildPrompt(bultoText: string, totalEsperado: number): string {
  // PROMPT VERBATIM del diseño original — no modificar sin bumpear PARSER_VERSION.
  return `Eres un extractor de datos. Te paso el texto crudo de UN BULTO de un Packing List. Devuelve SOLO un JSON válido sin preámbulo ni markdown:
{
  "estilos": [
    { "sku": "...", "color": "...", "nombre": "...",
      "qty_por_talla": {"S": 10, "M": 20},
      "qty_total": 105 }
  ],
  "total_bulto": 105
}
El total_bulto DEBE ser exactamente ${totalEsperado}.
Los SKUs son alfanuméricos al inicio de cada línea de estilo.
Si una qty_total parece partida en dos líneas (ej "10\\n0"), reconstrúyela ("100").

Texto del bulto:
${bultoText}`;
}

function extractJson(text: string): unknown {
  // Claude a veces envuelve en ```json``` aunque le pidamos "sin markdown".
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  const candidate = fenced ? fenced[1] : text;
  return JSON.parse(candidate.trim());
}

function validateFallback(data: unknown, totalEsperado: number): { ok: true; data: FallbackResponse } | { ok: false; reason: string } {
  if (!data || typeof data !== "object") return { ok: false, reason: "Respuesta no es objeto" };
  const obj = data as Record<string, unknown>;
  if (!Array.isArray(obj.estilos)) return { ok: false, reason: "Falta array 'estilos'" };
  const total = typeof obj.total_bulto === "number" ? obj.total_bulto : Number(obj.total_bulto);
  if (!Number.isFinite(total)) return { ok: false, reason: "total_bulto no numérico" };
  if (total !== totalEsperado) return { ok: false, reason: `total_bulto=${total} no cuadra con esperado=${totalEsperado}` };

  const estilos: FallbackEstilo[] = [];
  let sumQty = 0;
  for (const e of obj.estilos as Record<string, unknown>[]) {
    if (!e || typeof e !== "object") return { ok: false, reason: "Estilo no es objeto" };
    const sku = typeof e.sku === "string" ? e.sku : "";
    if (!sku) return { ok: false, reason: "Estilo sin sku" };
    const qtyTotal = typeof e.qty_total === "number" ? e.qty_total : Number(e.qty_total);
    if (!Number.isFinite(qtyTotal) || qtyTotal < 0) return { ok: false, reason: `Estilo ${sku}: qty_total inválido` };
    sumQty += qtyTotal;
    estilos.push({
      sku,
      color: typeof e.color === "string" ? e.color : undefined,
      nombre: typeof e.nombre === "string" ? e.nombre : undefined,
      qty_por_talla: (e.qty_por_talla && typeof e.qty_por_talla === "object")
        ? Object.fromEntries(Object.entries(e.qty_por_talla as Record<string, unknown>).map(([k, v]) => [k, Number(v)]))
        : undefined,
      qty_total: qtyTotal,
    });
  }
  if (sumQty !== totalEsperado) return { ok: false, reason: `Suma de qty_total=${sumQty} no cuadra con esperado=${totalEsperado}` };
  return { ok: true, data: { estilos, total_bulto: total } };
}

export async function POST(req: NextRequest) {
  const auth = requireRole(req, ["admin", "secretaria"]);
  if (auth instanceof NextResponse) return auth;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ ok: false, error: "ANTHROPIC_API_KEY no configurada" }, { status: 500 });
  }

  let body: { bultoText?: string; totalEsperado?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Body JSON inválido" }, { status: 400 });
  }

  const bultoText = typeof body.bultoText === "string" ? body.bultoText.trim() : "";
  const totalEsperado = typeof body.totalEsperado === "number" ? body.totalEsperado : Number(body.totalEsperado);

  if (!bultoText) return NextResponse.json({ ok: false, error: "Falta bultoText" }, { status: 400 });
  if (!Number.isFinite(totalEsperado) || totalEsperado <= 0) {
    return NextResponse.json({ ok: false, error: "totalEsperado inválido" }, { status: 400 });
  }

  const client = new Anthropic({ apiKey });

  let rawResponse = "";
  try {
    const msg = await client.messages.create({
      model: MODEL,
      max_tokens: 2048,
      messages: [{ role: "user", content: buildPrompt(bultoText, totalEsperado) }],
    });
    for (const block of msg.content) {
      if (block.type === "text") rawResponse += block.text;
    }
  } catch (err) {
    const m = err instanceof Error ? err.message : "Error de Anthropic";
    return NextResponse.json({ ok: false, error: `Claude API: ${m}` }, { status: 502 });
  }

  let parsed: unknown;
  try {
    parsed = extractJson(rawResponse);
  } catch {
    return NextResponse.json({
      ok: false,
      error: "Claude no devolvió JSON válido",
      claude_response: rawResponse.slice(0, 2000),
    }, { status: 502 });
  }

  const check = validateFallback(parsed, totalEsperado);
  if (!check.ok) {
    return NextResponse.json({
      ok: false,
      error: `Validación post-Claude falló: ${check.reason}`,
      claude_response: parsed,
    }, { status: 422 });
  }

  return NextResponse.json({
    ok: true,
    estilos: check.data.estilos,
    total_bulto: check.data.total_bulto,
  });
}
