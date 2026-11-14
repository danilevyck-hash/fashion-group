"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 EL FILTRO ESTILO «a» DEL CELULAR (revisión 14-nov-2026, `FILTRO_A_2026_11`).
//
// Daniel eligió la «a» (mockups filtros-opciones.png, filtro-a-*.png): un
// buscador gris de iOS que llena el ancho, con el ícono de filtros ADENTRO a la
// derecha. Con filtros puestos el ícono va relleno y una línea gris debajo dice
// cuáles, con ✕ para quitarlos sin abrir nada. Al tocar el ícono sube la hoja
// «Filtros»: «Restablecer» a la izquierda, «Listo» en negrita a la derecha,
// ORDENAR con ✓ (control segmentado si son 3 o menos) y un renglón por filtro
// con lo puesto en gris y ›, que entra a su lista con ✓.
//
// 🔑 Solo para pantallas con MUCHOS filtros (Multifashion › Productos, Ventas ›
// Productos, Catálogos, Marketing › Gastos). Con uno o dos filtros van
// cápsulas a la vista (`Capsula`, `LineaBuscarYCapsulas`), que SIEMPRE dicen
// qué filtran: «Todas las empresas ▾», nunca «Todas ▾» (Daniel, 14-nov-2026).
//
// Lo que se toca se aplica en el acto: «Listo» cierra, «Restablecer» limpia.
// Nada de esto guarda datos: solo cambia qué se ve.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import { useBodyScrollLock } from "@/lib/hooks/useBodyScrollLock";
import DesplegableFlotante from "@/components/ui/DesplegableFlotante";
import { vidrioSobre } from "@/lib/ui/vidrio";
import { cn } from "@/lib/utils";

export interface OpcionA {
  valor: string;
  etiqueta: string;
  /** «Todos 50»: el número gris al final del renglón. */
  conteo?: number;
}

export interface FiltroDeLaHoja {
  clave: string;
  /** El nombre del renglón: «Marca», «Departamento». */
  etiqueta: string;
  opciones: readonly OpcionA[];
  /** Lo elegido. Igual a `porDefecto` = sin filtro. */
  valor: string;
  onCambiar: (v: string) => void;
  /** El primer renglón de la lista, que quita el filtro: «Todas», «Todos».
   *  Sin él, siempre hay una opción elegida (p. ej. Estado). */
  todos?: string;
  /** El valor que no cuenta como filtro. `""` por defecto. */
  porDefecto?: string;
  /** Con 3 opciones o menos, control segmentado arriba en vez de renglón. */
  segmentado?: boolean;
}

export interface OrdenDeLaHoja {
  opciones: readonly OpcionA[];
  valor: string;
  onCambiar: (v: string) => void;
}

/** Un filtro puesto, para la línea gris de abajo del buscador. */
export interface FiltroPuesto {
  clave: string;
  texto: string;
  onQuitar: () => void;
}

/** Los filtros puestos, en el orden de la hoja. Función pura (la usan los tests). */
export function filtrosPuestos(filtros: readonly FiltroDeLaHoja[]): FiltroPuesto[] {
  return filtros
    .filter((f) => f.valor !== (f.porDefecto ?? ""))
    .map((f) => ({
      clave: f.clave,
      texto: f.opciones.find((o) => o.valor === f.valor)?.etiqueta ?? f.valor,
      onQuitar: () => f.onCambiar(f.porDefecto ?? ""),
    }));
}

/** El texto gris del renglón: lo puesto, o «Todas»/«Todos». */
export function textoDelRenglon(f: FiltroDeLaHoja): string {
  if (f.valor === (f.porDefecto ?? "")) return f.todos ?? "Todos";
  return f.opciones.find((o) => o.valor === f.valor)?.etiqueta ?? f.todos ?? "Todos";
}

// ── El ícono de filtros: círculo con tres rayas que se acortan ──────────────

