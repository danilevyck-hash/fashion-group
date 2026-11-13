// ─────────────────────────────────────────────────────────────────────────────
// GET /api/guias/facturas-cliente?codigo=D-XXX
//
// Las facturas del cliente para armar una guía: se elige el cliente UNA vez y
// se marcan las facturas que van (Daniel: «va», 3-sep-2026; interruptor
// GUIAS_ATAJOS_NUEVOS en src/lib/guias/atajos-facturas.ts).
//
// 🔴 EL PUENTE ES POR CÓDIGO, NUNCA POR NOMBRE (invariante de clientes_master):
//   codigo D-XXX → switch_clientes.(empresa_key, cliente_switch_id) → switch_facturas
// Es el mismo puente de /api/clientes/[codigo]/ultimas-facturas. Un JOIN por
// nombre contra una tabla con homónimos multiplica la factura.
//
// 🔴 SOLO LAS 6 DEL GRUPO, POR INCLUSIÓN (`.in(empresa_key, B2B_EMPRESA_KEYS)`):
// Boston y American Classic no entran ni aunque el código exista allá.
//
// Solo `tipo_comprobante = 'Factura'` (TIPO_FACTURA, amarrado al vocabulario de
// tipos-comprobante.ts), ordenadas por fecha desc. Nuestra base primero, sin
// límite de días: switch_facturas trae la historia desde oct-2022 y las
// 285 facturas de los últimos 30 días cruzan el puente al 100% (medido
// 3-sep-2026). Lo de HOY lo refresca /api/guias/facturas-hoy en segundo plano.
//
// «Ya salió en otra guía» = la factura aparece en guia_items.facturas de una
// guía VIVA, pareada por (empresa, número) exactos y normalizados — los
// secuenciales de Switch se repiten entre empresas. ES AVISO, NUNCA BLOQUEO, y
// el sistema puede afirmar «ya salió» pero NO lo contrario (hay facturas sin
// guía que son mostrador o retiro).
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { pedidoDeReferencia } from "@/lib/guias/pedidos-flujo-simple";
import { requireAuth, getSession } from "@/lib/require-auth";
import { B2B_EMPRESA_KEYS, mapEmpresaName } from "@/lib/empresa-mapping";
import { esCodigoDeCliente } from "@/lib/clientes/mundos";
import { TIPO_FACTURA, yaSalioEn } from "@/lib/guias/atajos-facturas";
import { leerYaSalio } from "@/lib/guias/ya-salio-server";
import { facturasPorNumero, facturasPorPedido } from "@/lib/guias/etiquetas-por-envio";
import { claveDeFactura } from "@/lib/guias/numero-factura";
import { CODIGOS_RETIRADOS_DE_GUIAS } from "@/lib/guias/american-classics";
import { nombreParaMostrar } from "@/lib/clientes/nombre-display";

export const dynamic = "force-dynamic";

// Los mismos roles que ESCRIBEN guías (vendedor es solo lectura en el módulo).
const ROLES = ["admin", "secretaria", "bodega"];

/** Techo del listado. El cliente más movido tiene 216 facturas en 90 días. */
const MAX_FACTURAS = 200;

interface ParPuente {
  empresa_key: string;
  cliente_switch_id: number;
}

interface FacturaFila {
  empresa_key: string;
  /** 🔴 El id REAL de Switch. Viaja desde el 18-sep-2026 para las ETIQUETAS:
   *  `guias_etiquetas` lo guarda, y es lo que la guía nunca guardó (su columna
   *  `facturas` es texto libre). ⚠️ ADITIVO: nada de lo que ya existía cambió. */
  switch_factura_id: number | null;
  secuencial: string | null;
  fecha: string | null;
  total: number | string | null;
  pedido_referencia?: string | null;
  pedido_leido_en?: string | null;
}

