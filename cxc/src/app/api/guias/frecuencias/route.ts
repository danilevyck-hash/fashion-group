import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/require-auth";
import { supabaseServer } from "@/lib/supabase-server";
import { leerClientesDelGrupo } from "@/lib/clientes/directorio-cache";
import { leerTodoPaginado } from "@/lib/supabase-paginado";
import { ultimaDireccionPorCliente } from "@/lib/guias/direccion-sugerida";
import { destinosHistoricos } from "@/lib/guias/destinos-clientes";
import { estaRetiradoDeGuias } from "@/lib/guias/american-classics";
import { leerDefinidosOVacio } from "@/lib/guias/destinos-config-server";
import { GUIAS_ATAJOS_NUEVOS } from "@/lib/guias/atajos-facturas";
import {
  ALL_EMPRESA_KEYS,
  EMPRESA_KEY_TO_NAME,
  mapEmpresaName,
} from "@/lib/empresa-mapping";

export const dynamic = "force-dynamic";

const GUIAS_ROLES = ["admin", "secretaria", "bodega", "vendedor"];

// Normalizador canónico (idéntico a clientes_master.nombre_normalized):
// upper + quitar [.,] + colapsar espacios.
function norm(s: string): string {
  return (s || "").toUpperCase().replace(/[.,]/g, "").replace(/\s+/g, " ").trim();
}

// Mapea un string sucio de empresa (guia_items.empresa) a una de las 8 keys
// canónicas, SOLO para contar frecuencia. Sin match → null (no cuenta).
function empresaKeyFromDirty(s: string): string | null {
  const n = norm(s);
  if (!n) return null;
  for (const key of ALL_EMPRESA_KEYS) {
    const cn = norm(EMPRESA_KEY_TO_NAME[key]);
    if (n === cn || n.includes(cn) || cn.includes(n)) return key;
  }
  return null;
}

