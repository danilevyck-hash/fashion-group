"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 «Filtrar» del catálogo en el celular (`CATALOGO_FILTRO_2026_11`, propuesta
// del 19-nov-2026, sin aprobar). Daniel, sobre lo de hoy: «el ícono no se
// entiende» y «son muchos toques».
//   · Al lado del buscador, un botón que SE LEE: ícono + «Filtrar» («Filtrar (1)»).
//   · La hoja muestra todo a la vista, sin pasos intermedios. Categoría primero,
//     en cuadrícula de 3 columnas: tocar una APLICA Y CIERRA (Sneakers = 2
//     toques). Género, Precio, Orden y «2+ bultos» se aplican al instante y la
//     hoja se cierra tocando afuera o la ✕.
//   · Lo puesto va junto a la cantidad, «Sneakers ✕», y se quita con un toque.
//     Las cápsulas bajan de línea; nada se desliza de lado.
// Solo cambia qué se ve: no guarda nada.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { BuscadorGris, IconoFiltros, RenglonInterruptor, type FiltroPuesto, type OpcionA } from "@/components/filtros/FiltroA";
import { useBodyScrollLock } from "@/lib/hooks/useBodyScrollLock";
import { cn } from "@/lib/utils";

export interface GrupoFiltrar {
  opciones: readonly OpcionA[];
  valor: string;
  onCambiar: (v: string) => void;
}

export interface FiltrarCelularProps {
  busqueda: string;
  onBuscar: (v: string) => void;
  /** Sin él (una sola categoría, p. ej. Joybees) no se dibuja la sección. */
  categoria?: GrupoFiltrar;
  genero?: GrupoFiltrar;
  orden: GrupoFiltrar;
  /** Los campos Desde/Hasta, ya armados por quien conoce el espejo. */
  precio?: ReactNode;
  bultos?: { activo: boolean; onCambiar: (v: boolean) => void };
  /** Los filtros puestos, en orden: categoría primero. */
  puestos: readonly FiltroPuesto[];
  cantidad: number;
  /** «Actualizado h:mm ↻» del catálogo interno, al final de la línea. */
  frescura?: ReactNode;
}

export default function FiltrarCelular(p: FiltrarCelularProps) {
  const [abierta, setAbierta] = useState(false);
  const n = p.puestos.length;
  return (
    <div data-filtrar-catalogo className="mb-3 space-y-2 sm:hidden">
      <div className="flex items-center gap-2">
        <BuscadorGris valor={p.busqueda} onCambiar={p.onBuscar} placeholder="Buscar nombre o código" compacto className="min-w-0 flex-1" />
        <button
          type="button"
          data-boton-filtrar
          aria-haspopup="dialog"
          onClick={() => setAbierta(true)}
          className={cn(
            "inline-flex h-11 shrink-0 items-center gap-1.5 rounded-[10px] px-3 text-[15px] font-semibold transition active:scale-[0.97]",
            n > 0 ? "bg-gray-900 text-white" : "bg-gray-200/70 text-gray-900",
          )}
        >
          <IconoFiltros relleno={false} />
          {n > 0 ? `Filtrar (${n})` : "Filtrar"}
        </button>
      </div>
      <div data-cantidad className="flex flex-wrap items-center gap-x-1.5 gap-y-1.5 text-sm text-gray-500">
        <span className="mr-0.5">{p.cantidad} {p.cantidad === 1 ? "producto" : "productos"}</span>
        {p.puestos.map((x) => (
          <button
            key={x.clave}
            type="button"
            data-filtro-puesto={x.clave}
            aria-label={`Quitar ${x.texto}`}
            onClick={x.onQuitar}
            className="relative inline-flex h-8 items-center gap-1 rounded-full bg-gray-900 pl-3 pr-2 text-[14px] font-medium text-white before:absolute before:inset-x-0 before:-inset-y-1.5 before:content-[''] active:scale-[0.97]"
          >
            {x.texto}
            <X aria-hidden className="h-3.5 w-3.5" strokeWidth={2.5} />
          </button>
        ))}
        {p.frescura && <span className="ml-auto inline-flex [&>*]:!m-0">{p.frescura}</span>}
      </div>
      <HojaFiltrar {...p} abierta={abierta} onCerrar={() => setAbierta(false)} />
    </div>
  );
}

// 🔴 Sin deslizar (Daniel, 19-nov-2026: «no quiero hacer scroll para buscar
// todas las opciones»). Medido en WebKit con la pantalla VISIBLE del iPhone en
// Safari (375×553 SE · 390×664 · 430×740): Tommy, el de más categorías (6),
// faltaban 349 px en el SE. Todo de 44 px de alto y letra de 14 px o más:
// categorías de a 3, género en una línea, precio en una línea, orden de a 2.
const TITULO = "mb-1.5 mt-3 px-1 text-[14px] font-semibold text-gray-500 first:mt-0";
const COLUMNAS = { 2: "grid-cols-2", 3: "grid-cols-3", 4: "grid-cols-4" } as const;