export async function GET(req: NextRequest) {
  const authError = requireAuth(req, ROLES);
  if (authError) return authError;
  // 🔴 BODEGA NO VE PLATA (7-oct-2026, Daniel: «que ningún usuario con rol
  // bodega vea precio, solo admin y secretaria»). Bodega entra a esta ruta
  // para armar una guía; el `total` de cada factura se recorta ACÁ, nunca
  // escondido en la pantalla — la fila lo pintaba igual que a cualquiera.
  const verPrecio = getSession(req)?.role !== "bodega";

  // 🔴 12-nov-2026: Etiquetas › Nuevo envío también arranca por el N.° de factura.
  const numero = req.nextUrl.searchParams.get("factura");
  if (numero != null) return buscarPorNumero(numero.trim());
  // 🔴 13-nov-2026: el buscador único también encuentra por N.° de PEDIDO.
  const documento = req.nextUrl.searchParams.get("buscar");
  if (documento != null) return buscarPorNumero(documento.trim(), true);

  const codigo = (req.nextUrl.searchParams.get("codigo") ?? "").trim();
  // Solo códigos del grupo (D-XXX). Un código numérico de Boston/Multifashion
  // no es un cliente de guías: 400, no una lista vacía que parezca "sin ventas".
  if (!esCodigoDeCliente(codigo)) {
    return NextResponse.json({ error: "codigo inválido" }, { status: 400 });
  }

  // 1 · El puente, por CÓDIGO y por INCLUSIÓN de las 6 del grupo.
  const { data: pares, error: pErr } = await supabaseServer
    .from("switch_clientes")
    .select("empresa_key, cliente_switch_id")
    .eq("codigo", codigo)
    .in("empresa_key", [...B2B_EMPRESA_KEYS]);
  if (pErr) {
    console.error("[guias/facturas-cliente] puente:", pErr.message);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }

  const paresValidos = ((pares ?? []) as ParPuente[]).filter(
    (p) => p.empresa_key && typeof p.cliente_switch_id === "number",
  );
  if (paresValidos.length === 0) {
    // Cliente sin puente (huérfano / sin ventas en Switch): lista vacía, no error.
    return NextResponse.json({ facturas: [], hasta: await frescuraFacturas() });
  }

  // 2 · Las facturas de esos pares. OR de TUPLAS (empresa_key, cliente_switch_id):
  //     el mismo cliente_switch_id puede ser OTRO cliente en otra empresa.
  const orFiltro = paresValidos
    .map((p) => `and(empresa_key.eq.${p.empresa_key},cliente_switch_id.eq.${p.cliente_switch_id})`)
    .join(",");

  const { data: facs, error: fErr } = await supabaseServer
    .from("switch_facturas")
    .select("empresa_key, switch_factura_id, secuencial, fecha, total, pedido_referencia, pedido_leido_en")
    .eq("tipo_comprobante", TIPO_FACTURA)
    .or(orFiltro)
    .order("fecha", { ascending: false })
    .order("switch_factura_id", { ascending: false })
    .limit(MAX_FACTURAS);
  if (fErr) {
    console.error("[guias/facturas-cliente] facturas:", fErr.message);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }

  // 3 · El índice «ya salió»: renglones vivos de guías vivas. Paginado con
  //     orden estable — db-max-rows corta en 1000 EN SILENCIO.
  let indice: ReadonlyMap<string, number>;
  let despachadas: ReadonlyMap<string, number>;
  try {
    // La lectura vive en `ya-salio-server.ts`: Etiquetas lee la MISMA (1-oct-2026).
    ({ indice, despachadas } = await leerYaSalio());
  } catch (e) {
    // Fail-open: sin índice no hay aviso, pero la lista de facturas sale igual.
    console.error("[guias/facturas-cliente] ya-salió:", e instanceof Error ? e.message : String(e));
    indice = new Map();
    despachadas = new Map();
  }

  const delPedido = await bultosDelPedido((facs ?? []) as FacturaFila[]);
  const facturas = ((facs ?? []) as FacturaFila[])
    .filter((f) => f.secuencial && f.fecha)
    .map((f) => {
      const empresa = mapEmpresaName(f.empresa_key);
      return {
        empresa_key: f.empresa_key,
        empresa,
        switch_factura_id: f.switch_factura_id == null ? null : Number(f.switch_factura_id),
        secuencial: String(f.secuencial),
        fecha: String(f.fecha),
        total: verPrecio ? Number(f.total ?? 0) : null,
        yaSalioEn: yaSalioEn(indice, empresa, String(f.secuencial)),
        yaSalioPendiente:
          yaSalioEn(indice, empresa, String(f.secuencial)) != null &&
          yaSalioEn(despachadas, empresa, String(f.secuencial)) == null,
        // 🔴 12-nov-2026: el N.° de pedido viaja CON la factura (lo guarda el
        // sync de facturas). `pedidoLeido: false` = todavía nadie lo leyó.
        pedido: f.pedido_referencia ?? null,
        pedidoLeido: f.pedido_leido_en != null,
        ...delPedido(f),
      };
    });

  return NextResponse.json({ facturas, hasta: await frescuraFacturas() });
}

