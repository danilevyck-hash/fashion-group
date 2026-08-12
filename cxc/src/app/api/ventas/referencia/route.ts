// ─────────────────────────────────────────────────────────────────────────────
// GET /api/ventas/referencia — tab "Referencia" de /ventas y página /referencia.
//
// UN SOLO BUSCADOR. Daniel: *"porq columna de varias pegar por lista? enves de
// ponerlo en el mismo buscador que una?"*. `?q=` acepta lo mismo para uno que
// para veinte: si lo pegado parece código(s) se buscan todos, y si no parece
// código se busca por descripción. La pestaña "Varias · pegar lista" se fue.
//
// 🔴 UNA SOLA RESOLUCIÓN PARA 1 Y PARA 50 CÓDIGOS: cada código pegado busca por
// PREFIJO (LIKE 'pegado%'), venga solo o en lista. El modelo trae todos sus
// colores (`4D5029G` → 4D5029G002…) y un código con color pegado tal cual se
// encuentra igual (es prefijo de sí mismo).
//
// 🩸 EL BUG QUE ESTO ARREGLA (12-ago-2026): con VARIOS códigos la búsqueda era
// `.in()` EXACTO mientras que con UNO era prefijo. Daniel pegó su lista real de
// 47 modelos (sin el color al final, porque su Excel lista modelos) y el modo
// pedido contestó "No encontré los códigos … ni en ventas ni en compras" para
// TODOS — mientras el mismo `4D5029G` buscado solo devolvía su tarjeta
// perfecta. Dos semánticas para la misma caja era el error; ahora es UNA.
//
// 🔴 ROLES (12-ago-2026, Daniel: *"habilita referencia para los vendedores y
// bodega"*): admin, vendedor y bodega. Para vendedor/bodega la respuesta lleva
// `margenVisible: false` — Daniel: *"quita margen, lo demas dejalo"* — y la
// vista no calcula ni muestra el margen. Todo lo demás (compras, ventas,
// stock, costos, precios) lo ven igual.
//
// TRES fuentes:
//   · switch_ingresos_mercancia — LAS COMPRAS REALES (34.792 líneas desde
//     oct-2022). Es la fuente nueva y la razón de ser del módulo: antes las
//     "tandas" se ADIVINABAN desde las ventas y no correspondían a ninguna
//     compra que hubiera ocurrido.
//   · switch_articulo_diario — las ventas (NC restadas en signoTipo(), un solo
//     lugar).
//   · switch_articulo_info — existencia y precio de etiqueta.
//
// Lectura SIEMPRE con leerTodoPaginado (db-max-rows=1000 corta en SILENCIO) y
// pre-conteo que rechaza búsquedas demasiado amplias — Supabase ya se cayó por
// lecturas así.
//
// ⚠️ DEGRADA LIMPIO. `switch_ingresos_mercancia` la está cargando otro agente y
// le sigue agregando empresas (joystep, boston, multifashion). Si la tabla o
// alguna columna todavía no existe, el tab responde igual con
// `comprasDisponibles: false` en vez de mostrar TODO como "sin compra
// registrada", que sería una mentira con forma de dato.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { supabaseServer } from "@/lib/supabase-server";
import { leerTodoPaginado } from "@/lib/supabase-paginado";
import { hoyPanama } from "@/lib/fecha-panama";
import {
  REFERENCIA_EMPRESA_KEYS,
  MAX_FILAS_BUSQUEDA,
  normalizarBusqueda,
  escapeLike,
  modeloDe,
  parsearListaCodigos,
  pedidosNoEncontrados,
} from "@/lib/ventas/referencia";
import {
  armarArticulo,
  type ArticuloCompras,
  type ComprasApiResp,
  type FilaIngreso,
} from "@/lib/ventas/compras";

export const dynamic = "force-dynamic";

const COLS_VENTAS = "empresa_key, fecha, codigo, descripcion, tipo, cantidad_total, venta_total";
const COLS_INFO = "empresa_key, codigo, descripcion, existencia, precio_etiqueta, synced_at";
/** Las 2 últimas las agregó el sync de ingresos y pueden no existir todavía. */
const COLS_INGRESOS_COMPLETO =
  "empresa_key, fecha, n_interno, linea, proveedor, codigo_articulo, articulo, precio, cantidad, costo_fob, costo_cif, costo_sin_desglosar, fob_confiable";
