// Llena UNA vez el N.° de pedido de las facturas de los últimos 30 días de las
// 6 del grupo, con el MISMO código que corre el sync de facturas cada hora
// (`llenarPedidosGuardados`). ⚠️ Abre UNA sesión web por empresa (expulsa a
// quien esté en el panel) y la cierra al terminar. Se puede repetir: solo lee
// lo que todavía no se leyó.
import { B2B_EMPRESA_KEYS } from "../src/lib/empresa-mapping";
import { llenarPedidosGuardados } from "../src/lib/guias/pedido-de-factura";

const DIAS = Number(process.argv[2] ?? 30);

(async () => {
  for (const emp of B2B_EMPRESA_KEYS) {
    const t = Date.now();
    const r = await llenarPedidosGuardados(emp, { dias: DIAS, max: 2000, topeMs: 20 * 60_000 });
    console.log(JSON.stringify({ ...r, segundos: Math.round((Date.now() - t) / 1000) }));
  }
})().catch((e) => { console.error(e); process.exit(1); });