/**
 * Hasta cuándo llega la base: el último sync de facturas EXITOSO más viejo
 * entre las 6 del grupo (el mínimo — es lo único que se puede prometer para
 * TODAS). Se dice en pantalla como «hasta las HH:MM»; null = no se sabe.
 */
async function frescuraFacturas(): Promise<string | null> {
  const { data, error } = await supabaseServer
    .from("switch_sync_log")
    .select("empresa_key, finished_at")
    .eq("sync_type", "facturas")
    .eq("status", "success")
    .in("empresa_key", [...B2B_EMPRESA_KEYS])
    .order("finished_at", { ascending: false })
    .limit(120);
  if (error || !data) return null;

  const ultimoPorEmpresa = new Map<string, string>();
  for (const r of data as Array<{ empresa_key: string; finished_at: string | null }>) {
    if (r.finished_at && !ultimoPorEmpresa.has(r.empresa_key)) {
      ultimoPorEmpresa.set(r.empresa_key, r.finished_at);
    }
  }
  if (ultimoPorEmpresa.size === 0) return null;
  return [...ultimoPorEmpresa.values()].sort()[0];
}

/** Solo se busca en el último año: lo que se etiqueta es reciente. */
const DIAS_BUSQUEDA_POR_NUMERO = 365;

/**
 * `?factura=2534` → el cliente (por CÓDIGO, el mismo puente de arriba) de la
 * factura que termina en esos dígitos, una por empresa de las 6 del grupo
 * (`facturasPorNumero`). Más de una = la pantalla pregunta cuál.
 */
