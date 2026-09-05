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

import { useMemo, useState } from "react";
import useSWR from "swr";
import { fmt } from "@/lib/format";
import { AGING, AGING_ORDER, tramoLabel } from "@/lib/cxc-aging";
import AvisoRechazosSwitch from "@/components/AvisoRechazosSwitch";
import SyncStatus from "@/components/shared/SyncStatus";
import { EMPRESA_KEY_TO_NAME } from "@/lib/empresa-mapping";
import { empresasCarteraAparte } from "@/lib/switch-api/empresas";
import BostonDocumentosDrawer from "@/components/cxc/BostonDocumentosDrawer";
import BostonHojaCobrar from "@/components/cxc/BostonHojaCobrar";
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
  /** Id de Switch: la llave con la que se piden sus últimos pagos. */
  cliente_switch_id: number | null;
  nombre: string;
  nombre_normalized: string;
  d0_90: number;
  d91_120: number;
  d121_plus: number;
  total: number;
  /** Los tramos finos, los MISMOS cortes del grupo. `null` mientras la
   *  migración `20260928120000` no corra: el dato POR DÍA sí existe (985
   *  documentos, todos con `dias`), lo que faltaba era calcularlo en la vista. */
  finos: {
    d0_30: number; d31_60: number; d61_90: number;
    d121_180: number; d181_270: number; d271_365: number; mas_365: number;
  } | null;
  telefono: string;
  celular: string;
  correo: string;
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
// panel del grupo ya monta (`cxc/page.tsx` y `PanelCxcMobile.tsx`), con la
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

// 🩸 Acá vivían la estrella ⭐ de Boston, su lector tolerante y el aviso «No se
// pudo guardar la estrella». Se fueron el 4-sep-2026 con los favoritos del CXC
// entero — Daniel: *«quita favoritos»*; `cxc_favorites` nunca tuvo una fila. La
// separación por CARTERA que las hacía distintas de las del grupo sigue viva en
// las notas y en la bitácora de contacto, que sí se usan.

function fechaCorta(iso: string | null) {
  if (!iso) return null;
  const d = new Date(iso + (iso.length === 10 ? "T12:00:00" : ""));
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("es-PA", { day: "numeric", month: "short", year: "numeric" });
}

/** El detalle fino de un tramo, para el `title`. Sin los tramos finos (la DDL
 *  todavía no corrió) no se dice nada, en vez de inventar un desglose. */
