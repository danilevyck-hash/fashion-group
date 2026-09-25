// ============================================================================
// Marketing — RESCATAR LAS FOTOS DE TIENDA QUE QUEDARON HUÉRFANAS
//
// 🩸 La puerta de las fotos de tienda subía el archivo al cajón y DESPUÉS
// anotaba la fila; la base rechazaba la fila (`mk_adjuntos_destino_chk` exigía
// proyecto) y el archivo se quedaba solo, sin fila y sin pantalla que lo vea.
// Medido el 24-sep-2026: 4 archivos en `tienda/D-118/`, 21:50:59–21:51:00 UTC,
// los cuatro `image/jpeg` (73 KB · 99 KB · 99 KB · 104 KB).
//
// 🔴 SOLO LECTURA POR DEFECTO. Sin `--aplicar` no escribe NADA: lista los
// archivos del cajón que no tienen fila y dice qué insertaría.
//
//   npx tsx scripts/marketing-rescatar-fotos-huerfanas.ts              (mira)
//   npx tsx scripts/marketing-rescatar-fotos-huerfanas.ts --tienda D-118
//   npx tsx scripts/marketing-rescatar-fotos-huerfanas.ts --marca=TH
//   npx tsx scripts/marketing-rescatar-fotos-huerfanas.ts --periodo=<uuid>
//   npx tsx scripts/marketing-rescatar-fotos-huerfanas.ts --archivo=<nombre>:TH
//   npx tsx scripts/marketing-rescatar-fotos-huerfanas.ts --aplicar    (escribe)
//
// 🔴 UNA MARCA POR ARCHIVO (24-sep-2026). `--archivo=<nombre>:<marca>` se
// repite una vez por archivo y le gana al valor global; el valor puede ser la
// clave de la marca (`TH`) o el id del período. El archivo que no está en el
// mapa y no tiene valor global se SALTA y se dice, uno por uno: los cuatro
// huérfanos de D-118 no son de la misma marca (dos Tommy, dos Calvin).
//
// 🔴 LA MARCA SE ELIGE, NO SE ADIVINA (24-sep-2026). Los períodos son POR
// MARCA y una tienda puede tener DOS abiertos a la vez (medido: D-118 tiene
// Calvin y Tommy). Con una sola marca abierta la foto va ahí sin preguntar;
// con dos o más hace falta `--marca=<clave>` o `--periodo=<uuid>`, y sin el
// parámetro el script MUESTRA las dos opciones y **no aplica nada**. Es la
// misma función pura que usa la puerta (`destinoDeFotoNueva`): no hay una
// segunda regla escrita acá.
//
// 🔴 A UN PERÍODO CERRADO NO ENTRA NADA: la lista de opciones son SOLO los
// abiertos, así que un `--periodo` cerrado no está entre ellas y se rechaza.
//
// ⚠️ `--aplicar` necesita la migración `20261219130000` YA corrida (se aplicó
// el 24-sep-2026): sin ella la base vuelve a rechazar la fila y el script lo
// dice sin tocar nada más.
// ============================================================================

import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";

const BUCKET = "marketing";
const PREFIJO = "tienda/";

