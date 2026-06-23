import { useCallback, useEffect, useState } from "react";
import useSWR from "swr";
import { supabase } from "@/lib/supabase";
import { VENDOR_MAP } from "@/lib/vendors";
import type { VendorMap } from "@/lib/vendors";
import type { CxcRow, CxcUpload, ConsolidatedClient } from "@/lib/types";
import { persistentCacheSet, persistentCacheGet, CACHE_KEYS } from "@/lib/offlineCache";

// Clave de caché SWR del módulo CXC. La caché vive a nivel de la app
// (SWRProvider) y persiste entre navegaciones → volver a CXC pinta al instante
// el dato cacheado y revalida en background (cero flash blanco), en vez del
// re-fetch desde cero que había con el fetch-on-mount.
const SWR_KEY = "cxc-admin-data";

interface ContactEntry { date: string; method: string }

interface AdminData {
  clients: ConsolidatedClient[];
  uploads: Record<string, CxcUpload>;
  contactLog: Record<string, ContactEntry>;
  ts: number;
}

/**
 * Trae y consolida todo el estado de CXC. Es la misma lógica que tenía el
 * loadData() de fetch-on-mount, ahora como fetcher puro de SWR: todas las
 * lecturas EN PARALELO; vendors/upload opcionales (.catch→null); aging NO se
 * atrapa (si la red falla, rechaza → SWR marca error y caemos al snapshot).
 */
