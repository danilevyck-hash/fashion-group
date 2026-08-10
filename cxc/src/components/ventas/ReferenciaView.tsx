"use client";

// ─────────────────────────────────────────────────────────────────────────────
// Tab "Referencia" de /ventas (solo admin — el guard real es el SSR de la
// página + requireRole en el API; esta vista es solo la cara).
//
// Diseño = el mockup aprobado por Daniel: chips de período, tarjeta con KPIs,
// aviso ámbar de agotado, barras mes a mes, tabla por color, vista múltiple
// con botón Excel. Toda la matemática viene del módulo PURO
// (@/lib/ventas/referencia) — acá no se suma ni se firma nada.
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Download, Search } from "lucide-react";
import { fetchJsonWithRetry, describeFetchError } from "@/lib/fetch-retry";
import {
  calcularStats,
  serieContinua,
  sumarSeries,
  modeloDe,
  colorDe,
  parsearListaCodigos,
  MAX_CODIGOS_MULTI,
  UMBRALES_AGOTADO,
  type MesSerie,
  type ReferenciaSerie,
  type ReferenciaStats,
  type ReferenciaApiResp,
} from "@/lib/ventas/referencia";
import {
  TEMPORADAS,
  ventanasTemporada,
  statsEnVentana,
  type VentanaTemporada,
} from "@/lib/ventas/temporadas-referencia";
import { estadoTexto, exportReferenciasToExcel, type FilaMultiExcel } from "@/lib/ventas/referencia-excel";
import { fmtFrescura, fobEstimado, margenSobreFob, PCT_IMPORTACION_DEFAULT } from "@/lib/ventas/referencia-info";

/** "1.10" — para decir en pantalla de dónde sale el FOB estimado. */
const DIVISOR_FOB_EST = (1 + PCT_IMPORTACION_DEFAULT).toFixed(2);

// ─── Formato ─────────────────────────────────────────────────────────────────

const MESES_CORTO = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

function fmtMes(mes: string): string {
  const [y, m] = mes.split("-").map(Number);
  return `${MESES_CORTO[m - 1]}-${String(y).slice(-2)}`;
}

