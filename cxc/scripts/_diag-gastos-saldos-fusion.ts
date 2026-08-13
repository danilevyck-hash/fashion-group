/**
 * Diagnóstico read-only para la FUSIÓN de "Gastos" + "Saldos de Banco".
 *
 * Contesta tres preguntas, y ninguna escribe nada:
 *   1. ¿`role_permissions` ya tiene `gastos-contabilidad` y `saldos-banco`?
 *      → es lo que decide si el permiso PRESTADO (`MODULO_HEREDA_PERMISO_DE`)
 *        se puede retirar sin apagarle el menú a nadie.
 *   2. ¿Qué overrides por usuario existen? (`fg_users.modulos_override`)
 *   3. ¿Cómo está `bancos_saldos`? — historial por empresa y, sobre todo, qué
 *      cargas repiten EXACTO el saldo anterior de la misma empresa (el caso del
 *      10-ago que copió los tres montos del 31-jul, al centavo).
 *
 * Uso: DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/_diag-gastos-saldos-fusion.ts
 */
import { supabaseServer } from "../src/lib/supabase-server";
import { leerTodoPaginado } from "../src/lib/supabase-paginado";

interface Fila {
  id: string;
  empresa_key: string;
  saldo: number | string;
  fecha_dato: string;
  created_by: string | null;
  created_at: string;
}

async function main() {
  // 1. role_permissions
  const { data: roles, error: e1 } = await supabaseServer
    .from("role_permissions")
    .select("role, modulos")
    .order("role");
  if (e1) throw new Error(`role_permissions: ${e1.message}`);
  console.log("── role_permissions ──────────────────────────────────────────");
  for (const r of roles ?? []) {
    const m: string[] = r.modulos ?? [];
    console.log(
      `${r.role.padEnd(14)} ${m.length} módulos` +
        `  gastos-contabilidad=${m.includes("gastos-contabilidad") ? "SÍ" : "NO"}` +
        `  saldos-banco=${m.includes("saldos-banco") ? "SÍ" : "NO"}` +
        `  gastos-empresa=${m.includes("gastos-empresa") ? "SÍ" : "NO"}`,
    );
    console.log(`               ${JSON.stringify(m)}`);
  }

  // 2. overrides por usuario
  const { data: users, error: e2 } = await supabaseServer
    .from("fg_users")
    .select("name, role, active, modulos_override")
    .not("modulos_override", "is", null);
  if (e2) throw new Error(`fg_users: ${e2.message}`);
  console.log("\n── fg_users.modulos_override ─────────────────────────────────");
  for (const u of users ?? []) {
    console.log(`${u.name} (${u.role}, ${u.active ? "activo" : "inactivo"}): ${JSON.stringify(u.modulos_override)}`);
  }

  // 3. bancos_saldos — historial completo
  const filas = await leerTodoPaginado<Fila>("bancos_saldos (diag)", (pedirCount, desde, hasta) =>
    supabaseServer
      .from("bancos_saldos")
      .select("id, empresa_key, saldo, fecha_dato, created_by, created_at", pedirCount ? { count: "exact" } : {})
      .order("id", { ascending: true })
      .range(desde, hasta),
  );
  console.log(`\n── bancos_saldos: ${filas.length} filas ──────────────────────────`);

  const porEmpresa = new Map<string, Fila[]>();
  for (const f of filas) {
    const l = porEmpresa.get(f.empresa_key) ?? [];
    l.push(f);
    porEmpresa.set(f.empresa_key, l);
  }

  const repetidos: string[] = [];
  for (const [emp, lista] of [...porEmpresa.entries()].sort()) {
    lista.sort((a, b) => (a.fecha_dato < b.fecha_dato ? -1 : a.fecha_dato > b.fecha_dato ? 1 : 0));
    console.log(`\n${emp} — ${lista.length} cargas`);
    for (let i = 0; i < lista.length; i += 1) {
      const f = lista[i];
      const prev = i > 0 ? lista[i - 1] : null;
      const igual = prev != null && Number(prev.saldo) === Number(f.saldo);
      if (igual) repetidos.push(`${emp} ${f.fecha_dato} $${Number(f.saldo)} = ${prev!.fecha_dato}`);
      console.log(
        `  ${f.fecha_dato}  ${String(Number(f.saldo).toFixed(2)).padStart(12)}` +
          `  por ${f.created_by ?? "?"}  (cargado ${f.created_at?.slice(0, 16)})${igual ? "   ← IGUAL AL ANTERIOR" : ""}`,
      );
    }
  }

  console.log("\n── Saldos que repiten EXACTO el anterior de su empresa ───────");
  if (repetidos.length === 0) console.log("(ninguno)");
  for (const r of repetidos) console.log(`  ${r}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
