/**
 * ¿DÓNDE se va el tiempo del botón "Actualizar ahora"? — MEDIDO, no supuesto.
 *
 * Dos syncs son los que hacen esperar a Daniel mirando la pantalla:
 *   · catálogos     ~135-200 s  (barrido de páginas + /stock + escrituras)
 *   · estadocuenta  ~109 s      (1 llamada HTTP por cliente, en serie)
 *
 * Este probe mide las DOS contra la MISMA empresa (`vistana`: catálogo Calvin
 * de 8.173 artículos + cartera CXC), con UNA sola sesión de Switch.
 *
 * Fases:
 *   P0. ¿`/apiarticulos/lista` respeta `porPagina` > 50? Si acepta 200, el
 *       barrido baja de 164 páginas a 41 SIN concurrencia — la palanca más
 *       barata de todas. (Ojo: `/apicliente/lista` tiene un cap silencioso en
 *       ~50, ver sync-empresa.ts; hay que MEDIR, no asumir que es igual.)
 *   P1. Barrido de páginas SERIAL → ms/página y el total extrapolado.
 *   P2. Curva de concurrencia sobre páginas DISJUNTAS (2/4/6/8/12).
 *   P3. Serial de control al final = deriva de Switch durante la prueba.
 *   P4. `getEstadoCuenta` serial vs paralelo, clientes DISJUNTOS.
 *   P5. Costo de las ESCRITURAS en Supabase (1 UPDATE por producto) — se mide
 *       el round-trip de un SELECT equivalente, sin escribir nada.
 *
 * 🩸 LOTES DISJUNTOS SIEMPRE. Reusar el mismo lote mide la CACHÉ de Switch y
 * da aceleraciones imposibles (el probe de Tommy midió 13,6× así). Cada nivel
 * paga su propio frío, y el serial de control al final detecta si Switch se
 * puso más rápido o más lento durante la corrida.
 *
 * 🔴 SESIÓN ÚNICA POR EMPRESA. Antes de correr: mirar el calendario de crons y
 * quedar a ≥15 min de cualquier entrada que toque esta empresa. Cierra sesión
 * al terminar, pase lo que pase.
 *
 * SOLO LECTURA — no escribe en Switch ni en Supabase.
 *
 *   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/_probe-sync-lento.ts
 */

import { createSwitchClient, logoutAllSwitchSessions } from "../src/lib/switch-api/client";
import { supabaseServer } from "../src/lib/supabase-server";

const EMPRESA = process.env.EMPRESA ?? "vistana";
const ms = () => Number(process.hrtime.bigint() / 1_000_000n);
const seg = (n: number) => (n / 1000).toFixed(1);

function p50(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)] ?? 0;
}

