// ─────────────────────────────────────────────────────────────────────────────
// GET /api/ventas/referencia — tab "Referencia" de /ventas. SOLO ADMIN.
//
// Dos modos:
//   ?q=…        una búsqueda: código exacto / modelo (prefijo) / descripción
//   ?codigos=…  vista múltiple: hasta 50 códigos exactos separados por coma
//
// DOS fuentes, fusionadas:
//   · switch_articulo_diario — las VENTAS (serie mensual neta, NC restadas en
//     signoTipo(), un solo lugar). SOLO las 6 empresas de Fashion Group.
//   · switch_articulo_info — el CATÁLOGO (nombre comercial, existencia, precio
//     de etiqueta + frescura). Lo llena el botón "Actualizar datos de Switch".
//     Si la tabla todavía no existe (migración 20260810120000 pendiente), el
//     tab funciona igual con `infoDisponible: false`.
//     🔴 `costo_api` JAMÁS entra al payload — ver infoParaCliente().
//
// La búsqueda por descripción mira LAS DOS: la del diario es categoría+género
// ("Men-Small Leather"); la del catálogo es el nombre comercial ("KAHLO
// PASSCASE"). Antes "kahlo" no encontraba nada — esa era la limitación
// reportada en la Fase 1.
//
// Lectura SIEMPRE con leerTodoPaginado (db-max-rows=1000 corta en silencio) y
// pre-conteo que rechaza búsquedas demasiado amplias (tope MAX_FILAS_BUSQUEDA)
// en vez de arrastrar 200 páginas — Supabase ya se cayó por lecturas así.
//
// `hoyMes` va en hora PANAMÁ desde el servidor: el cliente nunca usa Date UTC.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { supabaseServer } from "@/lib/supabase-server";
import { leerTodoPaginado } from "@/lib/supabase-paginado";
import { hoyPanama } from "@/lib/fecha-panama";
import {
  REFERENCIA_EMPRESA_KEYS,
  MAX_FILAS_BUSQUEDA,
  MAX_CODIGOS_MULTI,
  agruparReferencias,
  normalizarBusqueda,
  esCodigo,
  escapeLike,
  modeloDe,
  type FilaDiario,
  type ReferenciaSerie,
  type CoincidenciaDescripcion,
  type ReferenciaApiResp,
} from "@/lib/ventas/referencia";
import { infoParaCliente, type ArticuloInfoFila } from "@/lib/ventas/referencia-info";

export const dynamic = "force-dynamic";

const COLUMNAS = "empresa_key, fecha, codigo, descripcion, tipo, cantidad_total, venta_total";
// SIN costo_api a propósito: ni siquiera se lee — no puede filtrarse al payload.
const COLUMNAS_INFO = "empresa_key, codigo, descripcion, existencia, precio_etiqueta, synced_at";

/** El filtro de una búsqueda, como dato (no closure), para aplicarlo igual al
 *  pre-conteo y a cada página de la lectura. */
type Filtro =
  | { tipo: "codigos"; codigos: string[] }
  | { tipo: "prefijo"; patron: string }
  | { tipo: "descripcion"; patron: string };

function base(opts: { count?: "exact"; head?: boolean }) {
  return supabaseServer
    .from("switch_articulo_diario")
    .select(COLUMNAS, opts)
    .in("empresa_key", [...REFERENCIA_EMPRESA_KEYS]);
}

function conFiltro(sel: ReturnType<typeof base>, f: Filtro): ReturnType<typeof base> {
  switch (f.tipo) {
    case "codigos":
      return sel.in("codigo", f.codigos);
    case "prefijo":
      return sel.like("codigo", f.patron);
    case "descripcion":
      return sel.ilike("descripcion", f.patron);
  }
}

/** Pre-conteo (head-only): si la búsqueda matchea más de MAX_FILAS_BUSQUEDA
 *  filas, se rechaza con mensaje claro en vez de leer 200 páginas. */
async function contarFilas(f: Filtro): Promise<number> {
  const { count, error } = await conFiltro(base({ count: "exact", head: true }), f);
  if (error) throw new Error(`conteo: ${error.message}`);
  return count ?? 0;
}

async function leerFilas(etiqueta: string, f: Filtro): Promise<FilaDiario[]> {
  return leerTodoPaginado<FilaDiario>(etiqueta, (pedirCount, desde, hasta) =>
    conFiltro(base(pedirCount ? { count: "exact" } : {}), f)
      .order("id", { ascending: true })
      .range(desde, hasta),
  );
}

// ─── Lecturas de switch_articulo_info (tolerantes a "tabla no existe") ───────

function esTablaAusente(msg: string): boolean {
  return /does not exist|schema cache/i.test(msg);
}

