"use client";

// Pestaña "Confecciones Boston" del CXC — la cartera que se lleva APARTE.
//
// Lee /api/cxc/boston, que a su vez lee `switch_estadocuenta_aging_boston`. Esa
// vista y la del grupo son disjuntas por construcción, así que esta pantalla no
// puede sumar la plata de Boston con la del grupo ni por error: no tiene los
// datos del grupo a mano. Regla de Daniel: *"si un cliente esta en el grupo de 6
// empresas y mismo cliente en conf boston, quiero q no se toque"*.
//
// El filtro/orden de las píldoras NO se reimplementa: usa `lib/cxc-orden`, el
// mismo módulo del CXC del grupo (PR #346). Tocar un tramo filtra Y reordena por
// ese tramo. Los tramos de Boston (d0_90 / d91_120 / d121_plus) se mapean a los
// nombres del módulo (current / watch / overdue) — son los MISMOS cortes.

import { useCallback, useMemo, useState } from "react";
import useSWR from "swr";
import { fmt } from "@/lib/format";
import { CARTERA_BOSTON } from "@/lib/cxc/cartera";
import { AGING } from "@/lib/cxc-aging";
import AvisoRechazosSwitch from "@/components/AvisoRechazosSwitch";
import SyncStatus from "@/components/shared/SyncStatus";
import { EMPRESA_KEY_TO_NAME } from "@/lib/empresa-mapping";
import { empresasCarteraAparte } from "@/lib/switch-api/empresas";
import {
  ordenEfectivo,
  ordenAlTocarTitulo,
  siguienteRiskFilter,
  pasaFiltroRiesgo,
  compararClientes,
  type RiskFilter,
  type SortKey,
  type OrdenOverride,
} from "@/lib/cxc-orden";

interface ClienteBoston {
  codigo: string;
  nombre: string;
  nombre_normalized: string;
  d0_90: number;
  d91_120: number;
  d121_plus: number;
  total: number;
  ultimo_pago_fecha: string | null;
  ultimo_pago_monto: number | null;
  tambien_en_grupo: boolean;
}

interface Respuesta {
  clientes: ClienteBoston[];
  totales: { total: number; d0_90: number; d91_120: number; d121_plus: number; clientes: number };
  /** Lo que el guard dejó afuera de esos totales, ya redactado por el servidor. */
  avisoMontos?: string | null;
}

/** Shape que espera `cxc-orden`. Los tramos son los mismos, cambia el nombre. */
function ordenable(c: ClienteBoston) {
  return {
    nombre_normalized: c.nombre_normalized,
    current: c.d0_90,
    watch: c.d91_120,
    overdue: c.d121_plus,
    total: c.total,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// LA FECHA DEL DATO — la pestaña tiene que decir DE CUÁNDO son sus cifras.
//
// 🩸 Por qué se agregó (24-ago-2026). El 19-ago a las 12:37 Switch cambió el
// motor de sus reportes y la ruta que usaba `boston-cartera` dejó de existir, así
// que la cartera quedó congelada en el 19-ago. Durante cinco días la pantalla
// mostró sus cuatro cifras SIN decir de cuándo eran: se leían como las de hoy. Un
// número viejo presentado como actual es peor que no tener número.
//
// No es un aviso nuevo ni una alerta nueva: es el MISMO `<SyncStatus />` que el
// panel del grupo ya monta (`admin/page.tsx` y `PanelCxcMobile.tsx`), con la
// misma tabla, el mismo umbral y el mismo ámbar. Lo único que cambia es a qué
// empresa le pregunta.
//
// 🔴 Y NO MEZCLA: `empresasCarteraAparte()` es exactamente la lista de empresas
// con `estadoCuenta:true` y `cxc:false` — o sea SOLO Boston. Se DERIVA de
// `EMPRESA_SYNC_CAPABILITIES` en vez de escribirse a mano acá, que es la misma
// regla que ya cumple la vista `switch_estadocuenta_aging`: una lista paralela es
// la que un día se aparta en silencio. `/api/sync-status` consulta por empresa
// (`.eq("empresa_key", …)`), así que ni una fila del grupo entra a esta pestaña.
// ─────────────────────────────────────────────────────────────────────────────
const EMPRESAS_CARTERA_BOSTON = empresasCarteraAparte();

const fetcher = (u: string) => fetch(u, { cache: "no-store" }).then((r) => {
  if (!r.ok) throw new Error("No se pudo leer la cartera de Boston");
  return r.json();
});

/**
 * Las estrellas son un extra: si la lectura falla —incluido el 503 de
 * "todavía no está habilitado", mientras el DDL de `cartera` no haya
 * corrido— la pestaña se dibuja completa y sin estrellas, en vez de no
 * dibujarse. La PLATA nunca depende de esta lectura.
 */
const fetcherFavoritos = (u: string) =>
  fetch(u, { cache: "no-store" }).then((r) => (r.ok ? r.json() : { favorites: [] }));

/** La estrella, idéntica a la del panel del grupo (`ClientRow.tsx`). */
function Estrella({ marcada, onToggle, nombre }: { marcada: boolean; onToggle: () => void; nombre: string }) {
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onToggle(); }}
      aria-pressed={marcada}
      aria-label={marcada ? `Quitar ${nombre} de favoritos` : `Marcar ${nombre} como favorito`}
      className="shrink-0 text-sm leading-none p-2.5 -m-2.5"
    >
      {marcada ? <span className="text-amber-400">★</span> : <span className="text-gray-300">☆</span>}
    </button>
  );
}