/** Cuadrícula que no se desliza; la elegida, en negro. Tocar la elegida otra
 *  vez la quita. */
function Cuadricula({ grupo, onTocado, columnas }: { grupo: GrupoFiltrar; onTocado?: () => void; columnas: 2 | 3 | 4 }) {
  return (
    <div role="radiogroup" className={cn("grid gap-2", COLUMNAS[columnas])}>
      {grupo.opciones.map((o) => {
        const elegida = o.valor === grupo.valor;
        return (
          <button
            key={o.valor}
            type="button"
            role="radio"
            aria-checked={elegida}
            onClick={() => { grupo.onCambiar(elegida ? "" : o.valor); onTocado?.(); }}
            className={cn(
              "min-h-[44px] min-w-0 truncate rounded-[10px] border px-1.5 text-center text-[15px] font-medium transition active:scale-[0.98]",
              elegida ? "border-gray-900 bg-gray-900 text-white" : "border-gray-200 bg-white text-gray-900",
            )}
          >
            {o.etiqueta}
          </button>
        );
      })}
    </div>
  );
}

/** Tres por fila desde 3 opciones; con 2, dos. */
const deATres = (n: number) => (n >= 3 ? 3 : 2);
/** En una línea mientras sean 4 o menos. */
const enUnaLinea = (n: number) => (Math.min(Math.max(n, 2), 4) as 2 | 3 | 4);

function HojaFiltrar(p: FiltrarCelularProps & { abierta: boolean; onCerrar: () => void }) {
  const { abierta, onCerrar } = p;
  useBodyScrollLock(abierta);
  useEffect(() => {
    if (!abierta) return;
    const tecla = (e: KeyboardEvent) => { if (e.key === "Escape") onCerrar(); };
    document.addEventListener("keydown", tecla);
    return () => document.removeEventListener("keydown", tecla);
  }, [abierta, onCerrar]);
  if (!abierta || typeof document === "undefined") return null;
  // El orden no se «quita»: tocar el elegido lo deja como está.
  const orden: GrupoFiltrar = { ...p.orden, onCambiar: (v) => p.orden.onCambiar(v || p.orden.valor) };
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="Filtrar" data-hoja-filtrar className="fixed inset-0 z-[60] flex flex-col justify-end sm:hidden">
      <button type="button" aria-label="Cerrar" onClick={onCerrar} className="absolute inset-0 bg-black/30" />
      <div className="relative flex max-h-[calc(100dvh-12px)] flex-col overflow-hidden rounded-t-[14px] bg-gray-100 shadow-xl" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        <div aria-hidden className="absolute left-1/2 top-1.5 h-[5px] w-9 -translate-x-1/2 rounded-full bg-gray-300" />
        <header className="grid grid-cols-[44px_1fr_44px] items-center px-2">
          <span />
          <h2 className="text-center text-[17px] font-semibold text-gray-950">Filtrar</h2>
          <button type="button" aria-label="Cerrar" onClick={onCerrar} className="flex h-11 w-11 items-center justify-center">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-200 text-gray-600"><X className="h-4 w-4" strokeWidth={2.5} /></span>
          </button>
        </header>
        <div className="overflow-y-auto overscroll-contain px-4 pb-3">
          {p.categoria && (
            <section data-seccion="categoria">
              <h3 className={TITULO}>Categoría</h3>
              <Cuadricula grupo={p.categoria} columnas={deATres(p.categoria.opciones.length)} onTocado={onCerrar} />
            </section>
          )}
          {p.genero && (
            <section data-seccion="genero">
              <h3 className={TITULO}>Género</h3>
              <Cuadricula grupo={p.genero} columnas={enUnaLinea(p.genero.opciones.length)} />
            </section>
          )}
          {p.precio && (
            <section data-seccion="precio">
              <h3 className={TITULO}>Precio</h3>
              {p.precio}
            </section>
          )}
          <section data-seccion="orden">
            <h3 className={TITULO}>Orden</h3>
            <Cuadricula grupo={orden} columnas={2} />
          </section>
          {p.bultos && (
            <section data-seccion="bultos" className="mt-3">
              <div className="overflow-hidden rounded-[10px] bg-white">
                <RenglonInterruptor etiqueta="2+ bultos" activo={p.bultos.activo} onCambiar={p.bultos.onCambiar} />
              </div>
            </section>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