// GET /api/guias/frecuencias
// Devuelve, para los selectores del form de guía:
//   - clientes: top por frecuencia de uso en guías (solo ítems con cliente_codigo),
//     como [{ codigo, nombre }] ordenado desc.
//   - empresas: las 8 empresas canónicas (nombres display) ordenadas por
//     frecuencia de uso en guías (mapeando strings sucios a las 8 para contar).
//   - direcciones: código de cliente → la ÚLTIMA dirección a la que se le
//     despachó, para que aparezca PRIMERA en la lista de sugerencias del campo
//     "Dirección". Ver `@/lib/guias/direccion-sugerida`.
//
// ⚠️ NO se devuelve nada equivalente para la EMPRESA, y es a propósito: medido
// contra producción, la empresa anterior de un cliente acierta el 34% de las
// veces (la dirección, el 80%). La empresa es POR ENVÍO.
export async function GET(req: NextRequest) {
  const session = getSession(req);
  if (!session || !GUIAS_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }

  try {
    // ⚠️ PAGINADO OBLIGATORIO. Esto leía `guia_items` con un `select` pelado:
    // hoy son 462 filas, pero `db-max-rows` = 1000 y PostgREST corta EN
    // SILENCIO. A partir de la línea 1.001 los "más usados" habrían empezado a
    // envejecer sin error ni señal — es el bug que este repo ya pagó una vez.
    const rows = await leerTodoPaginado<{
      guia_id: string;
      cliente_codigo: string | null;
      empresa: string | null;
      direccion: string | null;
      deleted: boolean | null;
    }>("guia_items (frecuencias)", (pedirCount, from, to) =>
      supabaseServer
        .from("guia_items")
        .select(
          "guia_id, cliente_codigo, empresa, direccion, deleted",
          pedirCount ? { count: "exact" } : {}
        )
        .order("id", { ascending: true })
        .range(from, to)
    );

    // La fecha de un envío vive en su GUÍA (`guia_items` no la tiene), y sin
    // fecha no hay "última dirección". Son ~200 filas, una sola página.
    const guias = await leerTodoPaginado<{
      id: string;
      fecha: string | null;
      numero: number | null;
      deleted: boolean | null;
    }>("guia_transporte (frecuencias)", (pedirCount, from, to) =>
      supabaseServer
        .from("guia_transporte")
        .select("id, fecha, numero, deleted", pedirCount ? { count: "exact" } : {})
        .order("id", { ascending: true })
        .range(from, to)
    );

    // ── Clientes: contar por código ──
    const cntCod = new Map<string, number>();
    for (const r of rows) {
      const c = (r.cliente_codigo ?? "").trim();
      if (c) cntCod.set(c, (cntCod.get(c) ?? 0) + 1);
    }
    const topCodigos = [...cntCod.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([c]) => c);

    // Resolver código → nombre por LA PUERTA ÚNICA de clientes, la misma que
    // usa el selector de Cheques. Antes era una consulta propia a
    // `clientes_master` sin filtro de mundo: un código de Boston que llegara a
    // `guia_items.cliente_codigo` se habría ofrecido como si fuera del grupo.
    let clientes: Array<{ codigo: string; nombre: string }> = [];
    if (topCodigos.length > 0) {
      const nameByCod = new Map<string, string>();
      for (const c of await leerClientesDelGrupo()) {
        if (c.codigo && c.nombre) nameByCod.set(c.codigo, c.nombre);
      }
      // Conserva el orden por frecuencia; descarta códigos sin nombre vivo.
      //
      // 🔴 Y descarta los RETIRADOS de guías (5-sep-2026): `D-201 American
      // Classics` es el duplicado de `D-108 Multi Fashion Holding` —no existe
      // en Switch en ninguna de las 6 y no tiene ni una factura— así que deja
      // de ofrecerse. Daniel: *«Multifashion y american classic es el mismo»*.
      //
      // ⚠️ El NOMBRE no se toca acá: el alias de D-108 lo aplica el selector al
      // dibujar y al elegir (`nombreParaMostrar`), y vive en UN solo lugar.
      clientes = topCodigos
        .filter((c) => nameByCod.has(c) && !estaRetiradoDeGuias(c))
        .map((c) => ({ codigo: c, nombre: nameByCod.get(c) as string }));
    }

    // ── Empresas: contar por key canónica, ordenar las 8 desc ──
    const cntEmp = new Map<string, number>();
    for (const r of rows) {
      const key = empresaKeyFromDirty(r.empresa ?? "");
      if (key) cntEmp.set(key, (cntEmp.get(key) ?? 0) + 1);
    }
    const empresas = ALL_EMPRESA_KEYS.map((key, idx) => ({
      key,
      idx,
      count: cntEmp.get(key) ?? 0,
    }))
      .sort((a, b) => b.count - a.count || a.idx - b.idx)
      .map((e) => mapEmpresaName(e.key));

    // ── Dirección: código de cliente → la última a la que se le despachó ──
    const direcciones = ultimaDireccionPorCliente(rows, guias);

    // ── Destinos por cliente: los botones bajo el campo Dirección ──
    // (4-sep-2026) Variantes agrupadas por clave exacta, grafía más usada,
    // máx. 6 por cliente. Cuelga del MISMO interruptor que el panel de
    // facturas: apagado, la respuesta vuelve a ser la de hoy y el formulario
    // no dibuja nada nuevo. Solo renglones vivos de guías vivas (los dos
    // `deleted` son independientes) — lo filtra el módulo.
    const destinos = GUIAS_ATAJOS_NUEVOS ? destinosHistoricos(rows, guias) : {};

    // ── Destinos DEFINIDOS: la tabla `guias_destino_cliente` ──
    // (4-sep-2026) Primera fuente del orden de precedencia (tabla → constante
    // → histórico, ver `destinosDefinidosPara`). FALLA ABIERTO: con la
    // migración 20260918120000 sin correr devuelve {} y los botones caen a la
    // constante — la pantalla de guías no se rompe.
    const definidos = GUIAS_ATAJOS_NUEVOS ? await leerDefinidosOVacio() : {};

    return NextResponse.json({ clientes, empresas, direcciones, destinos, definidos });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error interno";
    console.error("[api/guias/frecuencias] GET:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