const COLS_INGRESOS_BASE =
  "empresa_key, fecha, n_interno, linea, proveedor, codigo_articulo, articulo, precio, cantidad, costo_fob, costo_cif";

interface FilaVenta {
  empresa_key: string;
  fecha: string;
  codigo: string | null;
  descripcion: string | null;
  tipo: string;
  cantidad_total: number | string;
  venta_total: number | string;
}

interface FilaInfo {
  empresa_key: string;
  codigo: string;
  descripcion: string | null;
  existencia: number | string | null;
  precio_etiqueta: number | string | null;
  synced_at: string;
}

type Filtro =
  /** 1..50 códigos pegados; CADA UNO busca por PREFIJO (modelo → colores). */
  | { tipo: "codigos"; codigos: string[] }
  | { tipo: "descripcion"; patron: string };

function esTablaOColumnaAusente(msg: string): boolean {
  return /does not exist|schema cache|PGRST20[0-9]|42703|42P01/i.test(msg);
}

// ─── Ventas ──────────────────────────────────────────────────────────────────

function baseVentas(opts: { count?: "exact"; head?: boolean }) {
  return supabaseServer
    .from("switch_articulo_diario")
    .select(COLS_VENTAS, opts)
    .in("empresa_key", [...REFERENCIA_EMPRESA_KEYS]);
}

function conFiltro<T extends { in: unknown }>(sel: T, f: Filtro, campo: string): T {
  const s = sel as unknown as {
    like: (c: string, v: string) => T;
    ilike: (c: string, v: string) => T;
    or: (filtros: string) => T;
  };
  switch (f.tipo) {
    case "codigos":
      // 🔴 LA RESOLUCIÓN ÚNICA: cada código pegado es un PREFIJO. Con uno solo
      // es el mismo LIKE de siempre; con varios, el OR de sus prefijos.
      //
      // El comodín en la sintaxis de `.or()` de PostgREST es `*` (se traduce a
      // `%`) — verificado contra producción el 12-ago-2026. Los valores van sin
      // escapar porque `esCodigo()` —la puerta de `parsearListaCodigos`, lo
      // ÚNICO que llega acá— solo deja pasar [A-Z0-9-/.#]: ni comas, ni
      // paréntesis, ni comillas, ni comodines.
      if (f.codigos.length === 1) return s.like(campo, `${escapeLike(f.codigos[0])}%`);
      return s.or(f.codigos.map((c) => `${campo}.like.${c}*`).join(","));
    case "descripcion":
      return s.ilike("descripcion", f.patron);
  }
}

async function contarVentas(f: Filtro): Promise<number> {
  const { count, error } = await conFiltro(baseVentas({ count: "exact", head: true }), f, "codigo");
  if (error) throw new Error(`conteo: ${error.message}`);
  return count ?? 0;
}

async function leerVentas(etiqueta: string, f: Filtro): Promise<FilaVenta[]> {
  return leerTodoPaginado<FilaVenta>(etiqueta, (pedirCount, desde, hasta) =>
    conFiltro(baseVentas(pedirCount ? { count: "exact" } : {}), f, "codigo")
      .order("id", { ascending: true })
      .range(desde, hasta),
  );
}

// ─── Compras (la fuente nueva) ───────────────────────────────────────────────

async function leerIngresos(f: Filtro): Promise<{ filas: FilaIngreso[]; disponible: boolean }> {
  for (const cols of [COLS_INGRESOS_COMPLETO, COLS_INGRESOS_BASE]) {
    try {
      const filas = await leerTodoPaginado<FilaIngreso>("ingresos_mercancia", (pedirCount, desde, hasta) =>
        conFiltro(
          supabaseServer
            .from("switch_ingresos_mercancia")
            .select(cols, pedirCount ? { count: "exact" } : {})
            .in("empresa_key", [...REFERENCIA_EMPRESA_KEYS]),
          f,
          "codigo_articulo",
        )
          // Orden TOTAL: paginar con filas empatadas puede repetir o saltear.
          .order("fecha", { ascending: true })
          .order("empresa_key", { ascending: true })
          .order("n_interno", { ascending: true })
          .order("linea", { ascending: true })
          .range(desde, hasta),
      );
      return { filas, disponible: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!esTablaOColumnaAusente(msg)) throw err;
      // columna nueva ausente → reintenta con el juego base; tabla ausente → sale
      if (cols === COLS_INGRESOS_BASE) return { filas: [], disponible: false };
    }
  }
  return { filas: [], disponible: false };
}

