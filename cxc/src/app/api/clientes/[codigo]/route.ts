// ─────────────────────────────────────────────────────────────────────────────
// GET    /api/clientes/[codigo]   (Sprint 1 Fase 4D)
// PATCH  /api/clientes/[codigo]
//
// GET devuelve cliente + ventas YTD por empresa + CXC actual por empresa
//   + última factura. PATCH solo permite editar contacto/telefono/celular/email/notas.
//   Los campos fiscales (nombre, razon_social, identificacion, dv, provincia,
//   codigo) NUNCA se editan acá — sync semanal de Switch los pisa.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { requireAuth } from "@/lib/require-auth";
import { invalidarDirectorioServidor } from "@/lib/clientes/directorio-cache";
import { B2B_EMPRESA_KEYS } from "@/lib/empresa-mapping";
// 🔴 LA FICHA ES SOLO PARA CLIENTES DEL GRUPO. Ver el 🩸 de `esCodigoDelGrupo`.
import { esCodigoDelGrupo } from "@/lib/clientes/mundos";
// La definición de "compras del año" vive en UN solo lugar y la comparten la
// ficha y el listado — si divergieran, la misma pantalla diría dos números
// distintos para el mismo cliente.
import { ymdPanama, montoFirmado, ventanaAnioPanama, aCentavos, aEnteroEscalado, escaladoACentavos, sumarCentavos } from "@/lib/clientes-ytd";

export const dynamic = "force-dynamic";

const READ_ROLES = ["admin", "secretaria", "vendedor", "bodega"];
const WRITE_ROLES = ["admin", "secretaria"];