function fmtInt(n: number): string {
  return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

function fmtMoney(n: number): string {
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtU(n: number | null): string {
  return n == null ? "—" : n.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

function fmtPct(n: number | null): string {
  return n == null ? "—" : (n * 100).toFixed(1) + "%";
}

function etiquetaEmpresa(key: string): string {
  return key.replace(/_/g, " ").toUpperCase();
}

type Periodo = "3" | "6" | "12";

// ─── Vista principal ─────────────────────────────────────────────────────────

export function ReferenciaView() {
  const [modo, setModo] = useState<"una" | "varias">("una");

  return (
    // 860 es el ancho del mockup aprobado; desde xl se abre a 1140 para que la
    // tabla con las columnas de costos (CIF / FOB est. / margen) entre sin
    // arrastre en escritorio. En celular/iPad la tabla scrollea en su propio
    // contenedor, como en el mockup.
    <div className="max-w-[860px] xl:max-w-[1140px]">
      {/* Selector de modo */}
      <div className="mb-4 flex gap-2">
        <BotonModo activo={modo === "una"} onClick={() => setModo("una")}>
          Una referencia
        </BotonModo>
        <BotonModo activo={modo === "varias"} onClick={() => setModo("varias")}>
          Varias · pegar lista
        </BotonModo>
      </div>

      {/* Los dos modos se montan siempre (hidden) para no perder lo buscado al alternar. */}
      <div className={modo === "una" ? "" : "hidden"}>
        <VistaUna />
      </div>
      <div className={modo === "varias" ? "" : "hidden"}>
        <VistaVarias />
      </div>
    </div>
  );
}

function BotonModo({ activo, onClick, children }: { activo: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-h-[44px] rounded-lg border px-4 text-sm font-semibold transition-colors ${
        activo
          ? "border-gray-900 bg-gray-900 text-white"
          : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
      }`}
    >
      {children}
    </button>
  );
}

// ─── Modo "una referencia" ───────────────────────────────────────────────────

function VistaUna() {
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resp, setResp] = useState<ReferenciaApiResp | null>(null);
  const [periodo, setPeriodo] = useState<Periodo>("12");
  const [temporada, setTemporada] = useState<string | null>(null);
  const [selectorTemporada, setSelectorTemporada] = useState(false);
  // Lo último buscado con éxito: es lo que se re-consulta después de
  // "Actualizar datos de Switch" para que la tarjeta muestre lo recién traído.
  const [ultimaBusqueda, setUltimaBusqueda] = useState<string | null>(null);

  const buscar = async (texto: string, silencioso = false) => {
    const query = texto.trim();
    if (query.length < 3) {
      setError("Escribe al menos 3 caracteres.");
      return;
    }
    if (!silencioso) setLoading(true);
    setError(null);
    try {
      const r = await fetchJsonWithRetry<ReferenciaApiResp>(
        `/api/ventas/referencia?q=${encodeURIComponent(query)}`,
      );
      setResp(r);
      setUltimaBusqueda(query);
    } catch (err) {
      setError(describeFetchError(err));
    } finally {
      if (!silencioso) setLoading(false);
    }
  };

  // Agrupar referencias por modelo (los últimos 3 dígitos son el color).
  const modelos = useMemo(() => {
    if (!resp?.referencias?.length) return [];
    const grupos = new Map<string, ReferenciaSerie[]>();
    for (const r of resp.referencias) {
      const m = modeloDe(r.codigo);
      grupos.set(m, [...(grupos.get(m) ?? []), r]);
    }
    return [...grupos.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [resp]);

  return (
    <div>
      <form
        className="rounded-xl border border-gray-200 bg-white p-3.5"
        onSubmit={(e) => {
          e.preventDefault();
          void buscar(q);
        }}
      >
        <div className="flex gap-2.5">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Código, modelo o descripción…"
            autoCapitalize="characters"
            autoCorrect="off"
            className="min-h-[44px] min-w-0 flex-1 rounded-lg border border-gray-200 bg-gray-50 px-3 text-[15px] text-gray-900 outline-none focus:border-gray-400"
          />
          <Button type="submit" disabled={loading} className="min-h-[44px] px-5">
            <Search className="mr-1.5 h-4 w-4" /> Buscar
          </Button>
        </div>
        <p className="mt-2 text-xs text-gray-500">
          Escribe el modelo (<b>31KAE22003</b> → todos los colores), el código exacto (<b>31KAE22003001</b>) o la
          descripción (<b>kahlo</b>).
        </p>
      </form>

      {/* Chips de período */}
      <div className="mt-3.5 flex flex-wrap gap-2">
        {(["3", "6", "12"] as Periodo[]).map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => {
              setPeriodo(p);
              setTemporada(null);
              setSelectorTemporada(false);
            }}
            className={`min-h-[44px] rounded-full border px-4 text-[13px] font-semibold ${
              temporada == null && periodo === p
                ? "border-teal-700 bg-teal-700 text-white"
                : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
            }`}
          >
            {p} meses
          </button>
        ))}
        <button
          type="button"
          onClick={() => setSelectorTemporada((v) => !v)}
          className={`min-h-[44px] rounded-full border border-dashed px-4 text-[13px] font-semibold ${
            temporada != null
              ? "border-teal-700 bg-teal-700 text-white"
              : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
          }`}
        >
          {temporada ? `Temporada ${temporada}` : "Temporada…"}
        </button>
      </div>

      {selectorTemporada && (
        <SelectorTemporada
          hoyMes={resp?.hoyMes ?? null}
          onElegir={(codigo) => {
            setTemporada(codigo);
            setSelectorTemporada(false);
          }}
        />
      )}

      {error && <AvisoError texto={error} />}
      {loading && <p className="mt-4 text-sm text-gray-500">Buscando…</p>}

      {!loading && resp?.modo === "coincidencias" && (
        <Coincidencias resp={resp} onElegir={(modelo) => { setQ(modelo); void buscar(modelo); }} />
      )}

      {!loading &&
        resp?.modo === "referencias" &&
        modelos.map(([modelo, refs]) => (
          <TarjetaModelo
            key={modelo}
            modelo={modelo}
            refs={refs}
            hoyMes={resp.hoyMes}
            periodo={periodo}
            temporada={temporada}
            infoDisponible={resp.infoDisponible !== false}
            onActualizado={() => {
              if (ultimaBusqueda) void buscar(ultimaBusqueda, true);
            }}
          />
        ))}
      {!loading && resp?.modo === "referencias" && !modelos.length && (
        <p className="mt-4 text-sm text-gray-500">No se encontró esa referencia en las 6 empresas del grupo.</p>
      )}
    </div>
  );
}

function AvisoError({ texto }: { texto: string }) {
  return (
    <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{texto}</div>
  );
}

function Coincidencias({
  resp,
  onElegir,
}: {
  resp: ReferenciaApiResp;
  onElegir: (modelo: string) => void;
}) {
  const lista = resp.coincidencias ?? [];
  if (!lista.length) {
    return <p className="mt-4 text-sm text-gray-500">No se encontró nada con esa descripción en las 6 empresas del grupo.</p>;
  }
  return (
    <div className="mt-4 overflow-hidden rounded-xl border border-gray-200 bg-white">
      <p className="border-b border-gray-100 px-4 py-3 text-sm font-semibold text-gray-900">
        {lista.length === 100 ? "Más de 100 coincidencias — elige una o afina la búsqueda" : `${lista.length} coincidencia${lista.length === 1 ? "" : "s"} — elige una`}
      </p>
      <ul>
        {lista.map((c) => (
          <li key={c.modelo} className="border-b border-gray-100 last:border-b-0">
            <button
              type="button"
              onClick={() => onElegir(c.modelo)}
              className="flex min-h-[44px] w-full flex-wrap items-center gap-x-3 gap-y-0.5 px-4 py-2 text-left hover:bg-gray-50"
            >
              <span className="font-mono text-sm font-bold text-gray-900">{c.modelo}</span>
              <span className="text-[13px] text-gray-500">{c.descripcion}</span>
              <span className="ml-auto text-xs text-gray-400">
                {etiquetaEmpresa(c.empresa)} · {c.colores} {c.colores === 1 ? "color" : "colores"}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SelectorTemporada({
  hoyMes,
  onElegir,
}: {
  hoyMes: string | null;
  onElegir: (codigo: string) => void;
}) {
  const familias = ["Tommy/Calvin", "Reebok"] as const;
  return (
    <div className="mt-3 rounded-xl border border-gray-200 bg-white p-4">
      <p className="mb-2.5 text-sm font-semibold text-gray-900">¿Para qué temporada compras?</p>
      {familias.map((fam) => (
        <div key={fam} className="mb-2 flex flex-wrap items-center gap-2">
          <span className="w-full text-xs font-semibold uppercase tracking-wide text-gray-400 sm:w-24">{fam}</span>
          {TEMPORADAS.filter((t) => t.familia === fam).map((t) => (
            <button
              key={t.codigo}
              type="button"
              onClick={() => onElegir(t.codigo)}
              className="min-h-[44px] rounded-full border border-gray-200 bg-white px-4 text-[13px] font-semibold text-gray-700 hover:bg-gray-50"
            >
              {t.nombre}
            </button>
          ))}
        </div>
      ))}
      <p className="mt-2 text-[13px] text-gray-500">
        Se muestran las 2 temporadas ya terminadas más recientes
        {hoyMes ? ` (ej. SP → ${ventanasTemporada("SP", hoyMes).map((v) => v.etiqueta).join(" y ")})` : ""} — lo que
        se vendió la temporada pasada es lo que mejor predice la que viene.
      </p>
    </div>
  );
}

// ─── Tarjeta de un modelo (sus colores) ──────────────────────────────────────

function TarjetaModelo({
  modelo,
  refs,
  hoyMes,
  periodo,
  temporada,
  infoDisponible,
  onActualizado,
}: {
  modelo: string;
  refs: ReferenciaSerie[];
  hoyMes: string;
  periodo: Periodo;
  temporada: string | null;
  infoDisponible: boolean;
  onActualizado: () => void;
}) {
  const serieModelo = useMemo(() => sumarSeries(refs.map((r) => r.serie)), [refs]);
  const stats = useMemo(() => calcularStats(serieModelo, hoyMes), [serieModelo, hoyMes]);
  const ventanas = useMemo(
    () => (temporada ? ventanasTemporada(temporada, hoyMes) : null),
    [temporada, hoyMes],
  );
  const barras = useMemo(() => serieContinua(serieModelo, hoyMes), [serieModelo, hoyMes]);
  const descripcion = refs[0]?.descripcion ?? "";
  const empresa = refs[0]?.empresa ?? "";
  // Nombre COMERCIAL del catálogo ("KAHLO PASSCASE") — la descripción de las
  // ventas es solo categoría+género. Se muestra si el catálogo lo tiene.
  const nombreComercial = refs.find((r) => r.info?.descripcion)?.info?.descripcion ?? null;
  const hayInfo = refs.some((r) => r.info != null);
  const conExistencia = refs.filter((r) => r.info?.existencia != null);
  const existenciaTotal = conExistencia.length
    ? conExistencia.reduce((s, r) => s + (r.info?.existencia ?? 0), 0)
    : null;
  const frescura = refs
    .map((r) => r.info?.syncedAt)
    .filter((s): s is string => !!s)
    .sort()
    .at(-1);
  // Costo CIF del modelo: solo si TODOS los colores con dato coinciden (lo
  // normal). Si varía por color, la franja calla y manda la tabla.
  const cifs = refs.map((r) => r.info?.costoCif).filter((c): c is number => c != null && c > 0);
  const cifModelo = cifs.length && cifs.every((c) => c === cifs[0]) ? cifs[0] : null;
  const fobEstModelo = fobEstimado(cifModelo);
  // Margen sobre el precio REAL de ventas; sin ventas, sobre la etiqueta.
  const precioEtiquetaModelo = refs.find((r) => r.info?.precioEtiqueta != null)?.info?.precioEtiqueta ?? null;
  const margenFobModelo = margenSobreFob(stats.precioReal ?? precioEtiquetaModelo, fobEstModelo);

  return (
    <div className="mt-4 overflow-hidden rounded-xl border border-gray-200 bg-white">
      {/* Cabecera */}
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-gray-200 px-4 py-3.5 sm:px-5">
        <div className="min-w-0">
          <div className="text-[17px] font-extrabold tracking-tight text-gray-950">
            <span className="font-mono">{modelo}</span>
            {(nombreComercial || descripcion) && (
              <span className="ml-2 text-[13px] font-normal text-gray-500">· {nombreComercial ?? descripcion}</span>
            )}
          </div>
          <div className="text-[13px] text-gray-500">
            {nombreComercial && descripcion && <>{descripcion} · </>}
            {refs.length} {refs.length === 1 ? "color" : "colores"}
            {stats.primeraVenta && <> · vende desde {fmtMes(stats.primeraVenta)}</>}
          </div>
        </div>
        <span className="rounded-md bg-indigo-50 px-2.5 py-1 text-xs font-bold text-indigo-700">
          {etiquetaEmpresa(empresa)}
        </span>
      </div>

      {/* Datos de catálogo (Switch) + botón de actualizar. El costo de la API
          se muestra como CIF (identificado 3/3); el FOB SOLO derivado y
          etiquetado "est." — decisión final de Daniel, 10-ago-2026. */}
      <FranjaCatalogo
        empresa={empresa}
        infoDisponible={infoDisponible}
        hayInfo={hayInfo}
        existenciaTotal={existenciaTotal}
        costoCif={cifModelo}
        fobEst={fobEstModelo}
        margenFobEst={margenFobModelo}
        frescura={frescura ?? null}
        onActualizado={onActualizado}
      />

      {/* KPIs */}
      {ventanas ? (
        <KpisTemporada serie={serieModelo} ventanas={ventanas} stats={stats} />
      ) : (
        <KpisPeriodo stats={stats} periodo={periodo} />
      )}

      {/* Aviso de agotado — UN solo ritmo, el que sostiene la sugerencia
          (u/mes real). Decir dos (el de los últimos meses y el real) era
          contradecirse en la misma frase. */}
      {stats.seAgoto && (
        <div className="mx-4 my-3.5 rounded-r-lg border-l-[3px] border-amber-500 bg-amber-50 px-3.5 py-2.5 text-[13px] text-gray-800 sm:mx-5">
          ⚠️ <b className="text-amber-700">Se agotó</b> — última venta hace {stats.mesesDesdeUltimaVenta} meses
          {stats.ultimaVenta && <> ({fmtMes(stats.ultimaVenta)})</>}, vendía{" "}
          <b className="tabular-nums">{fmtU(stats.uMesReal)} u/mes</b> con mercancía.{" "}
          {stats.sugerencia6m != null && (
            <span className="font-extrabold tabular-nums">
              Para {UMBRALES_AGOTADO.MESES_SUGERENCIA} meses: ~{fmtInt(stats.sugerencia6m)} unidades.
            </span>
          )}
        </div>
      )}

      {/* Descontinuado — estado propio y SIN sugerencia de compra (🩸 antes
          recomendaba ~138 unidades de algo sin vender hacía 27 meses). */}
      {stats.descontinuado && (
        <div className="mx-4 my-3.5 rounded-r-lg border-l-[3px] border-gray-400 bg-gray-50 px-3.5 py-2.5 text-[13px] text-gray-800 sm:mx-5">
          <b className="text-gray-900">Descontinuado</b> — última venta hace {stats.mesesDesdeUltimaVenta} meses
          {stats.ultimaVenta && <> ({fmtMes(stats.ultimaVenta)})</>}. Pasó más de un año: no se sugiere compra.
        </div>
      )}

      {/* Barras mes a mes */}
      {barras.length > 0 && <GraficoBarras barras={barras} />}

      {/* Tabla por color */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr>
              <Th>Color</Th>
              {ventanas ? (
                ventanas.map((v) => (
                  <Th key={v.etiqueta} right>
                    {v.etiqueta}
                  </Th>
                ))
              ) : (
                <>
                  <Th right>3 m</Th>
                  <Th right>6 m</Th>
                  <Th right>12 m</Th>
                </>
              )}
              <Th right>u/mes real</Th>
              <Th right>Precio real</Th>
              {hayInfo && <Th right>Exist.</Th>}
              {hayInfo && <Th right>Etiqueta</Th>}
              {hayInfo && <Th right>Costo CIF</Th>}
              {hayInfo && <Th right>FOB est.</Th>}
              {hayInfo && <Th right>Margen s/FOB est.</Th>}
              <Th>Estado</Th>
            </tr>
          </thead>
          <tbody>
            {refs.map((r) => (
              <FilaColor key={r.codigo} referencia={r} hoyMes={hoyMes} ventanas={ventanas} conInfo={hayInfo} />
            ))}
          </tbody>
        </table>
      </div>
      <p className="border-t border-gray-100 px-4 py-2.5 text-xs text-gray-500 sm:px-5">
        Ventas netas: las devoluciones (notas de crédito) ya están restadas. <b>u/mes real</b> cuenta solo los meses
        en que HABÍA mercancía.
        {hayInfo && (
          <>
            {" "}
            El Costo CIF es de Switch; <b>FOB y margen son estimados</b> (CIF ÷ {DIVISOR_FOB_EST}).
          </>
        )}
      </p>
    </div>
  );
}

// ─── Franja de catálogo: existencia + costos + frescura + botón de Switch ────
//
// 🔴 El costo de la API se pinta como "Costo CIF" (identificado 3/3 contra la
// ficha de Switch). El FOB SOLO existe derivado — CIF ÷ (1 + %imp), división
// de vuelta, nunca ×0.9 — y SIEMPRE con la etiqueta "est.". Presentarlo como
// FOB a secas es lo que el candado de articulo-info.test.ts caza.
function FranjaCatalogo({
  empresa,
  infoDisponible,
  hayInfo,
  existenciaTotal,
  costoCif,
  fobEst,
  margenFobEst,
  frescura,
  onActualizado,
}: {
  empresa: string;
  infoDisponible: boolean;
  hayInfo: boolean;
  existenciaTotal: number | null;
  /** CIF del modelo (si todos los colores coinciden; si no, va solo en la tabla). */
  costoCif: number | null;
  fobEst: number | null;
  margenFobEst: number | null;
  frescura: string | null;
  onActualizado: () => void;
}) {
  const [actualizando, setActualizando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const actualizar = async () => {
    setActualizando(true);
    setError(null);
    try {
      const res = await fetch("/api/ventas/referencia/actualizar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ empresa }),
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? "No se pudo actualizar.");
      onActualizado();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo actualizar. Intenta de nuevo en unos segundos.");
    } finally {
      setActualizando(false);
    }
  };

  return (
    <div className="border-b border-gray-200 bg-gray-50/60 px-4 py-2.5 sm:px-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-[13px] text-gray-700">
          {hayInfo ? (
            <>
              {existenciaTotal != null ? (
                <>
                  Existencia: <b className="tabular-nums">{fmtInt(existenciaTotal)} u</b>
                </>
              ) : (
                <>Existencia: sin dato</>
              )}
              {costoCif != null && (
                <>
                  {" · "}Costo CIF: <b className="tabular-nums">{fmtMoney(costoCif)}</b>
                </>
              )}
              {fobEst != null && (
                <>
                  {" · "}FOB est.: <b className="tabular-nums">{fmtMoney(fobEst)}</b>
                </>
              )}
              {margenFobEst != null && (
                <>
                  {" · "}margen s/FOB est.: <b className="tabular-nums">{fmtPct(margenFobEst)}</b>
                </>
              )}
              {frescura && <span className="text-gray-500"> · datos de Switch al {fmtFrescura(frescura)}</span>}
            </>
          ) : infoDisponible ? (
            <>Sin datos de catálogo todavía — toca «Actualizar datos de Switch».</>
          ) : (
            <>Los datos de catálogo (existencia y precio de etiqueta) estarán cuando se corra la migración.</>
          )}
        </div>
        <button
          type="button"
          onClick={() => void actualizar()}
          disabled={actualizando}
          className="min-h-[44px] rounded-lg border border-gray-300 bg-white px-3.5 text-[13px] font-semibold text-gray-800 hover:bg-gray-50 disabled:opacity-60"
        >
          {actualizando ? "Actualizando… (puede tardar 1-2 min)" : "Actualizar datos de Switch"}
        </button>
      </div>
      {error && <p className="mt-1.5 text-xs text-red-700">{error}</p>}
    </div>
  );
}

function KpisPeriodo({ stats, periodo }: { stats: ReferenciaStats; periodo: Periodo }) {
  const sel = periodo === "3" ? stats.m3 : periodo === "6" ? stats.m6 : stats.m12;
  const otras = (["3", "6", "12"] as Periodo[])
    .filter((p) => p !== periodo)
    .map((p) => ({ p, v: p === "3" ? stats.m3 : p === "6" ? stats.m6 : stats.m12 }));
  return (
    <div className="grid grid-cols-1 border-b border-gray-200 sm:grid-cols-3">
      <Kpi
        label={`Unidades · ${periodo} m`}
        valor={fmtInt(sel.unidades)}
        sub={otras.map(({ p, v }) => `${p} m: ${fmtInt(v.unidades)}`).join(" · ")}
      />
      <Kpi
        label={`Venta · ${periodo} m`}
        valor={fmtMoney(sel.venta)}
        sub={otras.map(({ p, v }) => `${p} m: ${fmtMoney(v.venta)}`).join(" · ")}
      />
      <Kpi
        label="Precio real"
        valor={stats.precioReal != null ? fmtMoney(stats.precioReal) : "—"}
        sub="al que salió de verdad"
      />
    </div>
  );
}

function KpisTemporada({
  serie,
  ventanas,
  stats,
}: {
  serie: MesSerie[];
  ventanas: VentanaTemporada[];
  stats: ReferenciaStats;
}) {
  return (
    <div className="grid grid-cols-1 border-b border-gray-200 sm:grid-cols-3">
      {ventanas.map((v) => {
        const s = statsEnVentana(serie, v);
        return (
          <Kpi
            key={v.etiqueta}
            label={`${v.etiqueta} · ${fmtMes(v.desde)} a ${fmtMes(v.hasta)}`}
            valor={`${fmtInt(s.unidades)} u`}
            sub={fmtMoney(s.venta)}
          />
        );
      })}
      <Kpi
        label="Precio real"
        valor={stats.precioReal != null ? fmtMoney(stats.precioReal) : "—"}
        sub="al que salió de verdad"
      />
    </div>
  );
}

function Kpi({ label, valor, sub }: { label: string; valor: string; sub?: string }) {
  return (
    <div className="border-b border-gray-100 px-4 py-3 last:border-b-0 sm:border-b-0 sm:border-r sm:border-gray-200 sm:px-5 sm:py-3.5 sm:last:border-r-0">
      <div className="text-xs font-bold uppercase tracking-wider text-gray-500">{label}</div>
      <div className="mt-0.5 text-2xl font-extrabold tracking-tight text-gray-950 tabular-nums">{valor}</div>
      {sub && <div className="text-[12.5px] text-gray-500 tabular-nums">{sub}</div>}
    </div>
  );
}

function GraficoBarras({ barras }: { barras: MesSerie[] }) {
  const max = Math.max(...barras.map((b) => b.unidades), 1);
  return (
    <div className="px-4 pb-3.5 pt-2 sm:px-5">
      <div className="mb-1.5 text-xs font-bold uppercase tracking-wider text-gray-500">Mes a mes · unidades</div>
      <div className="flex h-16 items-end gap-1">
        {barras.map((b) => (
          <div
            key={b.mes}
            title={`${fmtMes(b.mes)}: ${fmtInt(b.unidades)} u`}
            className={`min-h-[3px] flex-1 rounded-t-[3px] ${b.unidades > 0 ? "bg-teal-700/85" : "bg-gray-200"}`}
            style={{ height: b.unidades > 0 ? `${Math.max(6, (b.unidades / max) * 100)}%` : "3px" }}
          />
        ))}
      </div>
      {/* Etiquetas ≥12px: en celular solo cada 3ª (no caben las 18); desde sm
          todas. Sin overflow-hidden: la etiqueta visible se centra sobre su
          barra y respira sobre las pistas vecinas (que van vacías) en vez de
          recortarse. */}
      <div className="mt-1 flex gap-1 text-xs text-gray-500">
        {barras.map((b, i) => (
          <span key={b.mes} className="min-w-0 flex-1 whitespace-nowrap text-center">
            <span className={i % 3 === 0 ? "" : "hidden sm:inline"}>{MESES_CORTO[Number(b.mes.slice(5)) - 1]}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return (
    <th
      className={`border-b border-gray-200 px-2.5 py-2 text-xs font-bold uppercase tracking-wide text-gray-500 sm:px-5 ${right ? "text-right" : "text-left"}`}
    >
      {children}
    </th>
  );
}

function Td({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return (
    <td className={`border-b border-gray-100 px-2.5 py-2.5 tabular-nums sm:px-5 ${right ? "text-right" : "text-left"}`}>
      {children}
    </td>
  );
}

function PillEstado({ stats }: { stats: ReferenciaStats | null }) {
  const texto = estadoTexto(stats);
  // Descontinuado va en gris (no hay nada que hacer); "se agotó" en rojo,
  // que es el que pide una decisión de compra.
  const clase =
    texto === "ACTIVO"
      ? "bg-emerald-50 text-emerald-700"
      : texto === "NUNCA VENDIDO"
        ? "bg-gray-100 text-gray-600"
        : stats?.descontinuado
          ? "bg-gray-200 text-gray-700"
          : "bg-red-50 text-red-700";
  return (
    <span className={`whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-bold ${clase}`}>{texto}</span>
  );
}

function FilaColor({
  referencia,
  hoyMes,
  ventanas,
  conInfo,
}: {
  referencia: ReferenciaSerie;
  hoyMes: string;
  ventanas: VentanaTemporada[] | null;
  /** true = la tabla lleva las columnas de catálogo (Exist. / Etiqueta). */
  conInfo: boolean;
}) {
  const stats = useMemo(() => calcularStats(referencia.serie, hoyMes), [referencia.serie, hoyMes]);
  const color = colorDe(referencia.codigo);
  // FOB SOLO derivado del CIF (división) y margen sobre el precio real de
  // ventas — sin ventas, sobre la etiqueta. Etiquetas "est." obligatorias.
  const fobEst = fobEstimado(referencia.info?.costoCif ?? null);
  const margenFob = margenSobreFob(stats.precioReal ?? referencia.info?.precioEtiqueta ?? null, fobEst);
  return (
    <tr>
      <Td>
        <span className="font-mono font-bold text-gray-900">{color ?? referencia.codigo}</span>
      </Td>
      {ventanas ? (
        ventanas.map((v) => {
          const s = statsEnVentana(referencia.serie, v);
          return (
            <Td key={v.etiqueta} right>
              {fmtInt(s.unidades)}
            </Td>
          );
        })
      ) : (
        <>
          <Td right>{fmtInt(stats.m3.unidades)}</Td>
          <Td right>{fmtInt(stats.m6.unidades)}</Td>
          <Td right>{fmtInt(stats.m12.unidades)}</Td>
        </>
      )}
      <Td right>{fmtU(stats.uMesReal)}</Td>
      <Td right>{stats.precioReal != null ? fmtMoney(stats.precioReal) : "—"}</Td>
      {conInfo && <Td right>{referencia.info?.existencia != null ? fmtInt(referencia.info.existencia) : "—"}</Td>}
      {conInfo && (
        <Td right>{referencia.info?.precioEtiqueta != null ? fmtMoney(referencia.info.precioEtiqueta) : "—"}</Td>
      )}
      {conInfo && <Td right>{referencia.info?.costoCif != null ? fmtMoney(referencia.info.costoCif) : "—"}</Td>}
      {conInfo && <Td right>{fobEst != null ? fmtMoney(fobEst) : "—"}</Td>}
      {conInfo && <Td right>{fmtPct(margenFob)}</Td>}
      <Td>
        <PillEstado stats={stats} />
      </Td>
    </tr>
  );
}

// ─── Modo "varias" (pegar lista) ─────────────────────────────────────────────

function VistaVarias() {
  const [texto, setTexto] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [resp, setResp] = useState<ReferenciaApiResp | null>(null);

  const buscar = async () => {
    const { codigos, descartados } = parsearListaCodigos(texto);
    if (!codigos.length) {
      setError("Pega al menos un código válido.");
      return;
    }
    setAviso(
      descartados > 0
        ? `La lista trae más de ${MAX_CODIGOS_MULTI} códigos — se buscaron los primeros ${MAX_CODIGOS_MULTI}.`
        : null,
    );
    setLoading(true);
    setError(null);
    try {
      const r = await fetchJsonWithRetry<ReferenciaApiResp>(
        `/api/ventas/referencia?codigos=${encodeURIComponent(codigos.join(","))}`,
      );
      setResp(r);
    } catch (err) {
      setError(describeFetchError(err));
    } finally {
      setLoading(false);
    }
  };

  // Filas calculadas (referencias halladas + no encontradas), en el orden pegado.
  const filas = useMemo<FilaMultiExcel[]>(() => {
    if (!resp?.referencias) return [];
    const halladas: FilaMultiExcel[] = resp.referencias.map((r) => ({
      codigo: r.codigo,
      // El nombre COMERCIAL del catálogo pisa la categoría de ventas.
      descripcion: r.info?.descripcion || r.descripcion,
      empresa: etiquetaEmpresa(r.empresa),
      stats: calcularStats(r.serie, resp.hoyMes),
      existencia: r.info?.existencia ?? null,
      costoCif: r.info?.costoCif ?? null,
      precioEtiqueta: r.info?.precioEtiqueta ?? null,
    }));
    const noEnc: FilaMultiExcel[] = (resp.noEncontrados ?? []).map((c) => ({
      codigo: c,
      descripcion: "",
      empresa: "",
      stats: null,
      existencia: null,
      costoCif: null,
      precioEtiqueta: null,
    }));
    return [...halladas, ...noEnc];
  }, [resp]);

  const encontradas = filas.filter((f) => f.stats != null).length;
  const hayInfoMulti = filas.some((f) => f.existencia != null);
  const frescuraMulti = useMemo(() => {
    const sellos = (resp?.referencias ?? [])
      .map((r) => r.info?.syncedAt)
      .filter((s): s is string => !!s)
      .sort();
    return sellos.at(-1) ?? null;
  }, [resp]);

  return (
    <div>
      <form
        className="rounded-xl border border-gray-200 bg-white p-3.5"
        onSubmit={(e) => {
          e.preventDefault();
          void buscar();
        }}
      >
        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          rows={4}
          placeholder={"31KAE22003 31KAE22002 31KAE22001…"}
          autoCapitalize="characters"
          autoCorrect="off"
          className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 font-mono text-sm text-gray-900 outline-none focus:border-gray-400"
        />
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-gray-500">
            Pega los códigos separados por espacios o saltos de línea — directo desde el Excel del proveedor. Hasta{" "}
            {MAX_CODIGOS_MULTI}.
          </p>
          <Button type="submit" disabled={loading} className="min-h-[44px] px-5">
            <Search className="mr-1.5 h-4 w-4" /> Buscar
          </Button>
        </div>
      </form>

      {error && <AvisoError texto={error} />}
      {aviso && (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-[13px] text-amber-800">
          {aviso}
        </div>
      )}
      {loading && <p className="mt-4 text-sm text-gray-500">Buscando…</p>}

      {!loading && resp && (
        <div className="mt-4 overflow-hidden rounded-xl border border-gray-200 bg-white">
          <div className="flex flex-wrap items-center justify-between gap-2.5 border-b border-gray-200 px-4 py-3 sm:px-5">
            <span className="text-sm font-bold tabular-nums text-gray-900">
              {filas.length} referencias · {encontradas} encontradas
            </span>
            <Button
              type="button"
              variant="outline"
              className="min-h-[44px]"
              disabled={!filas.length}
              onClick={() => void exportReferenciasToExcel(filas, resp.hoyMes)}
            >
              <Download className="mr-1.5 h-4 w-4" /> Descargar Excel
            </Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr>
                  <Th>Referencia</Th>
                  <Th right>3 m</Th>
                  <Th right>6 m</Th>
                  <Th right>12 m</Th>
                  <Th right>u/mes real</Th>
                  <Th right>Precio real</Th>
                  {hayInfoMulti && <Th right>Exist.</Th>}
                  {hayInfoMulti && <Th right>Costo CIF</Th>}
                  {hayInfoMulti && <Th right>FOB est.</Th>}
                  {hayInfoMulti && <Th right>Margen s/FOB est.</Th>}
                  <Th>Estado</Th>
                </tr>
              </thead>
              <tbody>
                {filas.map((f) => (
                  <tr key={f.codigo}>
                    <Td>
                      <span className="font-mono font-bold text-gray-900">{f.codigo}</span>
                      {(f.descripcion || f.empresa) && (
                        <span className="block text-xs text-gray-500">
                          {[f.descripcion, f.empresa].filter(Boolean).join(" · ")}
                        </span>
                      )}
                    </Td>
                    <Td right>{f.stats ? fmtInt(f.stats.m3.unidades) : "—"}</Td>
                    <Td right>{f.stats ? fmtInt(f.stats.m6.unidades) : "—"}</Td>
                    <Td right>{f.stats ? fmtInt(f.stats.m12.unidades) : "—"}</Td>
                    <Td right>{f.stats ? fmtU(f.stats.uMesReal) : "—"}</Td>
                    <Td right>{f.stats?.precioReal != null ? fmtMoney(f.stats.precioReal) : "—"}</Td>
                    {hayInfoMulti && <Td right>{f.existencia != null ? fmtInt(f.existencia) : "—"}</Td>}
                    {hayInfoMulti && <Td right>{f.costoCif != null ? fmtMoney(f.costoCif) : "—"}</Td>}
                    {hayInfoMulti && (
                      <Td right>
                        {(() => {
                          const fob = fobEstimado(f.costoCif ?? null);
                          return fob != null ? fmtMoney(fob) : "—";
                        })()}
                      </Td>
                    )}
                    {hayInfoMulti && (
                      <Td right>
                        {fmtPct(
                          margenSobreFob(
                            f.stats?.precioReal ?? f.precioEtiqueta ?? null,
                            fobEstimado(f.costoCif ?? null),
                          ),
                        )}
                      </Td>
                    )}
                    <Td>
                      <PillEstado stats={f.stats} />
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="px-4 py-2.5 text-xs text-gray-500 sm:px-5">
            Ventas netas: las devoluciones (notas de crédito) ya están restadas. <b>u/mes real</b> cuenta solo los
            meses en que HABÍA mercancía — una referencia puede marcar 0 en 12 m y aun así un ritmo alto: se agotó,
            no dejó de gustar.
            {hayInfoMulti && (
              <>
                {" "}
                El Costo CIF es de Switch; <b>FOB y margen son estimados</b> (CIF ÷ {DIVISOR_FOB_EST}).
              </>
            )}
            {frescuraMulti && <> Datos de Switch al {fmtFrescura(frescuraMulti)}.</>}
          </p>
        </div>
      )}
    </div>
  );
}
