// ============================================================================
// LAS FOTOS DE UNA TIENDA (22-sep-2026).
//
// 🔴 Las fotos se pegan a la TIENDA, ya no al proyecto: la columna es
// `mk_adjuntos.tienda_codigo` (la migración `20261216120000` la copió del
// proyecto — medido: 60 de 60 fotos quedaron con su tienda).
//
// 🔴 Y SIGUEN AL PERÍODO (24-sep-2026). Cada foto nace sellada al período
// ABIERTO de la tienda (`mk_adjuntos.periodo_id`, migración `20261219130000`)
// y viaja con su `periodo` puesto SOLO si ese sello ya cerró: la cuadrícula de
// la ficha filtra con el mismo chip que la lista de gastos (`fotos-periodo.ts`).
//
// 🔴 Falla ABIERTA: sin la columna contesta 200 con lista vacía y lo dice en
// `sinMigracion`, igual que el resto del rediseño; sin la regla nueva, el POST
// avisa en español y BORRA del cajón el archivo que acababa de subir.
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { ROLES_MARKETING } from "@/lib/marketing/roles";
import { supabaseServer } from "@/lib/supabase-server";
import { firmarAdjuntos } from "@/lib/marketing/storage";
import { esColumnaAusente, sinColumnasDelRediseno } from "@/lib/marketing/columnas-opcionales";
import { esCodigoGeneral, VISTA_TIENDA } from "@/lib/marketing/vista-tienda";
import { TIENDA_GENERAL } from "@/lib/marketing/gasto";
import {
  AVISO_FALTA_LA_MIGRACION,
  AVISO_PERIODO_CERRADO,
  MARKETING_FOTOS_CON_PERIODO,
  destinoDeFotoNueva,
  esLaReglaDeDestino,
  periodoDeLaFoto,
} from "@/lib/marketing/fotos-periodo";
import {
  borrarDelCajon,
  estadoDelPeriodo,
  leerPeriodosDeFotos,
  marcasAbiertasDeLaTienda,
} from "@/lib/marketing/fotos-periodo-server";
import type { MkAdjunto } from "@/lib/marketing/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";
export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  { params }: { params: { codigo: string } },
) {
  const auth = requireRole(req, [...ROLES_MARKETING]);
  if (auth instanceof NextResponse) return auth;
  if (!VISTA_TIENDA) {
    return NextResponse.json({ error: "No disponible" }, { status: 404 });
  }
  const crudo = String(params.codigo ?? "").trim();
  if (crudo.length === 0 || crudo.length > 40) {
    return NextResponse.json({ error: "Código inválido" }, { status: 400 });
  }
  // 🔴 «General» TAMBIÉN es un cajón con fotos (22-sep-2026, los remates). Un
  // mueble que no es de ninguna tienda igual tiene su foto, y hasta hoy no
  // tenía de dónde colgarla: se guarda bajo el código `GENERAL`, que ningún
  // cliente del directorio puede usar (los suyos son D-xx).
  const codigo = esCodigoGeneral(crudo)
    ? TIENDA_GENERAL.toUpperCase()
    : crudo.toUpperCase();

  try {
    const { data, error } = await supabaseServer
      .from("mk_adjuntos")
      .select("*")
      .eq("tipo", "foto_proyecto")
      .eq("tienda_codigo", codigo)
      .order("created_at", { ascending: false });
    if (error) {
      if (esColumnaAusente(error)) return NextResponse.json([]);
      throw new Error(error.message);
    }
    const filas = (data ?? []) as MkAdjunto[];
    const firmados = await firmarAdjuntos(filas);
    // 🔴 El período de cada foto: solo si su sello ya CERRÓ. Sin la columna
    // `periodo_id` no hay ids que leer y todas salen abiertas, como hoy.
    const conPeriodo = MARKETING_FOTOS_CON_PERIODO
      ? await conSuPeriodo(firmados, filas)
      : firmados;
    const res = NextResponse.json(conPeriodo);
    res.headers.set("Cache-Control", "no-store");
    return res;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error interno";
    console.error("GET /api/marketing/tienda/[codigo]/fotos:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}


/**
 * Le pega a cada foto el `periodo` de su sello, cuando ese sello ya CERRÓ.
 * Las filas firmadas no traen `periodo_id` (viene del `select("*")` crudo), así
 * que se cruzan por id. Falla ABIERTA: sin la columna nadie tiene sello y
 * todas salen abiertas.
 */
async function conSuPeriodo(
  firmados: MkAdjunto[],
  crudas: ReadonlyArray<MkAdjunto>,
): Promise<Array<MkAdjunto & { periodo: ReturnType<typeof periodoDeLaFoto> }>> {
  const idDePeriodo = new Map<string, string>();
  for (const f of crudas) {
    const pid = String((f as unknown as Record<string, unknown>).periodo_id ?? "").trim();
    if (pid) idDePeriodo.set(String(f.id), pid);
  }
  const periodos = await leerPeriodosDeFotos([...idDePeriodo.values()]);
  return firmados.map((f) => ({
    ...f,
    periodo: periodoDeLaFoto(idDePeriodo.get(String(f.id)) ?? null, periodos),
  }));
}

/**
 * Registra una foto que YA se subió al bucket, colgada de la TIENDA.
 *
 * 🔴 Puerta propia y no `POST /api/marketing/adjuntos`: esa exige un
 * `proyecto_id` para una `foto_proyecto` (lo pide el CHECK del esquema y lo
 * repite `createAdjunto`), y el rediseño quitó el proyecto. Acá la foto nace
 * con su `tienda_codigo` y sin proyecto.
 *
 * 🔴 Nace SELLADA al período abierto de la tienda (`periodo_id`), para que la
 * cuadrícula la muestre bajo el chip que corresponde y el ZIP de la marca la
 * lleve cuando ese período cierre.
 *
 * 🔴 Y LA MARCA SE ELIGE CUANDO HAY MÁS DE UNA (24-sep-2026). Daniel: *«las
 * fotos deben ir a la tienda del período abierto; un período cerrado, nada
 * debe entrar ni salir»*. Los períodos son POR MARCA: con UNA abierta la foto
 * va ahí sin preguntar; con DOS o más llega `periodoId` (o `marca`) y el
 * SERVIDOR valida que sea de una marca con gasto ABIERTO en ESTA tienda. Lo
 * que no cuadra es 400 en español y el archivo se borra del cajón.
 *
 * 🔴 Falla ABIERTA: sin la columna, se guarda como antes —sin tienda ni
 * sello— y se dice en el log; la foto NO se pierde. 🩸 Y si la base rechaza
 * la fila por la regla vieja (`mk_adjuntos_destino_chk` exige proyecto), el
 * aviso sale EN ESPAÑOL y el archivo recién subido se BORRA del cajón: cada
 * intento fallido dejaba un huérfano (4 medidos el 24-sep-2026).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { codigo: string } },
) {
  const auth = requireRole(req, ["admin", "secretaria"]);
  if (auth instanceof NextResponse) return auth;
  if (!VISTA_TIENDA) {
    return NextResponse.json({ error: "No disponible" }, { status: 404 });
  }
  const crudo = String(params.codigo ?? "").trim();
  if (crudo.length === 0 || crudo.length > 40) {
    return NextResponse.json({ error: "Código inválido" }, { status: 400 });
  }
  // El cajón «General» guarda bajo `GENERAL`, igual que lo lee el GET.
  const codigo = esCodigoGeneral(crudo)
    ? TIENDA_GENERAL.toUpperCase()
    : crudo.toUpperCase();
  try {
    const body = (await req.json()) as {
      url?: string;
      nombreOriginal?: string;
      sizeBytes?: number;
      /** El período ABIERTO elegido, o la clave de la marca a la que pertenece. */
      periodoId?: string;
      marca?: string;
    };
    const url = String(body?.url ?? "").trim();
    if (url.length === 0) {
      return NextResponse.json({ error: "Falta el archivo" }, { status: 400 });
    }
    const base = {
      proyecto_id: null,
      factura_id: null,
      tipo: "foto_proyecto" as const,
      url,
      nombre_original: String(body?.nombreOriginal ?? "").trim() || null,
      size_bytes: Number.isFinite(Number(body?.sizeBytes)) ? Number(body?.sizeBytes) : null,
    };
    // 🔴 El sello lo decide UNA sola función (`destinoDeFotoNueva`, pura) sobre
    // las marcas ABIERTAS de esta tienda. Leerlas nunca lanza y una lista vacía
    // deja la foto sin sello, como hoy.
    const elegido = String(body?.periodoId ?? body?.marca ?? "").trim();
    const marcas = MARKETING_FOTOS_CON_PERIODO
      ? await marcasAbiertasDeLaTienda(codigo)
      : [];
    const destino = destinoDeFotoNueva(marcas, elegido);
    if (!destino.ok) {
      // Lo que llegó no es una marca abierta de esta tienda: si el período
      // existe y ya cerró, se dice con su nombre — a un cerrado no entra nada.
      const cerrado =
        !destino.faltaElegir && elegido ? (await estadoDelPeriodo(elegido)) === "cerrado" : false;
      await borrarDelCajon(url);
      return NextResponse.json(
        {
          error: cerrado ? AVISO_PERIODO_CERRADO : destino.error,
          faltaElegir: destino.faltaElegir,
          marcas,
        },
        { status: 400 },
      );
    }
    const periodoId = destino.periodoId;
    const conTienda: Record<string, unknown> = { ...base, tienda_codigo: codigo };
    if (periodoId) conTienda.periodo_id = periodoId;
    let { data, error } = await supabaseServer
      .from("mk_adjuntos")
      .insert(conTienda)
      .select()
      .single();
    // Sin `periodo_id` (la migración todavía no corrió) se reintenta sin el
    // sello: la foto se guarda igual y se ve bajo «Abierto».
    if (error && periodoId && esColumnaAusente(error)) {
      console.warn(
        "[marketing/fotos-periodo] mk_adjuntos.periodo_id no existe; la foto se guarda sin sello.",
      );
      ({ data, error } = await supabaseServer
        .from("mk_adjuntos")
        .insert({ ...base, tienda_codigo: codigo })
        .select()
        .single());
    }
    if (error && esColumnaAusente(error)) {
      console.warn(
        "[marketing/rediseño] mk_adjuntos.tienda_codigo no existe; la foto se guarda sin tienda.",
      );
      ({ data, error } = await supabaseServer
        .from("mk_adjuntos")
        .insert(sinColumnasDelRediseno(base))
        .select()
        .single());
    }
    // 🩸 La regla vieja todavía exige proyecto: el archivo ya está subido, así
    // que se BORRA y se avisa en español. Nunca el texto crudo de Postgres.
    if (error && esLaReglaDeDestino(error)) {
      console.error(
        "[marketing/fotos-periodo] la base rechazó la foto de tienda por " +
          `${error.message}; falta la migración 20261219130000.`,
      );
      await borrarDelCajon(url);
      return NextResponse.json({ error: AVISO_FALTA_LA_MIGRACION }, { status: 400 });
    }
    if (error) {
      await borrarDelCajon(url);
      throw new Error(error.message);
    }
    const firmado = await firmarAdjuntos([data as MkAdjunto]);
    return NextResponse.json(firmado[0]);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "No se pudo registrar la foto";
    console.error("POST /api/marketing/tienda/[codigo]/fotos:", msg);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