interface LecturaInfo {
  filas: ArticuloInfoFila[];
  disponible: boolean;
}

function baseInfo(opts: { count?: "exact"; head?: boolean }) {
  return supabaseServer
    .from("switch_articulo_info")
    .select(COLUMNAS_INFO, opts)
    .in("empresa_key", [...REFERENCIA_EMPRESA_KEYS]);
}

type FiltroInfo = { tipo: "codigos"; codigos: string[] } | { tipo: "prefijo"; patron: string } | { tipo: "descripcion"; patron: string };

function conFiltroInfo(sel: ReturnType<typeof baseInfo>, f: FiltroInfo): ReturnType<typeof baseInfo> {
  switch (f.tipo) {
    case "codigos":
      return sel.in("codigo", f.codigos);
    case "prefijo":
      return sel.like("codigo", f.patron);
    case "descripcion":
      return sel.ilike("descripcion", f.patron);
  }
}

/** Lee del catálogo con el mismo paginado defensivo. Si la tabla no existe
 *  (migración pendiente), devuelve vacío con `disponible: false` — el tab de
 *  ventas no se cae por el catálogo. */
async function leerInfo(etiqueta: string, f: FiltroInfo): Promise<LecturaInfo> {
  try {
    const { count, error } = await conFiltroInfo(baseInfo({ count: "exact", head: true }), f);
    if (error) throw new Error(error.message);
    if ((count ?? 0) > MAX_FILAS_BUSQUEDA) {
      // Demasiado amplio para el catálogo: se ignora esta fuente (la búsqueda
      // del diario ya tiene su propio rechazo con mensaje).
      return { filas: [], disponible: true };
    }
    const filas = await leerTodoPaginado<ArticuloInfoFila>(etiqueta, (pedirCount, desde, hasta) =>
      conFiltroInfo(baseInfo(pedirCount ? { count: "exact" } : {}), f)
        .order("codigo", { ascending: true })
        .range(desde, hasta),
    );
    return { filas, disponible: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (esTablaAusente(msg)) return { filas: [], disponible: false };
    throw err;
  }
}

/** Info por códigos exactos, en tandas de 100 (una URL con 50+ códigos × 6
 *  empresas queda lejos del tope de 1.000 filas por página). */
async function leerInfoPorCodigos(codigos: string[]): Promise<LecturaInfo> {
  const filas: ArticuloInfoFila[] = [];
  let disponible = true;
  for (let i = 0; i < codigos.length; i += 100) {
    const r = await leerInfo("articulo_info (codigos)", { tipo: "codigos", codigos: codigos.slice(i, i + 100) });
    if (!r.disponible) return { filas: [], disponible: false };
    filas.push(...r.filas);
    disponible = r.disponible;
  }
  return { filas, disponible };
}

/** Adjunta a cada referencia su fila de catálogo (por empresa+codigo, con
 *  fallback a codigo pelado) y agrega referencias SIN ventas para los códigos
 *  que solo existen en el catálogo — "nunca vendido" también es una respuesta. */
function fusionar(
  referencias: ReferenciaSerie[],
  info: LecturaInfo,
): ReferenciaSerie[] {
  if (!info.disponible) return referencias;
  const porClave = new Map(info.filas.map((f) => [`${f.empresa_key}·${f.codigo}`, f]));
  const porCodigo = new Map(info.filas.map((f) => [f.codigo, f]));
  const vistos = new Set<string>();
  const out = referencias.map((r) => {
    vistos.add(r.codigo);
    const fila = porClave.get(`${r.empresa}·${r.codigo}`) ?? porCodigo.get(r.codigo) ?? null;
    return { ...r, info: fila ? infoParaCliente(fila) : null };
  });
  for (const f of info.filas) {
    if (vistos.has(f.codigo)) continue;
    vistos.add(f.codigo);
    out.push({
      codigo: f.codigo,
      empresa: f.empresa_key,
      descripcion: f.descripcion ?? "",
      serie: [],
      info: infoParaCliente(f),
    });
  }
  return out.sort((a, b) => a.codigo.localeCompare(b.codigo));
}

function errorAmplia(): NextResponse {
  return NextResponse.json(
    { error: "La búsqueda es demasiado amplia — escribe más letras del código o la descripción." },
    { status: 400 },
  );
}

export async function GET(req: NextRequest) {
  const auth = requireRole(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  const sp = req.nextUrl.searchParams;
  const hoyMes = hoyPanama().slice(0, 7);

  try {
    // ── Vista múltiple: códigos exactos ──────────────────────────────────────
    const codigosRaw = sp.get("codigos");
    if (codigosRaw != null) {
      const codigos = [
        ...new Set(
          codigosRaw
            .split(",")
            .map((c) => normalizarBusqueda(c))
            .filter((c) => c.length >= 3 && esCodigo(c)),
        ),
      ].slice(0, MAX_CODIGOS_MULTI);
      if (!codigos.length) {
        return NextResponse.json({ error: "No hay códigos válidos en la lista." }, { status: 400 });
      }
      const filtro: Filtro = { tipo: "codigos", codigos };
      if ((await contarFilas(filtro)) > MAX_FILAS_BUSQUEDA) return errorAmplia();
      const info = await leerInfoPorCodigos(codigos);
      const referencias = fusionar(agruparReferencias(await leerFilas("referencia (multi)", filtro)), info);
      const hallados = new Set(referencias.map((r) => r.codigo));
      const body: ReferenciaApiResp = {
        modo: "referencias",
        hoyMes,
        referencias,
        noEncontrados: codigos.filter((c) => !hallados.has(c)),
        infoDisponible: info.disponible,
      };
      return NextResponse.json(body);
    }

    // ── Búsqueda única ───────────────────────────────────────────────────────
    const q = normalizarBusqueda(sp.get("q") ?? "");
    if (q.length < 3) {
      return NextResponse.json({ error: "Escribe al menos 3 caracteres." }, { status: 400 });
    }
    if (q.length > 60) {
      return NextResponse.json({ error: "Búsqueda demasiado larga." }, { status: 400 });
    }

    // 1) Código o modelo: prefijo sobre `codigo`, en las DOS fuentes. Exacto =
    //    el prefijo devuelve su propio código; modelo = todos los colores.
    if (esCodigo(q)) {
      const patron = `${escapeLike(q)}%`;
      const filtro: Filtro = { tipo: "prefijo", patron };
      const n = await contarFilas(filtro);
      if (n > MAX_FILAS_BUSQUEDA) return errorAmplia();
      const info = await leerInfo(`articulo_info (prefijo ${q})`, { tipo: "prefijo", patron });
      if (n > 0 || info.filas.length > 0) {
        const referencias = fusionar(
          n > 0 ? agruparReferencias(await leerFilas(`referencia (codigo ${q})`, filtro)) : [],
          info,
        );
        const body: ReferenciaApiResp = {
          modo: "referencias",
          hoyMes,
          referencias,
          infoDisponible: info.disponible,
        };
        return NextResponse.json(body);
      }
      // 0 filas por código en las dos fuentes → cae a descripción ("KAHLO"
      // también pasa esCodigo pero es una palabra, no un código).
    }

    // 2) Descripción: ilike en LAS DOS fuentes, dedupe por modelo.
    //    · diario: categoría+género ("Men-Small Leather")
    //    · catálogo: nombre comercial ("KAHLO PASSCASE") — el que Daniel conoce
    const patronDesc = `%${escapeLike(q)}%`;
    const filtroDesc: Filtro = { tipo: "descripcion", patron: patronDesc };
    if ((await contarFilas(filtroDesc)) > MAX_FILAS_BUSQUEDA) return errorAmplia();
    const [filas, infoDesc] = await Promise.all([
      leerFilas(`referencia (descripcion ${q})`, filtroDesc),
      leerInfo(`articulo_info (descripcion ${q})`, { tipo: "descripcion", patron: patronDesc }),
    ]);

    const porModelo = new Map<string, { descripcion: string; empresa: string; colores: Set<string> }>();
    for (const f of filas) {
      if (!f.codigo) continue;
      const modelo = modeloDe(f.codigo);
      const m = porModelo.get(modelo) ?? {
        descripcion: f.descripcion ?? "",
        empresa: f.empresa_key,
        colores: new Set<string>(),
      };
      m.colores.add(f.codigo);
      porModelo.set(modelo, m);
    }
    // El nombre comercial del catálogo PISA la categoría del diario: es el que
    // Daniel reconoce, y es el campo por el que probablemente buscó.
    for (const f of infoDesc.filas) {
      const modelo = modeloDe(f.codigo);
      const m = porModelo.get(modelo) ?? {
        descripcion: "",
        empresa: f.empresa_key,
        colores: new Set<string>(),
      };
      if (f.descripcion) m.descripcion = f.descripcion;
      m.colores.add(f.codigo);
      porModelo.set(modelo, m);
    }
    const coincidencias: CoincidenciaDescripcion[] = [...porModelo.entries()]
      .map(([modelo, m]) => ({
        modelo,
        descripcion: m.descripcion,
        empresa: m.empresa,
        colores: m.colores.size,
      }))
      .sort((a, b) => a.modelo.localeCompare(b.modelo))
      .slice(0, 100);

    const body: ReferenciaApiResp = {
      modo: "coincidencias",
      hoyMes,
      coincidencias,
      infoDisponible: infoDesc.disponible,
    };
    return NextResponse.json(body);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[api/ventas/referencia]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
