/**
 * Las alternativas para las 478 llamadas /stock del cron `tommy-catalogo`,
 * MEDIDAS antes de implementar ninguna.
 *
 * El precedente que hay que descartar o confirmar: Boston pasó de 54 min a 4 s
 * cambiando 4.912 llamadas de la API por 2 pedidos al reporte del panel web.
 * Tommy tiene la misma forma (1 llamada por artículo), así que la primera
 * pregunta es si existe una fuente MASIVA del saldo.
 *
 * Se prueban, en orden de preferencia:
 *   A. ¿/apiarticulos/stock devuelve TODO si se le saca articuloId, o si se le
 *      pide por sucursal? (sería el equivalente al reporte de Boston)
 *      ⚠️ Quirk de Switch: una ruta/param inexistente responde HTTP 200 con
 *      body VACÍO, no 404. "200 vacío" = no existe.
 *   B. ¿/apiarticulos/lista trae el saldo si se le pide más grande la página, o
 *      esconde algún campo que no estemos leyendo?
 *   C. ¿Switch tolera CONCURRENCIA en /stock? Es el plan B: no baja el número
 *      de llamadas, baja el tiempo de pared. Se compara la misma tanda serial
 *      contra 3 niveles de concurrencia, mirando también que no aparezcan
 *      errores ni respuestas vacías (que sería rate-limit disfrazado).
 *
 * 🔴 SESIÓN ÚNICA. `fashion_shoes` admite UN login. Antes de correr: sin filas
 * `running` en switch_sync_log y lejos de 12:40 / 17:40 UTC. Cierra sesión al
 * terminar.
 *
 * SOLO LECTURA — no escribe en Switch ni en Supabase.
 *
 *   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/_probe-tommy-alternativas.ts
 */

import { createSwitchClient, logoutAllSwitchSessions } from "../src/lib/switch-api/client";
import { isTommyArticulo } from "../src/lib/switch-api/sync-catalogo-tommy";

const EMPRESA = "fashion_shoes";
const ms = () => Number(process.hrtime.bigint() / 1_000_000n);

/** Llama a un path crudo con la sesión ya abierta del cliente. */
async function crudo(path: string): Promise<{ status: string; muestra: string }> {
  const mod = await import("../src/lib/switch-api/client");
  const anyMod = mod as unknown as Record<string, unknown>;
  // `authedCall` no se exporta; se usa el cliente y se mira el shape recibido.
  void anyMod;
  return { status: "n/a", muestra: "" };
}
void crudo;

