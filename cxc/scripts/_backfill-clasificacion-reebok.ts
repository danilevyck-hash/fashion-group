/**
 * ─────────────────────────────────────────────────────────────────────────────
 * BACKFILL de la clasificación de Reebok — ESCRIBE (con freno)
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Reclasifica `products.category` y `products.gender` con el MISMO módulo puro
 * que usa el sync (`clasificacionDeArticulo`). No toca ninguna otra columna:
 * ni la foto, ni el nombre, ni el precio, ni el stock, ni `active`.
 *
 * 🔴 EL FRENO ESTÁ ADENTRO, NO EN LA CABEZA DE QUIEN LO CORRE. Si algún
 * producto cambiara de BULTO, el script **se niega a escribir** y termina con
 * código 3. El bulto sale de la categoría (`reebok-bulto.ts`) y el pedido se
 * cobra por bulto (`reebok-order-total.ts`): mover uno mueve plata en pedidos
 * reales, y eso no lo decide un script.
 *
 * 🔑 Es IDEMPOTENTE: la segunda corrida escribe cero filas, porque solo escribe
 * lo que difiere. Y un producto SIN ficha no se toca — no se lo manda al cajón
 * neutro "para emparejar".
 *
 * Por defecto SIMULA. Para escribir hay que pedirlo:
 *   FUENTE=lineas DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config \
 *     scripts/_backfill-clasificacion-reebok.ts            # simula
 *   … scripts/_backfill-clasificacion-reebok.ts --aplicar   # escribe
 *
 * Deja la foto de ANTES en /tmp/_backfill-clasificacion-<fecha>.json, fila por
 * fila, para poder auditar o revertir.
 */

import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import {
  clasificacionDeArticulo,
  fichaLlego,
  type FichaSwitch,
} from "../src/lib/reebok-clasificacion";
import { getBultoSize } from "../src/lib/reebok-bulto";

const EMPRESA = "active_shoes";
const APLICAR = process.argv.includes("--aplicar");
const FUENTE = (process.env.FUENTE ?? "fichas") as "fichas" | "lineas";

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

async function leerTodo<T>(tabla: string, cols: string, orden: string): Promise<T[]> {
  const out: T[] = [];
  for (let p = 0; p < 200; p++) {
    const { data, error } = await db.from(tabla).select(cols).order(orden, { ascending: true })
      .range(p * 1000, p * 1000 + 999);
    if (error) throw new Error(`${tabla}: ${error.message}`);
    const lote = (data ?? []) as unknown as T[];
    out.push(...lote);
    if (lote.length < 1000) break;
  }
  return out;
}

interface Producto {
  id: string; sku: string; name: string | null;
  category: string | null; gender: string | null;
  active: boolean | null; existencia: number | null;
}

async function fichas(): Promise<Map<string, FichaSwitch>> {
  if (FUENTE === "lineas") {
    const filas = await leerTodo<{ codigo: string; rubro: string | null; subrubro: string | null; marca: string | null; fecha: string; empresa_key: string; id: number }>(
      "switch_factura_lineas", "id, codigo, rubro, subrubro, marca, fecha, empresa_key", "id");
    const ult = new Map<string, { fecha: string; ficha: FichaSwitch }>();
    for (const f of filas) {
      if (f.empresa_key !== EMPRESA || !f.codigo) continue;
      const k = String(f.codigo).trim();
      const prev = ult.get(k);
      if (prev && prev.fecha > f.fecha) continue;
      // La fecha de la factura hace de `ficha_at`: es algo que Switch mandó, con
      // fecha. Ver la nota gemela en `_verif-clasificacion-reebok.ts`.
      ult.set(k, { fecha: f.fecha, ficha: { rubro: f.rubro, subrubro: f.subrubro, marca: f.marca, ficha_at: f.fecha } });
    }
    return new Map([...ult].map(([k, v]) => [k, v.ficha]));
  }
  const filas = await leerTodo<{ codigo: string; rubro: string | null; subrubro: string | null; marca: string | null; ficha_at: string | null; empresa_key: string }>(
    "switch_articulo_info", "codigo, rubro, subrubro, marca, ficha_at, empresa_key", "codigo");
  const m = new Map<string, FichaSwitch>();
  for (const f of filas) {
    if (f.empresa_key !== EMPRESA || !f.codigo) continue;
    // 🩸 Sin `ficha_at` no hay ficha: es una fila del barrido de precios a la que
    // nadie le pidió nada. Reclasificar con eso sería mandar al cajón neutro a
    // productos que solo están esperando su turno en la cola.
    const ficha: FichaSwitch = { rubro: f.rubro, subrubro: f.subrubro, marca: f.marca, ficha_at: f.ficha_at };
    if (!fichaLlego(ficha)) continue;
    m.set(String(f.codigo).trim(), ficha);
  }
  return m;
}

