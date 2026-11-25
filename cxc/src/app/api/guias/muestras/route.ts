/**
 * Despachos › Pedidos › «Muestras» (24-nov-2026, `MUESTRAS_2026_11`).
 *
 *   GET   ?empresa_key=&pedido_switch_id=  → { muestras }  (las de UN pedido, para bodega)
 *   GET                                     → { pedidos, total } (lo que el vendedor tiene por mandar)
 *   POST  { empresa_key, pedido_switch_id, codigos[] } → bodega pide las muestras
 *   PATCH { accion: "enviada" | "no_llego" | "quitar", ids[] }
 *
 * 🔴 El SERVIDOR decide quién hace qué (`muestras.ts`): pide y reclama bodega
 * o admin; «Enviada» solo el vendedor asignado o admin; cada uno ve sus
 * empresas (Jorman solo Vistana). Todo deja rastro en `activity_logs`.
 * El quién sale de la cookie FIRMADA, nunca del cuerpo. No abre Switch.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireRole, type SessionPayload } from "@/lib/requireRole";
import { supabaseServer } from "@/lib/supabase-server";
import { logActivity } from "@/lib/log-activity";
import { B2B_EMPRESA_KEYS } from "@/lib/empresa-mapping";
import { PEDIDOS_VER_ROLES } from "@/lib/guias/pedidos-bodega";
import { veLaEmpresa } from "@/lib/guias/pedidos-bultos";
import {
  MUESTRAS_2026_11,
  codigosAPedir,
  columnasDeAccion,
  empresasDeMuestrasDe,
  puedeAccionMuestra,
  puedePedirMuestra,
  type AccionMuestra,
} from "@/lib/guias/muestras";
import { COLUMNAS_MUESTRA, leerMuestrasDelPedido, leerPorMandar, sincronizarEspera } from "@/lib/guias/muestras-server";
import { avisoDeMuestras } from "@/lib/guias/muestras-aviso";
import { mandarAvisoDeMuestras } from "@/lib/guias/muestras-aviso-server";

export const dynamic = "force-dynamic";

const apagado = () => NextResponse.json({ error: "No disponible" }, { status: 404 });
const noExiste = () => NextResponse.json({ error: "Ese pedido no existe" }, { status: 404 });
const quienFirma = (a: SessionPayload) => a.userName || a.userId || "";
const ACCIONES: readonly AccionMuestra[] = ["enviada", "no_llego", "quitar"];
const RASTRO: Record<AccionMuestra, string> = { enviada: "muestra_enviada", no_llego: "muestra_no_llego", quitar: "muestra_quitada" };

export async function GET(req: NextRequest) {
  if (!MUESTRAS_2026_11) return apagado();
  const auth = requireRole(req, [...PEDIDOS_VER_ROLES]);
  if (auth instanceof NextResponse) return auth;
  const q = req.nextUrl.searchParams;
  try {
    if (q.has("pedido_switch_id")) {
      const empresa = (q.get("empresa_key") ?? "").trim();
      const id = Number(q.get("pedido_switch_id"));
      if (!empresa || !Number.isInteger(id)) return NextResponse.json({ error: "Datos incompletos" }, { status: 400 });
      if (!veLaEmpresa(empresa, auth.userName, auth.role)) return noExiste();
      return NextResponse.json({ muestras: await leerMuestrasDelPedido(empresa, id) });
    }
    const empresas = empresasDeMuestrasDe(auth.userName, auth.role);
    if (empresas.length === 0) return NextResponse.json({ error: "Las muestras las ve el vendedor que las manda" }, { status: 403 });
    const pedidos = await leerPorMandar(empresas);
    return NextResponse.json({ pedidos, total: pedidos.reduce((s, p) => s + p.muestras.length, 0), empresas });
  } catch (e) {
    console.error("[guias/muestras] GET:", e instanceof Error ? e.message : String(e));
    return NextResponse.json({ error: "No se pudieron leer las muestras" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!MUESTRAS_2026_11) return apagado();
  const auth = requireRole(req, [...PEDIDOS_VER_ROLES]);
  if (auth instanceof NextResponse) return auth;
  const quien = quienFirma(auth);
  if (!quien) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const empresa = String(body?.empresa_key ?? "");
  const id = Number(body?.pedido_switch_id);
  const pedidas = Array.isArray(body?.codigos) ? (body!.codigos as unknown[]) : [];
  if (!(B2B_EMPRESA_KEYS as readonly string[]).includes(empresa) || !Number.isInteger(id) || pedidas.length === 0) {
    return NextResponse.json({ error: "Toca al menos una referencia" }, { status: 400 });
  }
  if (!veLaEmpresa(empresa, auth.userName, auth.role)) return noExiste();

  const [ped, est, lin, vivas] = await Promise.all([
    supabaseServer.from("switch_pedidos").select("pedido_switch_id, secuencial, cliente_nombre").eq("empresa_key", empresa).eq("pedido_switch_id", id).maybeSingle(),
    supabaseServer.from("pedidos_bodega_estado").select("estado").eq("empresa_key", empresa).eq("pedido_switch_id", id).maybeSingle(),
    supabaseServer.from("pedidos_lineas").select("codigo, descripcion").eq("empresa_key", empresa).eq("pedido_switch_id", id),
    supabaseServer.from("pedidos_muestras").select("codigo").eq("empresa_key", empresa).eq("pedido_switch_id", id).eq("deleted", false),
  ]);
  if (!ped.data) return noExiste();
  if (est.error || lin.error || vivas.error) return NextResponse.json({ error: "No se pudo leer el pedido" }, { status: 500 });
  const v = puedePedirMuestra(
    { empresa_key: empresa, estadoPedido: (est.data as { estado: string } | null)?.estado ?? "pendiente" },
    { role: auth.role, userName: auth.userName },
  );
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 403 });

  const lineas = (lin.data ?? []) as Array<{ codigo: string; descripcion: string | null }>;
  const codigos = codigosAPedir(pedidas, lineas.map((l) => l.codigo), ((vivas.data ?? []) as Array<{ codigo: string }>).map((m) => m.codigo));
  if (codigos.length === 0) return NextResponse.json({ error: "Esas referencias ya tienen muestra pedida" }, { status: 409 });
  const descripcion = new Map(lineas.map((l) => [l.codigo.trim(), l.descripcion]));
  const ahora = new Date().toISOString();
  const filas = codigos.map((c) => ({
    empresa_key: empresa, pedido_switch_id: id, codigo: c, descripcion: descripcion.get(c) ?? null,
    estado: "falta", pedida_por: quien, pedida_en: ahora,
  }));
  const { data: creadas, error } = await supabaseServer.from("pedidos_muestras").insert(filas).select(COLUMNAS_MUESTRA);
  if (error?.code === "23505") return NextResponse.json({ error: "Otra persona pidió esa muestra. Vuelve a cargar el pedido." }, { status: 409 });
  if (error) return NextResponse.json({ error: "No se pudieron pedir las muestras" }, { status: 500 });
  const espera = await sincronizarEspera(empresa, id, quien);
  await logActivity(auth.role, "pedir_muestras", "pedidos_muestras", { pedido: `${empresa}:${id}`, codigos, espera }, auth.userName);
  // 🔔 UN aviso push al vendedor que las manda (`MUESTRAS_AVISO_PUSH_2026_11`).
  // Nunca frena: lo guardado ya quedó; si falla, se registra y sigue.
  const p = ped.data as { secuencial?: string | null; cliente_nombre?: string | null };
  await mandarAvisoDeMuestras(
    avisoDeMuestras({ empresa_key: empresa, pedido_switch_id: id, n: (creadas ?? filas).length, secuencial: p.secuencial, cliente: p.cliente_nombre }),
  );
  return NextResponse.json({ ok: true, muestras: creadas ?? [] });
}

export async function PATCH(req: NextRequest) {
  if (!MUESTRAS_2026_11) return apagado();
  const auth = requireRole(req, [...PEDIDOS_VER_ROLES]);
  if (auth instanceof NextResponse) return auth;
  const quien = quienFirma(auth);
  if (!quien) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const accion = body?.accion as AccionMuestra;
  const ids = Array.isArray(body?.ids) ? [...new Set((body!.ids as unknown[]).map(Number).filter(Number.isInteger))] : [];
  if (!ACCIONES.includes(accion) || ids.length === 0 || ids.length > 200) {
    return NextResponse.json({ error: "Datos incompletos" }, { status: 400 });
  }
  const { data, error: lErr } = await supabaseServer
    .from("pedidos_muestras")
    .select("id, empresa_key, pedido_switch_id, codigo, estado")
    .in("id", ids)
    .eq("deleted", false);
  if (lErr) return NextResponse.json({ error: "No se pudieron leer las muestras" }, { status: 500 });
  const muestras = (data ?? []) as Array<{ id: number; empresa_key: string; pedido_switch_id: number; codigo: string; estado: string }>;
  if (muestras.length !== ids.length) return NextResponse.json({ error: "Esa muestra ya no está. Vuelve a cargar la lista." }, { status: 409 });
  // Todo o nada: si una no se puede, no se escribe ninguna.
  for (const m of muestras) {
    const v = puedeAccionMuestra(accion, m, { role: auth.role, userName: auth.userName });
    if (!v.ok) return NextResponse.json({ error: v.error }, { status: 403 });
  }
  const ahora = new Date().toISOString();
  const cols = columnasDeAccion(accion, quien, ahora);
  // El UPDATE exige el estado leído: si otro la movió entretanto, no se pisa.
  const hechas: number[] = [];
  for (const estado of [...new Set(muestras.map((m) => m.estado))]) {
    const delEstado = muestras.filter((m) => m.estado === estado).map((m) => m.id);
    const { data: upd, error } = await supabaseServer
      .from("pedidos_muestras")
      .update(cols)
      .in("id", delEstado)
      .eq("estado", estado)
      .eq("deleted", false)
      .select("id");
    if (error) return NextResponse.json({ error: "No se pudo guardar" }, { status: 500 });
    hechas.push(...((upd ?? []) as Array<{ id: number }>).map((u) => u.id));
  }
  const pedidos = [...new Map(muestras.map((m) => [`${m.empresa_key}:${m.pedido_switch_id}`, m])).values()];
  for (const p of pedidos) {
    const espera = await sincronizarEspera(p.empresa_key, p.pedido_switch_id, quien);
    await logActivity(auth.role, RASTRO[accion], "pedidos_muestras", {
      pedido: `${p.empresa_key}:${p.pedido_switch_id}`,
      codigos: muestras.filter((m) => m.empresa_key === p.empresa_key && m.pedido_switch_id === p.pedido_switch_id && hechas.includes(m.id)).map((m) => m.codigo),
      espera,
    }, auth.userName);
  }
  if (hechas.length < ids.length) return NextResponse.json({ error: "Alguien la movió entretanto. Vuelve a cargar la lista.", hechas }, { status: 409 });
  return NextResponse.json({ ok: true, hechas });
}
