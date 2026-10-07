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
import {
  crearEnvioDelPedido,
  deshacerEnvioDelPedido,
  faltaParaVerificarPedido,
  leerAsignacion,
} from "@/lib/guias/pedido-detalle-server";
import { B2B_EMPRESA_KEYS } from "@/lib/empresa-mapping";
import { aplicarAlias } from "@/lib/comisiones/alias";
import { leerAliasOVacio } from "@/lib/comisiones/exclusiones-server";

export const dynamic = "force-dynamic";

const apagado = () => NextResponse.json({ error: "No disponible" }, { status: 404 });

/** Lo que marcó bodega, con las dos firmas si la migración ya corrió. */
interface EstadoDeBodega {
  empresa_key: string;
  pedido_switch_id: number;
  estado: string | null;
  cambiado_por: string | null;
  cambiado_en: string | null;
  envio_id?: string | null;
  preparado_por?: string | null;
  preparado_en?: string | null;
  verificado_por?: string | null;
  verificado_en?: string | null;
}

const COLUMNAS_BASE = "empresa_key, pedido_switch_id, estado, cambiado_por, cambiado_en, envio_id";
const COLUMNAS_CON_FIRMAS = `${COLUMNAS_BASE}, preparado_por, preparado_en, verificado_por, verificado_en`;

/**
 * 🔴 FALLA ABIERTA SOBRE LAS COLUMNAS NUEVAS. 🩸 Pedirlas a secas devolvía un
 * **500** y la pantalla entera se caía al aviso rojo mientras la migración
 * `20261231120000` no estuviera aplicada —que es justo el estado de producción
 * hoy—. Se piden; si no están, se vuelve a pedir sin ellas y las firmas
 * simplemente no se dibujan.
 */
async function leerEstadoPrevio(empresa: string, id: number): Promise<EstadoDeBodega | null> {
  const pedir = (cols: string) =>
    supabaseServer
      .from("pedidos_bodega_estado")
      .select(cols)
      .eq("empresa_key", empresa)
      .eq("pedido_switch_id", id)
      .maybeSingle();
  if (PEDIDOS_BULTOS_2026_10) {
    const con = await pedir(COLUMNAS_CON_FIRMAS);
    if (!con.error) return con.data as unknown as EstadoDeBodega;
  }
  // Falla ABIERTA igual que la lista: sin las columnas nuevas, se lee lo de siempre.
  const sin = await pedir(COLUMNAS_BASE);
  return (sin.data as unknown as EstadoDeBodega | null) ?? null;
}

async function leerEstadoDeBodega(): Promise<{ data: EstadoDeBodega[] | null; error: unknown }> {
  if (PEDIDOS_BULTOS_2026_10) {
    const con = await supabaseServer.from("pedidos_bodega_estado").select(COLUMNAS_CON_FIRMAS).limit(5000);
    if (!con.error) return { data: con.data as unknown as EstadoDeBodega[], error: null };
  }
  const sin = await supabaseServer.from("pedidos_bodega_estado").select(COLUMNAS_BASE).limit(5000);
  return { data: sin.data as unknown as EstadoDeBodega[] | null, error: sin.error };
}

/**
 * 🔴 CUÁNTOS BULTOS LLEVA CADA PEDIDO, para la columna que quedó libre al bajar
 * el vendedor debajo del cliente (Daniel, 6-oct-2026). Se cuentan los números
 * de bulto DISTINTOS, que es lo que se carga al camión: 56 líneas pueden ser
 * 416 bultos (medido).
 *
 * FALLA ABIERTA: `pedidos_linea_bulto` es una tabla nueva, así que si la
 * migración no corrió esto devuelve un mapa vacío y la columna dice «—». La
 * lista nunca se cae por una tabla que todavía no existe.
 */
