"use client";

// ============================================================================
// LA BARRA DEL CELULAR, COMPARTIDA (v3, 2-oct-2026).
//
// Daniel rechazó la v2: *«no es intuitivo así como Apple. Puedes usar 3 líneas
// si quieres, pero optimizadas, que no se vea desordenado»*. 🩸 Los íconos
// solos (🏢, ⬇) y el período escondido bajo el título no se entendían: Apple
// usa íconos sin texto SOLO para lo universal (buscar, compartir).
//
// TRES renglones como máximo, con la MISMA grilla en todos los módulos
// (16 px de margen, 44 px de alto, 8 px entre renglones, letra de 13 px;
// entre controles de un renglón, 6 px):
//
//   1 · «Aprobaciones ▾»                                   [🔍] [···]
//   2 · [ ‹     16 – 30 sep 2026     › ] [📅]          (si hay período)
//   3 · [Colaborador | Día] [Empresa: Todas ▾]        [Excel]  (si hay algo)
//
// y la acción principal fija abajo (`BarraAccionFija`).
//
// 🔑 LO DE CADA PESTAÑA LLEGA POR `EnLaBarra` (portales): el botón sigue
// llamando a la MISMA función de siempre; nada de lo que se envía cambia.
// 🔴 Sin proveedor (interruptor apagado o computadora) no se dibuja nada.
// ============================================================================

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { ChevronDown, Search } from "lucide-react";
import { getModuleColor } from "@/lib/moduleColors";
import { ATRIBUTO_BARRA_FIJA, CONSULTA_CELULAR } from "@/lib/navegacion/barra-celular";
import { usePublicarAltoBarraFija } from "@/lib/navegacion/useBarraFijaAbajo";
import { CLASE_VIDRIO, RADIO_VIDRIO, VIDRIO_2026_10, conVidrio } from "@/lib/ui/vidrio";
import {
  BARRA_CELULAR_2026_10,
  textoDelTitulo,
  usaBarraCelular,
} from "@/lib/navegacion/barra-controles-celular";

/**
 * ¿Se dibuja la barra nueva en esta pantalla? Arranca en `false` (computadora)
 * y se decide en un efecto: en el servidor no hay `matchMedia`.
 */
