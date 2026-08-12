// SOLO LECTURA — foto del estado de producción para el corte por MARCA.
// Uso: DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/_diag-marketing-marcas.ts
import { createClient } from "@supabase/supabase-js";

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

async function todo<T>(t: string, sel: string): Promise<T[]> {
  const { data, error } = await sb.from(t).select(sel).range(0, 9999);
  if (error) throw new Error(`${t}: ${error.message}`);
  return (data ?? []) as T[];
}

async function main() {
  const [periodos, sellos, adjuntos, marcas] = await Promise.all([
    todo<any>("mk_periodos", "id, proveedor_key, nombre, estado, cerrado_en"),
    todo<any>("mk_periodo_documentos", "periodo_id, proveedor_key, tipo, documento_id"),
    todo<any>("mk_adjuntos", "id, tipo, factura_id, proyecto_id"),
    todo<any>("mk_marcas", "id, nombre, codigo, empresa_codigo"),
  ]);

  console.log("═══ mk_periodos ═══");
  for (const p of periodos) {
    console.log(`  ${String(p.id)}  key=${p.proveedor_key.padEnd(10)} ${p.estado.padEnd(8)} "${p.nombre}"  cerrado_en=${p.cerrado_en ?? "-"}`);
  }

  console.log(`\n═══ mk_periodo_documentos: ${sellos.length} sellos ═══`);
  const porKey = new Map<string, number>();
  const porPeriodo = new Map<string, number>();
  for (const s of sellos) {
    porKey.set(s.proveedor_key, (porKey.get(s.proveedor_key) ?? 0) + 1);
    porPeriodo.set(s.periodo_id, (porPeriodo.get(s.periodo_id) ?? 0) + 1);
  }
  for (const [k, n] of porKey) console.log(`  proveedor_key=${k}: ${n}`);
  for (const [k, n] of porPeriodo) {
    const p = periodos.find((x) => String(x.id) === String(k));
    console.log(`  periodo ${k} (${p?.nombre ?? "?"} / ${p?.estado ?? "?"}): ${n}`);
  }

  console.log(`\n═══ mk_adjuntos: ${adjuntos.length} ═══`);
  const porTipo = new Map<string, number>();
  for (const a of adjuntos) porTipo.set(a.tipo, (porTipo.get(a.tipo) ?? 0) + 1);
  for (const [k, n] of porTipo) console.log(`  tipo=${k}: ${n}`);

  console.log("\n═══ mk_marcas ═══");
  for (const m of marcas) {
    console.log(`  ${String(m.codigo).padEnd(6)} ${String(m.nombre).padEnd(20)} ${m.id}  empresa=${m.empresa_codigo ?? "-"}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