async function main() {
  const productos = await leerTodo<Producto>("products", "id, sku, name, category, gender, active, existencia", "sku");
  const fs_ = await fichas();

  const cambios: Array<{ id: string; sku: string; name: string | null; de: { category: string | null; gender: string | null }; a: { category: string; gender: string } }> = [];
  let bultoMovido = 0;
  const detalleBulto: string[] = [];
  let sinFicha = 0;

  for (const p of productos) {
    const f = fs_.get(String(p.sku).trim());
    if (!f) { sinFicha++; continue; }
    const c = clasificacionDeArticulo(f, p.name, { category: p.category, gender: p.gender });
    if (getBultoSize(p.category ?? "") !== getBultoSize(c.category)) {
      bultoMovido++;
      detalleBulto.push(`${p.sku} | ${p.category}=${getBultoSize(p.category ?? "")} → ${c.category}=${getBultoSize(c.category)} | ${p.name}`);
    }
    if (c.category === p.category && c.gender === p.gender) continue;
    cambios.push({ id: p.id, sku: p.sku, name: p.name, de: { category: p.category, gender: p.gender }, a: { category: c.category, gender: c.gender } });
  }

  console.log(`\nfuente: ${FUENTE} · productos: ${productos.length} · sin ficha (intactos): ${sinFicha}`);
  console.log(`filas a escribir: ${cambios.length}`);
  console.log(`💸 cambian de BULTO: ${bultoMovido}`);

  // 🔴 EL FRENO. Va ANTES de cualquier escritura y corta la corrida entera.
  if (bultoMovido > 0) {
    console.error(`\n🔴 FRENO: ${bultoMovido} producto(s) cambiarían de bulto. NO SE ESCRIBE NADA.`);
    detalleBulto.forEach((l) => console.error(`   ${l}`));
    console.error(`   Eso mueve plata en pedidos reales — tiene que aprobarlo Daniel, no un script.\n`);
    process.exit(3);
  }

  const foto = `/tmp/_backfill-clasificacion-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.json`;
  fs.writeFileSync(foto, JSON.stringify(cambios, null, 2));
  console.log(`foto del ANTES (fila por fila, para auditar o revertir): ${foto}`);

  if (!APLICAR) {
    console.log(`\n(SIMULACIÓN — no se escribió nada. Agrega --aplicar para escribir.)\n`);
    return;
  }

  let ok = 0;
  const fallos: string[] = [];
  for (const c of cambios) {
    // UNA fila por vez, por id, y SOLO las dos columnas. Nada de upsert: un
    // upsert mal armado se lleva puestas las fotos.
    const { error } = await db.from("products")
      .update({ category: c.a.category, gender: c.a.gender })
      .eq("id", c.id);
    if (error) fallos.push(`${c.sku}: ${error.message}`);
    else ok++;
  }
  console.log(`\nescritas: ${ok} / ${cambios.length}`);
  if (fallos.length) { fallos.forEach((f) => console.error(`  🔴 ${f}`)); process.exit(1); }
  console.log(`✅ listo.\n`);
}

main().catch((e) => { console.error(e); process.exit(1); });