export function useBarraCelular(interruptor: boolean = BARRA_CELULAR_2026_10): boolean {
  const [celular, setCelular] = useState(false);
  useEffect(() => {
    if (!interruptor || typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia(CONSULTA_CELULAR);
    setCelular(mq.matches);
    const alCambiar = (e: MediaQueryListEvent) => setCelular(e.matches);
    mq.addEventListener?.("change", alCambiar);
    return () => mq.removeEventListener?.("change", alCambiar);
  }, [interruptor]);
  return usaBarraCelular(celular, interruptor);
}

// ─────────────────────────────────────────────────────────────────────────────
// La grilla: un solo lugar para el alto y la letra de los tres renglones
// ─────────────────────────────────────────────────────────────────────────────

/** El renglón: 44 px de alto en los tres. */
export const CLASE_RENGLON = "flex h-11 min-w-0 items-center gap-1.5";
/** El título del celular: 22 px (Daniel, 2-oct-2026). */
export const CLASE_TITULO_BARRA = "text-[22px] font-semibold leading-tight tracking-tight text-gray-900";
/**
 * 🔴 v3.1: los controles de los renglones 2 y 3 MIDEN 36 px a la vista (igual
 * que un segmentado de iOS) y se tocan en 44: una franja invisible de 4 px
 * arriba y abajo (`before:`). Así un chip, un segmentado y el período miden lo
 * mismo y ninguno deja de ser tocable.
 */
export const CLASE_TOQUE_44 = "relative before:absolute before:inset-x-0 before:-inset-y-1 before:content-['']";
/** Botón de texto o chip: 36 px a la vista, letra de 13 px. */
const BASE_BOTON_TEXTO =
  `inline-flex h-9 items-center gap-0.5 rounded-full border border-gray-300 bg-white px-2.5 text-[13px] font-medium text-gray-900 active:bg-gray-100 disabled:opacity-40 ${CLASE_TOQUE_44}`;
export const CLASE_BOTON_TEXTO = `${BASE_BOTON_TEXTO} shrink-0`;
/** Todo control segmentado del celular: 36 px a la vista, 44 al tocar, letra de 13 px. */
export const CLASE_SEGMENTADO_BARRA =
  "h-9 shrink-0 [&>button]:relative [&>button]:min-h-0 [&>button]:px-2.5 [&>button]:py-0 [&>button]:text-[13px] [&>button]:before:absolute [&>button]:before:inset-x-0 [&>button]:before:-inset-y-1.5 [&>button]:before:content-['']";
/** Un renglón dentro del «···». */
export const CLASE_FILA_MENU =
  "flex min-h-[44px] w-full items-center justify-center gap-2 rounded-md border border-gray-300 bg-white px-3 text-[15px] font-medium text-gray-900 active:bg-gray-100 disabled:opacity-40";

// ─────────────────────────────────────────────────────────────────────────────
// El proveedor: dónde caen los controles de cada pestaña
// ─────────────────────────────────────────────────────────────────────────────

type Ranura = "iconos" | "filaIzq" | "filaDer" | "menu";
const RANURAS: Ranura[] = ["iconos", "filaIzq", "filaDer", "menu"];
const vacias = <T,>(v: T) => Object.fromEntries(RANURAS.map((r) => [r, v])) as Record<Ranura, T>;

interface ContextoBarra {
  activa?: string;
  ranuras: Record<Ranura, HTMLElement | null>;
  ponerRanura: (r: Ranura, el: HTMLElement | null) => void;
  cuentas: Record<Ranura, number>;
  contar: (r: Ranura, d: 1 | -1) => void;
}

const Contexto = createContext<ContextoBarra | null>(null);

/** `true` solo adentro de una pantalla con la barra nueva prendida. */
export function useHayBarraCelular(): boolean {
  return useContext(Contexto) !== null;
}

/**
 * Envuelve la pantalla. Con `activo` en `false` no hace nada. `activa` es la
 * pestaña que se mira: las que quedan montadas escondidas no mandan nada.
 */
export function ProveedorBarraCelular({ activo, activa, children }: { activo: boolean; activa?: string; children: ReactNode }) {
  const [ranuras, setRanuras] = useState<Record<Ranura, HTMLElement | null>>(() => vacias<HTMLElement | null>(null));
  const [cuentas, setCuentas] = useState<Record<Ranura, number>>(() => vacias(0));
  const ponerRanura = useCallback((r: Ranura, el: HTMLElement | null) => {
    setRanuras((s) => (s[r] === el ? s : { ...s, [r]: el }));
  }, []);
  const contar = useCallback((r: Ranura, d: 1 | -1) => {
    setCuentas((s) => ({ ...s, [r]: Math.max(0, s[r] + d) }));
  }, []);
  const valor = useMemo(() => ({ activa, ranuras, ponerRanura, cuentas, contar }), [activa, ranuras, ponerRanura, cuentas, contar]);
  if (!activo) return <>{children}</>;
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

function useContar(r: Ranura, prendido: boolean, contar?: ContextoBarra["contar"]) {
  useEffect(() => {
    if (!prendido || !contar) return;
    contar(r, 1);
    return () => contar(r, -1);
  }, [r, prendido, contar]);
}

const hay = (n: ReactNode) => n != null && n !== false;

/**
 * Lo que una pestaña manda a la barra:
 * - `iconos`: el 🔍 del renglón 1 (lo universal, sin texto);
 * - `filaIzq`: su control segmentado, al empezar el renglón 3;
 * - `filaDer`: su botón de texto («Excel», «Descargar»), al final del renglón 3;
 * - `menu`: lo raro, al «···»;
 * - `accion`: la acción principal, fija abajo.
 */
export function EnLaBarra({
  pestana,
  iconos,
  filaIzq,
  filaDer,
  menu,
  accion,
}: {
  /** De qué pestaña es (una o varias claves). Sin ella, siempre. */
  pestana?: string | readonly string[];
  iconos?: ReactNode;
  filaIzq?: ReactNode;
  filaDer?: ReactNode;
  menu?: ReactNode;
  accion?: AccionPrincipal | null;
}) {
  const ctx = useContext(Contexto);
  const claves = pestana == null ? null : typeof pestana === "string" ? [pestana] : pestana;
  const visible = !!ctx && (!claves || claves.includes(ctx.activa ?? ""));
  const nodos: Record<Ranura, ReactNode> = { iconos, filaIzq, filaDer, menu };
  useContar("iconos", visible && hay(iconos), ctx?.contar);
  useContar("filaIzq", visible && hay(filaIzq), ctx?.contar);
  useContar("filaDer", visible && hay(filaDer), ctx?.contar);
  useContar("menu", visible && hay(menu), ctx?.contar);
  if (!ctx || !visible) return null;
  return (
    <>
      {RANURAS.map((r) => (hay(nodos[r]) && ctx.ranuras[r] ? <PortalA key={r} destino={ctx.ranuras[r]!}>{nodos[r]}</PortalA> : null))}
      {accion && <BarraAccionFija {...accion} />}
    </>
  );
}

function PortalA({ destino, children }: { destino: HTMLElement; children: ReactNode }) {
  return createPortal(children, destino);
}

// ─────────────────────────────────────────────────────────────────────────────
// Los tres renglones
// ─────────────────────────────────────────────────────────────────────────────

export interface PestanaDeBarra {
  value: string;
  label: string;
}

export function BarraDeControles({
  titulo,
  pestanas,
  activa,
  onPestana,
  periodo,
  fila,
  menu,
}: {
  /** El nombre del módulo, para cuando no hay pestañas. */
  titulo: string;
  pestanas?: readonly PestanaDeBarra[];
  activa?: string;
  onPestana?: (v: string) => void;
  /** Renglón 2: el período a todo el ancho. */
  periodo?: ReactNode;
  /** Renglón 3, del módulo (el chip «Empresa: Todas ▾»). */
  fila?: ReactNode;
  /** Lo raro del módulo (ayuda, configuración), para el «···». */
  menu?: ReactNode;
}) {
  const ctx = useContext(Contexto);
  const pathname = usePathname();
  const color = getModuleColor(pathname ?? "");
  const [abierta, setAbierta] = useState(false);
  const poner = ctx?.ponerRanura;
  const ponerIconos = useCallback((el: HTMLElement | null) => poner?.("iconos", el), [poner]);
  const ponerIzq = useCallback((el: HTMLElement | null) => poner?.("filaIzq", el), [poner]);
  const ponerDer = useCallback((el: HTMLElement | null) => poner?.("filaDer", el), [poner]);

  const conPestanas = !!pestanas && pestanas.length > 1;
  const etiquetaActiva = conPestanas ? pestanas!.find((p) => p.value === activa)?.label ?? null : null;
  const texto = textoDelTitulo(titulo, etiquetaActiva);
  const hayMenu = hay(menu) || (ctx?.cuentas.menu ?? 0) > 0;
  const hayDeLaPestana = (ctx?.cuentas.filaIzq ?? 0) > 0 || (ctx?.cuentas.filaDer ?? 0) > 0;
  // 🔴 v3.1 — nada solo en una fila si cabe al lado de otra cosa: si el
  // renglón 3 solo tendría el chip del módulo, el chip sube al lado del período
  // y, si no cabe (con 📅), el `flex-wrap` lo baja solo.
  const filaJuntoAlPeriodo = hay(periodo) && hay(fila) && !hayDeLaPestana;
  const hayFila = (hay(fila) && !filaJuntoAlPeriodo) || hayDeLaPestana;

  return (
    <div data-barra-celular className="flex flex-col gap-2 px-4 pb-1 pt-2">
      {/* 1 · Título-selector · 🔍 · «···». `relative`: buscar se abre encima. */}
      <div data-renglon="titulo" className={`relative ${CLASE_RENGLON}`}>
        <p className={`flex min-w-0 flex-1 items-center gap-2 ${CLASE_TITULO_BARRA}`}>
          {color && <span aria-hidden="true" className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: color.hex }} />}
          {conPestanas ? (
            <SelectorEnTexto
              etiqueta="Sección"
              valor={activa ?? ""}
              texto={texto}
              opciones={pestanas!.map((p) => ({ valor: p.value, etiqueta: p.label }))}
              onCambiar={(v) => onPestana?.(v)}
            />
          ) : (
            <span className="min-w-0 truncate">{texto}</span>
          )}
        </p>
        <span ref={ponerIconos} className="contents" />
        {hayMenu && (
          <IconoBarra etiqueta="Más opciones" onClick={() => setAbierta(true)} data-mas-celular>
            <span className="text-[20px] leading-none">···</span>
          </IconoBarra>
        )}
      </div>

      {/* 2 · El período, a todo el ancho. */}
      {hay(periodo) && (
        <div
          data-renglon="periodo"
          className={filaJuntoAlPeriodo ? "flex min-h-11 min-w-0 flex-wrap items-center gap-x-1.5 gap-y-2" : CLASE_RENGLON}
        >
          {periodo}
          {filaJuntoAlPeriodo && fila}
        </div>
      )}

      {/* 3 · Filtros y acciones con TEXTO. Sin nada, no se dibuja. */}
      <div data-renglon="filtros" className={hayFila ? CLASE_RENGLON : "hidden"}>
        <span ref={ponerIzq} className="contents" />
        {!filaJuntoAlPeriodo && fila}
        <span className="flex-1" />
        <span ref={ponerDer} className="contents" />
      </div>

      <HojaMenu abierta={abierta} onCerrar={() => setAbierta(false)}>
        {menu}
      </HojaMenu>
      <ColchonDeAbajo />
    </div>
  );
}

