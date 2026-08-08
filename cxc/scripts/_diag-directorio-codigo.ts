/**
 * READ-ONLY. Vista previa del auto-match de `directorio_clientes.cliente_codigo`.
 *
 * Reproduce EXACTAMENTE el UPDATE de la migración (mismo normalizador, mismo
 * filtro `codigo ~ '^D-'`) sin escribir una sola fila, y muestra qué ficha se
 * ata a quién y cuáles quedan sin atar — que son decisión de Daniel, no del
 * backfill.
 *
 *   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/_diag-directorio-codigo.ts
 */
import { supabaseServer } from "../src/lib/supabase-server";
import { leerTodoPaginado } from "../src/lib/supabase-paginado";
import { esCodigoDeCliente } from "../src/lib/clientes/mundos";

const N2 = (s: string | null | undefined): string =>
  (s ?? "").trim().toUpperCase().replace(/[.,]/g, "").replace(/\s+/g, " ").trim();

interface Ficha {
  id: string; nombre: string; empresa: string | null; telefono: string | null;
  celular: string | null; whatsapp: string | null; correo: string | null;
  contacto: string | null; notas: string | null; deleted: boolean;
}

async function main() {
  const master = await leerTodoPaginado<{ codigo: string | null; nombre: string; nombre_normalized: string; deleted: boolean }>(
    "clientes_master",
    (c, from, to) =>
      supabaseServer
        .from("clientes_master")
        .select("codigo, nombre, nombre_normalized, deleted", c ? { count: "exact" } : {})
        .order("id", { ascending: true })
        .range(from, to)
  );
  const fichas = await leerTodoPaginado<Ficha>("directorio_clientes", (c, from, to) =>
    supabaseServer
      .from("directorio_clientes")
      .select("id, nombre, empresa, telefono, celular, whatsapp, correo, contacto, notas, deleted", c ? { count: "exact" } : {})
      .order("id", { ascending: true })
      .range(from, to)
  );

  // Índice SOLO de clientes del grupo (código D-XXX). El índice UNIQUE parcial
  // de clientes_master.nombre_normalized garantiza a lo sumo 1 match.
  const porNombre = new Map<string, string>();
  for (const m of master) {
    if (m.deleted || !esCodigoDeCliente(m.codigo)) continue;
    porNombre.set(m.nombre_normalized, (m.codigo ?? "").trim());
  }
  // Índice de TODO el maestro, para poder decir "parea pero con Boston".
  const porNombreTodo = new Map<string, string>();
  for (const m of master) {
    if (m.deleted) continue;
    if (!porNombreTodo.has(m.nombre_normalized)) porNombreTodo.set(m.nombre_normalized, (m.codigo ?? "(sin código)").trim());
  }

  const vivas = fichas.filter((f) => !f.deleted);
  const atadas: Array<{ f: Ficha; cod: string }> = [];
  const sinAtar: Ficha[] = [];
  const soloBoston: Array<{ f: Ficha; cod: string }> = [];

  for (const f of vivas) {
    const n2 = N2(f.nombre);
    const cod = porNombre.get(n2);
    if (cod) { atadas.push({ f, cod }); continue; }
    const otro = porNombreTodo.get(n2);
    if (otro) soloBoston.push({ f, cod: otro });
    else sinAtar.push(f);
  }

  console.log("=== auto-match de directorio_clientes.cliente_codigo ===");
  console.log(`fichas totales : ${fichas.length}   ·   vivas: ${vivas.length}`);
  console.log(`SE ATAN        : ${atadas.length}`);
  console.log(`no parean      : ${sinAtar.length}`);
  console.log(`parean pero con un cliente que NO es del grupo: ${soloBoston.length}`);

  console.log("\n--- se atan ---");
  for (const a of atadas) console.log(`   ${a.cod.padEnd(8)} ← "${a.f.nombre}"`);

  if (soloBoston.length) {
    console.log("\n--- parean con alguien que NO es del grupo (NO se atan) ---");
    for (const a of soloBoston) console.log(`   ${a.cod.padEnd(10)} ← "${a.f.nombre}"`);
  }

  console.log("\n--- 🔴 NO parean: decisión de Daniel, no se adivinan ni se borran ---");
  for (const f of sinAtar) {
    const datos = [
      f.telefono && `tel ${f.telefono}`,
      f.celular && `cel ${f.celular}`,
      f.whatsapp && `wa ${f.whatsapp}`,
      f.correo && `correo ${f.correo}`,
      f.contacto && `contacto ${f.contacto}`,
      f.notas && `notas "${f.notas}"`,
    ].filter(Boolean);
    console.log(`   · "${f.nombre}"${f.empresa ? ` [${f.empresa}]` : ""}`);
    console.log(`       ${datos.length ? datos.join(" · ") : "(sin ningún dato de contacto)"}`);
  }

  // Qué se perdería si alguien edita una ficha desde el tab Clientes del catálogo.
  console.log("\n=== fichas con datos que el formulario del catálogo BORRA al editar ===");
  const enRiesgo = vivas.filter((f) => f.telefono || f.celular || f.contacto || f.notas);
  console.log(`${enRiesgo.length} de ${vivas.length} fichas tienen teléfono, celular, contacto o notas`);
}

main().catch((e) => { console.error(e); process.exit(1); });