function fechaCorta(iso: string | null) {
  if (!iso) return null;
  const d = new Date(iso + (iso.length === 10 ? "T12:00:00" : ""));
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("es-PA", { day: "numeric", month: "short", year: "numeric" });
}

/** Barrita de color de la fila: el tramo más viejo con deuda manda. */
function colorFila(c: ClienteBoston) {
  if (c.d121_plus > 0) return "bg-red-500";
  if (c.d91_120 > 0) return "bg-amber-500";
  return "bg-emerald-500";
}

export default function BostonTab() {
  const { data, error, isLoading } = useSWR<Respuesta>("/api/cxc/boston", fetcher, {
    revalidateOnFocus: false,
  });

  // ── Favoritos DE BOSTON ────────────────────────────────────────────────────
  // 🔴 La cartera viaja SIEMPRE, en la lectura y en la escritura. Sin ella,
  // `cxc_favorites` se ata solo a `nombre_normalized` y la estrella que se pone
  // acá aparecería también en el panel del grupo — hay 6 nombres que existen en
  // las dos carteras (CITY MALL PASO CANOA entre ellos). Daniel: *"es la misma
  // persona, pero no lo quiero ver en fashion group porque no tiene el mismo
  // codigo"*, y eligió SEPARAR: cada cartera con sus propias notas y estrellas.
  const { data: favData, mutate: mutarFavoritos } = useSWR<{ favorites: string[] }>(
    `/api/cxc/favorites?cartera=${CARTERA_BOSTON}`,
    fetcherFavoritos,
    { revalidateOnFocus: false },
  );
  const favoritos = useMemo(() => new Set(favData?.favorites ?? []), [favData]);

  const [avisoFavorito, setAvisoFavorito] = useState<string | null>(null);

  const alternarFavorito = useCallback(
    async (nombre: string) => {
      const optimista = new Set(favoritos);
      if (optimista.has(nombre)) optimista.delete(nombre);
      else optimista.add(nombre);
      // `revalidate: false` mientras el POST viaja; al volver se revalida contra
      // el servidor, así que un fallo NO deja la estrella mintiendo.
      mutarFavoritos({ favorites: [...optimista] }, { revalidate: false });
      try {
        const r = await fetch("/api/cxc/favorites", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ clientName: nombre, cartera: CARTERA_BOSTON }),
        });
        if (!r.ok) throw new Error(String(r.status));
      } catch {
        setAvisoFavorito("No se pudo guardar la estrella. Intenta de nuevo.");
        setTimeout(() => setAvisoFavorito(null), 4000);
      } finally {
        mutarFavoritos();
      }
    },
    [favoritos, mutarFavoritos],
  );
  const [search, setSearch] = useState("");
  const [riskFilter, setRiskFilter] = useState<RiskFilter>("all");
  const [ordenOverride, setOrdenOverride] = useState<OrdenOverride | null>(null);

  const orden = ordenEfectivo(riskFilter, ordenOverride);

  const filtrados = useMemo(() => {
    const todos = data?.clientes ?? [];
    const q = search.trim().toLowerCase();
    return todos
      .filter((c) => (riskFilter === "all" ? true : pasaFiltroRiesgo(ordenable(c), riskFilter)))
      .filter((c) => (q ? c.nombre.toLowerCase().includes(q) || c.codigo.toLowerCase().includes(q) : true))
      .sort((a, b) =>
        compararClientes(ordenable(a), ordenable(b), {
          orden,
          esFavorito: (n) => favoritos.has(n),
        }),
      );
  }, [data, search, riskFilter, orden, favoritos]);

  const t = data?.totales;
  const pills = [
    { key: "all" as RiskFilter, label: "Total pendiente", valor: t?.total ?? 0, n: t?.clientes ?? 0, dot: "", color: "text-gray-900" },
    { key: "current" as RiskFilter, label: AGING.current.colLabel, valor: t?.d0_90 ?? 0, n: null, dot: AGING.current.dot, color: AGING.current.text },
    { key: "watch" as RiskFilter, label: AGING.watch.colLabel, valor: t?.d91_120 ?? 0, n: null, dot: AGING.watch.dot, color: AGING.watch.text },
    { key: "overdue" as RiskFilter, label: AGING.overdue.colLabel, valor: t?.d121_plus ?? 0, n: null, dot: AGING.overdue.dot, color: AGING.overdue.text },
  ];

  function tocarPildora(k: RiskFilter) {
    setRiskFilter((actual) => siguienteRiskFilter(actual, k));
    setOrdenOverride(null);
  }
  function tocarTitulo(k: SortKey) {
    setOrdenOverride({ risk: riskFilter, ...ordenAlTocarTitulo(orden, k) });
  }
  const flecha = (k: SortKey) => (orden.key !== k ? " ↕" : orden.dir === "asc" ? " ↑" : " ↓");

  if (error) {
    return <p className="text-sm text-red-600 py-8">No se pudo cargar la cartera de Confecciones Boston.</p>;
  }

  return (
    <div>
      {/* De cuándo son las cifras de abajo. Va PRIMERO, igual que en el panel del
          grupo: lo primero que se lee antes de creerle a un número. */}
      <SyncStatus
        tabla="estadocuenta"
        empresasEsperadas={EMPRESAS_CARTERA_BOSTON}
        empresaLabels={EMPRESA_KEY_TO_NAME}
        className="mb-3"
      />

      {/* Qué se quedó AFUERA de los totales de abajo. Va pegado a la frescura
          —las dos contestan "¿le puedo creer a este número?"— y ARRIBA de las
          píldoras, para leerse antes de cobrar. Si no hay nada rechazado no se
          dibuja nada. */}
      <AvisoRechazosSwitch texto={data?.avisoMontos} className="mb-3" />

      <input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Buscar cliente..."
        aria-label="Buscar cliente de Confecciones Boston"
        className="w-full min-h-[44px] px-4 rounded-xl border border-gray-200 bg-white text-base mb-3
                   focus:outline-none focus:ring-2 focus:ring-gray-900/10"
      />

      {/* 4 píldoras, todas FILTRAN: 2+2 en iPhone, una sola línea desde iPad.
          🩸 Acá vivía una 5ª tarjeta, "Cobrado julio · $35,392.49 · 126", con el
          monto y la cuenta ESCRITOS A MANO en el código. No filtraba nada y no
          se podía calcular: los cobros de Boston no entran a este sistema
          (`recibos: false` en EMPRESA_SYNC_CAPABILITIES — su cartera va por
          Brand It, ver la nota de arriba de este archivo y cxc/CLAUDE.md). O
          sea que iba a decir "julio" para siempre, al lado de cuatro cifras que
          sí se actualizan solas: en octubre se leía como si fuera de octubre.
          Daniel aprobó quitarla. NO reponerla con otro mes escrito a mano ni
          encender el sync de recibos de Boston para "poder calcularla" — eso es
          una decisión de negocio, no un arreglo. */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
        {pills.map((p) => {
          const activa = riskFilter === p.key;
          return (
            <button
              key={p.key}
              type="button"
              onClick={() => tocarPildora(p.key)}
              aria-pressed={activa}
              className={`min-h-[44px] text-left px-3 py-2 rounded-xl border bg-white transition
                          ${activa ? "border-gray-900 ring-1 ring-gray-900" : "border-gray-200 hover:border-gray-300"}`}
            >
              <span className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-gray-500">
                {p.dot && <span className={`w-1.5 h-1.5 rounded-full ${p.dot}`} />}
                {p.label}
              </span>
              <span className={`block text-base sm:text-lg font-semibold tabular-nums ${p.color}`}>
                ${fmt(p.valor)}
                {p.n != null && <span className="text-xs font-normal text-gray-400"> · {p.n}</span>}
              </span>
            </button>
          );
        })}
      </div>

      {avisoFavorito && <p className="text-sm text-red-600 mb-2">{avisoFavorito}</p>}

      <p className="text-sm text-gray-500 mb-3">
        {isLoading ? "Cargando..." : `${filtrados.length} ${filtrados.length === 1 ? "cliente" : "clientes"}`}
      </p>

      {/* ── iPhone Y iPad: tarjetas ──────────────────────────────────────
          🔑 EL CORTE ES `lg` (1024), NO `sm` (640) NI `md` (768) — y lo que
          decide es el ancho ÚTIL, no el de la ventana. La barra lateral se lleva
          224 px, así que un iPad de 834 deja **610** px de contenido: más
          angosto que un iPhone acostado. Con el corte en `sm` esta pestaña
          dibujaba su tabla de 6 columnas ahí y había que ARRASTRARLA de lado
          (medido en el navegador contra el build de producción: **184 px** de
          arrastre a 834). Es la misma regla, el mismo número y el mismo patrón
          que ya se aplicó a Proveedores, Clientes › Directorio y Multifashion ›
          Vendedoras el 30-jul-2026 — NO se rediseñó nada: estas tarjetas ya
          existían y funcionaban, sólo se les amplió el tramo hasta `lg`.

          `data-vista` es FIJO ("tarjetas" / "tabla") a propósito: un medidor que
          busque el layout por su clase de breakpoint (`.sm\:hidden`) devuelve
          VACÍO en cuanto el corte se mueve, compara CERO montos y pasa en verde
          sin haber mirado nada. ─────────────────────────────────────────── */}
      <div data-vista="tarjetas" className="lg:hidden space-y-2">
        {filtrados.map((c) => (
          <div key={c.codigo} className="flex rounded-xl border border-gray-200 bg-white overflow-hidden">
            <span className={`w-1 shrink-0 ${colorFila(c)}`} aria-hidden />
            <div className="flex-1 min-w-0 p-3">
              <div className="flex items-baseline justify-between gap-2">
                <span className="flex items-center gap-1.5 min-w-0">
                  <Estrella
                    marcada={favoritos.has(c.nombre_normalized)}
                    onToggle={() => alternarFavorito(c.nombre_normalized)}
                    nombre={c.nombre}
                  />
                  <span className="font-medium text-gray-900 truncate">{c.nombre}</span>
                </span>
                <span className="font-semibold tabular-nums shrink-0">${fmt(c.total)}</span>
              </div>
              {c.tambien_en_grupo && (
                <span className="inline-block mt-1 px-2 py-0.5 rounded-full bg-gray-100 text-[11px] text-gray-600">
                  también en el grupo
                </span>
              )}
              <div className="mt-1 flex gap-3 text-sm tabular-nums">
                <span className={AGING.current.text}>{c.d0_90 ? fmt(c.d0_90) : "—"}</span>
                <span className={AGING.watch.text}>{c.d91_120 ? fmt(c.d91_120) : "—"}</span>
                <span className={AGING.overdue.text}>{c.d121_plus ? fmt(c.d121_plus) : "—"}</span>
              </div>
              {c.ultimo_pago_fecha && (
                <p className="mt-1 text-xs text-gray-400">
                  Últ. pago {fechaCorta(c.ultimo_pago_fecha)}
                  {c.ultimo_pago_monto != null && ` · $${fmt(c.ultimo_pago_monto)}`}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* ── iPad ACOSTADO y escritorio: tabla (entra sin arrastre) ─────── */}
      <div data-vista="tabla" className="hidden lg:block rounded-xl border border-gray-200 bg-white overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[11px] uppercase tracking-wide text-gray-500 border-b border-gray-100">
              <th className="text-left font-normal px-4 py-3">
                <button type="button" onClick={() => tocarTitulo("name")} className="min-h-[44px]">Cliente{flecha("name")}</button>
              </th>
              <th className="text-right font-normal px-3">
                <button type="button" onClick={() => tocarTitulo("current")} className="min-h-[44px]">{AGING.current.colLabel}{flecha("current")}</button>
              </th>
              <th className="text-right font-normal px-3">
                <button type="button" onClick={() => tocarTitulo("watch")} className="min-h-[44px]">{AGING.watch.colLabel}{flecha("watch")}</button>
              </th>
              <th className="text-right font-normal px-3">
                <button type="button" onClick={() => tocarTitulo("overdue")} className="min-h-[44px]">{AGING.overdue.colLabel}{flecha("overdue")}</button>
              </th>
              <th className="text-right font-normal px-3">Último pago</th>
              <th className="text-right font-normal px-4">
                <button type="button" onClick={() => tocarTitulo("total")} className="min-h-[44px]">Total{flecha("total")}</button>
              </th>
            </tr>
          </thead>
          <tbody>
            {filtrados.map((c) => (
              <tr key={c.codigo} className="border-b border-gray-50 last:border-0">
                <td className="px-4 py-3">
                  <span className="flex items-center gap-2">
                    <span className={`w-1 h-8 rounded-full shrink-0 ${colorFila(c)}`} aria-hidden />
                    <Estrella
                      marcada={favoritos.has(c.nombre_normalized)}
                      onToggle={() => alternarFavorito(c.nombre_normalized)}
                      nombre={c.nombre}
                    />
                    <span className="text-gray-900">{c.nombre}</span>
                    {c.tambien_en_grupo && (
                      <span className="px-2 py-0.5 rounded-full bg-gray-100 text-[11px] text-gray-600 whitespace-nowrap">
                        también en el grupo
                      </span>
                    )}
                  </span>
                </td>
                <td className={`px-3 text-right tabular-nums ${c.d0_90 ? AGING.current.text : "text-gray-300"}`}>{c.d0_90 ? fmt(c.d0_90) : "—"}</td>
                <td className={`px-3 text-right tabular-nums ${c.d91_120 ? AGING.watch.text : "text-gray-300"}`}>{c.d91_120 ? fmt(c.d91_120) : "—"}</td>
                <td className={`px-3 text-right tabular-nums ${c.d121_plus ? AGING.overdue.text : "text-gray-300"}`}>{c.d121_plus ? fmt(c.d121_plus) : "—"}</td>
                <td className="px-3 text-right whitespace-nowrap">
                  {c.ultimo_pago_fecha ? (
                    <>
                      <span className="block text-gray-700">{fechaCorta(c.ultimo_pago_fecha)}</span>
                      {c.ultimo_pago_monto != null && (
                        <span className="block text-xs text-gray-400 tabular-nums">${fmt(c.ultimo_pago_monto)}</span>
                      )}
                    </>
                  ) : (
                    <span className="text-gray-300">—</span>
                  )}
                </td>
                <td className="px-4 text-right font-semibold tabular-nums">{fmt(c.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
