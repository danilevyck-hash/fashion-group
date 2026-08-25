// Corre el sync de la cartera de Boston UNA vez con el código de esta rama.
// ⚠️ Abre UNA sesión web contra Switch (expulsa a quien esté en el panel de
// Boston) y la cierra apenas tiene el dato.
import { syncCarteraWeb } from "../src/lib/switch-api/sync-estadocuenta-web";

(async () => {
  const r = await syncCarteraWeb({ triggeredBy: "manual" });
  console.log(JSON.stringify(r, null, 1));
  if (!r.ok) process.exit(1);
})().catch((e) => { console.error(e); process.exit(1); });
