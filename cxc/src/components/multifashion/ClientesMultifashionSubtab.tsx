"use client";

// Sub-tab "Clientes" de Multifashion. La tabla de Mayoreo tiene DOS layouts
// según el ancho ÚTIL: la grilla en escritorio (≥lg) y una tarjeta por cliente
// en celular e iPad (<lg) — el porqué medido está en `ClienteTarjeta`, al final
// del archivo.
//
// Período: el ÚNICO del módulo, elegido en el encabezado (6-sep-2026). Antes
// esta pestaña tenía sus CUATRO píldoras propias.
//
// Arriba, en una línea, la cobertura del período: cuántos tiquetes tienen nombre
// y qué porción de la venta son. Es lo primero que hay que saber antes de leer
// el ranking — el mostrador anónimo es la mayor parte de la tienda.
//
// Dos secciones:
//   1. Mayoreo: clientes con is_wholesale=true (la columna sigue llamándose
//      así en la DB; la UI dice "Mayoreo" — cero jerga en inglés). Conserva la
//      tabla ancha del escritorio, sus tarjetas del celular y el sparkline.
//      La columna "#" es la POSICIÓN en el ranking por monto (no un id).
//   2. Clientes identificados: la LISTA DE SEGUIMIENTO —
//      `ListaSeguimientoClientes` — con el bucket "Anónimos (mostrador)"
//      (CONTADO / CONSUMIDOR FINAL) aparte.
//
// 🔴 QUÉ CAMBIÓ EL 16-sep-2026. La sección 2 era el TOP 50 del período por
// monto y pasó a ser la lista de seguimiento y postventa: TODOS los clientes
// con compras, del que más tiempo lleva sin volver. El porqué, lo medido y las
// citas de Daniel viven en `ListaSeguimientoClientes.tsx` y en
// `lib/multifashion/clientes-universo.ts`. Dos cosas que hay que saber acá:
//
// ⚠️ Esa lista NO sigue el período del módulo, a propósito: «quién no vuelve»
// es una foto de HOY, igual que las cuatro tarjetas. El período sigue mandando
// en la cobertura, en Mayoreo y en el bucket anónimo.
//
// 🔴 Y NO SE PAREA MÁS POR NOMBRE: la lista ES el universo de fidelización y su
// identidad es el CÓDIGO de Switch.

import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { Card } from "@/components/ui/card";
import { Package, Users, ChevronDown, Store, Repeat, UserPlus, Moon, Percent } from "lucide-react";
import { fmtMoney, fmtMoneyCompact } from "@/lib/ventas/format";
import { Ayuda } from "@/components/shared/Ayuda";
import { nombreEnPantalla } from "@/lib/multifashion/nombres";
import { coberturaDeClientes, FILAS_CLIENTES_AL_ABRIR } from "@/lib/multifashion/clientes-cobertura";
import { etiquetaPeriodo, type Periodo } from "@/lib/multifashion/periodo";
import { ListaSeguimientoClientes } from "./ListaSeguimientoClientes";
import type { ClienteUniverso } from "@/lib/multifashion/clientes-universo";
import { RETAIL_AL_FRENTE, fueraDelRanking } from "@/lib/multifashion/retail-al-frente";

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

// ─── Fidelización ACS (endpoint /api/multifashion/fidelizacion) ─────────────

interface FidelResp {
  hoy: string;
  detalle_activo: boolean;
  cards: { frecuentes: number; nuevos_mes: number; dormidos: number; cinco_pendiente: number };
  clientes: ClienteUniverso[];
}