async function main() {
  const client = createSwitchClient(EMPRESA);
  console.log(`\n════ ${EMPRESA} ════\n`);

  // ── P0. ¿respeta porPagina? ────────────────────────────────────────────────
  console.log("── P0. ¿/apiarticulos/lista respeta porPagina > 50? ──");
  for (const pp of [50, 100, 200, 500, 1000]) {
    const t = ms();
    try {
      const d = (await client.getArticulos({ porPagina: pp, paginaActual: 1 })) as unknown as {
        articulos?: unknown[];
        paginacion?: { total?: number | string };
      };
      const n = d?.articulos?.length ?? 0;
      const total = Number(d?.paginacion?.total ?? 0);
      const dur = ms() - t;
      console.log(
        `   porPagina=${String(pp).padStart(4)} → devolvió ${String(n).padStart(4)} art en ${String(dur).padStart(5)} ms` +
          (total ? `   (total del catálogo: ${total})` : "") +
          (n === pp ? "   ✅ RESPETA" : n > 50 ? "   ⚠️ parcial" : "   ❌ capado en 50"),
      );
    } catch (e) {
      console.log(`   porPagina=${String(pp).padStart(4)} → error: ${String((e as Error).message).slice(0, 80)}`);
    }
  }
  console.log();

  // ── P0b. ¿`filtro` sirve para pedir SOLO una marca? ────────────────────────
  // El cliente ya acepta el parámetro y NADIE lo usa. Si filtrara por marca,
  // el barrido de Calvin bajaría de 164 páginas a ~13 sin concurrencia.
  // ⚠️ Quirk de Switch: un parámetro que no existe responde 200 con lo mismo
  // que sin él (o vacío). Se compara contra la página 1 SIN filtro.
  console.log("── P0b. ¿`filtro` acota el universo? ──");
  const sinFiltro = await client.getArticulos({ porPagina: 50, paginaActual: 1 });
  const baseCodigos = (sinFiltro?.articulos ?? []).map((a) => a.codigo).join(",");
  for (const f of ["8", "CK FOOTWEAR", "marcaId:8", "CALVIN"]) {
    try {
      const d = await client.getArticulos({ porPagina: 50, paginaActual: 1, filtro: f });
      const arr = d?.articulos ?? [];
      const igual = arr.map((a) => a.codigo).join(",") === baseCodigos;
      const marcas = [...new Set(arr.map((a) => a.marcaId))].slice(0, 6);
      console.log(
        `   filtro=${JSON.stringify(f).padEnd(16)} → ${String(arr.length).padStart(3)} art` +
          (igual ? "   ❌ IDÉNTICO a sin filtro (el parámetro se ignora)" : `   marcaIds=${marcas.join("/")}`),
      );
    } catch (e) {
      console.log(`   filtro=${JSON.stringify(f).padEnd(16)} → error: ${String((e as Error).message).slice(0, 70)}`);
    }
  }
  console.log();

  // Tamaño real del catálogo, barriendo hasta la página corta con el tamaño
  // que HOY usa el sync (50). Se aprovecha para la línea base serial.
  const PER_PAGE = 50;

  // ── P1. barrido SERIAL COMPLETO = lo que hoy tarda `fetchAllArticulos` ─────
  //
  // 🩸 Y de paso resuelve una CONTRADICCIÓN del repo: `sync-catalogo.ts` corta
  // el barrido en `arr.length < PER_PAGE`, mientras `sync-articulo-marca.ts`
  // y `sync-articulo-info.ts` dicen, textual, que *"el endpoint ignora
  // porPagina y devuelve lo que quiere"* y por eso cortan solo en página VACÍA.
  // Los dos no pueden tener razón. Si una página intermedia viniera con menos
  // de 50, el catálogo se cortaría ahí EN SILENCIO — el bug del #498 otra vez.
  // Se registra el tamaño de TODAS las páginas para saberlo con certeza.
  console.log(`── P1. barrido serial COMPLETO (porPagina=${PER_PAGE}) — lo que tarda hoy ──`);
  const durSerial: number[] = [];
  const tamanos: number[] = [];
  const tBarrido = ms();
  let vistas = 0;
  let paginasTotales = 0;
  for (let p = 1; p <= 250; p++) {
    const t = ms();
    const d = await client.getArticulos({ porPagina: PER_PAGE, paginaActual: p });
    durSerial.push(ms() - t);
    const n = d?.articulos?.length ?? 0;
    tamanos.push(n);
    vistas += n;
    paginasTotales = p;
    if (n < PER_PAGE) break;
  }
  const msBarrido = ms() - tBarrido;
  const msPagina = p50(durSerial);
  console.log(
    `   ${paginasTotales} páginas · ${vistas} artículos · TOTAL ${seg(msBarrido)} s · ` +
      `p50 ${msPagina} ms/página (min ${Math.min(...durSerial)} · max ${Math.max(...durSerial)})`,
  );
  const cortas = tamanos.slice(0, -1).map((n, i) => ({ p: i + 1, n })).filter((x) => x.n !== PER_PAGE);
  if (cortas.length === 0) {
    console.log(
      `   ✅ TODAS las páginas intermedias trajeron exactamente ${PER_PAGE} y la última ${tamanos[tamanos.length - 1]}` +
        ` → el corte por "página corta" de sync-catalogo.ts es CORRECTO para ${EMPRESA}`,
    );
  } else {
    console.log(
      `   🔴 ${cortas.length} página(s) INTERMEDIA(S) con distinto de ${PER_PAGE}: ` +
        cortas.slice(0, 8).map((x) => `p${x.p}=${x.n}`).join(" ") +
        ` → el corte por "página corta" TRUNCA el catálogo en silencio`,
    );
  }

  // ── P1b. 🔴 ¿QUÉ DEVUELVE UNA PÁGINA MÁS ALLÁ DEL FINAL? ──────────────────
  //
  // Decide el diseño del barrido en paralelo, así que NO se puede suponer. En
  // serie nunca se pregunta (el bucle corta en la página corta). En paralelo la
  // tanda las pide igual, y hay dos comportamientos posibles y opuestos:
  //   · devuelve VACÍO  → se pueden descartar y, además, una página NO vacía
  //     detrás de la corta es una señal legítima de "el catálogo se movió".
  //   · CLAMPEA a la última página (devuelve lo mismo otra vez) → esa señal es
  //     ruido y el barrido tiene que descartar en silencio, como hoy.
  console.log(`\n── P1b. ¿qué devuelve una página MÁS ALLÁ del final (${paginasTotales})? ──`);
  const ultimaCodigos = (
    await client.getArticulos({ porPagina: PER_PAGE, paginaActual: paginasTotales })
  )?.articulos?.map((a) => a.codigo).join(",");
  for (const p of [paginasTotales + 1, paginasTotales + 3, paginasTotales + 20]) {
    try {
      const d = await client.getArticulos({ porPagina: PER_PAGE, paginaActual: p });
      const arr = d?.articulos ?? [];
      const igualUltima = arr.map((a) => a.codigo).join(",") === ultimaCodigos;
      console.log(
        `   página ${p} → ${arr.length} artículos` +
          (arr.length === 0
            ? "   ✅ VACÍA (se puede descartar y detectar el catálogo movido)"
            : igualUltima
              ? "   🔴 CLAMPEA a la última (repite el mismo contenido)"
              : "   ⚠️ trae OTRA cosa"),
      );
    } catch (e) {
      console.log(`   página ${p} → error: ${String((e as Error).message).slice(0, 80)}`);
    }
  }

  // ── P2. curva de concurrencia, páginas DISJUNTAS ───────────────────────────
  //
  // ⚠️ P1 ya recorrió TODO el catálogo, así que estas páginas están calientes.
  // Por eso el punto de comparación NO es el p50 de P1 sino un serial de
  // control corrido ACÁ, sobre páginas igual de calientes: peras con peras. Y
  // cada nivel usa páginas DISJUNTAS entre sí (reusar el mismo lote da
  // aceleraciones imposibles — es lo que midió mal el primer probe de Tommy).
  console.log(`\n── P2. concurrencia sobre páginas DISJUNTAS ──`);
  const NIVELES = [2, 4, 6, 8, 12];
  const POR_NIVEL = 16;
  let cursor = 1;
  const resultados: Array<{ c: number; msPorPagina: number; errores: number; vacias: number }> = [];

  async function correr(concurrencia: number, paginas: number[]) {
    let errores = 0;
    let vacias = 0;
    const cola = [...paginas];
    const t = ms();
    const worker = async () => {
      for (;;) {
        const p = cola.shift();
        if (p === undefined) return;
        try {
          const d = await client.getArticulos({ porPagina: PER_PAGE, paginaActual: p });
          if ((d?.articulos?.length ?? 0) === 0) vacias++;
        } catch {
          errores++;
        }
      }
    };
    await Promise.all(Array.from({ length: concurrencia }, worker));
    return { ms: ms() - t, errores, vacias, n: paginas.length };
  }

  // Control serial con el MISMO tamaño de lote, para comparar peras con peras.
  const basePar = await correr(1, Array.from({ length: POR_NIVEL }, (_, i) => cursor + i));
  cursor += POR_NIVEL;
  const baseMsPag = basePar.ms / basePar.n;
  console.log(
    `   serial ×1 ..... ${seg(basePar.ms)} s  (${baseMsPag.toFixed(0)} ms/página)  errores=${basePar.errores} vacías=${basePar.vacias}`,
  );

  for (const c of NIVELES) {
    const paginas = Array.from({ length: POR_NIVEL }, (_, i) => cursor + i);
    cursor += POR_NIVEL;
    const r = await correr(c, paginas);
    const efectivo = r.ms / r.n;
    const mejora = baseMsPag / efectivo;
    resultados.push({ c, msPorPagina: efectivo, errores: r.errores, vacias: r.vacias });
    console.log(
      `   paralelo ×${String(c).padStart(2)} .. ${seg(r.ms)} s  (${efectivo.toFixed(0)} ms/página efectivo)  ` +
        `→ ${mejora.toFixed(1)}× ${r.errores === 0 ? "OK" : `⚠️ errores=${r.errores}`} vacías=${r.vacias}`,
    );
  }

  // ── P3. deriva ─────────────────────────────────────────────────────────────
  const control = await correr(1, Array.from({ length: POR_NIVEL }, (_, i) => cursor + i));
  cursor += POR_NIVEL;
  const deriva = ((control.ms / control.n) / baseMsPag - 1) * 100;
  console.log(
    `   serial (control final) ... ${(control.ms / control.n).toFixed(0)} ms/página  → deriva ${deriva >= 0 ? "+" : ""}${deriva.toFixed(0)}%`,
  );

  // Extrapolación al catálogo entero
  console.log(`\n   EXTRAPOLACIÓN del barrido completo (${paginasTotales} páginas de ${PER_PAGE}):`);
  console.log(`     hoy (serial, MEDIDO en P1) ... ${seg(msBarrido)} s`);
  console.log(`     serial de control ............ ${seg(paginasTotales * baseMsPag)} s`);
  for (const r of resultados) {
    console.log(`     paralelo ×${String(r.c).padStart(2)} ................ ${seg(paginasTotales * r.msPorPagina)} s`);
  }

  // ── P4. estadocuenta: 1 llamada por cliente ────────────────────────────────
  console.log(`\n── P4. estadocuenta (1 llamada HTTP por cliente) ──`);
  const tClientes = ms();
  const clientes: Array<{ id: number }> = [];
  for (let page = 1; page <= 40; page++) {
    const resp = await client.listClientes({ porPagina: 200, paginaActual: page });
    const batch = (resp.clientes ?? []) as Array<{ id: number }>;
    if (batch.length === 0) break;
    clientes.push(...batch.filter((c) => typeof c.id === "number"));
    const total = Number(resp.paginacion?.total ?? 0);
    if (total > 0 && clientes.length >= total) break;
  }
  const msClientes = ms() - tClientes;
  console.log(`   listClientes: ${clientes.length} clientes en ${seg(msClientes)} s`);

  const N_EC = 20;
  const necesarios = N_EC * (NIVELES.length + 2);
  const paso = Math.max(1, Math.floor(clientes.length / necesarios));
  const pool = clientes.filter((_, i) => i % paso === 0).slice(0, necesarios);
  const lotes: Array<Array<{ id: number }>> = [];
  for (let i = 0; i < NIVELES.length + 2; i++) lotes.push(pool.slice(i * N_EC, (i + 1) * N_EC));

  async function correrEc(concurrencia: number, lote: Array<{ id: number }>) {
    let errores = 0;
    const cola = [...lote];
    const t = ms();
    const worker = async () => {
      for (;;) {
        const c = cola.shift();
        if (!c) return;
        try {
          await client.getEstadoCuenta(c.id);
        } catch {
          errores++;
        }
      }
    };
    await Promise.all(Array.from({ length: concurrencia }, worker));
    return { ms: ms() - t, errores, n: lote.length };
  }

  if (lotes[0].length === 0) {
    console.log("   ⚠️ no hay clientes suficientes para medir");
  } else {
    const baseEc = await correrEc(1, lotes[0]);
    const baseMsEc = baseEc.ms / baseEc.n;
    console.log(
      `   serial ×1 ..... ${seg(baseEc.ms)} s  (${baseMsEc.toFixed(0)} ms/cliente)  errores=${baseEc.errores}`,
    );
    const resEc: Array<{ c: number; msPorCliente: number; errores: number }> = [];
    for (let i = 0; i < NIVELES.length; i++) {
      const c = NIVELES[i];
      const lote = lotes[i + 1];
      if (lote.length === 0) continue;
      const r = await correrEc(c, lote);
      const efectivo = r.ms / r.n;
      resEc.push({ c, msPorCliente: efectivo, errores: r.errores });
      console.log(
        `   paralelo ×${String(c).padStart(2)} .. ${seg(r.ms)} s  (${efectivo.toFixed(0)} ms/cliente efectivo)  ` +
          `→ ${(baseMsEc / efectivo).toFixed(1)}× ${r.errores === 0 ? "OK" : `⚠️ errores=${r.errores}`}`,
      );
    }
    const ctrlEc = await correrEc(1, lotes[NIVELES.length + 1]);
    const derEc = ((ctrlEc.ms / ctrlEc.n) / baseMsEc - 1) * 100;
    console.log(
      `   serial (control final) ... ${(ctrlEc.ms / ctrlEc.n).toFixed(0)} ms/cliente  → deriva ${derEc >= 0 ? "+" : ""}${derEc.toFixed(0)}%`,
    );

    console.log(`\n   EXTRAPOLACIÓN a ${clientes.length} clientes:`);
    console.log(`     hoy (serial) ......... ${seg(clientes.length * baseMsEc + msClientes)} s  (incluye listClientes)`);
    for (const r of resEc) {
      console.log(`     paralelo ×${String(r.c).padStart(2)} ......... ${seg(clientes.length * r.msPorCliente + msClientes)} s`);
    }
  }

  // ── P5. costo de un round-trip a Supabase ──────────────────────────────────
  console.log(`\n── P5. round-trip a Supabase (para dimensionar las escrituras) ──`);
  const durDb: number[] = [];
  for (let i = 0; i < 10; i++) {
    const t = ms();
    await supabaseServer.from("products").select("id").limit(1);
    durDb.push(ms() - t);
  }
  console.log(`   SELECT trivial: p50 ${p50(durDb)} ms (min ${Math.min(...durDb)} · max ${Math.max(...durDb)})`);
  console.log(`   → 490 UPDATEs uno por uno ≈ ${seg(490 * p50(durDb))} s de puro round-trip`);
  console.log(`   → 8.173 UPDATEs uno por uno ≈ ${seg(8173 * p50(durDb))} s`);
  console.log();
}

main()
  .catch((e) => {
    console.error("FALLÓ:", e?.message ?? e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await logoutAllSwitchSessions();
  });