export function IconoFiltros({ relleno }: { relleno: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden className="shrink-0">
      {relleno ? (
        <circle cx="12" cy="12" r="10.5" fill="currentColor" />
      ) : (
        <circle cx="12" cy="12" r="9.75" fill="none" stroke="currentColor" strokeWidth="1.5" />
      )}
      <g stroke={relleno ? "white" : "currentColor"} strokeWidth="1.6" strokeLinecap="round">
        <line x1="7.5" y1="9" x2="16.5" y2="9" />
        <line x1="9" y1="12.25" x2="15" y2="12.25" />
        <line x1="10.75" y1="15.5" x2="13.25" y2="15.5" />
      </g>
    </svg>
  );
}

// ── El buscador gris de iOS ─────────────────────────────────────────────────

const CAMPO_GRIS =
  "h-11 w-full rounded-[10px] bg-gray-200/70 pl-9 text-base text-gray-900 placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40";

export function BuscadorGris({
  valor,
  onCambiar,
  placeholder,
  derecha,
  className,
}: {
  valor: string;
  onCambiar: (v: string) => void;
  /** «Buscar» + lo que de verdad busca: «Buscar código o descripción». */
  placeholder: string;
  /** Lo que va adentro, a la derecha (el ícono de filtros). */
  derecha?: ReactNode;
  className?: string;
}) {
  return (
    <div data-buscador-gris className={cn("relative min-w-0", className)}>
      <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
      <input
        type="search"
        value={valor}
        onChange={(e) => onCambiar(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className={cn(CAMPO_GRIS, derecha ? "pr-12" : "pr-3")}
      />
      {derecha && <div className="absolute inset-y-0 right-0 flex items-center">{derecha}</div>}
    </div>
  );
}

// ── Buscador + ícono + línea de filtros puestos + la hoja ───────────────────

export interface BuscadorConFiltrosProps {
  busqueda: string;
  onBuscar: (v: string) => void;
  placeholder: string;
  orden?: OrdenDeLaHoja;
  filtros: readonly FiltroDeLaHoja[];
  /** Secciones propias de la hoja (Precio, «2+ bultos»), después de los filtros. */
  extra?: ReactNode;
  /** Lo puesto en `extra`, para la línea gris y el ícono relleno. */
  puestosExtra?: readonly FiltroPuesto[];
  /** «Restablecer»: vuelve todo a como abre la pantalla. */
  onRestablecer: () => void;
  className?: string;
}

export function BuscadorConFiltros(p: BuscadorConFiltrosProps) {
  const [abierta, setAbierta] = useState(false);
  const puestos = useMemo(() => [...filtrosPuestos(p.filtros), ...(p.puestosExtra ?? [])], [p.filtros, p.puestosExtra]);
  const hay = puestos.length > 0;
  return (
    <div data-filtro-a className={p.className}>
      <BuscadorGris
        valor={p.busqueda}
        onCambiar={p.onBuscar}
        placeholder={p.placeholder}
        derecha={
          <button
            type="button"
            data-boton-filtros
            aria-label={hay ? `Filtros (${puestos.length} puestos)` : "Filtros"}
            aria-haspopup="dialog"
            onClick={() => setAbierta(true)}
            className="flex h-11 w-11 items-center justify-center text-blue-600 active:opacity-60"
          >
            <IconoFiltros relleno={hay} />
          </button>
        }
      />
      {hay && (
        <div data-filtros-puestos className="mt-1 flex flex-wrap items-center gap-x-1 px-1 text-[13px] text-gray-500">
          <span className="min-w-0 truncate">{puestos.map((x) => x.texto).join(" · ")}</span>
          <button
            type="button"
            aria-label="Quitar filtros"
            onClick={() => puestos.forEach((x) => x.onQuitar())}
            className="-my-3 inline-flex h-11 w-9 shrink-0 items-center justify-center text-gray-400 active:text-gray-700"
          >
            <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-gray-200">
              <X className="h-3 w-3" strokeWidth={2.5} />
            </span>
          </button>
        </div>
      )}
      <HojaFiltros
        abierta={abierta}
        onCerrar={() => setAbierta(false)}
        orden={p.orden}
        filtros={p.filtros}
        extra={p.extra}
        onRestablecer={p.onRestablecer}
      />
    </div>
  );
}

// ── La hoja «Filtros» ───────────────────────────────────────────────────────

const RENGLON = "flex min-h-[44px] w-full items-center justify-between gap-3 px-4 text-left text-[17px] text-gray-950 active:bg-gray-100";
const GRUPO = "overflow-hidden rounded-[10px] bg-white [&>*+*]:border-t [&>*+*]:border-gray-200";
const TITULO_SECCION = "mb-1.5 mt-5 px-4 text-[13px] uppercase tracking-wide text-gray-500 first:mt-1";

export function SeccionHoja({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section>
      <h3 className={TITULO_SECCION}>{titulo}</h3>
      <div className={GRUPO}>{children}</div>
    </section>
  );
}

/** Segmentado de iOS para 3 opciones o menos, dentro de la hoja. */
function Segmentado({ opciones, valor, onCambiar, etiqueta }: {
  opciones: readonly OpcionA[]; valor: string; onCambiar: (v: string) => void; etiqueta: string;
}) {
  return (
    <div role="radiogroup" aria-label={etiqueta} className="flex rounded-[9px] bg-gray-200/70 p-0.5">
      {opciones.map((o) => (
        <button
          key={o.valor}
          type="button"
          role="radio"
          aria-checked={o.valor === valor}
          onClick={() => onCambiar(o.valor)}
          className={cn(
            "min-h-[36px] flex-1 rounded-[7px] px-2 text-[14px] transition",
            o.valor === valor ? "bg-white font-semibold text-gray-950 shadow-sm" : "text-gray-800",
          )}
        >
          {o.etiqueta}
        </button>
      ))}
    </div>
  );
}

function ListaConCheck({ opciones, valor, onElegir }: {
  opciones: readonly OpcionA[]; valor: string; onElegir: (v: string) => void;
}) {
  return (
    <div className={GRUPO}>
      {opciones.map((o) => (
        <button
          key={o.valor || "__todos"}
          type="button"
          role="option"
          aria-selected={o.valor === valor}
          onClick={() => onElegir(o.valor)}
          className={RENGLON}
        >
          <span className="min-w-0 truncate">{o.etiqueta}</span>
          <span className="flex shrink-0 items-center gap-2">
            {o.conteo != null && <span className="tabular-nums text-gray-500">{o.conteo.toLocaleString("en-US")}</span>}
            {o.valor === valor && <Check aria-hidden className="h-5 w-5 text-blue-600" />}
          </span>
        </button>
      ))}
    </div>
  );
}

export function HojaFiltros({ abierta, onCerrar, orden, filtros, extra, onRestablecer }: {
  abierta: boolean;
  onCerrar: () => void;
  orden?: OrdenDeLaHoja;
  filtros: readonly FiltroDeLaHoja[];
  extra?: ReactNode;
  onRestablecer: () => void;
}) {
  const [dentro, setDentro] = useState<string | null>(null);
  const [q, setQ] = useState("");
  useBodyScrollLock(abierta);
  useEffect(() => { if (!abierta) { setDentro(null); setQ(""); } }, [abierta]);
  useEffect(() => {
    if (!abierta) return;
    const tecla = (e: KeyboardEvent) => { if (e.key === "Escape") onCerrar(); };
    document.addEventListener("keydown", tecla);
    return () => document.removeEventListener("keydown", tecla);
  }, [abierta, onCerrar]);
  const scroll = useRef<HTMLDivElement>(null);
  useEffect(() => { scroll.current?.scrollTo({ top: 0 }); }, [dentro]);

  if (!abierta || typeof document === "undefined") return null;

  const segmentados = filtros.filter((f) => f.segmentado && f.opciones.length <= 3);
  const renglones = filtros.filter((f) => !segmentados.includes(f));
  const actual = dentro ? filtros.find((f) => f.clave === dentro) ?? null : null;
  const opcionesActual: OpcionA[] = actual
    ? [...(actual.todos ? [{ valor: actual.porDefecto ?? "", etiqueta: actual.todos }] : []), ...actual.opciones]
    : [];
  const conBuscador = opcionesActual.length > 12;
  const visibles = conBuscador && q.trim()
    ? opcionesActual.filter((o) => o.etiqueta.toLowerCase().includes(q.trim().toLowerCase()))
    : opcionesActual;

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={actual ? actual.etiqueta : "Filtros"} data-hoja-filtros className="fixed inset-0 z-[60] flex flex-col justify-end sm:hidden">
      <button type="button" aria-label="Cerrar" onClick={onCerrar} className="absolute inset-0 bg-black/30" />
      <div
        className="relative flex max-h-[88dvh] flex-col overflow-hidden rounded-t-[14px] bg-gray-100 shadow-xl"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div aria-hidden className="mx-auto mt-1.5 h-[5px] w-9 rounded-full bg-gray-300" />
        <header className="grid grid-cols-[1fr_auto_1fr] items-center px-2">
          {actual ? (
            <button type="button" onClick={() => { setDentro(null); setQ(""); }} className="flex min-h-[44px] items-center justify-self-start px-2 text-[17px] text-blue-600">
              <ChevronLeft className="-ml-1 h-5 w-5" /> Filtros
            </button>
          ) : (
            <button type="button" onClick={onRestablecer} className="min-h-[44px] justify-self-start px-2 text-[17px] text-blue-600">
              Restablecer
            </button>
          )}
          <h2 className="text-[17px] font-semibold text-gray-950">{actual ? actual.etiqueta : "Filtros"}</h2>
          <button type="button" onClick={onCerrar} className="min-h-[44px] justify-self-end px-2 text-[17px] font-semibold text-blue-600">
            Listo
          </button>
        </header>
        <div ref={scroll} className="overflow-y-auto overscroll-contain px-4 pb-6">
          {actual ? (
            <div className="pt-2">
              {conBuscador && (
                <BuscadorGris valor={q} onCambiar={setQ} placeholder={`Buscar ${actual.etiqueta.toLowerCase()}`} className="mb-3" />
              )}
              <ListaConCheck
                opciones={visibles}
                valor={actual.valor}
                onElegir={(v) => { actual.onCambiar(v); setDentro(null); setQ(""); }}
              />
              {visibles.length === 0 && <p className="px-4 py-3 text-sm text-gray-500">Sin resultados</p>}
            </div>
          ) : (
            <>
              {segmentados.map((f) => (
                <section key={f.clave}>
                  <h3 className={TITULO_SECCION}>{f.etiqueta}</h3>
                  <Segmentado opciones={f.opciones} valor={f.valor} onCambiar={f.onCambiar} etiqueta={f.etiqueta} />
                </section>
              ))}
              {orden && orden.opciones.length > 0 && (
                <section>
                  <h3 className={TITULO_SECCION}>Orden</h3>
                  {orden.opciones.length <= 3 ? (
                    <Segmentado opciones={orden.opciones} valor={orden.valor} onCambiar={orden.onCambiar} etiqueta="Orden" />
                  ) : (
                    <ListaConCheck opciones={orden.opciones} valor={orden.valor} onElegir={orden.onCambiar} />
                  )}
                </section>
              )}
              {renglones.length > 0 && (
                <SeccionHoja titulo="Filtrar por">
                  {renglones.map((f) => (
                    <button key={f.clave} type="button" data-renglon-filtro={f.clave} onClick={() => setDentro(f.clave)} className={RENGLON}>
                      <span className="shrink-0">{f.etiqueta}</span>
                      <span className="flex min-w-0 items-center gap-1 text-gray-500">
                        <span className="truncate">{textoDelRenglon(f)}</span>
                        <ChevronRight aria-hidden className="h-4 w-4 shrink-0 text-gray-400" />
                      </span>
                    </button>
                  ))}
                </SeccionHoja>
              )}
              {extra}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** Un renglón con interruptor, para la hoja («2+ bultos»). */
export function RenglonInterruptor({ etiqueta, activo, onCambiar }: { etiqueta: string; activo: boolean; onCambiar: (v: boolean) => void }) {
  return (
    <label className={cn(RENGLON, "cursor-pointer")}>
      <span>{etiqueta}</span>
      <input
        type="checkbox"
        role="switch"
        checked={activo}
        onChange={(e) => onCambiar(e.target.checked)}
        className="relative h-[31px] w-[51px] shrink-0 cursor-pointer appearance-none rounded-full bg-gray-200 transition before:absolute before:left-[2px] before:top-[2px] before:h-[27px] before:w-[27px] before:rounded-full before:bg-white before:shadow before:transition checked:bg-emerald-500 checked:before:translate-x-[20px]"
      />
    </label>
  );
}

// ── «Una línea»: buscador + cápsulas que dicen qué filtran ──────────────────

/**
 * Una cápsula con su menú de ✓: «Todas las empresas ▾», «Todos 50 ▾». Dice
 * SIEMPRE qué filtra (Daniel, 14-nov-2026): nunca «Todas ▾» a secas.
 */
export function Capsula({ etiqueta, opciones, valor, onCambiar, alinear = "izquierda", className }: {
  /** Para el lector de pantalla: «Empresa». */
  etiqueta: string;
  opciones: readonly OpcionA[];
  valor: string;
  onCambiar: (v: string) => void;
  alinear?: "izquierda" | "derecha";
  className?: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const ancla = useRef<HTMLButtonElement>(null);
  const elegida = opciones.find((o) => o.valor === valor) ?? opciones[0];
  return (
    <>
      <button
        ref={ancla}
        type="button"
        data-capsula={etiqueta}
        aria-haspopup="listbox"
        aria-expanded={abierto}
        aria-label={`${etiqueta}: ${elegida?.etiqueta ?? ""}`}
        onClick={() => setAbierto((a) => !a)}
        className={cn(
          "inline-flex h-11 shrink-0 items-center gap-1 whitespace-nowrap rounded-full border border-gray-200 bg-white px-3.5 text-[15px] text-gray-900 transition active:scale-[0.97]",
          className,
        )}
      >
        <span>{elegida?.etiqueta}</span>
        {elegida?.conteo != null && <span className="tabular-nums">{elegida.conteo.toLocaleString("en-US")}</span>}
        <ChevronDown aria-hidden className="h-4 w-4 text-gray-500" />
      </button>
      <DesplegableFlotante
        abierto={abierto}
        anclaRef={ancla}
        onCerrar={() => setAbierto(false)}
        marca={`capsula-${etiqueta.toLowerCase()}`}
        role="listbox"
        aria-label={etiqueta}
        anchoMinimo={220}
        alinear={alinear}
        className={vidrioSobre("max-h-[60vh] overflow-y-auto rounded-xl border border-black/10 bg-white py-1 shadow-lg")}
      >
        {opciones.map((o) => (
          <button
            key={o.valor || "__todos"}
            type="button"
            role="option"
            aria-selected={o.valor === valor}
            onClick={() => { onCambiar(o.valor); setAbierto(false); }}
            className="flex min-h-[44px] w-full items-center gap-3 px-4 text-left text-[15px] text-gray-900 transition hover:bg-black/5"
          >
            <span className="w-4 shrink-0">{o.valor === valor && <Check aria-hidden className="h-4 w-4" />}</span>
            <span className="flex-1">{o.etiqueta}</span>
            {o.conteo != null && <span className="tabular-nums text-gray-500">{o.conteo.toLocaleString("en-US")}</span>}
          </button>
        ))}
      </DesplegableFlotante>
    </>
  );
}

/**
 * El buscador a la izquierda llenando el ancho y la cápsula a la derecha, en
 * la MISMA línea (Daniel, 14-nov-2026). La cápsula nunca se corta: lo que se
 * acorta es el texto del buscador («Buscar»). Con dos cápsulas (`abajo`), el
 * buscador va solo y ellas en la línea de abajo (Asistencia › Colaboradores).
 */
export function LineaBuscarYCapsulas({ busqueda, onBuscar, placeholder, children, abajo = false, className }: {
  busqueda: string;
  onBuscar: (v: string) => void;
  placeholder: string;
  /** Las cápsulas. */
  children: ReactNode;
  /** `true` = las cápsulas siempre en su propia línea, debajo del buscador. */
  abajo?: boolean;
  className?: string;
}) {
  return (
    <div data-linea-buscar className={cn("flex items-center gap-2", abajo && "flex-wrap", className)}>
      <BuscadorGris valor={busqueda} onCambiar={onBuscar} placeholder={placeholder} className={abajo ? "w-full" : "min-w-0 flex-1"} />
      <div className="flex shrink-0 items-center gap-2">{children}</div>
    </div>
  );
}