/**
 * Texto que se ve + la lista NATIVA del teléfono encima, transparente, del
 * tamaño exacto del texto (en iOS, tocar fuera de la lista no la abre).
 */
export function SelectorEnTexto({
  etiqueta,
  valor,
  texto,
  opciones,
  onCambiar,
  className = "",
}: {
  etiqueta: string;
  valor: string;
  texto: ReactNode;
  opciones: readonly { valor: string; etiqueta: string }[];
  onCambiar: (v: string) => void;
  className?: string;
}) {
  return (
    <span className={`relative inline-flex min-h-[44px] min-w-0 items-center gap-1 ${className}`}>
      <span className="min-w-0 truncate">{texto}</span>
      <ChevronDown className="h-4 w-4 shrink-0 text-gray-500" strokeWidth={2.25} aria-hidden />
      <select
        aria-label={etiqueta}
        value={valor}
        onChange={(e) => onCambiar(e.target.value)}
        className="absolute inset-0 h-full w-full cursor-pointer appearance-none text-base opacity-0"
      >
        {opciones.map((o) => (
          <option key={o.valor} value={o.valor}>{o.etiqueta}</option>
        ))}
      </select>
    </span>
  );
}

/**
 * Un chip CON TEXTO para elegir entre pocas opciones: «Empresa: Todas ▾».
 * Abre la lista nativa con un toque. Puesto (≠ la primera), va en negro.
 */
