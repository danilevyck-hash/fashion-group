// ============================================================================
// Marketing — el lado que TOCA LA BASE de «las fotos siguen al período».
// La regla pura vive en `fotos-periodo.ts`; acá solo se lee y se limpia.
//
// 🔴 TODO FALLA ABIERTO. Ninguna de estas funciones puede tumbar la subida de
// una foto: sin la columna `periodo_id`, sin las tablas de período o con un
// hipo de red, se devuelve `null` y la foto se guarda sin sello — que es
// exactamente lo de hoy.
// ============================================================================

import { supabaseServer } from "@/lib/supabase-server";
import { esColumnaAusente } from "./columnas-opcionales";
import { esPathStorage } from "./storage";
import {
  marcasAbiertasOrdenadas,
  periodosAbiertosOrdenados,
  type GastoParaSellarFoto,
  type MarcaAbiertaDeLaTienda,
  type PeriodoLeidoParaFoto,
} from "./fotos-periodo";

const BUCKET = "marketing";

type Fila = Record<string, unknown>;

const txt = (v: unknown) => String(v ?? "").trim();

function avisar(donde: string, detalle: unknown) {
  const msg = detalle instanceof Error ? detalle.message : String(detalle);
  console.warn(`[marketing/fotos-periodo] ${donde}: ${msg}`);
}

/**
 * 🔴 LAS MARCAS CON PERÍODO ABIERTO EN ESTA TIENDA — lo que se elige con un
 * toque cuando hay más de una.
 *
 * Son tres lecturas: los gastos vivos de la tienda, sus sellos y los períodos
 * de esos sellos. Corre UNA vez al abrir la ficha y UNA por foto subida.
 *
 * Falla ABIERTA: cualquier tropiezo devuelve la lista VACÍA, y con lista vacía
 * la foto se guarda sin sello — exactamente lo de hoy.
 */
export async function marcasAbiertasDeLaTienda(
  codigo: string,
): Promise<MarcaAbiertaDeLaTienda[]> {
  try {
    const tienda = txt(codigo).toUpperCase();
    if (!tienda) return [];

    const [facRes, entRes] = await Promise.all([
      supabaseServer
        .from("mk_facturas")
        .select("id, fecha_factura, created_at")
        .eq("tienda_codigo", tienda)
        .is("anulado_en", null),
      supabaseServer
        .from("mk_entregas_muebles")
        .select("id, created_at")
        .eq("tienda_codigo", tienda),
    ]);
    if (facRes.error && !esColumnaAusente(facRes.error)) {
      avisar("facturas", facRes.error.message);
      return [];
    }
    if (entRes.error && !esColumnaAusente(entRes.error)) {
      avisar("entregas", entRes.error.message);
      return [];
    }

    const cuandoDe = (f: Fila) => txt(f.created_at) || txt(f.fecha_factura);
    const gastos = [
      ...((facRes.data ?? []) as Fila[]).map((f) => ({ id: txt(f.id), cuando: cuandoDe(f) })),
      ...((entRes.data ?? []) as Fila[]).map((e) => ({ id: txt(e.id), cuando: cuandoDe(e) })),
    ].filter((g) => g.id.length > 0);
    if (gastos.length === 0) return [];

    const selRes = await supabaseServer
      .from("mk_periodo_documentos")
      .select("documento_id, periodo_id")
      .in("documento_id", gastos.map((g) => g.id));
    if (selRes.error) {
      avisar("sellos", selRes.error.message);
      return [];
    }
    const sellos = (selRes.data ?? []) as Fila[];
    const idsPeriodo = [...new Set(sellos.map((s) => txt(s.periodo_id)).filter(Boolean))];
    if (idsPeriodo.length === 0) return [];

    // 🔴 SOLO LOS ABIERTOS. A un período cerrado no entra ni sale nada, así
    // que ninguno cerrado llega siquiera a ser una opción.
    const perRes = await supabaseServer
      .from("mk_periodos")
      .select("id, proveedor_key, estado")
      .in("id", idsPeriodo)
      .eq("estado", "abierto");
    if (perRes.error) {
      avisar("periodos", perRes.error.message);
      return [];
    }
    const marcaDe = new Map<string, string>();
    for (const p of (perRes.data ?? []) as Fila[]) marcaDe.set(txt(p.id), txt(p.proveedor_key));
    if (marcaDe.size === 0) return [];

    const porDoc = new Map<string, string[]>();
    for (const s of sellos) {
      const pid = txt(s.periodo_id);
      if (!marcaDe.has(pid)) continue;
      const doc = txt(s.documento_id);
      porDoc.set(doc, [...(porDoc.get(doc) ?? []), pid]);
    }

    const entrada: GastoParaSellarFoto[] = gastos.map((g) => ({
      documentoId: g.id,
      cuando: g.cuando,
      periodosAbiertos: porDoc.get(g.id) ?? [],
    }));
    return marcasAbiertasOrdenadas(
      periodosAbiertosOrdenados(entrada).map((periodoId) => ({
        periodoId,
        proveedorKey: marcaDe.get(periodoId) ?? "",
      })),
    );
  } catch (err) {
    avisar("marcasAbiertasDeLaTienda", err);
    return [];
  }
}