interface EmpresaTotals {
  empresa: string;
  ventas_ytd: number;
  cobrado_ytd: number;
  cxc: number;
  ultima_factura: string | null;
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ codigo: string }> }) {
  const authError = requireAuth(req, READ_ROLES);
  if (authError) return authError;

  const { codigo } = await ctx.params;
  if (!codigo) return NextResponse.json({ error: "codigo requerido" }, { status: 400 });

  // 1. Cliente
  const { data: cliente, error: cErr } = await supabaseServer
    .from("clientes_master")
    .select("*")
    .eq("codigo", codigo)
    .eq("deleted", false)
    .maybeSingle();
  if (cErr) {
    console.error("[api/clientes/codigo] lookup error:", cErr.message);
    return NextResponse.json({ error: cErr.message }, { status: 500 });
  }
  if (!cliente) return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 });

  // 🔴 LA PUERTA DE MUNDO, y va DESPUÉS del lookup a propósito: un código que no
  // existe y uno de Boston tienen que contestar lo MISMO (404 "Cliente no
  // encontrado"). Un 403 diferenciado sería un oráculo: confirmaría desde afuera
  // qué códigos existen en la cartera de Boston.
  if (!(await esCodigoDelGrupo(codigo))) {
    return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 });
  }

  // El año se corta en hora PANAMÁ. Antes era `new Date().getFullYear()`, que en
  // el servidor (UTC) ya salta al año siguiente a las 19:00 del 31-dic de
  // Panamá y vaciaba el YTD 5 horas antes de tiempo.
  const { desde: anioDesde, hasta: anioHasta } = ventanaAnioPanama();
  const yearStart = anioDesde.slice(0, 10);

  // Puente por ID: pares (empresa_key, cliente_switch_id) del cliente. El id es
  // por-empresa → matcheamos el par exacto, no solo el cliente_switch_id.
  const { data: pares } = await supabaseServer
    .from("switch_clientes")
    .select("empresa_key, cliente_switch_id")
    .eq("codigo", codigo);
  const cids = [...new Set((pares ?? [])
    .map(p => (p as { cliente_switch_id: number | null }).cliente_switch_id)
    .filter((x): x is number => typeof x === "number"))];
  const pairSet = new Set((pares ?? []).map(p => {
    const x = p as { empresa_key: string; cliente_switch_id: number | null };
    return `${x.empresa_key}|${x.cliente_switch_id}`;
  }));

  // 2. Ventas YTD (switch_facturas año en curso, acotado) · última factura
  //    (switch_facturas ordenada desc) · CXC (switch_estadocuenta_aging) · Cobrado
  //    (switch_recibos). Dos queries switch separadas para NO topar el límite de
  //    1000 filas en clientes grandes (una sola .in() sin acotar las perdía). Las
  //    dos últimas YA eran switch → idénticas; solo ventas/última dejan ventas_raw.
  const [ventasRes, ultimaRes, cxcRes, cobradoRes] = await Promise.all([
    cids.length > 0
      ? supabaseServer
          .from("switch_facturas")
          .select("empresa_key, cliente_switch_id, fecha, tipo_comprobante, subtotal_descuento")
          .in("cliente_switch_id", cids)
          .gte("fecha", anioDesde)
          .lt("fecha", anioHasta)
      : Promise.resolve({ data: [] as unknown[] }),
    cids.length > 0
      ? supabaseServer
          .from("switch_facturas")
          .select("empresa_key, cliente_switch_id, fecha")
          .in("cliente_switch_id", cids)
          .in("tipo_comprobante", ["Factura", "Tiquete", "Transacción"])
          .order("fecha", { ascending: false })
      : Promise.resolve({ data: [] as unknown[] }),
    supabaseServer
      .from("switch_estadocuenta_aging")
      .select("company_key, total")
      .eq("codigo", codigo),
    // Cobrado YTD = pagos del año (switch_recibos) EXCLUYENDO retenciones.
    // El `.in(empresa)` acota a las empresas con CXC en ESTE sistema: sin él la
    // query trae los recibos de cualquier empresa que comparta el código de
    // cliente, y la separación quedaría a cargo del `.map(B2B_EMPRESA_KEYS)` de
    // más abajo en vez de la consulta. Ver el gemelo en clientes/[codigo]/page.tsx.
    supabaseServer
      .from("switch_recibos")
      .select("empresa_key, total")
      .in("empresa_key", B2B_EMPRESA_KEYS)
      .eq("cliente_codigo", codigo)
      .eq("es_retencion", false)
      .gte("fecha", anioDesde)
      .lt("fecha", anioHasta),
  ]);

  // Ventas YTD (base SIN ITBMS = subtotal_descuento), neto firmado por tipo. Las tres piezas
  // del cálculo — ventana del año, día-Panamá y signo por comprobante — salen de
  // `lib/clientes-ytd`, el MISMO módulo que usa el listado.
  const ventasMap = new Map<string, number>();
  for (const r of (ventasRes.data ?? []) as {
    empresa_key: string; cliente_switch_id: number; fecha: string;
    tipo_comprobante: string; subtotal_descuento: number | string;
  }[]) {
    if (!pairSet.has(`${r.empresa_key}|${r.cliente_switch_id}`)) continue;
    if (!r.fecha || ymdPanama(r.fecha) < yearStart) continue;
    // En ENTEROS: sumar decimales depende del orden de las filas y separaba
    // este total del que muestra el listado por un centavo (ver clientes-ytd.ts).
    ventasMap.set(r.empresa_key, (ventasMap.get(r.empresa_key) ?? 0) + aEnteroEscalado(montoFirmado(r.tipo_comprobante, r.subtotal_descuento)));
  }

  // Última factura: la lista viene ordenada desc → la primera fila (pairSet match)
  // de cada empresa es su fecha más reciente; la primera global = la del grupo.
  const ultimaFacturaMap = new Map<string, string>();
  let ultimaGlobal: string | null = null;
  for (const r of (ultimaRes.data ?? []) as { empresa_key: string; cliente_switch_id: number; fecha: string }[]) {
    if (!r.fecha || !pairSet.has(`${r.empresa_key}|${r.cliente_switch_id}`)) continue;
    const ymd = ymdPanama(r.fecha);
    if (!ultimaFacturaMap.has(r.empresa_key)) ultimaFacturaMap.set(r.empresa_key, ymd);
    if (!ultimaGlobal || ymd > ultimaGlobal) ultimaGlobal = ymd;
  }

  // CXC + Cobrado: sin cambio (ya eran switch). CXC `total` ya viene firmado.
  const cxcMap = new Map<string, number>();
  for (const r of (cxcRes.data ?? []) as { company_key: string; total: number }[]) {
    cxcMap.set(r.company_key, (cxcMap.get(r.company_key) ?? 0) + Number(r.total ?? 0));
  }
  const cobradoMap = new Map<string, number>();
  for (const r of (cobradoRes.data ?? []) as { empresa_key: string; total: number }[]) {
    cobradoMap.set(r.empresa_key, (cobradoMap.get(r.empresa_key) ?? 0) + Number(r.total ?? 0));
  }

  const empresas: EmpresaTotals[] = B2B_EMPRESA_KEYS.map(e => ({
    empresa: e,
    ventas_ytd: escaladoACentavos(ventasMap.get(e) ?? 0),
    cobrado_ytd: aCentavos(cobradoMap.get(e) ?? 0),
    cxc: aCentavos(cxcMap.get(e) ?? 0),
    ultima_factura: ultimaFacturaMap.get(e) ?? null,
  }));

  const totalGrupo = {
    ventas_ytd:  sumarCentavos(empresas.map(e => e.ventas_ytd)),
    cobrado_ytd: empresas.reduce((s, e) => s + e.cobrado_ytd, 0),
    cxc:         empresas.reduce((s, e) => s + e.cxc, 0),
  };

  return NextResponse.json({
    cliente,
    empresas,
    total_grupo: {
      ventas_ytd:  totalGrupo.ventas_ytd,
      cobrado_ytd: aCentavos(totalGrupo.cobrado_ytd),
      cxc:         aCentavos(totalGrupo.cxc),
      ultima_factura: ultimaGlobal,
    },
  });
}