export function ChipSelector({
  rotulo,
  valor,
  opciones,
  onCambiar,
}: {
  rotulo: string;
  valor: string;
  opciones: readonly { valor: string; etiqueta: string }[];
  onCambiar: (v: string) => void;
}) {
  const elegida = opciones.find((o) => o.valor === valor)?.etiqueta ?? valor;
  const puesto = opciones.length > 0 && valor !== opciones[0].valor;
  return (
    <span
      data-chip-selector
      className={`${BASE_BOTON_TEXTO} min-w-0 ${puesto ? "border-gray-900 bg-gray-900 text-white" : ""}`}
    >
      <span className="min-w-0 truncate">
        {rotulo}: {elegida}
      </span>
      <ChevronDown className="h-4 w-4 shrink-0" strokeWidth={2.25} aria-hidden />
      <select
        aria-label={rotulo}
        value={valor}
        onChange={(e) => onCambiar(e.target.value)}
        className="absolute inset-x-0 -inset-y-1 cursor-pointer appearance-none rounded-full text-base opacity-0"
      >
        {opciones.map((o) => (
          <option key={o.valor} value={o.valor}>{o.etiqueta}</option>
        ))}
      </select>
    </span>
  );
}

/** Un botón redondo de 44 px, SOLO para lo universal (buscar, «···»). */
export function IconoBarra({
  etiqueta,
  onClick,
  children,
  ...resto
}: {
  etiqueta: string;
  onClick?: () => void;
  children: ReactNode;
  "data-mas-celular"?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={etiqueta}
      title={etiqueta}
      {...resto}
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-gray-700 transition active:bg-gray-100"
    >
      {children}
    </button>
  );
}