async function fetchAdminData(): Promise<AdminData> {
  const [vendorRows, upRows, agingJson, overridesRes, pagosRes, logRes] =
    await Promise.all([
      fetch("/api/vendors").then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch("/api/upload", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch("/api/cxc/aging", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)),
      supabase.from("cxc_client_overrides").select("*"),
      supabase.from("switch_ultimo_pago_cliente_v2").select("*"),
      supabase
        .from("cxc_contact_log")
        .select("*")
        .order("contacted_at", { ascending: false })
        .limit(2000),
    ]);

  // Vendor map (global VENDOR_MAP) — opcional.
  if (Array.isArray(vendorRows)) {
    const vendorMapData: VendorMap = {};
    for (const row of vendorRows) {
      if (!vendorMapData[row.company_key]) vendorMapData[row.company_key] = {};
      vendorMapData[row.company_key][row.client_name] = row.vendor_name;
    }
    Object.keys(VENDOR_MAP).forEach((k) => delete VENDOR_MAP[k]);
    Object.assign(VENDOR_MAP, vendorMapData);
  }

  // Frescura por empresa (UploadFreshness usa uploaded_at).
  const latestUploads: Record<string, CxcUpload> = {};
  if (Array.isArray(upRows)) {
    for (const u of upRows as { company_key: string; uploaded_at: string }[]) {
      if (!latestUploads[u.company_key]) latestUploads[u.company_key] = u as CxcUpload;
    }
  }

  const rows = (agingJson?.rows ?? null) as CxcRow[] | null;

  const overrideMap: Record<string, { correo: string; telefono: string; celular: string; contacto: string; resultado_contacto?: string; proximo_seguimiento?: string }> = {};
  if (overridesRes.data) {
    for (const o of overridesRes.data) overrideMap[o.nombre_normalized] = o;
  }

  // Último pago por empresa+cliente (vista switch_ultimo_pago_cliente_v2,
  // lee de switch_recibos). Join por (empresa_key, cliente_codigo).
  const pagoMap = new Map<string, { fecha: string; monto: number }>();
  if (pagosRes.data) {
    for (const p of pagosRes.data) {
      if (!p.cliente_codigo) continue;
      pagoMap.set(`${p.empresa_key}|${p.cliente_codigo}`, {
        fecha: p.ultimo_pago_fecha,
        monto: Number(p.ultimo_pago_monto) || 0,
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
        client.companies[r.company_key] = {
          nombre: r.nombre, codigo: r.codigo,
          d0_30: r.d0_30, d31_60: r.d31_60, d61_90: r.d61_90,
          d91_120: r.d91_120, d121_180: r.d121_180,
          d181_270: r.d181_270, d271_365: r.d271_365,
          mas_365: r.mas_365, total: r.total,
          ultimoPagoFecha: pago?.fecha ?? null,
          ultimoPagoMonto: pago?.monto ?? null,
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

  // Último contacto por cliente (cxc_contact_log, ya leído arriba en paralelo).
  const latestLog: Record<string, ContactEntry> = {};
  if (logRes.data) {
    for (const l of logRes.data) {
      if (!latestLog[l.nombre_normalized]) {
        latestLog[l.nombre_normalized] = { date: l.contacted_at, method: l.method };
      }
    }
  }

  // Frescura = cuándo se MATERIALIZÓ la MV del aging (no la hora del request). El
  // endpoint /api/cxc/aging devuelve refreshedAt (materializado_en de
  // switch_estadocuenta_aging_mv); si cayó al fallback de la view en vivo (sin MV
  // todavía), refreshedAt es null → Date.now().
  const refreshTs = agingJson?.refreshedAt
    ? new Date(agingJson.refreshedAt as string).getTime()
    : Date.now();

  return { clients: clientsArr, uploads: latestUploads, contactLog: latestLog, ts: refreshTs };
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
      // pestaña, y snapshot persistente fresco en cada éxito (Modo viaje).
      dedupingInterval: 60_000,
      revalidateOnFocus: true,
      onSuccess: (d) => persistentCacheSet(CACHE_KEYS.CXC_AGING, d.clients),
    },
  );

  // Siembra instantánea desde el snapshot persistente (Modo viaje) SIN
  // revalidar, para el arranque en frío (primera carga / reload). Se lee TRAS
  // montar (no en render) para no romper SSR/hidratación. En navegaciones de
  // vuelta no hace falta: la caché SWR en memoria ya tiene el dato.
  useEffect(() => {
    if (!authReady || data) return;
    const snap = persistentCacheGet<ConsolidatedClient[]>(CACHE_KEYS.CXC_AGING);
    if (snap) {
      mutate(
        { clients: snap.data, uploads: {}, contactLog: {}, ts: snap.ts },
        { revalidate: false },
      );
    }
  }, [authReady, data, mutate]);

  // contactLog como estado local para conservar la actualización OPTIMISTA del
  // page (setContactLog al marcar contactado). Se re-sincroniza cuando llega
  // data fresca de SWR (que ya incluye el contacto recién insertado).
  const [contactLog, setContactLog] = useState<Record<string, ContactEntry>>({});
  useEffect(() => {
    if (data?.contactLog) setContactLog(data.contactLog);
  }, [data]);

  // loadData → revalidación forzada (mutate). Lo usan PullToRefresh, Reintentar,
  // y las acciones de escritura (edición de contacto, marcar contactado) para
  // invalidar tras escribir y ver el saldo/estado al toque.
  const loadData = useCallback(async () => { await mutate(); }, [mutate]);

  const hasData = (data?.clients?.length ?? 0) > 0;

  return {
    clients: data?.clients ?? [],
    uploads: data?.uploads ?? {},
    contactLog,
    // Solo "cargando" cuando no hay nada que mostrar todavía (primer arranque
    // sin snapshot). Al volver, data ya está en caché → sin spinner.
    loading: isLoading && !data,
    // Mostrar error solo si NO hay dato utilizable; si hay snapshot/caché se
    // muestra eso (stale) en vez de un error en blanco.
    loadError: error && !hasData ? "Error al cargar datos. Intenta de nuevo." : null,
    loadData,
    setContactLog,
    dataTs: data?.ts ?? null,
    // Estamos mostrando caché/snapshot offline cuando hubo error pero hay dato.
    fromCache: !!error && hasData,
  };
}
