import { useCallback } from "react";
import useSWR from "swr";
import { CARTERA_GRUPO } from "@/lib/cxc/cartera";
import { ultimoPagoPorCodigo } from "@/lib/cxc/sin-pagar";
import type { CxcRow, ConsolidatedClient } from "@/lib/types";

// Clave de caché SWR del módulo CXC. La caché vive a nivel de la app
// (SWRProvider) y persiste entre navegaciones → volver a CXC pinta al instante
// el dato cacheado y revalida en background (cero flash blanco), en vez del
// re-fetch desde cero que había con el fetch-on-mount.
const SWR_KEY = "cxc-admin-data";

interface AdminData {
  clients: ConsolidatedClient[];
  ts: number;
  /**
   * Código del cliente → fecha (`YYYY-MM-DD`) de su ÚLTIMO PAGO REAL en
   * CUALQUIERA de las 6 empresas del grupo. Alimenta el aviso «sin pagar hace
   * +90 d».
   *
   * 🔴 SALE DE LA MISMA LECTURA QUE YA SE HACÍA (`/api/cxc/ultimo-pago`, la
   * vista `switch_ultimo_pago_cliente_v2`): CERO peticiones nuevas. Esa vista
   * ya excluye retenciones y recibos en cero y la ruta acota a las empresas con
   * CXC, así que Boston no entra ni por asomo.
   *
   * ⚠️ Se arma con TODAS las filas que devuelve la ruta, no solo con las
   * empresas donde el cliente tiene deuda: el que terminó de pagarle a Vistana
   * la semana pasada NO puede salir como «no paga hace 300 días» porque su
   * saldo vivo esté en otra empresa.
   */
  ultimoPago: Record<string, string>;
  /**
   * Lo que el guard de montos dejó AFUERA de esta cartera, ya redactado por el
   * servidor y acotado a las 6 del grupo. `null` = no hay nada que decir.
   */
  avisoMontos: string | null;
}

/**
 * Trae y consolida todo el estado de CXC. Es la misma lógica que tenía el
 * loadData() de fetch-on-mount, ahora como fetcher puro de SWR: todas las
 * lecturas EN PARALELO; vendors/upload opcionales (.catch→null); aging NO se
 * atrapa (si la red falla, rechaza → SWR marca error y muestra la caché en
 * memoria si la hay).
 */