/**
 * 🔍 Buscar: la lupa del renglón 1; al tocarla, el campo ocupa ESE renglón con
 * «Cancelar». Con texto escrito se queda abierto: lo que filtra se ve.
 */
export function BuscarEnLaBarra({
  valor,
  onCambiar,
  placeholder,
  etiqueta,
}: {
  valor: string;
  onCambiar: (v: string) => void;
  placeholder: string;
  etiqueta: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const campo = useRef<HTMLInputElement | null>(null);
  const visible = abierto || valor !== "";
  useEffect(() => {
    if (abierto) campo.current?.focus();
  }, [abierto]);
  if (!visible) {
    return (
      <IconoBarra etiqueta={etiqueta} onClick={() => setAbierto(true)}>
        <Search className="h-5 w-5" strokeWidth={2} aria-hidden />
      </IconoBarra>
    );
  }
  return (
    <div data-buscar-barra className="absolute inset-0 z-10 flex items-center gap-2 bg-white">
      <div className="relative min-w-0 flex-1">
        <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input
          ref={campo}
          type="search"
          value={valor}
          onChange={(e) => onCambiar(e.target.value)}
          placeholder={placeholder}
          aria-label={etiqueta}
          className="h-11 w-full rounded-md bg-gray-100 pl-9 pr-3 text-base text-gray-900 outline-none"
        />
      </div>
      <button type="button" onClick={() => { onCambiar(""); setAbierto(false); }} className="min-h-[44px] shrink-0 px-1 text-[15px] text-blue-600">
        Cancelar
      </button>
    </div>
  );
}

export interface OpcionDeDescarga {
  rotulo: string;
  onClick: () => void;
  disabled?: boolean;
}

/**
 * Descargar, CON TEXTO. Con UNA opción el botón dice su nombre («Excel») y
 * descarga directo; con varias dice «Descargar» y abre la hoja de acciones.
 * Siempre las mismas funciones de la computadora.
 */
export function DescargarEnLaBarra({ opciones, apagado }: { opciones: readonly OpcionDeDescarga[]; apagado?: boolean }) {
  const [hoja, setHoja] = useState(false);
  const una = opciones.length === 1 ? opciones[0] : null;
  return (
    <>
      <button
        type="button"
        data-descargar-barra
        disabled={apagado || (una ? una.disabled : opciones.every((o) => o.disabled))}
        onClick={() => (una ? una.onClick() : setHoja(true))}
        className={CLASE_BOTON_TEXTO}
      >
        {una ? una.rotulo : "Descargar"}
      </button>
      {!una && (
        <HojaMenu abierta={hoja} onCerrar={() => setHoja(false)} titulo="Descargar">
          {opciones.map((o) => (
            <button key={o.rotulo} type="button" disabled={o.disabled} onClick={o.onClick} className={CLASE_FILA_MENU}>
              {o.rotulo}
            </button>
          ))}
        </HojaMenu>
      )}
    </>
  );
}

/**
 * La hoja que sube desde abajo (el «···», Descargar). Va al final de `<body>`
 * y queda montada aunque esté cerrada: es el destino del menú de cada pestaña.
 * Tocar un botón de adentro la cierra.
 */
function HojaMenu({
  abierta,
  onCerrar,
  titulo,
  children,
}: {
  abierta: boolean;
  onCerrar: () => void;
  titulo?: string;
  children: ReactNode;
}) {
  const ctx = useContext(Contexto);
  const contenido = useRef<HTMLDivElement | null>(null);
  const poner = ctx?.ponerRanura;
  const esElMenu = !titulo;
  const ponerMenu = useCallback((el: HTMLElement | null) => { if (esElMenu) poner?.("menu", el); }, [poner, esElMenu]);

  useEffect(() => {
    const el = contenido.current;
    if (!el) return;
    // 🔑 En el DOM, no en React: lo que llega por portal burbujea en React
    // hacia su pestaña, no hacia esta hoja.
    const alTocar = (e: MouseEvent) => {
      if ((e.target as HTMLElement | null)?.closest("button")) setTimeout(onCerrar, 0);
    };
    el.addEventListener("click", alTocar);
    return () => el.removeEventListener("click", alTocar);
  }, [onCerrar]);

  useEffect(() => {
    if (!abierta) return;
    const alTeclear = (e: KeyboardEvent) => { if (e.key === "Escape") onCerrar(); };
    document.addEventListener("keydown", alTeclear);
    return () => document.removeEventListener("keydown", alTeclear);
  }, [abierta, onCerrar]);

  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={titulo ?? "Más opciones"}
      aria-hidden={!abierta}
      data-hoja-mas={esElMenu ? "" : undefined}
      className={`fixed inset-0 z-[60] flex-col justify-end ${abierta ? "flex" : "hidden"}`}
    >
      <button type="button" aria-label="Cerrar" onClick={onCerrar} className="absolute inset-0 bg-black/30" />
      <div
        className={`relative mx-2 mb-2 max-h-[80vh] overflow-y-auto p-4 text-left text-[15px] ${conVidrio("rounded-lg bg-white", `${CLASE_VIDRIO} ${RADIO_VIDRIO}`)}`}
        style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" }}
      >
        {titulo && <p className="mb-3 text-center text-[13px] text-gray-500">{titulo}</p>}
        <div ref={contenido} className="flex flex-col gap-3">
          {children}
          {esElMenu && <div ref={ponerMenu} className="flex flex-col gap-3 empty:hidden" />}
        </div>
        <button
          type="button"
          onClick={onCerrar}
          className="mt-4 block min-h-[44px] w-full rounded-md border border-gray-300 text-[15px] font-medium text-gray-700 active:bg-gray-100"
        >
          Listo
        </button>
      </div>
    </div>,
    document.body,
  );
}

