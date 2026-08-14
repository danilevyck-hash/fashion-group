/**
 * VERIFICACIÓN CONTRA PRODUCCIÓN — SOLO LECTURA.
 *
 * Contesta dos preguntas con datos reales, no con supuestos:
 *   1. ¿Quién es cada quién hoy? (roles reales de `fg_users`)
 *   2. ¿El endpoint de la cartera de Boston deja entrar EXACTAMENTE a quien la
 *      pestaña le dibuja? Se llama al handler REAL con cookies firmadas de
 *      verdad, rol por rol.
 *
 * Los roles sin permiso cortan en `requireRole` y NO tocan la base: solo las
 * dos llamadas que SÍ pasan consultan Supabase (que está en compute Micro).
 *
 * Uso:
 *   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config \
 *     scripts/_verif-boston-permiso-produccion.ts
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "../src/lib/supabase-server";
import { signSession } from "../src/lib/session-cookie";
import { ROLES_BOSTON, pestanasCxc, puedeVerBoston } from "../src/lib/cxc/boston-roles";
import { GET } from "../src/app/api/cxc/boston/route";

const ROLES = ["admin", "secretaria", "vendedor", "bodega", "contabilidad", "gerente_acs"] as const;

function req(role: string): NextRequest {
  const cookie = signSession({ role, userId: "verif", userName: "verif", sessionToken: "verif" });
  return new NextRequest("https://fashiongr.com/api/cxc/boston", {
    headers: { cookie: `cxc_session=${cookie}` },
  });
}

async function main() {
  // ── 1. Los usuarios REALES y su rol ────────────────────────────────────────
  const { data: users, error } = await supabaseServer
    .from("fg_users")
    .select("name,role,active")
    .order("role");
  if (error) throw new Error(`fg_users: ${error.message}`);

  const vivos = (users ?? []).filter((u) => u.active !== false);
  const porRol = new Map<string, string[]>();
  for (const u of vivos) {
    porRol.set(u.role, [...(porRol.get(u.role) ?? []), u.name]);
  }

  console.log("### 1. USUARIOS ACTIVOS EN PRODUCCIÓN, por rol\n");
  for (const [rol, nombres] of [...porRol].sort()) {
    const ve = puedeVerBoston(rol);
    console.log(
      `  ${ve ? "✅ VE" : "🚫 NO VE"}  ${rol.padEnd(13)} (${nombres.length}) ${nombres.join(", ")}`,
    );
  }

  // ── 2. Qué pestañas dibuja la pantalla, rol por rol ───────────────────────
  console.log("\n### 2. PESTAÑAS QUE DIBUJA EL PANEL (lib/cxc/boston-roles)\n");
  for (const rol of ROLES) {
    console.log(`  ${rol.padEnd(13)} → ${pestanasCxc(rol).map((p) => p.label).join("  |  ")}`);
  }

  // ── 3. Qué contesta el ENDPOINT, rol por rol ──────────────────────────────
  console.log("\n### 3. GET /api/cxc/boston con cookie FIRMADA de cada rol\n");
  let descuadres = 0;
  for (const rol of ROLES) {
    const res = (await GET(req(rol))) as NextResponse;
    const dibuja = puedeVerBoston(rol);
    const entra = res.status === 200;
    let detalle = "";
    if (entra) {
      const json = (await res.json()) as { totales?: Record<string, number> };
      const t = json.totales ?? {};
      detalle = `${t.clientes} clientes · $${(t.total ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}` +
        ` (0-90 $${(t.d0_90 ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}` +
        ` · 91-120 $${(t.d91_120 ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}` +
        ` · 121+ $${(t.d121_plus ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2 })})`;
    }
    const coherente = dibuja === entra;
    if (!coherente) descuadres++;
    console.log(
      `  ${coherente ? "🟢" : "🔴"} ${rol.padEnd(13)} HTTP ${res.status}  ` +
      `| pestaña: ${dibuja ? "SÍ" : "no"} | endpoint: ${entra ? "SÍ" : "no"} ${detalle}`,
    );
  }

  console.log(
    descuadres === 0
      ? "\n✅ La pestaña y el endpoint dicen LO MISMO para los 6 roles."
      : `\n❌ ${descuadres} rol(es) donde la pantalla y el endpoint NO coinciden.`,
  );
  console.log(`   Lista única: ROLES_BOSTON = [${ROLES_BOSTON.join(", ")}]`);
  process.exit(descuadres === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