async function buscarPorNumero(numero: string, conPedido = false): Promise<NextResponse> {
  const clave = claveDeFactura(numero);
  if (clave === "" || numero.replace(/\D/g, "").length > 15) {
    return NextResponse.json({ error: "Escribe el número de la factura" }, { status: 400 });
  }
  const desde = new Date(Date.now() - DIAS_BUSQUEDA_POR_NUMERO * 86_400_000).toISOString().slice(0, 10);
  const consulta = (columna: "secuencial" | "pedido_referencia") =>
    supabaseServer
      .from("switch_facturas")
      .select("empresa_key, switch_factura_id, secuencial, fecha, cliente_switch_id, pedido_referencia, pedido_leido_en")
      .eq("tipo_comprobante", TIPO_FACTURA)
      .in("empresa_key", [...B2B_EMPRESA_KEYS])
      .gte("fecha", desde)
      .like(columna, `%${clave}`)
      .order("fecha", { ascending: false })
      .limit(500);
  const [porFactura, porPedido] = await Promise.all([
    consulta("secuencial"),
    conPedido ? consulta("pedido_referencia") : Promise.resolve({ data: [], error: null }),
  ]);
  const error = porFactura.error ?? porPedido.error;
  if (error) {
    console.error("[guias/facturas-cliente] por número:", error.message);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
  type Fila = {
    empresa_key: string; switch_factura_id: number | null; secuencial: string | null; fecha: string | null;
    cliente_switch_id: number | null; pedido_referencia?: string | null; pedido_leido_en?: string | null;
  };
  const halladas = [
    ...facturasPorNumero((porFactura.data ?? []) as Fila[], numero).map((f) => ({ f, tipo: "factura" as const })),
    ...facturasPorPedido((porPedido.data ?? []) as Fila[], numero).map((f) => ({ f, tipo: "pedido" as const })),
  ]
    .filter(({ f }) => typeof f.cliente_switch_id === "number")
    // Lo más reciente arriba, sea factura o pedido: lo que se etiqueta es de hoy.
    .sort((a, b) => String(b.f.fecha ?? "").localeCompare(String(a.f.fecha ?? "")));
  if (halladas.length === 0) return NextResponse.json({ coincidencias: [] });

  const orFiltro = [...new Set(halladas.map(({ f }) => `and(empresa_key.eq.${f.empresa_key},cliente_switch_id.eq.${f.cliente_switch_id})`))]
    .join(",");
  const { data: clientes, error: cErr } = await supabaseServer
    .from("switch_clientes")
    .select("empresa_key, cliente_switch_id, codigo, nombre")
    .or(orFiltro);
  if (cErr) {
    console.error("[guias/facturas-cliente] por número, clientes:", cErr.message);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
  const filas = (clientes ?? []) as Array<{ empresa_key: string; cliente_switch_id: number; codigo: string | null; nombre: string | null }>;
  const delPedido = await bultosDelPedido(halladas.map(({ f }) => f));
  const coincidencias = halladas.flatMap(({ f, tipo }) => {
    const c = filas.find((x) => x.empresa_key === f.empresa_key && x.cliente_switch_id === f.cliente_switch_id);
    const codigo = (c?.codigo ?? "").trim();
    if (!esCodigoDeCliente(codigo) || CODIGOS_RETIRADOS_DE_GUIAS.includes(codigo)) return [];
    return [{
      empresa_key: f.empresa_key,
      empresa: mapEmpresaName(f.empresa_key),
      secuencial: String(f.secuencial),
      fecha: String(f.fecha),
      cliente_codigo: codigo,
      cliente_nombre: nombreParaMostrar(codigo, c?.nombre) || codigo,
      // Aditivo (13-nov-2026): lo que el buscador único necesita para llenar el pedido.
      ...(conPedido ? {
        tipo,
        switch_factura_id: f.switch_factura_id == null ? null : Number(f.switch_factura_id),
        pedido: f.pedido_referencia ?? null,
        pedidoLeido: f.pedido_leido_en != null,
        ...delPedido(f),
      } : {}),
    }];
  });
  return NextResponse.json({ coincidencias });
}

/**
 * 🔴 13-nov-2026 (propuesta): los bultos que bodega anotó al marcar Preparado,
 * amarrados por el N.° de pedido de la factura (`pedido_referencia`
 * «16-000002463» = pedido 2463 de esa MISMA empresa). Solo Preparado o
 * Recibido con bultos. Falla ABIERTA: sin lectura, la factura viaja sin ellos.
 */
async function bultosDelPedido(
  filas: ReadonlyArray<{ empresa_key: string; pedido_referencia?: string | null }>,
): Promise<(f: { empresa_key: string; pedido_referencia?: string | null }) => { pedidoBultos?: number; pedidoPreparadoPor?: string | null }> {
  const idDe = pedidoDeReferencia;
  const ids = [...new Set(filas.map((f) => idDe(f.pedido_referencia)).filter((n): n is number => n != null))];
  const porClave = new Map<string, { bultos: number; preparado_por: string | null }>();
  if (ids.length > 0) {
    const { data, error } = await supabaseServer
      .from("pedidos_bodega_estado")
      .select("empresa_key, pedido_switch_id, bultos, preparado_por")
      .in("empresa_key", [...new Set(filas.map((f) => f.empresa_key))])
      .in("pedido_switch_id", ids)
      .in("estado", ["preparado", "recibido"]);
    if (error) console.error("[guias/facturas-cliente] bultos del pedido:", error.message);
    for (const r of (data ?? []) as Array<{ empresa_key: string; pedido_switch_id: number; bultos: number; preparado_por: string | null }>) {
      if (r.bultos != null) porClave.set(`${r.empresa_key}|${r.pedido_switch_id}`, r);
    }
  }
  return (f) => {
    const r = porClave.get(`${f.empresa_key}|${idDe(f.pedido_referencia)}`);
    return r ? { pedidoBultos: r.bultos, pedidoPreparadoPor: r.preparado_por } : {};
  };
}