async function fetchAdminData(): Promise<AdminData> {
  // overrides/últimopago/contact-log: antes eran lecturas anon directas a Supabase;
  // ahora rutas server con service_role (RLS de esas tablas cerrada). No-críticas
  // (resuelven a [] si fallan); solo /api/cxc/aging puede rechazar → error.
  //
  // 🔴 La bitácora de contactos (`/api/cxc/contact-log`) ya NO se pide: nadie la
  // dibujaba. Llegaba hasta la tabla y la tarjeta del celular como prop y
  // ninguna de las dos la desestructuraba. Retirada el 14-ago-2026 junto con las
  // opciones "Ya contacté" del menú — una petición menos por carga del panel.
  //
  // 🔴 Y OTRAS DOS SE RETIRARON EL 24-ago-2026, por lo mismo: `/api/vendors` y
  // `/api/upload`. La primera llenaba el objeto global `VENDOR_MAP`, que NINGUNA
  // pantalla lee; la segunda armaba `uploads` (la frescura por carga de archivo),
  // que llegaba hasta `cxc/page.tsx`, se desestructuraba y no se usaba en una
  // sola línea — la frescura que SÍ se muestra sale de `refreshedAt` del aging y
  // del componente `SyncStatus`, que la pide por su cuenta.
  //
  // Eran 2 de 6 peticiones POR CADA apertura del CXC, contra una base en compute
  // Micro. Quedan 4, y una de ellas (el contacto en vivo dentro de `/api/cxc/aging`)
  // reemplaza a la que hacía falta de verdad.
  const [agingJson, overrides, pagos, compras] =
    await Promise.all([
      fetch("/api/cxc/aging", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)),
      fetch(`/api/cxc/overrides?cartera=${CARTERA_GRUPO}`, { cache: "no-store" }).then((r) => (r.ok ? r.json() : [])).catch(() => []),
      fetch("/api/cxc/ultimo-pago", { cache: "no-store" }).then((r) => (r.ok ? r.json() : [])).catch(() => []),
      fetch("/api/cxc/ultima-compra", { cache: "no-store" }).then((r) => (r.ok ? r.json() : [])).catch(() => []),
    ]);

  const rows = (agingJson?.rows ?? null) as CxcRow[] | null;

  const overrideMap: Record<string, { correo: string; telefono: string; celular: string; contacto: string; resultado_contacto?: string; proximo_seguimiento?: string }> = {};
  if (Array.isArray(overrides)) {
    for (const o of overrides) overrideMap[o.nombre_normalized] = o;
  }

  // Último pago por empresa+cliente (vista switch_ultimo_pago_cliente_v2,
  // lee de switch_recibos). Join por (empresa_key, cliente_codigo).
  const pagoMap = new Map<string, { fecha: string; monto: number }>();
  if (Array.isArray(pagos)) {
    for (const p of pagos) {
      if (!p.cliente_codigo) continue;
      pagoMap.set(`${p.empresa_key}|${p.cliente_codigo}`, {
        fecha: p.ultimo_pago_fecha,
        monto: Number(p.ultimo_pago_monto) || 0,
      });
    }
  }

  // Última compra por empresa+cliente (vista switch_ultima_compra_cliente_v1,
  // la última Factura de switch_facturas). Mismo join y misma forma que el
  // último pago. Si la DDL todavía no corrió, la ruta devuelve [] y el mapa
  // queda vacío: cada empresa muestra "Sin compras registradas" y no cambia
  // NADA más de la pantalla.
  const compraMap = new Map<string, { fecha: string; monto: number }>();
  if (Array.isArray(compras)) {
    for (const c of compras) {
      if (!c.cliente_codigo) continue;
      compraMap.set(`${c.empresa_key}|${c.cliente_codigo}`, {
        fecha: c.ultima_compra_fecha,
        monto: Number(c.ultima_compra_monto) || 0,
      });
    }
  }

  const map = new Map<string, ConsolidatedClient>();
  if (rows) {
    for (const r of rows as CxcRow[]) {
      const key = r.nombre_normalized;
      if (!key) continue;

      let client = map.get(key);
      if (!client) {
        const ovr = overrideMap[key];
        client = {
          nombre_normalized: key,
          companies: {},
          correo: ovr?.correo || r.correo || "",
          telefono: ovr?.telefono || r.telefono || "",
          celular: ovr?.celular || r.celular || "",
          contacto: ovr?.contacto || r.contacto || "",
          resultado_contacto: ovr?.resultado_contacto || "",
          total: 0, current: 0, watch: 0, overdue: 0,
          d0_30: 0, d31_60: 0, d61_90: 0, d91_120: 0, d121_plus: 0,
          hasOverride: !!ovr,
        };
        map.set(key, client);
      }

      const existing = client.companies[r.company_key];
      if (existing) {
        existing.d0_30 += r.d0_30; existing.d31_60 += r.d31_60; existing.d61_90 += r.d61_90;
        existing.d91_120 += r.d91_120; existing.d121_180 += r.d121_180;
        existing.d181_270 += r.d181_270; existing.d271_365 += r.d271_365;
        existing.mas_365 += r.mas_365; existing.total += r.total;
      } else {
        const pago = pagoMap.get(`${r.company_key}|${r.codigo}`);
        const compra = compraMap.get(`${r.company_key}|${r.codigo}`);
        client.companies[r.company_key] = {
          nombre: r.nombre, codigo: r.codigo,
          d0_30: r.d0_30, d31_60: r.d31_60, d61_90: r.d61_90,
          d91_120: r.d91_120, d121_180: r.d121_180,
          d181_270: r.d181_270, d271_365: r.d271_365,
          mas_365: r.mas_365, total: r.total,
          ultimoPagoFecha: pago?.fecha ?? null,
          ultimoPagoMonto: pago?.monto ?? null,
          ultimaCompraFecha: compra?.fecha ?? null,
          ultimaCompraMonto: compra?.monto ?? null,
        };
      }

      if (!client.correo && r.correo) client.correo = r.correo;
      if (!client.telefono && r.telefono) client.telefono = r.telefono;
      if (!client.celular && r.celular) client.celular = r.celular;
      if (!client.contacto && r.contacto) client.contacto = r.contacto;
    }
  }

  for (const client of map.values()) {
    let total = 0, current = 0, watch = 0, overdue = 0;
    let gd0 = 0, gd1 = 0, gd2 = 0, gd3 = 0, gd4 = 0;
    for (const co of Object.values(client.companies)) {
      total += co.total;
      current += co.d0_30 + co.d31_60 + co.d61_90;
      watch += co.d91_120;
      overdue += co.d121_180 + co.d181_270 + co.d271_365 + co.mas_365;
      gd0 += co.d0_30; gd1 += co.d31_60; gd2 += co.d61_90;
      gd3 += co.d91_120; gd4 += co.d121_180 + co.d181_270 + co.d271_365 + co.mas_365;
    }
    client.total = total; client.current = current;
    client.watch = watch; client.overdue = overdue;
    client.d0_30 = gd0; client.d31_60 = gd1; client.d61_90 = gd2;
    client.d91_120 = gd3; client.d121_plus = gd4;
  }

  const clientsArr = Array.from(map.values()).filter((c) => c.total !== 0);

  // Frescura = cuándo se MATERIALIZÓ la MV del aging (no la hora del request). El
  // endpoint /api/cxc/aging devuelve refreshedAt (materializado_en de
  // switch_estadocuenta_aging_mv); si cayó al fallback de la view en vivo (sin MV
  // todavía), refreshedAt es null → Date.now().
  // Código → última fecha de pago, mirando las 6 empresas juntas.
  const ultimoPago = Object.fromEntries(
    ultimoPagoPorCodigo(
      (Array.isArray(pagos) ? pagos : []).map((p) => ({
        codigo: (p as { cliente_codigo?: string | null }).cliente_codigo,
        fecha: (p as { ultimo_pago_fecha?: string | null }).ultimo_pago_fecha,
      })),
    ),
  );

  const refreshTs = agingJson?.refreshedAt
    ? new Date(agingJson.refreshedAt as string).getTime()
    : Date.now();

  return {
    clients: clientsArr,
    ts: refreshTs,
    ultimoPago,
    avisoMontos: (agingJson?.avisoMontos as string | null | undefined) ?? null,
  };
}

