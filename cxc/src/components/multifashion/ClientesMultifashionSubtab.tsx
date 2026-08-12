"use client";

// Sub-tab "Clientes" de Multifashion — DOS layouts, según el ancho útil.
//
// Escritorio (≥lg): la grilla compacta de siempre, sin tocar.
// Celular e iPad (<lg): una tarjeta por cliente — ver `ClienteTarjeta` al final
// del archivo para el porqué medido (a 390 px quedaban 288 px de la grilla
// fuera de la pantalla y SIN forma de alcanzarlos, y el nombre del cliente
// colapsaba a 0 px de ancho).
//
// Período: filtro PROPIO del tab (Mes · 3m · 6m · 12m), persistido en URL
// (?mfCliRango). El mes/año del shell ancla el FIN del rango; los rangos
// móviles cuentan N meses hacia atrás desde ese mes (cruzan año solos).
//
// Dos secciones:
//   1. Mayoreo: clientes con is_wholesale=true (la columna sigue llamándose
//      así en la DB; la UI dice "Mayoreo" — cero jerga en inglés).
//   2. Clientes identificados (retail): ranking por monto, nombre real.
//      Identidad normalizada en el RPC (TRIM + colapsa espacios) para no partir
//      un cliente por variantes; VENTAS MAHER excluido (revendedor). El bucket
//      "Anónimos (mostrador)" suma CONTADO / CONSUMIDOR FINAL aparte.
//
// La columna "#" es la POSICIÓN en el ranking por monto (no un id de cliente).
// Click en una row expande sparkline mensual (un cliente expandido a la vez).

import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { Card } from "@/components/ui/card";
import { Package, Users, ChevronDown, Store, Repeat, UserPlus, Moon, Percent, MessageCircle } from "lucide-react";
import { fmtMoney, fmtMoneyCompact } from "@/lib/ventas/format";
import { Ayuda } from "@/components/shared/Ayuda";
import { useUrlState } from "@/lib/hooks/useUrlState";

// "Escala compartida entre mayoreo y retail" vivía escrito DOS veces —una en la
// lista vertical del celular, otra en la tira del escritorio— y por eso podían
// divergir. Ahora es una sola constante, y se lee a un toque en vez de ocupar un
// renglón bajo cada mini-gráfico: es metodología (por qué las barras se pueden
// comparar entre secciones), no un aviso.
const ESCALA_COMPARTIDA = "Escala compartida entre mayoreo y retail";

function AyudaEscala() {
  return (
    <Ayuda titulo="Cómo leer las barras">
      {ESCALA_COMPARTIDA}: la barra más alta de la pantalla es el mejor mes, y todas las demás se miden
      contra ella.
    </Ayuda>
  );
}
import { cn } from "@/lib/utils";

// ─── Types ─────────────────────────────────────────────────────────────────

interface MesRow {
  mes_anio: number;
  mes_idx: number;
  mes_label: string;
  ventas: number;
  tickets: number;
}

interface ClienteRow {
  nombre: string;
  total_ytd: number;
  tickets_ytd: number;
  ticket_prom?: number;
  ultima_compra: string | null;
  meses: MesRow[];
}

interface WholesaleResp {
  fecha_inicio: string;
  fecha_fin: string;
  total_clientes: number;
  total_ventas: number;
  total_tickets: number;
  clientes: ClienteRow[];
}

interface RetailResp {
  fecha_inicio: string;
  fecha_fin: string;
  limit: number;
  total_clientes: number;
  total_ventas: number;
  total_tickets: number;
  // Cobertura identificados vs anónimos (mostrador), independiente del top N.
  clientes_identificados: number;
  ventas_identificadas: number;
  tickets_identificados: number;
  ventas_anonimas: number;
  tickets_anonimos: number;
  pct_identificado: number;
  clientes: ClienteRow[];
}

type RangoCli = "mes" | "3m" | "6m" | "12m";

const RANGO_OPCIONES: { value: RangoCli; label: string }[] = [
  { value: "mes", label: "Mes" },
  { value: "3m", label: "3 meses" },
  { value: "6m", label: "6 meses" },
  { value: "12m", label: "12 meses" },
];

// ─── Fidelización ACS (endpoint /api/multifashion/fidelizacion) ─────────────

export interface FidelCliente {
  cliente_switch_id: number;
  nombre: string;
  nombre_norm: string;
  telefono_wa: string | null;
  registrado: boolean;
  visitas: number;
  visitas_90d: number;
  ultima_compra: string | null;
  estado5: "disponible" | "usado" | null;
  frecuente: boolean;
  dormido: boolean;
  nuevo_mes: boolean;
  cinco_pendiente: boolean;
}