async function main() {
  const client = createSwitchClient(EMPRESA);

  // Universo (y calienta la sesión).
  const arts = [];
  for (let p = 1; p <= 80; p++) {
    const d = await client.getArticulos({ porPagina: 50, paginaActual: p });
    const arr = d?.articulos ?? [];
    arts.push(...arr);
    if (arr.length < 50) break;
  }
  const tommy = arts.filter(isTommyArticulo);
  console.log(`universo: ${arts.length} artículos, ${tommy.length} Tommy\n`);

  // ── A. ¿el bulk /lista esconde el saldo en algún campo que no leemos? ──────
  console.log("── A. campos que /apiarticulos/lista devuelve de verdad ──");
  const claves = new Set<string>();
  for (const a of arts) for (const k of Object.keys(a)) claves.add(k);
  console.log("   ", [...claves].sort().join(", "));
  const traeSaldo = [...claves].some((k) => /saldo|existencia|stock/i.test(k));
  console.log(`   ¿hay algún campo de EXISTENCIA/saldo? → ${traeSaldo ? "SÍ" : "NO"}`);
  const ej = tommy[0];
  console.log(`    ejemplo: codigo=${ej.codigo} disponible=${ej.disponible} precio=${ej.precio}\n`);

  // ── B. ¿/stock acepta pedirlo masivo? ─────────────────────────────────────
  // Quirk: ruta/param inválido → HTTP 200 con body vacío. Un `stock` ausente o
  // de largo 0 cuando el artículo SÍ tiene existencia = "no soporta esa forma".
  console.log("── B. ¿/apiarticulos/stock se puede pedir masivo? ──");
  const conStock = tommy.find((a) => parseFloat(String(a.disponible ?? "0")) >= 1) ?? tommy[0];
  const uno = await client.getStock(conStock.id);
  console.log(`   control (articuloId=${conStock.id}): ${uno?.stock?.length ?? 0} fila(s) — la forma que YA usamos`);

  for (const [etiqueta, arg] of [
    ["sin articuloId", ""],
    ["articuloId vacío", " "],
    ["articuloId=0", "0"],
    ["articuloId=-1", "-1"],
  ] as const) {
    try {
      const r = await client.getStock(arg as string);
      const n = r?.stock?.length ?? 0;
      console.log(`   ${etiqueta.padEnd(18)} → ${n} fila(s)${n > 1 ? "  ⚠️ ¡MASIVO!" : n === 0 ? "  (200 vacío = no existe esa forma)" : ""}`);
    } catch (e) {
      console.log(`   ${etiqueta.padEnd(18)} → error: ${String((e as Error).message).slice(0, 70)}`);
    }
  }
  console.log();

  // ── C. ¿tolera CONCURRENCIA? ──────────────────────────────────────────────
  // Plan B: mismas llamadas, menos tiempo de pared.
  //
  // 🩸 CADA NIVEL USA ARTÍCULOS DISTINTOS. La primera versión de esta prueba
  // reusaba el MISMO lote en los cuatro niveles y daba 13,6× con concurrencia 5
  // — superlineal, o sea imposible por paralelismo solo. Lo que medía era la
  // CACHÉ de Switch: la tanda serial calentaba los 24 artículos y las paralelas
  // los pedían ya calientes. Con lotes disjuntos cada nivel paga su propio frío.
  // Y se vuelve a medir SERIAL al final, sobre otro lote más, para detectar si
  // Switch se puso más rápido o más lento durante la prueba (deriva).
  console.log("── C. ¿Switch tolera /stock en paralelo? (lotes DISJUNTOS) ──");
  const N = 24;
  const necesarios = N * 5; // 4 niveles + el serial de control final
  const paso = Math.max(1, Math.floor(tommy.length / necesarios));
  const pool = tommy.filter((_, i) => i % paso === 0).slice(0, necesarios);
  if (pool.length < necesarios) {
    console.log(`   ⚠️ solo hay ${pool.length} artículos para ${necesarios} necesarios`);
  }
  const lotes: typeof tommy[] = [];
  for (let i = 0; i < 5; i++) lotes.push(pool.slice(i * N, (i + 1) * N));

  async function correr(concurrencia: number, lote: typeof tommy) {
    let errores = 0;
    let vacias = 0;
    const t = ms();
    const cola = [...lote];
    const worker = async () => {
      for (;;) {
        const a = cola.shift();
        if (!a) return;
        try {
          const r = await client.getStock(a.id);
          if ((r?.stock?.length ?? 0) === 0) vacias++;
        } catch {
          errores++;
        }
      }
    };
    await Promise.all(Array.from({ length: concurrencia }, worker));
    return { ms: ms() - t, errores, vacias, n: lote.length };
  }

  const base = await correr(1, lotes[0]);
  console.log(`   serial (hoy) .... ${(base.ms / 1000).toFixed(1)} s  (${(base.ms / base.n).toFixed(0)} ms/llamada)  errores=${base.errores} vacías=${base.vacias}`);
  console.log(`      → 478 llamadas: ${((base.ms / base.n) * 478 / 1000).toFixed(0)} s`);

  const niveles = [3, 5, 8];
  for (let i = 0; i < niveles.length; i++) {
    const c = niveles[i];
    const r = await correr(c, lotes[i + 1]);
    const mejora = (base.ms / base.n) / (r.ms / r.n);
    const salud = r.errores === 0 ? "OK" : `⚠️ errores=${r.errores}`;
    console.log(`   paralelo ×${c} ..... ${(r.ms / 1000).toFixed(1)} s  (${(r.ms / r.n).toFixed(0)} ms/llamada efectivo)  → ${mejora.toFixed(1)}× más rápido   ${salud} vacías=${r.vacias}`);
    console.log(`      → 478 llamadas: ${((r.ms / r.n) * 478 / 1000).toFixed(0)} s`);
  }

  // Control de DERIVA: mismo modo que la línea base, lote nuevo, al final.
  const control = await correr(1, lotes[4]);
  const deriva = ((control.ms / control.n) / (base.ms / base.n) - 1) * 100;
  console.log(`   serial (control final) ... ${(control.ms / control.n).toFixed(0)} ms/llamada  → deriva ${deriva >= 0 ? "+" : ""}${deriva.toFixed(0)}% contra la línea base`);
}

main()
  .catch((e) => { console.error("FALLÓ:", e?.message ?? e); process.exitCode = 1; })
  .finally(async () => { await logoutAllSwitchSessions(); });