/**
 * @param authReady cuando es false, SWR NO dispara el fetch (clave null). Así se
 * preserva el gate de sesión: no se pega a /api/cxc/aging antes de confirmar rol.
 */
export default function useAdminData(authReady: boolean = true) {
  const { data, error, isLoading, mutate } = useSWR<AdminData>(
    authReady ? SWR_KEY : null,
    fetchAdminData,
    {
      // CXC cambia poco entre saltos pero importa al cobrar: dedupe 60s (evita
      // refetch redundante en re-navegaciones rápidas), revalida al volver a la
      // pestaña.
      dedupingInterval: 60_000,
      revalidateOnFocus: true,
    },
  );

  // loadData → revalidación forzada (mutate). Lo usan PullToRefresh, Reintentar,
  // y las acciones de escritura (edición de contacto, marcar contactado) para
  // invalidar tras escribir y ver el saldo/estado al toque.
  const loadData = useCallback(async () => { await mutate(); }, [mutate]);

  const hasData = (data?.clients?.length ?? 0) > 0;

  return {
    clients: data?.clients ?? [],
    ultimoPago: data?.ultimoPago ?? {},
    // Solo "cargando" cuando no hay nada que mostrar todavía (primer arranque).
    // Al volver, data ya está en la caché SWR en memoria → sin spinner.
    loading: isLoading && !data,
    // Mostrar error solo si NO hay dato utilizable; si hay caché SWR se
    // muestra eso (stale) en vez de un error en blanco.
    loadError: error && !hasData ? "Error al cargar datos. Intenta de nuevo." : null,
    loadData,
    dataTs: data?.ts ?? null,
    avisoMontos: data?.avisoMontos ?? null,
    // Mostrando la caché en memoria (dato viejo) porque el refetch falló.
    fromCache: !!error && hasData,
  };
}
