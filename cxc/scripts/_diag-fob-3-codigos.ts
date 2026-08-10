/** READ-ONLY: costo de 3 códigos con FOB≠CIF conocidos (pantalla de Daniel).
 *  QD3636001 FOB 2.90/CIF 3.19 · KCSALYA929 9.10/10.01 · K10K109927DWE 36.00/39.60.
 *  Si la API da el primero → costo=FOB; si da el segundo → costo=CIF.
 *  DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/_diag-fob-3-codigos.ts */
import { createSwitchClient, logoutAllSwitchSessions } from "../src/lib/switch-api/client";

const CODIGOS = ["QD3636001", "KCSALYA929", "K10K109927DWE"];

async function main() {
  const cli = createSwitchClient("vistana");
  try {
    for (const codigo of CODIGOS) {
      const data = await cli.getArticulos({ porPagina: 50, paginaActual: 1, filtro: codigo });
      const row = (data?.articulos ?? []).find((a) => a.codigo === codigo);
      if (!row) { console.log(`${codigo}: NO apareció con filtro`); continue; }
      console.log(`${codigo} · costo=${row.costo} · precio=${row.precio} · disponible=${row.disponible}`);
    }
  } finally {
    await logoutAllSwitchSessions();
  }
}
main().catch((e) => { console.error("ERROR:", e?.message ?? e); process.exit(1); });