// ─── Catálogo ────────────────────────────────────────────────────────────────

async function leerInfo(f: Filtro): Promise<{ filas: FilaInfo[]; disponible: boolean }> {
  try {
    const filas = await leerTodoPaginado<FilaInfo>("articulo_info", (pedirCount, desde, hasta) =>
      conFiltro(
        supabaseServer
          .from("switch_articulo_info")
          .select(COLS_INFO, pedirCount ? { count: "exact" } : {})
          .in("empresa_key", [...REFERENCIA_EMPRESA_KEYS]),
        f,
        "codigo",
      )
        .order("codigo", { ascending: true })
        .order("empresa_key", { ascending: true })
        .range(desde, hasta),
    );
    return { filas, disponible: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (esTablaOColumnaAusente(msg)) return { filas: [], disponible: false };
    throw err;
  }
}

// ─── Fusión ──────────────────────────────────────────────────────────────────

/**
 * Arma un artículo por cada `(empresa, código)` que aparezca en CUALQUIERA de
 * las tres fuentes.
 *
 * Normalmente una referencia vive en UNA sola empresa; cuando por dato sucio
 * aparece en dos, se muestran las dos por separado en vez de mezclarlas — una
 * compra de una empresa no puede explicar la venta de otra.
 */
function fusionar(
  ventas: FilaVenta[],
  ingresos: FilaIngreso[],
  info: FilaInfo[],
  hoy: string,
): ArticuloCompras[] {
  const claves = new Set<string>();
  const k = (e: string, c: string) => `${e} ${c}`;
  for (const v of ventas) if (v.codigo) claves.add(k(v.empresa_key, v.codigo));
  for (const i of ingresos) claves.add(k(i.empresa_key, i.codigo_articulo));
  for (const i of info) claves.add(k(i.empresa_key, i.codigo));

  const out: ArticuloCompras[] = [];
  for (const clave of claves) {
    const [empresa, codigo] = clave.split(" ");
    const vs = ventas.filter((v) => v.empresa_key === empresa && v.codigo === codigo);
    const gs = ingresos.filter((g) => g.empresa_key === empresa && g.codigo_articulo === codigo);
    const inf = info.find((i) => i.empresa_key === empresa && i.codigo === codigo) ?? null;
    const num = (x: number | string | null | undefined) => {
      if (x == null || x === "") return null;
      const n = Number(x);
      return Number.isFinite(n) ? n : null;
    };
    out.push(
      armarArticulo(
        {
          empresa,
          codigo,
          descripcion: inf?.descripcion || vs[0]?.descripcion || gs[0]?.articulo || "",
          ingresos: gs,
          ventas: vs,
          existencia: num(inf?.existencia),
          precioEtiqueta: num(inf?.precio_etiqueta),
          catalogoSyncedAt: inf?.synced_at ?? null,
        },
        hoy,
      ),
    );
  }
  return out.sort((a, b) => a.codigo.localeCompare(b.codigo) || a.empresa.localeCompare(b.empresa));
}

function errorAmplia(): NextResponse {
  return NextResponse.json(
    { error: "La búsqueda es demasiado amplia — escribe más letras del código o la descripción." },
    { status: 400 },
  );
}

// ─── Handler ─────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  // Daniel: *"habilita referencia para los vendedores y bodega"*.
  const auth = requireRole(req, ["admin", "vendedor", "bodega"]);
  if (auth instanceof NextResponse) return auth;
  // Daniel: *"quita margen, lo demas dejalo"* — solo admin ve el margen. La
  // vista no lo calcula cuando esto viene en false (y el Excel tampoco).
  const margenVisible = auth.role === "admin";

  const hoy = hoyPanama().slice(0, 10);
  const hoyMes = hoy.slice(0, 7);
  const crudo = req.nextUrl.searchParams.get("q") ?? "";

  try {
    if (crudo.trim().length < 3) {
      return NextResponse.json({ error: "Escribe al menos 3 caracteres." }, { status: 400 });
    }

    // ── UN SOLO BUSCADOR, UNA SOLA RESOLUCIÓN ──────────────────────────────
    // Lo pegado se parte igual siempre, y CADA código busca por PREFIJO —
    // venga solo o en lista de 50. El prefijo es lo que trae todos los colores
    // del modelo (`40HM265` → 40HM265001, 40HM265032, …). Daniel ve por color.
    const { codigos, descartados } = parsearListaCodigos(crudo);

    let filtro: Filtro;
    if (codigos.length >= 1) {
      filtro = { tipo: "codigos", codigos };
    } else {
      const q = normalizarBusqueda(crudo);
      if (q.length > 60) return NextResponse.json({ error: "Búsqueda demasiado larga." }, { status: 400 });
      filtro = { tipo: "descripcion", patron: `%${escapeLike(q)}%` };
    }

    if (filtro.tipo !== "descripcion") {
      if ((await contarVentas(filtro)) > MAX_FILAS_BUSQUEDA) return errorAmplia();

      const [ventas, ingresos, info] = await Promise.all([
        leerVentas("referencia", filtro),
        leerIngresos(filtro),
        leerInfo(filtro),
      ]);

      const articulos = fusionar(ventas, ingresos.filas, info.filas, hoy);

      // Un código pedido que no trajo NI UN artículo por prefijo, en NINGUNA
      // fuente: ese sí no existe. Los que trajeron colores no se reportan —
      // el criterio es el MISMO para 1 código que para 50.
      const noEncontrados = pedidosNoEncontrados(
        codigos,
        articulos.map((a) => a.codigo),
      );

      const body: ComprasApiResp = {
        hoy,
        hoyMes,
        articulos,
        noEncontrados,
        comprasDisponibles: ingresos.disponible,
        infoDisponible: info.disponible,
        margenVisible,
      };
      if (articulos.length > 0 || noEncontrados.length > 0) {
        return NextResponse.json(descartados > 0 ? { ...body, descartados } : body);
      }
      // Nada por código: puede que fuera una palabra ("KAHLO"). Cae a descripción.
      filtro = { tipo: "descripcion", patron: `%${escapeLike(normalizarBusqueda(crudo))}%` };
    }

    // ── Descripción: se ofrecen los modelos que coinciden ───────────────────
    if ((await contarVentas(filtro)) > MAX_FILAS_BUSQUEDA) return errorAmplia();
    const [ventas, info] = await Promise.all([leerVentas("referencia (desc)", filtro), leerInfo(filtro)]);

    const porModelo = new Map<string, { descripcion: string; empresa: string; colores: Set<string> }>();
    const sumar = (codigo: string, empresa: string, desc: string | null, pisa: boolean) => {
      const modelo = modeloDe(codigo);
      const m = porModelo.get(modelo) ?? { descripcion: "", empresa, colores: new Set<string>() };
      if (desc && (pisa || !m.descripcion)) m.descripcion = desc;
      m.colores.add(codigo);
      porModelo.set(modelo, m);
    };
    for (const v of ventas) if (v.codigo) sumar(v.codigo, v.empresa_key, v.descripcion, false);
    // El nombre comercial del catálogo PISA la categoría del diario: es el que
    // Daniel reconoce y probablemente por el que buscó.
    for (const i of info.filas) sumar(i.codigo, i.empresa_key, i.descripcion, true);

    const body: ComprasApiResp = {
      hoy,
      hoyMes,
      articulos: [],
      noEncontrados: [],
      coincidencias: [...porModelo.entries()]
        .map(([modelo, m]) => ({
          modelo,
          descripcion: m.descripcion,
          empresa: m.empresa,
          colores: m.colores.size,
        }))
        .sort((a, b) => a.modelo.localeCompare(b.modelo))
        .slice(0, 100),
      comprasDisponibles: true,
      infoDisponible: info.disponible,
      margenVisible,
    };
    return NextResponse.json(body);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[api/ventas/referencia]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
