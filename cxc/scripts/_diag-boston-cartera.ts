/**
 * Diagnóstico READ-ONLY de la cartera de Confecciones Boston por el reporte WEB.
 *
 * No escribe NADA: ni en Supabase ni en Switch. Baja el reporte de antigüedad,
 * lo convierte con el MISMO módulo que usa el sync (`construirFilas`), lo cuadra
 * contra los totales que publica el propio Switch y lo compara, documento por
 * documento, contra lo que hoy tiene `switch_estadocuenta`.
 *
 * Sirve para dos cosas: certificar la carga antes de encenderla, y auditarla
 * después sin tocar producción.
 *
 *   DOTENV_CONFIG_PATH=.env.local \
 *   SWITCH_CONFECCIONES_BOSTON_WEB_USER=... SWITCH_CONFECCIONES_BOSTON_WEB_PASSWORD=... \
 *   npx tsx -r dotenv/config scripts/_diag-boston-cartera.ts
 *
 * ⚠️ Abre una sesión WEB de Boston con `changesession=SI`: EXPULSA a quien esté
 * en el panel de esa empresa. Correr de madrugada. La sesión se cierra al final.
 */
import { supabaseServer } from "../src/lib/supabase-server";
import { loginSwitchWeb, fetchCarteraAntiguedad, cerrarSesionWeb } from "../src/lib/switch-api/web-client";
import { construirFilas, tramosPublicadosPorSwitch, type ClienteReporteWeb } from "../src/lib/switch-api/estadocuenta-web";
import { cuadraConSwitch, EMPRESA_CARTERA_WEB } from "../src/lib/switch-api/sync-estadocuenta-web";

