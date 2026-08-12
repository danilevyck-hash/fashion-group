// Verificación READ-ONLY contra producción: con la DDL 20260812150000 SIN
// correr, el sync de Calvin se omite limpio SIN abrir sesión en Switch.
import { calvinDdlPendiente, syncCatalogoCalvin } from "../src/lib/switch-api/sync-catalogo-calvin";

async function main() {
  const pendiente = await calvinDdlPendiente();
  console.log("calvinDdlPendiente():", pendiente);
  const r = await syncCatalogoCalvin({ dryRun: true });
  console.log("syncCatalogoCalvin dryRun →", JSON.stringify({ ddlPendiente: r.ddlPendiente, hadError: r.hadError, error: r.empresas[0]?.error }));
  if (!pendiente || !r.ddlPendiente) {
    console.error("ESPERABA ddlPendiente=true (la DDL no corrió todavía)");
    process.exitCode = 1;
  }
}
main();