async function leerCuentaDeBultos(empresas: string[]): Promise<Map<string, number>> {
  const cuenta = new Map<string, Set<number>>();
  if (!PEDIDOS_BULTOS_2026_10) return new Map();
  const { data, error } = await supabaseServer
    .from("pedidos_linea_bulto")
    .select("empresa_key, pedido_switch_id, bulto")
    .in("empresa_key", empresas)
    .limit(50000);
  if (error || !data) return new Map();
  for (const f of data) {
    const k = `${f.empresa_key}:${f.pedido_switch_id}`;
    (cuenta.get(k) ?? cuenta.set(k, new Set()).get(k)!).add(Number(f.bulto));
  }
  return new Map([...cuenta].map(([k, v]) => [k, v.size]));
}

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
  const [ped, est, alias, bultos, asignacion] = await Promise.all([
    supabaseServer
      .from("switch_pedidos")
      .select("empresa_key, pedido_switch_id, secuencial, fecha, cliente_codigo, cliente_nombre, vendedor_nombre, synced_at")
      .in("empresa_key", [...empresas])
      .order("fecha")
      .limit(1000),
    leerEstadoDeBodega(),
    leerAliasOVacio(),
    leerCuentaDeBultos([...empresas]),
    // 🔴 Lo que apaga «Verificar»: cuántos artículos siguen sin bulto
    // (7-oct-2026). Falla ABIERTA: sin tabla, mapa vacío y no se apaga nada.
    PEDIDOS_BULTOS_2026_10 ? leerAsignacion([...empresas]) : Promise.resolve(new Map()),
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
      bultos: bultos.get(`${p.empresa_key}:${p.pedido_switch_id}`) ?? null,
      // 🔴 `null` = todavía no se sabe; la pantalla entonces no apaga «Verificar».
      articulos: asignacion.get(`${p.empresa_key}:${p.pedido_switch_id}`)?.articulos ?? null,
      sin_bulto: asignacion.get(`${p.empresa_key}:${p.pedido_switch_id}`)?.sinBulto ?? null,
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
  // El estado previo y de dónde viene el pedido: los lee el bloque de abajo y
  // los necesita la FIRMA, que tiene que conservar la de quien lo preparó.
  let previo: EstadoDeBodega | null = null;
  let desde: EstadoBultos = "pendiente";
  // Deshacer un paso borra el envío que había: si no, queda huérfano.
  let deshacerElEnvio = false;

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
    previo = await leerEstadoPrevio(empresa, id);
    desde = estadoLeido(previo?.estado);
    // Quien lo preparó sale de SU columna; antes de la migración cae a la vieja
    // `cambiado_por`, que con el pedido en «preparado» es la misma persona.
    const preparadoPor = previo?.preparado_por ?? (desde === "preparado" ? (previo?.cambiado_por ?? null) : null);

    const v = puedeMover(
      { desde, hasta: estado as EstadoBultos, empresa_key: empresa, preparado_por: preparadoPor },
      { role: auth.role, userName: auth.userName },
    );
    if (!v.ok) return NextResponse.json({ error: v.error }, { status: 403 });

    // 🔴 «VERIFICAR» ESTÁ BLOQUEADO MIENTRAS QUEDE UNA LÍNEA SIN BULTO
    // (Daniel, 7-oct-2026). 🩸 Antes solo avisaba: el envío de Etiquetas no se
    // creaba, pero el pedido quedaba «Verificado» igual. Ahora el toque se
    // rechaza y dice cuántos artículos faltan.
    if (estado === "verificado") {
      const falta = await faltaParaVerificarPedido(empresa, id);
      if (falta) return NextResponse.json({ error: falta }, { status: 409 });
    }

    // 🔴 VOLVER A «PREPARADO» DESHACE EL ENVÍO QUE NACIÓ AL VERIFICAR, para que
    // no quede huérfano con el conteo viejo (Daniel, 7-oct-2026). Si no se
    // puede anular —ya salió en una guía—, NO se mueve el estado y se DICE.
    if (desde === "verificado" && previo?.envio_id) {
      try {
        const r = await deshacerEnvioDelPedido(previo.envio_id, quienFirma);
        if (!r.ok) return NextResponse.json({ error: r.error }, { status: 409 });
        deshacerElEnvio = true;
      } catch {
        return NextResponse.json({ error: "No se pudo deshacer el envío de Etiquetas" }, { status: 503 });
      }
    }

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
  //
  // 🔴 PERO «VOLVER A PREPARADO» CONSERVA LA FIRMA ORIGINAL DE QUIEN PREPARÓ
  // (Daniel, 7-oct-2026). 🩸 Antes el servidor la pisaba con la de quien
  // deshacía, y entonces la secretaria que devolvía el pedido quedaba como su
  // preparadora — con lo que podía verificarlo ella misma y los dos pares de
  // ojos dejaban de existir. Volver atrás solo borra la firma del paso que se
  // deshace.
  const firma = PEDIDOS_BULTOS_2026_10
    ? estado === "preparado"
      ? desde === "verificado"
        ? {
            preparado_por: previo?.preparado_por ?? null,
            preparado_en: previo?.preparado_en ?? null,
            verificado_por: null,
            verificado_en: null,
          }
        : { preparado_por: quienFirma, preparado_en: ahora, verificado_por: null, verificado_en: null }
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
    // El envío nuevo se guarda; el que se acaba de anular se suelta, para que
    // verificar otra vez cree uno con los bultos de ese momento.
    ...(envio ? { envio_id: envio.envio_id } : deshacerElEnvio ? { envio_id: null } : {}),
  };
  const { error } = await supabaseServer.from("pedidos_bodega_estado").upsert(fila, { onConflict: "empresa_key,pedido_switch_id" });
  if (error) return NextResponse.json({ error: "No se pudo guardar el estado" }, { status: 500 });
  return NextResponse.json({
    ok: true,
    cambiado_por: fila.cambiado_por,
    cambiado_en: fila.cambiado_en,
    ...(envio ? { envio } : {}),
    ...(avisoEnvio ? { avisoEnvio } : {}),
    // 🔴 Deshacer el envío se DICE en pantalla, nunca en silencio (7-oct-2026).
    ...(deshacerElEnvio ? { envioAnulado: true } : {}),
  });
}
