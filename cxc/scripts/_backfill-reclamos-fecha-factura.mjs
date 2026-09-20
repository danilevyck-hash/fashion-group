#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// RECLAMOS — RELLENAR `fecha_factura` RELEYENDO LOS PDF QUE EXISTEN (11-sep-2026).
//
// Daniel, textual: «releo los PDF que existan y el resto lo teclea Andrea».
//
// Para cada reclamo VIVO con `factura_pdf_path` y `fecha_factura IS NULL`:
//   1. baja el PDF del bucket privado `reclamo-facturas`,
//   2. lo pasa por EL MISMO lector que usa la pantalla (`lib/reclamos/
//      lector-factura.ts`: mismo modelo, mismo prompt, mismo parser),
//   3. escribe SOLO `fecha_factura` — ninguna otra columna se toca.
// Idempotente: la segunda corrida no encuentra nada que hacer. Imprime cuántas
// fechas leyó y cuántos reclamos quedan sin fecha (los que Andrea teclea).
//
//   npx tsx scripts/_backfill-reclamos-fecha-factura.mjs            # escribe
//   npx tsx scripts/_backfill-reclamos-fecha-factura.mjs --dry-run  # solo mira
//
// (Va con `tsx` porque importa el lector en TypeScript.)
//
// ─────────────────────────────────────────────────────────────────────────────
// 🩸 20-sep-2026 — ESTE SCRIPT YA NO TIENE TRABAJO QUE HACER. NO ESTÁ ROTO.
//
// Solo toca reclamos con `fecha_factura` en NULL (`sinFecha`, y el UPDATE
// repite `.is("fecha_factura", null)`), y la migración `20261114120000` —
// aplicada el 11-sep-2026 — las llenó TODAS con su `fecha_reclamo`. Hoy no
// queda ni una fila que cruce ese filtro: corre, no encuentra nada y termina.
//
// 🔑 Y no es que falte una llave: la `ANTHROPIC_API_KEY` **se verificó el
// 20-sep-2026 y SIRVE** (contesta 200 y el modelo del lector está disponible).
// La doc decía que el backfill «quedó sin correr porque la llave es inválida»;
// eso dejó de ser cierto.
//
// 🔴 QUÉ HARÍA FALTA PARA QUE SIRVIERA: que alguien vaciara `fecha_factura` de
// los 4 reclamos que SÍ tienen PDF, o que llegaran reclamos nuevos sin fecha —
// y eso último ya no puede pasar: al CREAR, el PDF es obligatorio
// (`validateReclamoNuevo`) y la fecha de la factura también, así que un reclamo
// nuevo nace con la fecha REAL. El problema era solo de los 29 viejos, de los
// cuales **ninguno tiene PDF que releer**.
//
// Daniel, 20-sep-2026, textual: *«si puedes sacar la fecha de la factura y
// arreglarlo, belleza; sino usa la fecha de creación como la de la factura y
// ya, una sola fecha menos enredo»*.
//
// No se borra: el día que haya PDF viejos que releer, esto es lo que hay.
// ─────────────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import * as lectorMod from "../src/lib/reclamos/lector-factura.ts";
// tsx entrega el módulo TS como CommonJS: los exports viven en `default`.
const { MODELO_LECTOR, MAX_TOKENS_LECTOR, PROMPT_LECTOR, parsearRespuestaLector } = lectorMod.default ?? lectorMod;

const RAIZ = path.resolve(new URL("..", import.meta.url).pathname);
const env = fs.readFileSync(path.join(RAIZ, ".env.local"), "utf8");
// Una variable de entorno gana sobre .env.local (por si la llave local está vencida).
const g = (k) => process.env[k] ?? (env.match(new RegExp(`^${k}=(.*)$`, "m"))?.[1] ?? "").trim().replace(/^["']|["']$/g, "");
const DRY = process.argv.includes("--dry-run");

const sb = createClient(g("NEXT_PUBLIC_SUPABASE_URL"), g("SUPABASE_SERVICE_ROLE_KEY"));
const ia = new Anthropic({ apiKey: g("ANTHROPIC_API_KEY") });

const { data: vivos, error } = await sb
  .from("reclamos")
  .select("id, nro_reclamo, factura_pdf_path, fecha_factura")
  .eq("deleted", false);
if (error) throw new Error(error.message);

const sinFecha = vivos.filter((r) => !r.fecha_factura);
const conPdf = sinFecha.filter((r) => !!r.factura_pdf_path);
console.log(`Reclamos vivos: ${vivos.length} · sin fecha de factura: ${sinFecha.length} · de esos, con PDF: ${conPdf.length}${DRY ? " · (dry-run: no se escribe)" : ""}`);

let leidas = 0;
let ilegibles = 0;
for (const r of conPdf) {
  const { data: file, error: dlErr } = await sb.storage.from("reclamo-facturas").download(r.factura_pdf_path);
  if (dlErr || !file) { console.log(`  ✗ ${r.nro_reclamo}: no se pudo bajar el PDF (${dlErr?.message ?? "vacío"})`); ilegibles++; continue; }
  const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");
  const msg = await ia.messages.create({
    model: MODELO_LECTOR,
    max_tokens: MAX_TOKENS_LECTOR,
    messages: [{ role: "user", content: [{ type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } }, { type: "text", text: PROMPT_LECTOR }] }],
  });
  const texto = msg.content.find((b) => b.type === "text")?.text ?? "";
  const leido = parsearRespuestaLector(texto);
  if (!leido?.fecha_factura) { console.log(`  ✗ ${r.nro_reclamo}: el lector no sacó la fecha`); ilegibles++; continue; }
  console.log(`  ✓ ${r.nro_reclamo}: ${leido.fecha_factura} (${leido.proveedor ?? "?"} · ${leido.lineas.length} renglones${leido.lineas.some((l) => l.talla) ? " · con talla" : ""})`);
  if (!DRY) {
    const { error: upErr } = await sb.from("reclamos").update({ fecha_factura: leido.fecha_factura }).eq("id", r.id).is("fecha_factura", null);
    if (upErr) { console.log(`  ✗ ${r.nro_reclamo}: no se pudo escribir (${upErr.message})`); ilegibles++; continue; }
  }
  leidas++;
}

console.log(`\nFechas leídas del PDF: ${leidas} · PDF que no dieron fecha: ${ilegibles} · quedan sin fecha (las teclea Andrea): ${sinFecha.length - leidas}`);
