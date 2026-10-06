/**
 * Guías › «Pedidos» (5-oct-2026, `PEDIDOS_BODEGA_2026_10`).
 *
 *   GET   → { pedidos: PedidoBodega[], actualizado: string | null }
 *   PATCH → { empresa_key, pedido_switch_id, estado } → { ok, cambiado_por, cambiado_en }
 *
 * Ven los de `PEDIDOS_VER_ROLES`; marcan solo admin y bodega. Sin montos:
 * la pantalla la ve bodega, así que `total` no sale de aquí. Lee `switch_pedidos` (lo escribe el cron de madrugada)
 * y escribe SOLO `pedidos_bodega_estado`. 🔴 No abre Switch: la ruta no saca
 * a nadie del panel. El quién sale de la cookie FIRMADA, nunca del cuerpo.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { supabaseServer } from "@/lib/supabase-server";
import {
  PEDIDOS_BODEGA_2026_10,
  PEDIDOS_BODEGA_ROLES,
  PEDIDOS_VER_ROLES,
  esEstadoPedido,
  ordenarPedidos,
  type EstadoPedido,
  type PedidoBodega,
} from "@/lib/guias/pedidos-bodega";
import {
  PEDIDOS_BULTOS_2026_10,
  empresasQueVe,
  estadoLeido,
  esEstadoBultos,
  puedeMover,
  ROLES_PREPARADO,
  type EstadoBultos,
} from "@/lib/guias/pedidos-bultos";
import { crearEnvioDelPedido } from "@/lib/guias/pedido-detalle-server";
import { B2B_EMPRESA_KEYS } from "@/lib/empresa-mapping";
import { aplicarAlias } from "@/lib/comisiones/alias";
import { leerAliasOVacio } from "@/lib/comisiones/exclusiones-server";

export const dynamic = "force-dynamic";

const apagado = () => NextResponse.json({ error: "No disponible" }, { status: 404 });

export async function GET(req: NextRequest) {
  if (!PEDIDOS_BODEGA_2026_10) return apagado();
  // VER: los de Guías (con v2); MARCAR (PATCH): solo admin y bodega.
  const auth = requireRole(req, [...PEDIDOS_VER_ROLES]);
  if (auth instanceof NextResponse) return auth;

  // 🔴 El RECORTE POR EMPRESA lo decide el SERVIDOR (6-oct-2026): Julio no ve
  // Vistana y Rodrigo/Jorman solo ven Vistana, pidan lo que pidan. Es duro,
  // como el de Boston. Admin y los no listados siguen viendo las 6.
  const empresas = PEDIDOS_BULTOS_2026_10 ? empresasQueVe(auth.userName, auth.role) : B2B_EMPRESA_KEYS;

  // ponytail: sin paginar; los Activo medidos el 5-oct son decenas, no miles.
  // El alias de Comisiones (REINALDO/REYNALDO/REINDALDO → una persona); falla abierto.
  const [ped, est, alias] = await Promise.all([
    supabaseServer
      .from("switch_pedidos")
      .select("empresa_key, pedido_switch_id, secuencial, fecha, cliente_codigo, cliente_nombre, vendedor_nombre, synced_at")
      .in("empresa_key", [...empresas])
      .order("fecha")
      .limit(1000),
    supabaseServer
      .from("pedidos_bodega_estado")
      .select("empresa_key, pedido_switch_id, estado, cambiado_por, cambiado_en, preparado_por, preparado_en, verificado_por, verificado_en")
      .limit(5000),
    leerAliasOVacio(),
  ]);
  if (ped.error) return NextResponse.json({ error: "No se pudieron leer los pedidos" }, { status: 500 });
  if (est.error) return NextResponse.json({ error: "No se pudo leer el estado de bodega" }, { status: 500 });

  const marca = new Map((est.data ?? []).map((e) => [`${e.empresa_key}:${e.pedido_switch_id}`, e]));
  let actualizado: string | null = null;
  const pedidos: PedidoBodega[] = (ped.data ?? []).map((p) => {
    if (!actualizado || p.synced_at > actualizado) actualizado = p.synced_at;
    const m = marca.get(`${p.empresa_key}:${p.pedido_switch_id}`);
    return {
      empresa_key: p.empresa_key,
      pedido_switch_id: p.pedido_switch_id,
      secuencial: p.secuencial,
      fecha: p.fecha,
      cliente_codigo: p.cliente_codigo,
      cliente_nombre: p.cliente_nombre,
      vendedor_nombre: p.vendedor_nombre ? aplicarAlias(p.vendedor_nombre, alias) : null,
      // Con bultos son TRES estados y «preparado» se LEE como «terminado»
      // (falla abierta mientras la migración no corra).
      estado: PEDIDOS_BULTOS_2026_10
        ? estadoLeido(m?.estado)
        : m && esEstadoPedido(m.estado)
          ? m.estado
          : "pendiente",
      cambiado_por: m?.cambiado_por ?? null,
      cambiado_en: m?.cambiado_en ?? null,
      // 🔴 Las DOS firmas, una por paso: «Preparado por Julio · 10:42 a. m.».
      // Sin la migración no llegan y la pantalla simplemente no las dibuja.
      preparado_por: m?.preparado_por ?? null,
      preparado_en: m?.preparado_en ?? null,
      verificado_por: m?.verificado_por ?? null,
      verificado_en: m?.verificado_en ?? null,
    };
  });
  return NextResponse.json({
    pedidos: ordenarPedidos(pedidos),
    actualizado,
    ...(PEDIDOS_BULTOS_2026_10 ? { empresas } : {}),
  });
}

export async function PATCH(req: NextRequest) {
  if (!PEDIDOS_BODEGA_2026_10) return apagado();
  // Con bultos, quién puede marcar QUÉ lo decide `puedeMover` abajo (que mira el
  // estado destino, quién terminó el pedido y de qué empresa es): aquí solo se
  // exige estar en la lista más ANCHA de las dos, que es la de «Preparado».
  const auth = requireRole(req, [...(PEDIDOS_BULTOS_2026_10 ? ROLES_PREPARADO : PEDIDOS_BODEGA_ROLES)]);
  if (auth instanceof NextResponse) return auth;

  // El CHECK de la tabla exige la firma; una inventada es peor que ninguna.
  const quienFirma = auth.userName || auth.userId;
  if (!quienFirma) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const empresa = String(body?.empresa_key ?? "");
  const id = Number(body?.pedido_switch_id);
  const estado = body?.estado;
  const valido = PEDIDOS_BULTOS_2026_10 ? esEstadoBultos(estado) : esEstadoPedido(estado);
  if (!(B2B_EMPRESA_KEYS as readonly string[]).includes(empresa) || !Number.isInteger(id) || !valido) {
    return NextResponse.json({ error: "Datos incompletos" }, { status: 400 });
  }

  let envio: { envio_id: string; bultos: number } | null = null;
  let avisoEnvio: string | null = null;

  if (PEDIDOS_BULTOS_2026_10) {
    // 🔴 El pedido tiene que existir Y ser de una empresa de esta persona: si no,
    // 404 (no se confirma que exista), como `/api/clientes/[codigo]`.
    const { data: pedido } = await supabaseServer
      .from("switch_pedidos")
      .select("empresa_key, pedido_switch_id, secuencial, cliente_codigo, cliente_nombre")
      .eq("empresa_key", empresa)
      .eq("pedido_switch_id", id)
      .maybeSingle();
    if (!pedido || !empresasQueVe(auth.userName, auth.role).includes(empresa)) {
      return NextResponse.json({ error: "Ese pedido no existe" }, { status: 404 });
    }

    // 🔑 `cambiado_por` del estado «terminado» ES quien lo terminó: de ahí sale
    // la regla «quien marcó Terminado solo marca Recibido si es admin».
    const { data: previo } = await supabaseServer
      .from("pedidos_bodega_estado")
      .select("estado, cambiado_por, envio_id, preparado_por, preparado_en")
      .eq("empresa_key", empresa)
      .eq("pedido_switch_id", id)
      .maybeSingle();
    const desde = estadoLeido(previo?.estado);
    // Quien lo preparó sale de SU columna; antes de la migración cae a la vieja
    // `cambiado_por`, que con el pedido en «preparado» es la misma persona.
    const preparadoPor = previo?.preparado_por ?? (desde === "preparado" ? (previo?.cambiado_por ?? null) : null);

    const v = puedeMover(
      { desde, hasta: estado as EstadoBultos, empresa_key: empresa, preparado_por: preparadoPor },
      { role: auth.role, userName: auth.userName },
    );
    if (!v.ok) return NextResponse.json({ error: v.error }, { status: 403 });

    // Regla 6: al VERIFICAR nace el envío de Etiquetas, con el cliente, los
    // bultos y el contenido ya puestos. 🔴 FALLA ABIERTA: si no se puede crear,
    // «Verificado» se marca igual y se dice por qué. Y no se crea dos veces.
    if (estado === "verificado" && !previo?.envio_id) {
      try {
        const r = await crearEnvioDelPedido(pedido, quienFirma);
        if (r.ok) envio = { envio_id: r.envio_id, bultos: r.bultos };
        else avisoEnvio = r.motivo;
      } catch {
        avisoEnvio = "No se pudo crear el envío de Etiquetas";
      }
    }
  }

  const ahora = new Date().toISOString();
  // 🔴 Cada paso firma SU columna, y al deshacer un paso se borra su firma: un
  // pedido que volvió a «Pendiente» no puede seguir diciendo quién lo terminó.
  const firma = PEDIDOS_BULTOS_2026_10
    ? estado === "preparado"
      ? { preparado_por: quienFirma, preparado_en: ahora, verificado_por: null, verificado_en: null }
      : estado === "verificado"
        ? { verificado_por: quienFirma, verificado_en: ahora }
        : { preparado_por: null, preparado_en: null, verificado_por: null, verificado_en: null }
    : {};
  const fila = {
    empresa_key: empresa,
    pedido_switch_id: id,
    estado,
    cambiado_por: quienFirma,
    cambiado_en: ahora,
    ...firma,
    ...(envio ? { envio_id: envio.envio_id } : {}),
  };
  const { error } = await supabaseServer.from("pedidos_bodega_estado").upsert(fila, { onConflict: "empresa_key,pedido_switch_id" });
  if (error) return NextResponse.json({ error: "No se pudo guardar el estado" }, { status: 500 });
  return NextResponse.json({
    ok: true,
    cambiado_por: fila.cambiado_por,
    cambiado_en: fila.cambiado_en,
    ...(envio ? { envio } : {}),
    ...(avisoEnvio ? { avisoEnvio } : {}),
  });
}