/**
 * 🔴 EL ESTADO DE UN PERÍODO, PARA DECIRLO CON SU NOMBRE. Solo se pregunta
 * cuando lo que llegó no está entre las marcas abiertas: sirve para separar
 * «ese período ya está cerrado» de «esa marca no es de esta tienda».
 *
 * `null` = no se sabe (no existe, o la lectura falló): el aviso general.
 */
export async function estadoDelPeriodo(periodoId: string): Promise<string | null> {
  try {
    const id = txt(periodoId);
    if (!id) return null;
    const { data, error } = await supabaseServer
      .from("mk_periodos")
      .select("id, estado")
      .eq("id", id)
      .limit(1);
    if (error) {
      avisar("estadoDelPeriodo", error.message);
      return null;
    }
    const fila = ((data ?? []) as Fila[])[0];
    return fila ? txt(fila.estado) || null : null;
  } catch (err) {
    avisar("estadoDelPeriodo", err);
    return null;
  }
}

/**
 * Los períodos de un puñado de fotos, listos para `periodoDeLaFoto`. Sin la
 * columna o sin la tabla devuelve un mapa vacío: todas las fotos salen como
 * abiertas, igual que hoy.
 */
export async function leerPeriodosDeFotos(
  ids: ReadonlyArray<string>,
): Promise<Map<string, PeriodoLeidoParaFoto>> {
  const out = new Map<string, PeriodoLeidoParaFoto>();
  const limpios = [...new Set(ids.map(txt).filter(Boolean))];
  if (limpios.length === 0) return out;
  try {
    const { data, error } = await supabaseServer
      .from("mk_periodos")
      .select("id, nombre, nombre_al_cerrar, proveedor_key, estado, cerrado_en")
      .in("id", limpios);
    if (error) {
      if (!esColumnaAusente(error)) avisar("leerPeriodosDeFotos", error.message);
      return out;
    }
    for (const p of (data ?? []) as Fila[]) {
      out.set(txt(p.id), {
        id: txt(p.id),
        nombre: txt(p.nombre) || null,
        nombreAlCerrar: txt(p.nombre_al_cerrar) || null,
        proveedorKey: txt(p.proveedor_key),
        estado: txt(p.estado) || null,
        cerradoEn: p.cerrado_en ? String(p.cerrado_en) : null,
      });
    }
  } catch (err) {
    avisar("leerPeriodosDeFotos", err);
  }
  return out;
}

/**
 * 🔴 SI LA FILA NO SE PUDO ESCRIBIR, EL ARCHIVO NO SE QUEDA. El archivo se
 * sube ANTES de anotarlo: cada intento fallido dejaba un huérfano que ninguna
 * pantalla ve y nadie borra (medido: 4 en `tienda/D-118/` el 24-sep-2026).
 *
 * Best-effort y nunca lanza: lo importante es el aviso que ve quien sube.
 */
export async function borrarDelCajon(url: string): Promise<void> {
  try {
    const path = txt(url);
    if (!path || !esPathStorage(path)) return;
    const { error } = await supabaseServer.storage.from(BUCKET).remove([path]);
    if (error) avisar("borrarDelCajon", error.message);
  } catch (err) {
    avisar("borrarDelCajon", err);
  }
}
