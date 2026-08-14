/**
 * Verificación READ-ONLY contra PRODUCCIÓN del reloj del catálogo.
 *
 * Llama al handler REAL de GET /api/catalogo/[marca]/sync-status con una cookie
 * firmada, contra la base de producción, y lo compara contra lo que decía el
 * indicador viejo (cron_heartbeats). No escribe nada.
 *
 *   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config \
 *     scripts/_verif-t205-reloj-produccion.ts
 */
import { NextRequest } from "next/server";

process.env.SESSION_SECRET ||= "verif-t205-0123456789abcdef0123456789abcdef";

const MARCAS = ["tommy", "reebok", "calvin", "joybees"] as const;

function hora(iso: string | null): string {
  if (!iso) return "(sin dato)";
  return new Date(iso).toISOString().replace("T", " ").slice(0, 19) + " UTC";
}

(async () => {
  const { signSession } = await import("@/lib/session-cookie");
  const { GET } = await import("@/app/api/catalogo/[marca]/sync-status/route");
  const { getMarcaConfig } = await import("@/lib/catalogo/marcas");
  const { supabaseServer } = await import("@/lib/supabase-server");

  const cookie = signSession({
    role: "admin",
    userId: "verif-t205",
    userName: "Verificación",
    sessionToken: "verif",
  });

  console.log("marca      | indicador AHORA (switch_sync_log) | cron_heartbeats (el viejo)");
  console.log("-".repeat(90));

  let fallas = 0;
  for (const marca of MARCAS) {
    const cfg = getMarcaConfig(marca)!;
    const req = new NextRequest(`http://localhost/api/catalogo/${marca}/sync-status`);
    req.cookies.set("cxc_session", cookie);
    const res = await GET(req, { params: { marca } });
    if (res.status !== 200) {
      console.log(`${marca.padEnd(10)} | 🔴 HTTP ${res.status}`);
      fallas++;
      continue;
    }
    const { lastSync } = (await res.json()) as { lastSync: string | null };

    const { data: hb } = await supabaseServer
      .from("cron_heartbeats")
      .select("last_success_at")
      .eq("cron_name", cfg.cronName)
      .maybeSingle();
    const viejo = (hb as { last_success_at: string } | null)?.last_success_at ?? null;

    const marcaDiff = lastSync && viejo && lastSync > viejo ? "  ← MÁS RECIENTE que el cron" : "";
    console.log(`${marca.padEnd(10)} | ${hora(lastSync).padEnd(33)} | ${hora(viejo)}${marcaDiff}`);

    if (!lastSync) {
      console.log(`  🔴 ${marca}: el indicador quedó sin hora`);
      fallas++;
    }
    // El reloj nuevo NUNCA puede quedar por detrás del heartbeat del cron: el
    // cron escribe su fila de switch_sync_log antes que su heartbeat.
    if (lastSync && viejo && new Date(lastSync).getTime() < new Date(viejo).getTime() - 60_000) {
      console.log(`  🔴 ${marca}: el indicador quedó ATRÁS del heartbeat del cron`);
      fallas++;
    }
  }

  console.log("-".repeat(90));
  console.log(fallas === 0 ? "🟢 OK" : `🔴 ${fallas} problema(s)`);
  process.exit(fallas === 0 ? 0 : 1);
})();