const money = (n: number) => n.toLocaleString("es-PA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

async function main() {
  const t0 = Date.now();
  console.log("[1/4] login web…");
  const sesion = await loginSwitchWeb(EMPRESA_CARTERA_WEB);
  console.log(`      ok (${Date.now() - t0} ms)`);
  console.log("[2/4] bajando el reporte…");
  let reporte;
  try {
    reporte = await fetchCarteraAntiguedad(sesion);
  } finally {
    await cerrarSesionWeb(sesion);
  }
  const msReporte = Date.now() - t0;

  const clientes = reporte.clientes as unknown as ClienteReporteWeb[];
  const { filas, skips, resumen } = construirFilas(EMPRESA_CARTERA_WEB, clientes);
  const publicado = tramosPublicadosPorSwitch(reporte.saldosTotales);
  const cuadre = cuadraConSwitch(resumen, publicado);

  console.log(`\n═══ REPORTE WEB (${reporte.rondas} rondas, ${msReporte} ms) ═══`);
  console.log(`fecha del reporte: ${reporte.fechaReporte}`);
  console.log(`clientes con saldo: ${resumen.clientes}   documentos: ${resumen.documentos}   omitidos: ${skips.length}`);
  console.log(`\n                     NOSOTROS          SWITCH PUBLICA`);
  const fila = (n: string, a: number, b: number) =>
    console.log(`  ${n.padEnd(10)} ${money(a).padStart(16)} ${money(b).padStart(16)}   ${Math.abs(a - b) <= 0.01 ? "✅" : "❌"}`);
  fila("total", resumen.total, publicado.total);
  fila("0-90", resumen.d0_90, publicado.d0_90);
  fila("91-120", resumen.d91_120, publicado.d91_120);
  fila("121+", resumen.d121_plus, publicado.d121_plus);
  console.log(`\ncuadre: ${cuadre.ok ? "✅ CUADRA AL CENTAVO" : `❌ ${cuadre.detalle}`}`);
  if (skips.length) {
    console.log("\nomitidos:");
    for (const s of skips.slice(0, 10)) console.log(`  ${s.campo}: ${s.secuencial ?? "-"} → ${JSON.stringify(s.valorCrudo)}`);
  }

  // ─── Contra lo que hay hoy en la base ──────────────────────────────────────
  console.log("[3/4] leyendo switch_estadocuenta…");
  const enBase: Array<{ ccte_id: number; secuencial: string; saldo: number; tipo_comprobante: string; cliente_switch_id: number }> = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabaseServer
      .from("switch_estadocuenta")
      .select("ccte_id,secuencial,saldo,tipo_comprobante,cliente_switch_id")
      .eq("empresa_key", EMPRESA_CARTERA_WEB)
      .neq("saldo", 0)
      .order("ccte_id")
      .range(from, from + 999);
    if (error) throw new Error(error.message);
    if (!data?.length) break;
    enBase.push(...(data as typeof enBase));
    if (data.length < 1000) break;
  }

  const webPorSec = new Map(filas.map((f) => [f.secuencial ?? "", f]));
  let pareados = 0, difSaldo = 0, difTipo = 0, difCliente = 0;
  for (const b of enBase) {
    const w = webPorSec.get(b.secuencial);
    if (!w) continue;
    pareados++;
    if (Math.abs(Math.abs(Number(w.saldo)) - Math.abs(Number(b.saldo))) > 0.005) difSaldo++;
    if (String(w.tipo_comprobante) !== String(b.tipo_comprobante)) difTipo++;
    if (Number(w.cliente_switch_id) !== Number(b.cliente_switch_id)) difCliente++;
  }
  const secBase = new Set(enBase.map((b) => b.secuencial));
  const cerrara = enBase.filter((b) => !webPorSec.has(b.secuencial));
  const nuevos = filas.filter((f) => !secBase.has(f.secuencial ?? ""));

  console.log(`\n═══ CONTRA LA BASE ═══`);
  console.log(`filas hoy con saldo != 0: ${enBase.length}`);
  console.log(`pareados por secuencial : ${pareados}   |saldo| distinto: ${difSaldo}   tipo distinto: ${difTipo}   cliente distinto: ${difCliente}`);
  console.log(`documentos NUEVOS (los va a insertar)          : ${nuevos.length}`);
  console.log(`documentos que el reconcile pondría en 0       : ${cerrara.length}  ($${money(cerrara.reduce((a, b) => a + Math.abs(Number(b.saldo)), 0))} que hoy la pestaña muestra de más)`);

  console.log("[4/4] leyendo las vistas…");
  const { data: vista } = await supabaseServer
    .from("switch_estadocuenta_aging_boston")
    .select("total,d0_90,d91_120,d121_plus")
    .range(0, 999);
  const s = (k: string) => Math.round((vista ?? []).reduce((a: number, x: Record<string, unknown>) => a + Number(x[k]), 0) * 100) / 100;
  console.log(`\npestaña de Boston AHORA : ${(vista ?? []).length} clientes · $${money(s("total"))}  (0-90 ${money(s("d0_90"))} · 91-120 ${money(s("d91_120"))} · 121+ ${money(s("d121_plus"))})`);
  console.log(`pestaña de Boston DESPUÉS: ${resumen.clientes} clientes · $${money(resumen.total)}  (0-90 ${money(resumen.d0_90)} · 91-120 ${money(resumen.d91_120)} · 121+ ${money(resumen.d121_plus)})`);

  // ─── El grupo no se toca ───────────────────────────────────────────────────
  const { data: grupo } = await supabaseServer
    .from("switch_estadocuenta_aging")
    .select("total")
    .range(0, 999);
  const totalGrupo = Math.round((grupo ?? []).reduce((a: number, x: { total: number }) => a + Number(x.total), 0) * 100) / 100;
  console.log(`\ncartera del GRUPO (no la toca nada de esto): ${(grupo ?? []).length} filas · $${money(totalGrupo)}`);
  console.log(`\n(nada de esto escribió en la base — es solo lectura)\n`);
}

main().catch((e) => {
  console.error("FALLÓ:", e?.message || e);
  process.exit(1);
});