function detalleFino(c: ClienteBoston, k: "current" | "watch" | "overdue"): string {
  if (!c.finos) return tramoLabel(k);
  const f = c.finos;
  if (k === "current") return `0-30: $${fmt(f.d0_30)} · 31-60: $${fmt(f.d31_60)} · 61-90: $${fmt(f.d61_90)}`;
  if (k === "watch") return "91-120 días";
  return `121-180: $${fmt(f.d121_180)} · 181-270: $${fmt(f.d181_270)} · 271-365: $${fmt(f.d271_365)} · +365: $${fmt(f.mas_365)}`;
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

  const [search, setSearch] = useState("");
  // 🩸 Acá vivía el botón «Últimos pagos ›» con su bloque por empresa. Boston es
  // UNA empresa: ese bloque decía tres pagos de la única empresa que hay, en
  // una sub-fila aparte. Ahora tocar un cliente lleva DIRECTO a sus documentos
  // —que es lo que se mira para cobrar— y la columna «Último pago» de la tabla
  // sigue dando el vistazo.
  /** El cliente cuyo cajón de documentos está abierto. */
  const [documentosDe, setDocumentosDe] = useState<ClienteBoston | null>(null);
  /** El cliente cuya hoja «Cobrar» está abierta. */
  const [cobrarA, setCobrarA] = useState<ClienteBoston | null>(null);
  const [riskFilter, setRiskFilter] = useState<RiskFilter>("all");
  const [ordenOverride, setOrdenOverride] = useState<OrdenOverride | null>(null);

  const orden = ordenEfectivo(riskFilter, ordenOverride);

  const filtrados = useMemo(() => {
    const todos = data?.clientes ?? [];
    const q = search.trim().toLowerCase();
    return todos
      .filter((c) => (riskFilter === "all" ? true : pasaFiltroRiesgo(ordenable(c), riskFilter)))
      .filter((c) => (q ? c.nombre.toLowerCase().includes(q) || c.codigo.toLowerCase().includes(q) : true))
      .sort((a, b) => compararClientes(ordenable(a), ordenable(b), { orden }));
  }, [data, search, riskFilter, orden]);

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

      {/* ── LA TIRA DE TOTALES, PEGADA A LA TABLA Y SOBRE SUS COLUMNAS ──────
          El MISMO formato que el CXC del grupo desde el 5-sep-2026: en pantalla
          ancha los cuatro totales viven en la misma grilla que la tabla, así que
          cada uno queda parado sobre su columna. Los cuatro FILTRAN igual que
          antes, con el mismo toggle de `lib/cxc-orden`.

          🩸 Acá vivía una 5ª tarjeta, "Cobrado julio · $35,392.49 · 126", con el
          monto y la cuenta ESCRITOS A MANO en el código. No filtraba nada y no
          se podía calcular: los cobros de Boston no entran a este sistema
          (`recibos: false` en EMPRESA_SYNC_CAPABILITIES — su cartera va por
          Brand It). O sea que iba a decir "julio" para siempre, al lado de
          cuatro cifras que sí se actualizan solas. Daniel aprobó quitarla. NO
          reponerla con otro mes escrito a mano. */}
      <div className="hidden lg:grid grid-cols-12 gap-2 px-4 py-2 bg-gray-50 border border-b-0 border-gray-200 rounded-t-xl">
        <div className="col-span-4 flex items-center">
          <span className="text-xs text-gray-500 px-2">
            {isLoading ? "Cargando…" : `${filtrados.length} ${filtrados.length === 1 ? "cliente" : "clientes"}`}
          </span>
        </div>
        {AGING_ORDER.map((k) => {
          const valor = k === "current" ? t?.d0_90 ?? 0 : k === "watch" ? t?.d91_120 ?? 0 : t?.d121_plus ?? 0;
          const activa = riskFilter === k;
          return (
            <button
              key={k}
              type="button"
              onClick={() => tocarPildora(k)}
              aria-pressed={activa}
              title={`${tramoLabel(k)}: $${fmt(valor)}`}
              className={`col-span-2 flex flex-col items-end justify-center rounded-md px-2 py-1 min-h-[44px] transition active:scale-[0.97] ${
                activa ? "border-2 border-gray-900 bg-white" : "border border-transparent hover:bg-white hover:border-gray-300"
              }`}
            >
              <span className="flex items-center gap-1 text-[11px] uppercase tracking-wide text-gray-500">
                <span className={`inline-block w-1.5 h-1.5 rounded-full ${AGING[k].dot}`} />
                {AGING[k].colLabel}
              </span>
              <span className={`text-sm font-semibold tabular-nums ${AGING[k].text}`}>${fmt(valor)}</span>
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => tocarPildora("all")}
          aria-pressed={riskFilter === "all"}
          title={`Total pendiente: $${fmt(t?.total ?? 0)} · ${t?.clientes ?? 0} clientes`}
          className={`col-span-2 flex flex-col items-end justify-center rounded-md px-2 py-1 min-h-[44px] transition active:scale-[0.97] ${
            riskFilter === "all" ? "border-2 border-gray-900 bg-white" : "border border-transparent hover:bg-white hover:border-gray-300"
          }`}
        >
          <span className="text-[11px] uppercase tracking-wide text-gray-500">Total · {t?.clientes ?? 0}</span>
          <span className="text-sm font-semibold tabular-nums text-gray-900">${fmt(t?.total ?? 0)}</span>
        </button>
      </div>

      {/* En celular la tira no entra en una grilla de 12: van las cuatro
          píldoras de siempre, 2+2. */}
      <div className="grid grid-cols-2 gap-2 mb-4 lg:hidden">
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

      <p className="text-sm text-gray-500 mb-3 lg:hidden">
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
              {/* Boston no tiene desglose por empresa —es UNA— así que no hay
                  panel intermedio: se cobra o se ven los documentos. */}
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => setCobrarA(c)}
                  className="flex-1 inline-flex min-h-[44px] items-center justify-center rounded-md bg-black px-3 text-xs font-medium text-white active:scale-[0.97]"
                >
                  Cobrar
                </button>
                <button
                  type="button"
                  onClick={() => setDocumentosDe(c)}
                  className="flex-1 inline-flex min-h-[44px] items-center justify-center rounded-md border border-gray-300 px-3 text-xs font-medium text-gray-700 active:scale-[0.97]"
                >
                  Documentos
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ── iPad ACOSTADO y escritorio: la MISMA grilla de 12 columnas que el
          CXC del grupo (4/2/2/2/2), para que la tira de totales de arriba quede
          parada sobre sus columnas. Antes era una `<table>` de 6 columnas y los
          totales flotaban aparte, sin relación visual con nada.
          «Último pago» dejó de ser una columna: vive debajo del nombre, que es
          donde no compite con la plata. ─────────────────────────────────── */}
      <div data-vista="tabla" className="hidden lg:block rounded-b-xl border border-gray-200 bg-white overflow-hidden">
        <div className="grid grid-cols-12 gap-2 px-4 py-2.5 bg-gray-50 border-b border-gray-200 text-xs font-medium text-gray-500 uppercase tracking-wide select-none">
          <div className="col-span-4 cursor-pointer hover:text-gray-900 transition" onClick={() => tocarTitulo("name")}>
            Cliente{flecha("name")}
          </div>
          <div className="col-span-2 text-right cursor-pointer hover:text-gray-900 transition" onClick={() => tocarTitulo("current")}>
            {AGING.current.colLabel}{flecha("current")}
          </div>
          <div className="col-span-2 text-right cursor-pointer hover:text-gray-900 transition" onClick={() => tocarTitulo("watch")}>
            {AGING.watch.colLabel}{flecha("watch")}
          </div>
          <div className="col-span-2 text-right cursor-pointer hover:text-gray-900 transition" onClick={() => tocarTitulo("overdue")}>
            {AGING.overdue.colLabel}{flecha("overdue")}
          </div>
          <div className="col-span-2 text-right cursor-pointer hover:text-gray-900 transition" onClick={() => tocarTitulo("total")}>
            Total{flecha("total")}
          </div>
        </div>

        {filtrados.map((c) => (
          <div key={c.codigo} className="border-b border-gray-50 last:border-0">
            <div className="grid grid-cols-12 gap-2 px-4 py-3 text-sm items-center">
              <div className="col-span-4 min-w-0">
                <span className="flex items-center gap-2 min-w-0">
                  <span className={`w-1 h-8 rounded-full shrink-0 ${colorFila(c)}`} aria-hidden />
                  <span className="truncate text-gray-900" title={c.nombre}>{c.nombre}</span>
                  {c.tambien_en_grupo && (
                    <span className="shrink-0 px-2 py-0.5 rounded-full bg-gray-100 text-[11px] text-gray-600 whitespace-nowrap">
                      también en el grupo
                    </span>
                  )}
                </span>
                <span className="block pl-3 text-xs text-gray-400">
                  {c.ultimo_pago_fecha
                    ? `Últ. pago ${fechaCorta(c.ultimo_pago_fecha)}${c.ultimo_pago_monto != null ? ` · $${fmt(c.ultimo_pago_monto)}` : ""}`
                    : "Sin pagos registrados"}
                </span>
              </div>
              <div className={`col-span-2 text-right tabular-nums cursor-help ${c.d0_90 ? AGING.current.text : "text-gray-300"}`} title={detalleFino(c, "current")}>
                {c.d0_90 ? fmt(c.d0_90) : "—"}
              </div>
              <div className={`col-span-2 text-right tabular-nums cursor-help ${c.d91_120 ? AGING.watch.text : "text-gray-300"}`} title={detalleFino(c, "watch")}>
                {c.d91_120 ? fmt(c.d91_120) : "—"}
              </div>
              <div className={`col-span-2 text-right tabular-nums cursor-help ${c.d121_plus ? AGING.overdue.text : "text-gray-300"}`} title={detalleFino(c, "overdue")}>
                {c.d121_plus ? fmt(c.d121_plus) : "—"}
              </div>
              <div className="col-span-2 text-right tabular-nums font-semibold flex items-center justify-end gap-2">
                <span>{fmt(c.total)}</span>
                <button
                  type="button"
                  onClick={() => setCobrarA(c)}
                  className="shrink-0 rounded-md bg-black px-2.5 py-1 text-xs font-medium text-white transition active:scale-[0.97] hover:bg-gray-800"
                >
                  Cobrar
                </button>
                <button
                  type="button"
                  onClick={() => setDocumentosDe(c)}
                  className="shrink-0 rounded-md border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-700 transition active:scale-[0.97]"
                >
                  Documentos
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <BostonDocumentosDrawer
        codigo={documentosDe?.codigo ?? null}
        nombre={documentosDe?.nombre ?? ""}
        clienteSwitchId={documentosDe?.cliente_switch_id ?? null}
        onClose={() => setDocumentosDe(null)}
      />

      <BostonHojaCobrar
        cliente={cobrarA}
        onClose={() => setCobrarA(null)}
        onVerDocumentos={(c) => {
          setCobrarA(null);
          setDocumentosDe(filtrados.find((f) => f.codigo === c.codigo) ?? null);
        }}
      />

    </div>
  );
}