interface FidelResp {
  hoy: string;
  detalle_activo: boolean;
  cards: { frecuentes: number; nuevos_mes: number; dormidos: number; cinco_pendiente: number };
  clientes: FidelCliente[];
}

type SegFiltro = "todos" | "frecuentes" | "dormidos" | "cinco";

const SEG_OPCIONES: { value: SegFiltro; label: string }[] = [
  { value: "todos", label: "Todos" },
  { value: "frecuentes", label: "Frecuentes" },
  { value: "dormidos", label: "Dormidos" },
  { value: "cinco", label: "5% disponible" },
];

// Misma normalización de identidad que el RPC del ranking y el endpoint.
const normNombre = (s: string): string =>
  s.normalize("NFKC").replace(/\s+/g, " ").trim().toUpperCase();

interface ClientesMultifashionSubtabProps {
  selectedYear: number;
  mes: number;
  /** gerente_acs: solo el mes; las ventanas 3m/6m/12m no se ofrecen (y el
   *  servidor las recorta al mes igual). */
  ventanaAcotada?: boolean;
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function parseIsoDateLocal(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function formatFechaShort(iso: string | null): string {
  if (!iso) return "—";
  const d = parseIsoDateLocal(iso);
  const MES = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];
  return `${d.getDate()} ${MES[d.getMonth()]} ${d.getFullYear()}`;
}

const MES_NOMBRES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

// Rango del tab Clientes. El FIN siempre es el último día del mes seleccionado
// en el shell; el INICIO depende del filtro propio: "mes" = ese mes; "3m/6m/12m"
// = primer día N-1 meses atrás (cruza año automáticamente vía Date).
function computeRange(
  rango: RangoCli, selectedYear: number, mes: number,
): { fecha_inicio: string; fecha_fin: string } {
  const mm = String(mes).padStart(2, "0");
  const lastDay = new Date(selectedYear, mes, 0).getDate();
  const fecha_fin = `${selectedYear}-${mm}-${String(lastDay).padStart(2, "0")}`;

  if (rango === "mes") {
    return { fecha_inicio: `${selectedYear}-${mm}-01`, fecha_fin };
  }

  const nMonths = rango === "3m" ? 3 : rango === "6m" ? 6 : 12;
  const start = new Date(selectedYear, mes - 1 - (nMonths - 1), 1);
  const sy = start.getFullYear();
  const sm = String(start.getMonth() + 1).padStart(2, "0");
  return { fecha_inicio: `${sy}-${sm}-01`, fecha_fin };
}

// ─── Component ─────────────────────────────────────────────────────────────

export function ClientesMultifashionSubtab({ selectedYear, mes, ventanaAcotada = false }: ClientesMultifashionSubtabProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Filtro de período PROPIO del tab (persistido en URL ?mfCliRango). Es un
  // filtro del mismo nivel → history "replace" (no cicla en back/forward).
  const [rangoRaw, setRango] = useUrlState<RangoCli>("mfCliRango", "mes");
  // Ventana acotada: "mes" y nada más — ni siquiera vía ?mfCliRango=12m.
  const rango: RangoCli = ventanaAcotada ? "mes" : rangoRaw;
  const opcionesRango = ventanaAcotada
    ? RANGO_OPCIONES.filter(o => o.value === "mes")
    : RANGO_OPCIONES;

  const range = useMemo(() => computeRange(rango, selectedYear, mes), [rango, selectedYear, mes]);
  const periodoStr = useMemo(() => {
    if (rango === "mes") return `${MES_NOMBRES[mes - 1]} ${selectedYear}`;
    const n = rango === "3m" ? 3 : rango === "6m" ? 6 : 12;
    return `Últimos ${n} meses · hasta ${MES_NOMBRES[mes - 1].toLowerCase()} ${selectedYear}`;
  }, [rango, selectedYear, mes]);

  // MISMOS params que antes: el querystring (fecha_inicio + fecha_fin) ES la
  // clave SWR → cada rango cachea por separado y revalida en background. Un solo
  // useSWR cuyo fetcher dispara ambos fetch en paralelo y devuelve {wholesale,
  // retail}, preservando el loading/error combinados del Promise.all original.
  const qs = `fecha_inicio=${range.fecha_inicio}&fecha_fin=${range.fecha_fin}`;
  const { data, error, isLoading, mutate } = useSWR<{ wholesale: WholesaleResp; retail: RetailResp }>(
    ["multifashion-clientes", range.fecha_inicio, range.fecha_fin],
    async () => {
      const [ws, rt] = await Promise.all([
        fetch(`/api/multifashion/clientes-wholesale?${qs}`, { cache: "no-store" }).then(async r => {
          if (!r.ok) {
            const body = await r.json().catch(() => ({}));
            throw new Error(body?.error ?? `wholesale HTTP ${r.status}`);
          }
          return r.json() as Promise<WholesaleResp>;
        }),
        fetch(`/api/multifashion/retail-recurrentes?${qs}`, { cache: "no-store" }).then(async r => {
          if (!r.ok) {
            const body = await r.json().catch(() => ({}));
            throw new Error(body?.error ?? `retail HTTP ${r.status}`);
          }
          return r.json() as Promise<RetailResp>;
        }),
      ]);
      return { wholesale: ws, retail: rt };
    },
    { dedupingInterval: 5 * 60_000, revalidateOnFocus: false },
  );

  const wholesale = data?.wholesale ?? null;
  const retail = data?.retail ?? null;
  const loading = isLoading && !data;
  const errorMsg = error ? (error instanceof Error ? error.message : "error inesperado") : null;

  // ── Fidelización ACS: segmentos + estado 5% + WhatsApp ────────────────────
  // Independiente del rango del tab (snapshot "hoy"). Si el endpoint falla,
  // la pestaña degrada a lo de siempre (sin tarjetas/chips/columnas nuevas).
  const [seg, setSeg] = useUrlState<SegFiltro>("mfCliSeg", "todos");
  const { data: fidel } = useSWR<FidelResp>(
    "multifashion-fidelizacion",
    async () => {
      const r = await fetch("/api/multifashion/fidelizacion", { cache: "no-store" });
      if (!r.ok) throw new Error(`fidelizacion HTTP ${r.status}`);
      return r.json();
    },
    { dedupingInterval: 5 * 60_000, revalidateOnFocus: false },
  );
  const fidelMap = useMemo(
    () => new Map((fidel?.clientes ?? []).map((c) => [c.nombre_norm, c])),
    [fidel],
  );
  // Chips: filtran la tabla de identificados por segmento (match por nombre).
  const retailFiltrado = useMemo(() => {
    const base = retail?.clientes ?? [];
    if (!fidel || seg === "todos") return base;
    return base.filter((c) => {
      const i = fidelMap.get(normNombre(c.nombre));
      if (!i) return false;
      if (seg === "frecuentes") return i.frecuente;
      if (seg === "dormidos") return i.dormido;
      return i.estado5 === "disponible";
    });
  }, [retail, fidel, fidelMap, seg]);

  // Al cambiar el rango, colapsa la fila expandida (igual que el efecto original
  // hacía con setExpandedId(null) en cada cambio de params).
  useEffect(() => {
    setExpandedId(null);
  }, [range.fecha_inicio, range.fecha_fin]);

  // Pico mensual compartido (escala visual unificada entre ambas secciones).
  const peakMes = useMemo(() => Math.max(
    ...(wholesale?.clientes ?? []).flatMap(c => c.meses.map(m => m.ventas)),
    ...(retail?.clientes ?? []).flatMap(c => c.meses.map(m => m.ventas)),
    1,
  ), [wholesale, retail]);

  // ¿El rango cruza años? Determina si las labels de los buckets deben
  // incluir año (ej. "May '25" vs "May").
  const spansYears = useMemo(() => {
    return range.fecha_inicio.slice(0, 4) !== range.fecha_fin.slice(0, 4);
  }, [range.fecha_inicio, range.fecha_fin]);

  const toggleRow = (id: string) => {
    setExpandedId(prev => prev === id ? null : id);
  };

  return (
    <div className={cn("space-y-5", loading && "opacity-60 pointer-events-none transition-opacity")}>
      {errorMsg ? (
        <Card className="rounded-md border border-orange-200 bg-orange-50 p-4 text-xs text-orange-900">
          No se pudo cargar la lista: {errorMsg}
          <button onClick={() => mutate()} className="ml-2 font-medium underline underline-offset-2 hover:text-orange-700">Reintentar</button>
        </Card>
      ) : loading && !wholesale && !retail ? (
        <Card className="flex min-h-[200px] items-center justify-center p-12 text-sm text-gray-500">
          Cargando clientes…
        </Card>
      ) : (
        <div className="space-y-8">
          {/* Encabezado + filtro de período propio del tab. */}
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              {/* `sr-only`: la pestaña ya dice "Clientes" y el selector de la
                  derecha enseña el período. El aviso del mostrador anónimo SÍ
                  se queda: cambia cómo se lee el top. */}
              <h3 className="sr-only">Clientes · {periodoStr}</h3>
              <p className="text-xs text-gray-400">Mostrador anónimo va aparte</p>
            </div>
            <div className="inline-flex items-center gap-0.5 rounded-md border border-gray-200 bg-gray-50 p-0.5">
              {opcionesRango.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setRango(opt.value)}
                  // 44 px de alto: la regla de la casa. Medían 26 y salió en la
                  // verificación del 30-jul-2026. El `-my-1.5` le devuelve al
                  // contenedor el aire que suma el área de tap, así que crecer no
                  // separa el filtro del título.
                  className={cn(
                    "-my-1.5 inline-flex min-h-[44px] items-center rounded px-2.5 text-xs font-medium transition",
                    rango === opt.value
                      ? "bg-white text-gray-900 shadow-sm"
                      : "text-gray-500 hover:text-gray-800",
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Fidelización ACS: 4 segmentos (snapshot hoy, independiente del rango) */}
          {fidel && (
            <section className="space-y-3">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <SegCard
                  icon={<Repeat className="h-4 w-4" />}
                  tone="teal"
                  valor={fidel.cards.frecuentes}
                  label="Frecuentes"
                  sub="2+ visitas en 90 días"
                />
                <SegCard
                  icon={<UserPlus className="h-4 w-4" />}
                  tone="teal"
                  valor={fidel.cards.nuevos_mes}
                  label="Nuevos del mes"
                  sub="registrados este mes"
                />
                <SegCard
                  icon={<Moon className="h-4 w-4" />}
                  tone="amber"
                  valor={fidel.cards.dormidos}
                  label="Dormidos"
                  sub="60+ días sin comprar"
                />
                <SegCard
                  icon={<Percent className="h-4 w-4" />}
                  tone="teal"
                  valor={fidel.cards.cinco_pendiente}
                  label="5% pendiente"
                  sub="sin segunda visita"
                />
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {SEG_OPCIONES.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setSeg(opt.value)}
                    // 44 px, igual que las píldoras de período de arriba. Medían
                    // 28 y son el filtro principal de la tabla de identificados.
                    className={cn(
                      "inline-flex min-h-[44px] items-center rounded-full border px-3 text-xs font-medium transition",
                      seg === opt.value
                        ? "border-teal-700 bg-teal-700 text-white"
                        : "border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:text-gray-900",
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
                {!fidel.detalle_activo && (
                  <span className="ml-1 text-xs text-gray-400">
                    El estado &quot;usado&quot; del 5% se activa cuando corra la migración de detalle.
                  </span>
                )}
              </div>
            </section>
          )}

          {/* Sección 1: Mayoreo (is_wholesale=true) */}
          <ClientesSection
            prefix="ws"
            title="Mayoreo"
            subtitle={wholesale
              ? `${wholesale.total_clientes} ${wholesale.total_clientes === 1 ? "cliente" : "clientes"} · ${fmtMoney(wholesale.total_ventas)} · ${wholesale.total_tickets.toLocaleString()} ${wholesale.total_tickets === 1 ? "ticket" : "tickets"}`
              : "—"}
            icon={<Package className="h-4 w-4" />}
            iconTone="amber"
            clientes={wholesale?.clientes ?? []}
            peakMes={peakMes}
            spansYears={spansYears}
            expandedId={expandedId}
            onToggleRow={toggleRow}
            emptyText={`No hay clientes de mayoreo en ${periodoStr}.`}
          />

          {/* Sección 2: Clientes identificados (retail por monto) */}
          <ClientesSection
            prefix="rt"
            title="Clientes identificados"
            subtitle={retail
              ? `${retail.pct_identificado ?? 0}% de las ventas retail · top ${retail.limit} por monto · ${retail.clientes_identificados ?? retail.total_clientes} con nombre${seg !== "todos" ? ` · filtro: ${SEG_OPCIONES.find(o => o.value === seg)?.label}` : ""}`
              : "—"}
            icon={<Users className="h-4 w-4" />}
            iconTone="teal"
            clientes={retailFiltrado}
            fidelMap={fidel ? fidelMap : undefined}
            peakMes={peakMes}
            spansYears={spansYears}
            expandedId={expandedId}
            onToggleRow={toggleRow}
            emptyText={seg !== "todos"
              ? `Ningún cliente del período cae en "${SEG_OPCIONES.find(o => o.value === seg)?.label}".`
              : `No hay clientes retail con nombre en ${periodoStr}.`}
          />

          {/* Bucket anónimo (mostrador): CONTADO / CONSUMIDOR FINAL, sin nombre. */}
          {retail && (retail.ventas_anonimas > 0 || retail.tickets_anonimos > 0) && (
            <Card className="flex items-center gap-3 p-3.5">
              <div className="flex h-7 w-7 items-center justify-center rounded-md border border-gray-200 bg-gray-50 text-gray-500">
                <Store className="h-4 w-4" />
              </div>
              <div className="flex min-w-0 flex-1 items-center gap-1">
                <p className="text-sm font-medium text-gray-900">Anónimos (mostrador)</p>
                {/* Qué códigos de Switch caen en este bucket es composición: se
                    aprende una vez y no cambia con el período. */}
                <Ayuda titulo="Qué entra acá">
                  Ventas de CONTADO / CONSUMIDOR FINAL, sin cliente identificado.
                </Ayuda>
              </div>
              <div className="text-right">
                <p className="font-mono text-sm tabular-nums text-gray-950">{fmtMoney(retail.ventas_anonimas)}</p>
                <p className="font-mono text-xs tabular-nums text-gray-500">{retail.tickets_anonimos.toLocaleString()} tickets</p>
              </div>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────

function SegCard({ icon, tone, valor, label, sub }: {
  icon: React.ReactNode;
  tone: "teal" | "amber";
  valor: number;
  label: string;
  sub: string;
}) {
  const toneCls = tone === "amber"
    ? "border-amber-100 bg-amber-50 text-amber-700"
    : "border-teal-100 bg-teal-50 text-teal-700";
  return (
    <Card className={cn("p-3.5", tone === "amber" && valor > 0 && "border-amber-200 bg-amber-50/40")}>
      <div className="flex items-center gap-2.5">
        <div className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-md border", toneCls)}>
          {icon}
        </div>
        <div className="min-w-0">
          <p className="font-mono text-lg font-semibold leading-tight text-gray-950 tabular-nums">{valor}</p>
          <p className="truncate text-xs font-medium text-gray-900">{label}</p>
          <p className="truncate text-xs text-gray-400">{sub}</p>
        </div>
      </div>
    </Card>
  );
}

function ClientesSection({
  prefix, title, subtitle, icon, iconTone,
  clientes, fidelMap, peakMes, spansYears, expandedId, onToggleRow, emptyText,
}: {
  prefix: "ws" | "rt";
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  iconTone: "amber" | "teal";
  clientes: ClienteRow[];
  /** Fidelización ACS por nombre normalizado — solo la sección retail la recibe. */
  fidelMap?: Map<string, FidelCliente>;
  peakMes: number;
  spansYears: boolean;
  expandedId: string | null;
  onToggleRow: (id: string) => void;
  emptyText: string;
}) {
  const toneIcon = iconTone === "amber"
    ? "border-amber-100 bg-amber-50 text-amber-700"
    : "border-teal-100 bg-teal-50 text-teal-700";

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2.5">
        <div className={cn("flex h-7 w-7 items-center justify-center rounded-md border", toneIcon)}>
          {icon}
        </div>
        <div>
          <h3 className="font-display text-sm font-semibold text-gray-950">{title}</h3>
          <p className="text-xs text-gray-500">{subtitle}</p>
        </div>
      </div>

      {clientes.length === 0 ? (
        <Card className="flex items-center justify-center py-8 text-xs text-gray-500">
          {emptyText}
        </Card>
      ) : (
        <>
        {/* Celular e iPad: una tarjeta por cliente. Ver el porqué arriba. */}
        <div data-vista="tarjetas" className="space-y-2 lg:hidden">
          {clientes.map((c, idx) => {
            const id = `${prefix}-${c.nombre}`;
            return (
              <ClienteTarjeta
                key={id}
                id={id}
                rank={idx + 1}
                cliente={c}
                fidel={fidelMap ? fidelMap.get(normNombre(c.nombre)) ?? null : undefined}
                peakMes={peakMes}
                spansYears={spansYears}
                isExpanded={expandedId === id}
                onToggle={onToggleRow}
              />
            );
          })}
        </div>

        <Card data-vista="tabla" className="hidden overflow-hidden p-0 lg:block">
          <div className={cn(
            "items-center gap-3 border-b border-gray-200 bg-gray-50 px-3.5 py-2 text-xs font-medium uppercase tracking-[0.04em] text-gray-500",
            fidelMap
              ? "grid grid-cols-[2.5rem_minmax(0,1fr)_7rem_4rem_5rem_6rem_5.5rem_2.5rem_1.25rem]"
              : "grid grid-cols-[2.5rem_minmax(0,1fr)_7rem_4rem_5rem_6rem_1.25rem]",
          )}>
            <span className="text-right" title="Posición en el ranking por monto">#</span>
            <span>Cliente</span>
            <span className="text-right">Total</span>
            <span className="text-right">Tickets</span>
            <span className="text-right">T. prom</span>
            <span className="text-right">Última</span>
            {fidelMap && <span className="text-center" title="Fidelización: disponible = registrado sin usar el 5%">5%</span>}
            {fidelMap && <span className="text-center" title="WhatsApp">WA</span>}
            <span />
          </div>

          {clientes.map((c, idx) => {
            const id = `${prefix}-${c.nombre}`;
            const isExpanded = expandedId === id;
            return (
              <ClienteRowItem
                key={id}
                id={id}
                rank={idx + 1}
                cliente={c}
                fidel={fidelMap ? fidelMap.get(normNombre(c.nombre)) ?? null : undefined}
                peakMes={peakMes}
                spansYears={spansYears}
                isExpanded={isExpanded}
                onToggle={onToggleRow}
              />
            );
          })}
        </Card>
        </>
      )}
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tarjeta de cliente — celular e iPad
// ─────────────────────────────────────────────────────────────────────────────

/**
 * La MISMA fila, en vertical.
 *
 * 🩸 POR QUÉ EXISTE (30-jul-2026). La grilla del ranking es de ancho FIJO
 * —`2.5rem 1fr 7rem 4rem 5rem 6rem 5.5rem 2.5rem 1.25rem`, o sea 644 px con sus
 * separaciones— dentro de una `Card` con `overflow-hidden`. Medido en el
 * navegador: a 390 px se ven 356 y **quedan 288 px afuera**; a 834 px (iPad, que
 * pierde 224 px con la barra lateral) se ven 552 y quedan **92**. Y como no hay
 * scroller adentro, esos píxeles **no se alcanzan de ninguna forma**: no es que
 * haya que arrastrar, es que no están. Peor todavía, el `1fr` del NOMBRE es lo
 * único elástico, así que se lo come el resto y colapsa a **0 px** — la columna
 * "Cliente" se veía vacía en las dos pantallas.
 *
 * Es el mismo patrón que ya se resolvió en `admin/components/PanelCxcMobile.tsx`
 * y en `components/ventas/ResumenViewMobile.tsx`: tabla ancha → tarjetas. No se
 * inventa uno nuevo.
 *
 * El corte es `lg` (1024 px) y NO `md`, porque lo que decide es el ancho ÚTIL,
 * no el de la ventana: la barra lateral se lleva 224 px, así que un iPad de 834
 * deja 552 — más angosto que un iPhone acostado. A 1024 quedan ~800 y la grilla
 * de 644 entra cómoda. El ESCRITORIO no cambia.
 *
 * NINGÚN número cambia: son las mismas 6 cifras de la fila, más el 5% y el
 * WhatsApp de retail.
 */
function ClienteTarjeta({
  id, rank, cliente, fidel, peakMes, spansYears, isExpanded, onToggle,
}: {
  id: string;
  rank: number;
  cliente: ClienteRow;
  /** undefined = sección sin fidelización (mayoreo); null = sin match ACS. */
  fidel?: FidelCliente | null;
  peakMes: number;
  spansYears: boolean;
  isExpanded: boolean;
  onToggle: (id: string) => void;
}) {
  const ticketProm = cliente.ticket_prom != null
    ? cliente.ticket_prom
    : (cliente.tickets_ytd > 0 ? cliente.total_ytd / cliente.tickets_ytd : 0);
  const conFidel = fidel !== undefined;

  return (
    <article className="overflow-hidden rounded-lg border border-gray-200 bg-white">
      {/* Un solo blanco táctil para abrir y cerrar. El chevron es parte del
          botón, no un control aparte: dos targets pegados en 356 px se erran. */}
      <button
        type="button"
        onClick={() => onToggle(id)}
        aria-expanded={isExpanded}
        className="flex w-full items-start gap-2 px-3 py-3 text-left active:bg-gray-50"
      >
        <span className="mt-0.5 shrink-0 font-mono text-xs tabular-nums text-gray-400">{rank}</span>
        <span className="min-w-0 flex-1">
          {/* El nombre manda: acá SÍ tiene el ancho, que es justo lo que la
              grilla le quitaba. */}
          <span className="block truncate text-sm font-medium text-gray-900">{cliente.nombre}</span>
          <span className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-xs text-gray-500">
            <span className="font-mono tabular-nums text-gray-950">{fmtMoney(cliente.total_ytd)}</span>
            <span className="font-mono tabular-nums">{cliente.tickets_ytd.toLocaleString()} tickets</span>
            <span className="font-mono tabular-nums">prom ${ticketProm.toFixed(2)}</span>
            <span className="font-mono tabular-nums">últ. {formatFechaShort(cliente.ultima_compra)}</span>
          </span>
        </span>
        <ChevronDown className={cn(
          "mt-0.5 h-4 w-4 shrink-0 text-gray-400 transition-transform",
          isExpanded && "rotate-180",
        )} />
      </button>

      {conFidel && (fidel?.estado5 || fidel?.telefono_wa) && (
        <div className="flex items-center gap-2 border-t border-gray-100 px-3 py-1.5">
          {fidel?.estado5 === "disponible" ? (
            <span className="rounded-full border border-teal-200 bg-teal-50 px-2 py-0.5 text-xs font-medium text-teal-700">5% disponible</span>
          ) : fidel?.estado5 === "usado" ? (
            <span className="rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-xs font-medium text-gray-500">5% usado ✓</span>
          ) : null}
          {fidel?.telefono_wa && (
            /* 44 px de alto (regla de la casa). El `-my-1.5` le devuelve al
               renglón el aire que suma el área de tap, así que crecer de 24 a 44
               no separa la tarjeta. */
            <a
              href={fidel.telefono_wa}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="-my-1.5 ml-auto inline-flex min-h-[44px] items-center gap-1.5 px-2 text-xs font-medium text-emerald-700 active:opacity-70"
            >
              <MessageCircle className="h-4 w-4" />
              WhatsApp
            </a>
          )}
        </div>
      )}

      {isExpanded && (
        <div className="border-t border-gray-100">
          <ClienteMesesLista cliente={cliente} peakMes={peakMes} spansYears={spansYears} />
        </div>
      )}
    </article>
  );
}

/**
 * Los mismos meses del sparkline, uno debajo del otro.
 *
 * El gráfico de barras del escritorio reparte los meses a lo ANCHO: con 12 meses
 * en 356 px cada columna queda en ~29 px y la etiqueta ("May '25", que lleva
 * `whitespace-nowrap`) se sale de su celda. En vertical el mes tiene todo el
 * ancho que necesita y la barra sigue estando —la comparación visual entre meses
 * no se pierde, solo cambia de eje—. La escala es la MISMA (`peakMes`,
 * compartida entre mayoreo y retail), así que las barras siguen siendo
 * comparables entre las dos secciones.
 */
function ClienteMesesLista({
  cliente, peakMes, spansYears,
}: {
  cliente: ClienteRow;
  peakMes: number;
  spansYears: boolean;
}) {
  const labelFor = (m: MesRow) => spansYears
    ? `${m.mes_label} '${String(m.mes_anio).slice(-2)}`
    : m.mes_label;

  return (
    <div className="bg-gray-50/40 px-3 py-2.5">
      <ul className="space-y-1">
        {cliente.meses.map(m => {
          const anchoPct = peakMes > 0 ? (m.ventas / peakMes) * 100 : 0;
          const hasData = m.ventas > 0;
          return (
            <li key={`${m.mes_anio}-${m.mes_idx}`} className="flex items-center gap-2">
              <span className="w-14 shrink-0 text-xs font-medium uppercase text-gray-500">{labelFor(m)}</span>
              <span className="relative h-2 min-w-0 flex-1 overflow-hidden rounded-sm bg-gray-200">
                {hasData && (
                  <span
                    className="absolute inset-y-0 left-0 rounded-sm bg-teal-700/80"
                    style={{ width: `${Math.max(2, anchoPct)}%` }}
                  />
                )}
              </span>
              <span className={cn(
                "w-16 shrink-0 text-right font-mono text-xs tabular-nums",
                hasData ? "text-gray-700" : "text-gray-300",
              )}>
                {hasData ? fmtMoneyCompact(m.ventas) : "—"}
              </span>
            </li>
          );
        })}
      </ul>
      <div className="mt-1 -ml-2">
        <AyudaEscala />
      </div>
    </div>
  );
}

function ClienteRowItem({
  id, rank, cliente, fidel, peakMes, spansYears, isExpanded, onToggle,
}: {
  id: string;
  rank: number;
  cliente: ClienteRow;
  /** undefined = sección sin fidelización (wholesale); null = sin match ACS. */
  fidel?: FidelCliente | null;
  peakMes: number;
  spansYears: boolean;
  isExpanded: boolean;
  onToggle: (id: string) => void;
}) {
  const ticketProm = cliente.ticket_prom != null
    ? cliente.ticket_prom
    : (cliente.tickets_ytd > 0 ? cliente.total_ytd / cliente.tickets_ytd : 0);
  const conFidel = fidel !== undefined;

  return (
    <div className="border-t border-gray-200">
      {/* div role=button (no <button>): la celda WhatsApp anida un <a>. */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => onToggle(id)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onToggle(id); } }}
        aria-expanded={isExpanded}
        className={cn(
          "grid w-full cursor-pointer items-center gap-3 px-3.5 py-2.5 text-left text-sm transition",
          conFidel
            ? "grid-cols-[2.5rem_minmax(0,1fr)_7rem_4rem_5rem_6rem_5.5rem_2.5rem_1.25rem]"
            : "grid-cols-[2.5rem_minmax(0,1fr)_7rem_4rem_5rem_6rem_1.25rem]",
          "hover:bg-gray-50/60",
          isExpanded && "bg-gray-50/80",
        )}
      >
        <span className="text-right font-mono text-xs text-gray-500 tabular-nums">{rank}</span>
        <span className="truncate font-medium text-gray-900">{cliente.nombre}</span>
        <span className="text-right font-mono text-gray-950 tabular-nums">{fmtMoney(cliente.total_ytd)}</span>
        <span className="text-right font-mono text-gray-700 tabular-nums">{cliente.tickets_ytd.toLocaleString()}</span>
        <span className="text-right font-mono text-gray-700 tabular-nums">${ticketProm.toFixed(2)}</span>
        <span className="text-right font-mono text-xs text-gray-500 tabular-nums">{formatFechaShort(cliente.ultima_compra)}</span>
        {conFidel && (
          <span className="flex justify-center">
            {fidel?.estado5 === "disponible" ? (
              <span className="rounded-full border border-teal-200 bg-teal-50 px-2 py-0.5 text-xs font-medium text-teal-700">Disponible</span>
            ) : fidel?.estado5 === "usado" ? (
              <span className="rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-xs font-medium text-gray-500">Usado ✓</span>
            ) : (
              <span className="text-xs text-gray-300">—</span>
            )}
          </span>
        )}
        {conFidel && (
          <span className="flex justify-center">
            {fidel?.telefono_wa ? (
              <a
                href={fidel.telefono_wa}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                title={`WhatsApp a ${cliente.nombre}`}
                className="flex h-6 w-6 items-center justify-center rounded-md border border-emerald-200 bg-emerald-50 text-emerald-700 transition hover:bg-emerald-100 active:scale-[0.95]"
              >
                <MessageCircle className="h-3.5 w-3.5" />
              </a>
            ) : (
              <span className="text-xs leading-tight text-gray-300" title="Sin teléfono en el maestro de Switch">sin tel.</span>
            )}
          </span>
        )}
        <ChevronDown className={cn(
          "h-3.5 w-3.5 text-gray-400 transition-transform",
          isExpanded && "rotate-180",
        )} />
      </div>

      <div
        className={cn(
          "grid overflow-hidden transition-[grid-template-rows] duration-200 ease-out",
          isExpanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
      >
        <div className="min-h-0">
          {isExpanded && <ClienteSparkline cliente={cliente} peakMes={peakMes} spansYears={spansYears} />}
        </div>
      </div>
    </div>
  );
}

function ClienteSparkline({
  cliente, peakMes, spansYears,
}: {
  cliente: ClienteRow;
  peakMes: number;
  spansYears: boolean;
}) {
  // Cuando el rango cruza años, mostramos label "May '25". Sino solo "May".
  const labelFor = (m: MesRow) => spansYears
    ? `${m.mes_label} '${String(m.mes_anio).slice(-2)}`
    : m.mes_label;

  const cols = Math.max(cliente.meses.length, 1);

  return (
    <div className="bg-gray-50/40 px-4 py-4">
      <div
        className="grid gap-1"
        style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
      >
        {cliente.meses.map(m => {
          const heightPct = peakMes > 0 ? (m.ventas / peakMes) * 100 : 0;
          const hasData = m.ventas > 0;
          return (
            <div key={`${m.mes_anio}-${m.mes_idx}`} className="flex flex-col items-center gap-1">
              <div className="relative flex h-12 w-full items-end justify-center rounded-sm bg-gray-100">
                {hasData && (
                  <div
                    className="w-full rounded-sm bg-teal-700/80 transition-all"
                    style={{ height: `${Math.max(4, heightPct)}%` }}
                    title={`${labelFor(m)}: ${fmtMoney(m.ventas)}`}
                  />
                )}
              </div>
              <p className="text-xs font-medium uppercase text-gray-500 whitespace-nowrap">{labelFor(m)}</p>
              <p className={cn(
                "font-mono text-xs tabular-nums",
                hasData ? "text-gray-700" : "text-gray-300",
              )}>
                {hasData ? fmtMoneyCompact(m.ventas) : "—"}
              </p>
            </div>
          );
        })}
      </div>
      <div className="mt-1 -ml-2">
        <AyudaEscala />
      </div>
    </div>
  );
}