/**
 * 🔴 El relleno del final de la página: el alto de la barra fija de abajo
 * (`--fg-alto-barra-fija`, 0 si no hay) más los 76 px del ☰ redondo. La última
 * fila de cualquier lista sube por encima de los dos.
 */
export const ALTO_COLCHON_DE_ABAJO = "calc(var(--fg-alto-barra-fija, 0px) + 76px)";

function ColchonDeAbajo() {
  if (typeof document === "undefined") return null;
  return createPortal(<div aria-hidden data-colchon-abajo style={{ height: ALTO_COLCHON_DE_ABAJO }} />, document.body);
}

// ─────────────────────────────────────────────────────────────────────────────
// La acción principal, fija abajo
// ─────────────────────────────────────────────────────────────────────────────

export interface AccionPrincipal {
  rotulo: ReactNode;
  onClick: () => void;
  disabled?: boolean;
}

/**
 * El botón negro fijo abajo, como «Guardar guía» y «Nuevo reclamo».
 * 🔴 Publica su alto en `--fg-alto-barra-fija`: el ☰ y los avisos suben.
 */
export function BarraAccionFija({ rotulo, onClick, disabled }: AccionPrincipal) {
  const cajon = useRef<HTMLDivElement | null>(null);
  usePublicarAltoBarraFija(cajon);
  // 🔑 Al final de `<body>`: un `transform` de un contenedor (el «tirar para
  // actualizar») le rompería el `fixed`.
  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      ref={cajon}
      data-accion-celular
      {...{ [ATRIBUTO_BARRA_FIJA]: "" }}
      className={conVidrio(
        "fixed inset-x-0 bottom-0 z-20 border-t border-gray-200 bg-white/95 px-4 pt-3 backdrop-blur",
        `fixed inset-x-2 bottom-2 z-20 p-2 ${CLASE_VIDRIO} ${RADIO_VIDRIO}`,
      )}
      style={{ paddingBottom: VIDRIO_2026_10 ? "calc(0.5rem + env(safe-area-inset-bottom))" : "calc(0.75rem + env(safe-area-inset-bottom))" }}
    >
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className="block min-h-[48px] w-full rounded-md bg-black px-4 text-center text-[17px] font-medium text-white transition hover:bg-gray-800 active:scale-[0.98] disabled:opacity-40"
      >
        {rotulo}
      </button>
    </div>,
    document.body,
  );
}
