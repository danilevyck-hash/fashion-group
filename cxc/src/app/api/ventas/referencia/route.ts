// ─────────────────────────────────────────────────────────────────────────────
// GET /api/ventas/referencia — tab "Referencia" de /ventas. SOLO ADMIN.
//
// Dos modos:
//   ?q=…        una búsqueda: código exacto / modelo (prefijo) / descripción
//   ?codigos=…  vista múltiple: hasta 50 códigos exactos separados por coma
//
// Fuente: switch_articulo_diario, SOLO las 6 empresas de Fashion Group
// (REFERENCIA_EMPRESA_KEYS — Boston y Multifashion/ACS excluidas a propósito).
// Lectura SIEMPRE con leerTodoPaginado (db-max-rows=1000 corta en silencio) y
// con un pre-conteo que rechaza búsquedas demasiado amplias en vez de arrastrar
// 200 páginas — Supabase ya se cayó por lecturas que lo saturaron.
//
// El servidor devuelve SERIES MENSUALES NETAS (NC ya restadas — el signo vive
// en signoTipo(), un solo lugar) y el mes actual en hora PANAMÁ (`hoyMes`): el
// cliente calcula KPIs con el MISMO módulo puro, nunca con Date en UTC.
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
  type CoincidenciaDescripcion,
  type ReferenciaApiResp,
} from "@/lib/ventas/referencia";

export const dynamic = "force-dynamic";

const COLUMNAS = "empresa_key, fecha, codigo, descripcion, tipo, cantidad_total, venta_total";

/** El filtro de una búsqueda, como dato (no como closure) para poder aplicarlo
 *  igual al pre-conteo y a cada página de la lectura. */
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
      const referencias = agruparReferencias(await leerFilas("referencia (multi)", filtro));
      const hallados = new Set(referencias.map((r) => r.codigo));
      const body: ReferenciaApiResp = {
        modo: "referencias",
        hoyMes,
        referencias,
        noEncontrados: codigos.filter((c) => !hallados.has(c)),
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

    // 1) Código o modelo: prefijo sobre `codigo`. Exacto = el prefijo devuelve
    //    su propio código; modelo = devuelve todos los colores.
    if (esCodigo(q)) {
      const filtro: Filtro = { tipo: "prefijo", patron: `${escapeLike(q)}%` };
      const n = await contarFilas(filtro);
      if (n > MAX_FILAS_BUSQUEDA) return errorAmplia();
      if (n > 0) {
        const referencias = agruparReferencias(await leerFilas(`referencia (codigo ${q})`, filtro));
        const body: ReferenciaApiResp = { modo: "referencias", hoyMes, referencias };
        return NextResponse.json(body);
      }
      // 0 filas por código → cae a descripción ("KAHLO" también pasa esCodigo
      // pero es una palabra, no un código).
    }

    // 2) Descripción: ilike, dedupe por modelo → lista de coincidencias.
    const filtroDesc: Filtro = { tipo: "descripcion", patron: `%${escapeLike(q)}%` };
    if ((await contarFilas(filtroDesc)) > MAX_FILAS_BUSQUEDA) return errorAmplia();
    const filas = await leerFilas(`referencia (descripcion ${q})`, filtroDesc);

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
    const coincidencias: CoincidenciaDescripcion[] = [...porModelo.entries()]
      .map(([modelo, m]) => ({
        modelo,
        descripcion: m.descripcion,
        empresa: m.empresa,
        colores: m.colores.size,
      }))
      .sort((a, b) => a.modelo.localeCompare(b.modelo))
      .slice(0, 100);

    const body: ReferenciaApiResp = { modo: "coincidencias", hoyMes, coincidencias };
    return NextResponse.json(body);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[api/ventas/referencia]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
