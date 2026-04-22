/**
 * Smoke test del fallback Claude: invoca directo al SDK con el mismo
 * prompt verbatim que usa el endpoint, pasa el texto crudo del bulto
 * 547982 (extraído previamente del PDF 42328), y valida que la respuesta
 * cuadre con el total del header (105).
 *
 * Uso: npx tsx scripts/test-fallback-claude.ts
 *
 * Costo esperado: ~$0.005 por invocación (Haiku 4.5, ~1500 tokens).
 */

import Anthropic from "@anthropic-ai/sdk";
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const repoRoot = resolve(dirname(__filename), "..");

const envPath = resolve(repoRoot, ".env.local");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf-8").split("\n")) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) { console.error("Falta ANTHROPIC_API_KEY"); process.exit(1); }

// Texto crudo del bulto 547982 tal como lo extrae pdfjs-dist del PDF 42328 página 32.
const BULTO_547982 = `Bulto No. OCPA200000000547982  Peso por bulto: 19.65 KG  Volumen: 0.09 CBM  Total piezas: 105
Estilo  Color  Nombre  Dim  XS  S  M  L  XL  Qty
76J4883CSY  SOFT TURQUOISE  CAMISETA PARA MUJER
15  30  10  30  15  10
0
76J4883TIB  ROSEY PINK  CAMISETA PARA MUJER
5  5`;

const TOTAL_ESPERADO = 105;

const PROMPT = `Eres un extractor de datos. Te paso el texto crudo de UN BULTO de un Packing List. Devuelve SOLO un JSON válido sin preámbulo ni markdown:
{
  "estilos": [
    { "sku": "...", "color": "...", "nombre": "...",
      "qty_por_talla": {"S": 10, "M": 20},
      "qty_total": 105 }
  ],
  "total_bulto": 105
}
El total_bulto DEBE ser exactamente ${TOTAL_ESPERADO}.
Los SKUs son alfanuméricos al inicio de cada línea de estilo.
Si una qty_total parece partida en dos líneas (ej "10\\n0"), reconstrúyela ("100").

Texto del bulto:
${BULTO_547982}`;

async function main() {
  const client = new Anthropic({ apiKey });
  console.log("Invocando Claude Haiku 4.5…");
  const t0 = Date.now();
  const msg = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 2048,
    messages: [{ role: "user", content: PROMPT }],
  });
  const elapsed = Date.now() - t0;
  const input = msg.usage?.input_tokens ?? 0;
  const output = msg.usage?.output_tokens ?? 0;
  console.log(`Tokens: in=${input} out=${output} (elapsed ${elapsed}ms)`);

  let raw = "";
  for (const b of msg.content) if (b.type === "text") raw += b.text;
  console.log("Raw response:");
  console.log(raw);
  console.log("---");

  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  const candidate = fenced ? fenced[1] : raw;
  const parsed = JSON.parse(candidate.trim());

  console.log("Parsed JSON:", JSON.stringify(parsed, null, 2));

  // Validación
  const total = Number(parsed.total_bulto);
  if (total !== TOTAL_ESPERADO) {
    console.error(`FAIL: total_bulto=${total} !== esperado=${TOTAL_ESPERADO}`);
    process.exit(1);
  }
  const sum = (parsed.estilos as { qty_total: number }[]).reduce((s, e) => s + Number(e.qty_total), 0);
  if (sum !== TOTAL_ESPERADO) {
    console.error(`FAIL: suma de estilos=${sum} !== esperado=${TOTAL_ESPERADO}`);
    process.exit(1);
  }
  console.log(`✓ OK: ${parsed.estilos.length} estilos, suma=${sum}, total=${total}`);

  // Verificar SKUs esperados
  const skus = new Set(parsed.estilos.map((e: { sku: string }) => e.sku));
  if (!skus.has("76J4883CSY") || !skus.has("76J4883TIB")) {
    console.error(`WARN: SKUs inesperados: ${[...skus].join(", ")}`);
  } else {
    const csy = parsed.estilos.find((e: { sku: string }) => e.sku === "76J4883CSY");
    const tib = parsed.estilos.find((e: { sku: string }) => e.sku === "76J4883TIB");
    if (Number(csy.qty_total) !== 100) {
      console.error(`FAIL: 76J4883CSY qty_total=${csy.qty_total} !== 100`);
      process.exit(1);
    }
    if (Number(tib.qty_total) !== 5) {
      console.error(`FAIL: 76J4883TIB qty_total=${tib.qty_total} !== 5`);
      process.exit(1);
    }
    console.log(`✓ SKUs correctos: 76J4883CSY=${csy.qty_total}, 76J4883TIB=${tib.qty_total}`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
