// SOLO LECTURA. Mide el HUECO que este PR cierra: cuánto hace que se
// materializó la MV del aging y en cuántos clientes su contacto ya difiere de
// lo que hoy dice `clientes_master` (que es donde escribe la ficha del cliente).
import { createClient } from "@supabase/supabase-js";

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
  const { data: mv, error } = await db
    .from("switch_estadocuenta_aging_mv")
    .select("codigo, nombre, correo, telefono, celular, materializado_en");
  if (error) throw new Error(error.message);

  const materializado = mv?.[0]?.materializado_en as string | undefined;
  const horas = materializado ? (Date.now() - new Date(materializado).getTime()) / 3_600_000 : null;
  console.log(`MV materializada: ${materializado ?? "—"}${horas != null ? `  (hace ${horas.toFixed(1)} h)` : ""}`);
  console.log(`filas en la MV: ${mv!.length}`);

  const codigos = [...new Set(mv!.map((r) => r.codigo).filter(Boolean))] as string[];
  const maestro = new Map<string, { telefono: string | null; celular: string | null; email: string | null }>();
  for (let i = 0; i < codigos.length; i += 300) {
    const { data, error: e2 } = await db
      .from("clientes_master")
      .select("codigo, email, telefono, celular")
      .in("codigo", codigos.slice(i, i + 300))
      .eq("deleted", false);
    if (e2) throw new Error(e2.message);
    for (const f of data!) maestro.set(f.codigo as string, f as never);
  }
  console.log(`códigos de la cartera: ${codigos.length} · encontrados en clientes_master: ${maestro.size}`);

  let difieren = 0;
  const ej: string[] = [];
  for (const r of mv!) {
    const m = maestro.get(r.codigo as string);
    if (!m) continue;
    const a = `${r.telefono ?? ""}/${r.celular ?? ""}/${r.correo ?? ""}`;
    const b = `${m.telefono ?? ""}/${m.celular ?? ""}/${m.email ?? ""}`;
    if (a !== b) {
      difieren++;
      if (ej.length < 8) ej.push(`  ${String(r.nombre).slice(0, 30).padEnd(30)} MV[${a}]  →  maestro[${b}]`);
    }
  }
  console.log(`\nclientes cuyo contacto YA difiere entre la MV y el maestro: ${difieren}`);
  for (const e of ej) console.log(e);
  if (difieren === 0) {
    console.log("\n(hoy coinciden: nadie editó un teléfono desde el último refresco de la MV.");
    console.log(" El hueco existe igual y dura lo que tarde el próximo refresco — ver las horas de arriba.)");
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