interface PatchBody {
  /** Nombre de la persona con quien se habla. Columna nueva (5-sep-2026). */
  contacto?: string | null;
  telefono?: string | null;
  celular?: string | null;
  email?: string | null;
  notas?: string | null;
}

/** ¿El error de PostgREST es «todavía no existe la columna `contacto`»? */
function faltaColumnaContacto(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  const msg = err.message ?? "";
  if (!/\bcontacto\b/i.test(msg)) return false;
  return /does not exist|schema cache|could not find/i.test(msg) ||
    err.code === "42703" || err.code === "PGRST204";
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ codigo: string }> }) {
  const authError = requireAuth(req, WRITE_ROLES);
  if (authError) return authError;

  const { codigo } = await ctx.params;
  if (!codigo) return NextResponse.json({ error: "codigo requerido" }, { status: 400 });

  let body: PatchBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  // Whitelist estricta — el sync semanal del Sprint 4 pisa los demás campos.
  const allowed: PatchBody = {};
  // 🔴 `contacto` entra a la MISMA familia que teléfono/celular/email/notas: lo
  // escribe la gente y el sync de Switch no lo pisa nunca.
  if ("contacto" in body) allowed.contacto = (body.contacto ?? "").toString().trim() || null;
  if ("telefono" in body) allowed.telefono = (body.telefono ?? "").toString().trim() || null;
  if ("celular"  in body) allowed.celular  = (body.celular  ?? "").toString().trim() || null;
  if ("email"    in body) allowed.email    = (body.email    ?? "").toString().trim() || null;
  if ("notas"    in body) allowed.notas    = (body.notas    ?? "").toString().trim() || null;

  if (Object.keys(allowed).length === 0) {
    return NextResponse.json({ error: "Ningún campo editable provisto" }, { status: 400 });
  }

  // 🔴 Se pregunta ANTES de escribir. El GET esconde la ficha de Boston, pero un
  // PATCH a mano no pasa por el GET: sin esto, la puerta de ESCRITURA seguía
  // abierta sobre 4.915 fichas que no son del grupo.
  if (!(await esCodigoDelGrupo(codigo))) {
    return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 });
  }

  const escribir = (campos: PatchBody) =>
    supabaseServer
      .from("clientes_master")
      .update(campos)
      .eq("codigo", codigo)
      .eq("deleted", false)
      .select()
      .maybeSingle();

  let { data, error } = await escribir(allowed);

  // La migración `20260926120000_clientes_master_contacto.sql` todavía no
  // corrió: se guarda lo demás y se avisa que el contacto no se pudo guardar.
  // Fallar entero dejaría sin guardar un teléfono corregido por una columna que
  // no existe.
  let contactoGuardado = "contacto" in allowed;
  if (faltaColumnaContacto(error)) {
    contactoGuardado = false;
    const { contacto: _sinColumna, ...resto } = allowed;
    void _sinColumna;
    if (Object.keys(resto).length === 0) {
      return NextResponse.json(
        { error: "Todavía no se puede guardar el contacto. Falta un ajuste en la base de datos." },
        { status: 503 },
      );
    }
    ({ data, error } = await escribir(resto));
  }

  if (error) {
    console.error("[api/clientes/codigo] patch error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 });

  // El listado del directorio se sirve de un caché en memoria (60 s). Sin esto
  // una edición tardaría hasta un minuto en verse. ⚠️ Solo limpia ESTA
  // instancia: en serverless otra puede seguir sirviendo lo viejo hasta que
  // venza el TTL — por eso el TTL es corto y no se depende solo de acá.
  invalidarDirectorioServidor();
  return NextResponse.json({ ok: true, cliente: data, contactoGuardado });
}