function cargarEnv() {
  const p = path.resolve(__dirname, "..", ".env.local");
  if (!fs.existsSync(p)) return;
  for (const linea of fs.readFileSync(p, "utf8").split("\n")) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(linea.trim());
    if (!m) continue;
    if (!process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

interface Huerfana {
  path: string;
  tienda: string;
  nombreOriginal: string;
  sizeBytes: number | null;
  subidaEn: string | null;
}

async function main() {
  cargarEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.log("❌ Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local");
    process.exitCode = 1;
    return;
  }
  const args = process.argv.slice(2);
  const aplicar = args.includes("--aplicar");
  const iTienda = args.indexOf("--tienda");
  const soloTienda = iTienda >= 0 ? String(args[iTienda + 1] ?? "").toUpperCase() : null;
  // La marca elegida a mano: `--marca=TH` o `--periodo=<uuid>`. Es lo mismo
  // para la regla pura — busca por clave de marca o por id de período.
  const valorDe = (bandera: string): string => {
    const conIgual = args.find((a) => a.startsWith(`${bandera}=`));
    if (conIgual) return conIgual.slice(bandera.length + 1).trim();
    const i = args.indexOf(bandera);
    return i >= 0 ? String(args[i + 1] ?? "").trim() : "";
  };
  const elegido = valorDe("--periodo") || valorDe("--marca");
  // 🔴 El mapa `archivo → marca`, que le gana al valor global.
  const { mapaDeArchivosElegidos, elegidoParaArchivo, nombreEnElCajon, AVISO_ARCHIVO_SIN_ELEGIR } = await import(
    "../src/lib/marketing/fotos-rescate"
  );
  const porArchivo = mapaDeArchivosElegidos(args);

  const sb = createClient(url, key, { auth: { persistSession: false } });

  // 1. Las filas que YA existen: su `url` es el path del cajón.
  const { data: filas, error: errFilas } = await sb
    .from("mk_adjuntos")
    .select("id, url")
    .eq("tipo", "foto_proyecto");
  if (errFilas) throw new Error(`mk_adjuntos: ${errFilas.message}`);
  const anotadas = new Set((filas ?? []).map((f) => String(f.url ?? "").trim()));

  // 2. Las carpetas del cajón, una por tienda.
  const { data: carpetas, error: errC } = await sb.storage.from(BUCKET).list(PREFIJO.slice(0, -1), {
    limit: 1000,
  });
  if (errC) throw new Error(`storage list: ${errC.message}`);

  const huerfanas: Huerfana[] = [];
  for (const c of carpetas ?? []) {
    const tienda = String(c.name ?? "").trim();
    if (!tienda) continue;
    if (soloTienda && tienda.toUpperCase() !== soloTienda) continue;
    const { data: archivos, error: errA } = await sb.storage
      .from(BUCKET)
      .list(`${PREFIJO}${tienda}`, { limit: 1000 });
    if (errA) throw new Error(`storage list ${tienda}: ${errA.message}`);
    for (const a of archivos ?? []) {
      const p = `${PREFIJO}${tienda}/${a.name}`;
      if (anotadas.has(p)) continue;
      const meta = (a.metadata ?? {}) as { size?: number };
      huerfanas.push({
        path: p,
        tienda: tienda.toUpperCase(),
        // El nombre se guarda con un sello de tiempo delante: `1790286658923_foo.jpeg`.
        nombreOriginal: String(a.name ?? "").replace(/^\d+_/, ""),
        sizeBytes: Number.isFinite(Number(meta.size)) ? Number(meta.size) : null,
        subidaEn: (a as { created_at?: string }).created_at ?? null,
      });
    }
  }

  if (huerfanas.length === 0) {
    console.log("✅ No hay archivos huérfanos en el cajón.");
    return;
  }

  console.log(`\n${huerfanas.length} archivo(s) en el cajón SIN fila en mk_adjuntos:\n`);
  for (const h of huerfanas) {
    console.log(
      `  ${h.tienda}  ${h.path}  ${h.sizeBytes ?? "?"} bytes  ${h.subidaEn ?? "sin fecha"}`,
    );
  }

  // 3. El período con el que nacería cada una: las marcas ABIERTAS de su
  //    tienda y la MISMA regla pura de la puerta (`destinoDeFotoNueva`).
  const { destinoDeFotoNueva, marcasAbiertasOrdenadas, periodosAbiertosOrdenados } = await import(
    "../src/lib/marketing/fotos-periodo"
  );
  type Marca = { periodoId: string; proveedorKey: string; nombre: string };
  const marcasPorTienda = new Map<string, Marca[]>();
  for (const t of new Set(huerfanas.map((h) => h.tienda))) {
    const [fac, ent] = await Promise.all([
      sb.from("mk_facturas").select("id, fecha_factura, created_at").eq("tienda_codigo", t).is("anulado_en", null),
      sb.from("mk_entregas_muebles").select("id, created_at").eq("tienda_codigo", t),
    ]);
    const gastos = [
      ...((fac.data ?? []) as Array<Record<string, unknown>>).map((f) => ({
        id: String(f.id),
        cuando: String(f.created_at ?? f.fecha_factura ?? ""),
      })),
      ...((ent.data ?? []) as Array<Record<string, unknown>>).map((e) => ({
        id: String(e.id),
        cuando: String(e.created_at ?? ""),
      })),
    ];
    if (gastos.length === 0) {
      marcasPorTienda.set(t, []);
      continue;
    }
    const sel = await sb
      .from("mk_periodo_documentos")
      .select("documento_id, periodo_id")
      .in("documento_id", gastos.map((g) => g.id));
    const ids = [...new Set(((sel.data ?? []) as Array<Record<string, unknown>>).map((x) => String(x.periodo_id)))];
    // 🔴 SOLO LOS ABIERTOS: un período cerrado nunca entra a la lista.
    const per = ids.length
      ? await sb.from("mk_periodos").select("id, proveedor_key").in("id", ids).eq("estado", "abierto")
      : { data: [] as Array<Record<string, unknown>> };
    const marcaDe = new Map<string, string>();
    for (const x of (per.data ?? []) as Array<Record<string, unknown>>) {
      marcaDe.set(String(x.id), String(x.proveedor_key ?? ""));
    }
    const porDoc = new Map<string, string[]>();
    for (const x of (sel.data ?? []) as Array<Record<string, unknown>>) {
      const pid = String(x.periodo_id);
      if (!marcaDe.has(pid)) continue;
      const doc = String(x.documento_id);
      porDoc.set(doc, [...(porDoc.get(doc) ?? []), pid]);
    }
    const orden = periodosAbiertosOrdenados(
      gastos.map((g) => ({ documentoId: g.id, cuando: g.cuando, periodosAbiertos: porDoc.get(g.id) ?? [] })),
    );
    marcasPorTienda.set(
      t,
      marcasAbiertasOrdenadas(orden.map((periodoId) => ({ periodoId, proveedorKey: marcaDe.get(periodoId) ?? "" }))),
    );
  }

  console.log("\nLas marcas con período ABIERTO de cada tienda:\n");
  for (const [t, marcas] of marcasPorTienda) {
    const lista = marcas.length
      ? marcas.map((m) => `${m.nombre} (${m.proveedorKey} · ${m.periodoId})`).join("  |  ")
      : "ninguna — la foto queda sin sello y se ve en «Abierto»";
    console.log(`  ${t}: ${lista}`);
  }

  // 4. 🔴 EL DESTINO ES POR ARCHIVO: primero el mapa `--archivo=<nombre>:<marca>`,
  //    después el valor global, y siempre la MISMA regla pura de la puerta.
  //    El archivo que queda sin elegir se SALTA y se dice, uno por uno.
  const destinoPorArchivo = new Map<string, ReturnType<typeof destinoDeFotoNueva>>();
  for (const h of huerfanas) {
    const marcas = marcasPorTienda.get(h.tienda) ?? [];
    destinoPorArchivo.set(h.path, destinoDeFotoNueva(marcas, elegidoParaArchivo(porArchivo, h.path, elegido)));
  }

  console.log("\nLo que se insertaría (una fila por archivo):\n");
  const saltadas: Huerfana[] = [];
  for (const h of huerfanas) {
    const destino = destinoPorArchivo.get(h.path);
    if (!destino?.ok) {
      saltadas.push(h);
      console.log(`  ⚠️  ${h.path} — ${destino?.faltaElegir ? AVISO_ARCHIVO_SIN_ELEGIR : destino?.error}`);
      const marcas = marcasPorTienda.get(h.tienda) ?? [];
      if (destino?.faltaElegir && marcas.length) {
        console.log(
          `     → elige una: ${marcas
            .map((m) => `--archivo=${nombreEnElCajon(h.path)}:${m.proveedorKey}`)
            .join("  o  ")}`,
        );
      }
      continue;
    }
    console.log(
      JSON.stringify({
        tipo: "foto_proyecto",
        proyecto_id: null,
        factura_id: null,
        tienda_codigo: h.tienda,
        periodo_id: destino.periodoId,
        url: h.path,
        nombre_original: h.nombreOriginal,
        size_bytes: h.sizeBytes,
      }),
    );
  }
  if (saltadas.length) {
    console.log(`\n🛑 ${saltadas.length} archivo(s) se saltan: nadie eligió su marca.`);
  }

  if (!aplicar) {
    console.log("\n👀 Solo lectura. Nada se escribió. Con `--aplicar` se insertan esas filas.");
    return;
  }

  // 🔴 Sin un solo archivo con marca resuelta no se escribe nada.
  if (saltadas.length === huerfanas.length) {
    console.log("\n🛑 Falta elegir la marca. Nada se escribió. Vuelve a correrlo con `--archivo=<nombre>:<marca>`.");
    process.exitCode = 1;
    return;
  }

  console.log("\n✍️  Insertando…");
  let ok = 0;
  let intentadas = 0;
  for (const h of huerfanas) {
    const destino = destinoPorArchivo.get(h.path);
    if (!destino?.ok) continue;
    intentadas += 1;
    const fila: Record<string, unknown> = {
      tipo: "foto_proyecto",
      proyecto_id: null,
      factura_id: null,
      tienda_codigo: h.tienda,
      url: h.path,
      nombre_original: h.nombreOriginal,
      size_bytes: h.sizeBytes,
    };
    if (destino.periodoId) fila.periodo_id = destino.periodoId;
    const { error } = await sb.from("mk_adjuntos").insert(fila);
    if (error) {
      console.log(`  ❌ ${h.path}: ${error.message}`);
      if (String(error.code ?? "") === "23514") {
        console.log("     → falta correr la migración 20261219130000. Se detiene acá.");
        break;
      }
      continue;
    }
    ok += 1;
    console.log(`  ✅ ${h.path}  →  ${destino.periodoId ?? "sin sello"}`);
  }
  console.log(`\n${ok} de ${intentadas} fila(s) insertada(s); ${saltadas.length} saltada(s).`);
}

main().catch((e) => {
  console.log(`❌ ${e instanceof Error ? e.message : String(e)}`);
  process.exitCode = 1;
});