interface ClientesMultifashionSubtabProps {
  selectedYear: number;
  mes: number;
  /**
   * El período ÚNICO del módulo (6-sep-2026). 🩸 Esta pestaña tenía CUATRO
   * píldoras propias (Mes · 3m · 6m · 12m) que decían el LARGO de la ventana
   * pero nunca el mes en el que termina — y ese mes lo fijaba el selector del
   * shell, que en esta pestaña **ni siquiera se dibujaba**. Ahora el período es
   * uno solo, se elige arriba y dice con todas las letras cuál es.
   */
  periodo: Periodo;
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

// Las dos fechas que pide el RPC, sacadas del período único del módulo.
//   · un MES        → ese mes entero.
//   · TODO EL AÑO   → del 1 de enero al 31 de diciembre de ese año.
//   · últimos N     → N meses terminando en el mes de corte (cruza año solo).
// El fin de una ventana rodante y de un mes es el último día del mes; que el mes
// esté en curso no cambia nada: el RPC no encuentra ventas que no existen.
export function computeRange(
  periodo: Periodo, selectedYear: number, mes: number,
): { fecha_inicio: string; fecha_fin: string } {
  if (periodo.tipo === "anio") {
    return { fecha_inicio: `${periodo.anio}-01-01`, fecha_fin: `${periodo.anio}-12-31` };
  }

  const mm = String(mes).padStart(2, "0");
  const lastDay = new Date(selectedYear, mes, 0).getDate();
  const fecha_fin = `${selectedYear}-${mm}-${String(lastDay).padStart(2, "0")}`;

  if (periodo.tipo === "mes") {
    return { fecha_inicio: `${selectedYear}-${mm}-01`, fecha_fin };
  }

  const start = new Date(selectedYear, mes - 1 - (periodo.n - 1), 1);
  const sy = start.getFullYear();
  const sm = String(start.getMonth() + 1).padStart(2, "0");
  return { fecha_inicio: `${sy}-${sm}-01`, fecha_fin };
}

// ─── Component ─────────────────────────────────────────────────────────────

export function ClientesMultifashionSubtab({ selectedYear, mes, periodo }: ClientesMultifashionSubtabProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const range = useMemo(() => computeRange(periodo, selectedYear, mes), [periodo, selectedYear, mes]);
  const periodoStr = useMemo(() => {
    if (periodo.tipo === "ultimos") {
      return `${etiquetaPeriodo(periodo)} · hasta ${MES_NOMBRES[mes - 1].toLowerCase()} ${selectedYear}`;
    }
    return etiquetaPeriodo(periodo);
  }, [periodo, mes, selectedYear]);

  // MISMOS params que antes: el querystring (fecha_inicio + fecha_fin) ES la
  // clave SWR → cada rango cachea por separado y revalida en background. Un solo
  // useSWR cuyo fetcher dispara ambos fetch en paralelo y devuelve {wholesale,
  // retail}, preservando el loading/error combinados del Promise.all original.
  const qs = `fecha_inicio=${range.fecha_inicio}&fecha_fin=${range.fecha_fin}`;
  const { data, error, isLoading, mutate } = useSWR<{ wholesale: WholesaleResp | null; retail: RetailResp }>(
    ["multifashion-clientes", range.fecha_inicio, range.fecha_fin],
    async () => {
      const [ws, rt] = await Promise.all([
        // 🩸 Con `RETAIL_AL_FRENTE` el bloque «Mayoreo» se fue y su consulta
        // NO se hace (la ruta contesta 410): la plata del mayoreo se dice en
        // la línea chiquita del Resumen.
        RETAIL_AL_FRENTE ? Promise.resolve(null) : fetch(`/api/multifashion/clientes-wholesale?${qs}`, { cache: "no-store" }).then(async r => {
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
  // Cuántos tiquetes del período tienen nombre y qué porción de la venta son.
  const cobertura = useMemo(() => coberturaDeClientes(retail), [retail]);
  const loading = isLoading && !data;
  const errorMsg = error ? (error instanceof Error ? error.message : "error inesperado") : null;

  // ── El universo de clientes (snapshot de HOY, sin período) ───────────────
  // De acá salen las CUATRO tarjetas y la lista de seguimiento. Si el endpoint
  // falla, la pestaña degrada a lo de siempre: cobertura, Mayoreo y el bucket
  // anónimo se dibujan igual, sin tarjetas y sin lista.
  const { data: fidel } = useSWR<FidelResp>(
    "multifashion-fidelizacion",
    async () => {
      const r = await fetch("/api/multifashion/fidelizacion", { cache: "no-store" });
      if (!r.ok) throw new Error(`fidelizacion HTTP ${r.status}`);
      return r.json();
    },
    { dedupingInterval: 5 * 60_000, revalidateOnFocus: false },
  );

  // Al cambiar el rango, colapsa la fila expandida (igual que el efecto original
  // hacía con setExpandedId(null) en cada cambio de params).
  useEffect(() => {
    setExpandedId(null);
  }, [range.fecha_inicio, range.fecha_fin]);

  // Pico mensual de los sparklines de Mayoreo. 🔴 Sigue mirando TAMBIÉN el
  // retail del período aunque esa sección ya no dibuje barras: la escala se
  // llama «compartida entre mayoreo y retail» en la pantalla y tiene que seguir
  // significando eso, o el rótulo miente.
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

  // 🔴 LA PESTAÑA MÍNIMA (23-sep-2026, mockup aprobado): 8 elementos → 5.
  // 1. la cobertura, con el mostrador en la MISMA línea · 2. TRES tarjetas
  // («Dormidos» era el chip «No vuelven») · 3. los chips · 4. la lista, con
  // cuánto compró cada uno · 5. «Ver los N». Se fueron: el bloque Mayoreo, el
  // encabezado repetido y el renglón de anónimos suelto. 🔴 La Frontera queda
  // fuera de la lista POR CÓDIGO (`fueraDelRanking`), nunca por nombre; las
  // cuatro cuentas de las tarjetas no se tocan.
  if (RETAIL_AL_FRENTE) {
    const clientesLista = fidel ? fidel.clientes.filter((c) => !fueraDelRanking(c.cliente_switch_id)) : [];
    return (
      <div data-pestana="clientes-minimo" className={cn("space-y-5", loading && "opacity-60 pointer-events-none transition-opacity")}>
        {errorMsg ? (
          <Card className="rounded-md border border-orange-200 bg-orange-50 p-4 text-xs text-orange-900">
            No se pudo cargar la lista: {errorMsg}
            <button onClick={() => mutate()} className="ml-2 font-medium underline underline-offset-2 hover:text-orange-700">Reintentar</button>
          </Card>
        ) : loading && !retail ? (
          <Card className="flex min-h-[200px] items-center justify-center p-12 text-sm text-gray-500">
            Cargando clientes…
          </Card>
        ) : (
          <div className="space-y-6">
            <div data-elemento="cobertura">
              <h3 className="sr-only">Clientes · {periodoStr}</h3>
              {cobertura.texto && (
                <p className="text-sm text-gray-700">
                  {cobertura.texto}
                  {retail && (retail.ventas_anonimas > 0 || retail.tickets_anonimos > 0) && (
                    <span className="text-gray-500">
                      {" · "}mostrador <span className="font-mono tabular-nums">{fmtMoney(retail.ventas_anonimas)}</span>
                      {" · "}<span className="font-mono tabular-nums">{retail.tickets_anonimos.toLocaleString()}</span> tickets, aparte
                    </span>
                  )}
                </p>
              )}
            </div>

            {fidel && (
              <section data-elemento="tarjetas" className="space-y-3">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <SegCard icon={<Repeat className="h-4 w-4" />} tone="teal" valor={fidel.cards.frecuentes} label="Frecuentes" sub="2+ visitas en 90 días" />
                  <SegCard icon={<UserPlus className="h-4 w-4" />} tone="teal" valor={fidel.cards.nuevos_mes} label="Nuevos del mes" sub="registrados este mes" />
                  <SegCard icon={<Percent className="h-4 w-4" />} tone="teal" valor={fidel.cards.cinco_pendiente} label="5% pendiente" sub="sin segunda visita" />
                </div>
                {!fidel.detalle_activo && (
                  <p className="text-xs text-gray-400">
                    El estado &quot;usado&quot; del 5% se activa cuando corra la migración de detalle.
                  </p>
                )}
              </section>
            )}

            {fidel && <ListaSeguimientoClientes clientes={clientesLista} hoy={fidel.hoy} conMonto />}
          </div>
        )}
      </div>
    );
  }

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
          {/* 🔴 LA COBERTURA, ARRIBA Y EN UNA LÍNEA. Se recalcula para el período
              elegido — nunca escrita fija. Sin tiquetes no se dibuja: un
              «0% — 0%» se leería como dato roto. Ver `clientes-cobertura.ts`. */}
          <div>
            {/* `sr-only`: la pestaña ya dice "Clientes" y el desplegable del
                encabezado enseña el período. */}
            <h3 className="sr-only">Clientes · {periodoStr}</h3>
            {cobertura.texto && (
              <p className="text-sm text-gray-700">{cobertura.texto}</p>
            )}
            <p className="mt-0.5 text-xs text-gray-400">Mostrador anónimo va aparte</p>
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
              {/* 🔴 LOS CHIPS SE MUDARON A LA LISTA (16-sep-2026) y pasaron de
                  cuatro a TRES: filtran la lista de seguimiento, así que van
                  pegados a ella. Ver `ListaSeguimientoClientes`. */}
              {!fidel.detalle_activo && (
                <p className="text-xs text-gray-400">
                  El estado &quot;usado&quot; del 5% se activa cuando corra la migración de detalle.
                </p>
              )}
            </section>
          )}

          {/* Sección 1: Mayoreo (is_wholesale=true).
              🔴 SI NO HAY, NO APARECE (6-sep-2026). Medido: en 2026 el mayoreo
              de la tienda son CINCO facturas en tres meses de nueve — o sea que
              seis meses de cada nueve la pantalla gastaba una caja entera para
              decir «No hay clientes de mayoreo en Septiembre 2026». Un bloque
              vacío no es información. Cuando SÍ hay, se ve igual que siempre. */}
          {(wholesale?.clientes.length ?? 0) > 0 && (
            <ClientesSection
              key={`ws-${range.fecha_inicio}-${range.fecha_fin}`}
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
          )}

          {/* Sección 2: la LISTA DE SEGUIMIENTO — todos los clientes con
              compras, del que más tiempo lleva sin volver. Snapshot de HOY: no
              sigue el período del módulo, igual que las cuatro tarjetas. */}
          {fidel && <ListaSeguimientoClientes clientes={fidel.clientes} hoy={fidel.hoy} />}

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
                <Ayuda titulo="Qué entra aquí">
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
          {/* 🩸 Iban con `truncate`: a 834 (iPad vertical, la barra lateral se
              lleva 224 px) "Nuevos del mes" quedaba en 62 px de 99 y
              "registrados este mes" en 62 de 129 — la mitad del rótulo. Son
              dos o tres palabras: envuelven. */}
          <p className="text-xs font-medium text-gray-900">{label}</p>
          <p className="text-xs text-gray-400">{sub}</p>
        </div>
      </div>
    </Card>
  );
}

/**
 * La sección con tabla ancha en escritorio y tarjetas en celular.
 *
 * ⚠️ 16-sep-2026: hoy la usa SOLO Mayoreo. La sección de clientes
 * identificados pasó a ser `ListaSeguimientoClientes`, que es UNA sola fila
 * igual en los dos anchos. Se conserva genérica —`prefix`, `filasAlAbrir`—
 * porque Mayoreo es exactamente el caso para el que existe: seis columnas de
 * cifras que a 390 px no entran.
 */
function ClientesSection({
  prefix, title, subtitle, icon, iconTone,
  clientes, peakMes, spansYears, expandedId, onToggleRow, emptyText,
  filasAlAbrir,
}: {
  prefix: "ws" | "rt";
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  iconTone: "amber" | "teal";
  clientes: ClienteRow[];
  peakMes: number;
  spansYears: boolean;
  expandedId: string | null;
  onToggleRow: (id: string) => void;
  emptyText: string;
  /** Cuántas filas se ven antes de tocar «Ver los N». Sin esto, todas. */
  filasAlAbrir?: number;
}) {
  const toneIcon = iconTone === "amber"
    ? "border-amber-100 bg-amber-50 text-amber-700"
    : "border-teal-100 bg-teal-50 text-teal-700";

  // «Ver los N» — nunca «Ver más», que no dice cuántos faltan.
  const [verTodos, setVerTodos] = useState(false);
  const recorta = filasAlAbrir != null && !verTodos && clientes.length > filasAlAbrir;
  const visibles = recorta ? clientes.slice(0, filasAlAbrir) : clientes;

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
          {visibles.map((c, idx) => {
            const id = `${prefix}-${c.nombre}`;
            return (
              <ClienteTarjeta
                key={id}
                id={id}
                rank={idx + 1}
                cliente={c}
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
            "grid grid-cols-[2.5rem_minmax(0,1fr)_7rem_4rem_5rem_6rem_1.25rem]",
          )}>
            <span className="text-right" title="Posición en el ranking por monto">#</span>
            <span>Cliente</span>
            <span className="text-right">Total</span>
            <span className="text-right">Tickets</span>
            <span className="text-right">T. prom</span>
            <span className="text-right">Última</span>
            <span />
          </div>

          {visibles.map((c, idx) => {
            const id = `${prefix}-${c.nombre}`;
            const isExpanded = expandedId === id;
            return (
              <ClienteRowItem
                key={id}
                id={id}
                rank={idx + 1}
                cliente={c}
                peakMes={peakMes}
                spansYears={spansYears}
                isExpanded={isExpanded}
                onToggle={onToggleRow}
              />
            );
          })}
        </Card>
        {recorta && (
          <button
            type="button"
            onClick={() => setVerTodos(true)}
            className="inline-flex min-h-[44px] items-center rounded-md border border-gray-200 bg-white px-3 text-xs font-medium text-gray-700 transition hover:border-gray-300 hover:text-gray-950 active:scale-[0.97]"
          >
            Ver los {clientes.length}
          </button>
        )}
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
 * NINGÚN número cambia: son las mismas 6 cifras de la fila.
 *
 * ⚠️ 16-sep-2026: el 5 % y el botón de WhatsApp salieron de acá. No se
 * perdieron — se fueron a `ListaSeguimientoClientes`, que es donde la tienda
 * escribe. Esta tarjeta hoy la usa solo Mayoreo, que nunca los tuvo.
 */
function ClienteTarjeta({
  id, rank, cliente, peakMes, spansYears, isExpanded, onToggle,
}: {
  id: string;
  rank: number;
  cliente: ClienteRow;
  peakMes: number;
  spansYears: boolean;
  isExpanded: boolean;
  onToggle: (id: string) => void;
}) {
  const ticketProm = cliente.ticket_prom != null
    ? cliente.ticket_prom
    : (cliente.tickets_ytd > 0 ? cliente.total_ytd / cliente.tickets_ytd : 0);

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
          <span className="block truncate text-sm font-medium text-gray-900">{nombreEnPantalla(cliente.nombre)}</span>
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

/**
 * La fila de la tabla ancha del escritorio. Hoy la usa solo Mayoreo.
 *
 * ⚠️ 16-sep-2026: se fueron las columnas del 5 % y de WhatsApp — Mayoreo nunca
 * las recibió, y los clientes identificados pasaron a
 * `ListaSeguimientoClientes`. Por eso la grilla es UNA sola, ya no dos.
 */
function ClienteRowItem({
  id, rank, cliente, peakMes, spansYears, isExpanded, onToggle,
}: {
  id: string;
  rank: number;
  cliente: ClienteRow;
  peakMes: number;
  spansYears: boolean;
  isExpanded: boolean;
  onToggle: (id: string) => void;
}) {
  const ticketProm = cliente.ticket_prom != null
    ? cliente.ticket_prom
    : (cliente.tickets_ytd > 0 ? cliente.total_ytd / cliente.tickets_ytd : 0);

  return (
    <div className="border-t border-gray-200">
      <div
        role="button"
        tabIndex={0}
        onClick={() => onToggle(id)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onToggle(id); } }}
        aria-expanded={isExpanded}
        className={cn(
          "grid w-full cursor-pointer items-center gap-3 px-3.5 py-2.5 text-left text-sm transition",
          "grid-cols-[2.5rem_minmax(0,1fr)_7rem_4rem_5rem_6rem_1.25rem]",
          "hover:bg-gray-50/60",
          isExpanded && "bg-gray-50/80",
        )}
      >
        <span className="text-right font-mono text-xs text-gray-500 tabular-nums">{rank}</span>
        <span className="truncate font-medium text-gray-900">{nombreEnPantalla(cliente.nombre)}</span>
        <span className="text-right font-mono text-gray-950 tabular-nums">{fmtMoney(cliente.total_ytd)}</span>
        <span className="text-right font-mono text-gray-700 tabular-nums">{cliente.tickets_ytd.toLocaleString()}</span>
        <span className="text-right font-mono text-gray-700 tabular-nums">${ticketProm.toFixed(2)}</span>
        <span className="text-right font-mono text-xs text-gray-500 tabular-nums">{formatFechaShort(cliente.ultima_compra)}</span>
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
