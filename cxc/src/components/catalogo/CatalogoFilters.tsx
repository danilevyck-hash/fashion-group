"use client";

// Filtros del catálogo (búsqueda + chips + orden), parametrizados por
// MARCA_THEME: opciones de género/categoría y clases vienen del tema; los
// chips de Oferta/Nuevo/Próximamente son feature (saleFilter, hoy solo Reebok),
// y el chip "2 bultos o más" + el select de precio son feature (filtroBultos /
// filtroPrecio, hoy solo Tommy — ver lib/catalogo/filtros-extra).
//
// ── 📱 EN CELULAR LOS FILTROS SON DESPLEGABLES, NO UNA FILA QUE SE ARRASTRA ──
//
// Daniel, textual (30-jul-2026): *"en todo lo del iphone donde haya data como
// los filtros en los catalogos y hay que hacer scroll, mejor arreglarlo de otra
// manera, un drop down"*.
//
// La fila de píldoras es un `overflow-x-auto`. Medido en el navegador con build
// y datos de producción, a 390 px (iPhone), catálogo interno / público:
//
//   Tommy ..... 779 / 813 px de arrastre — 10 de 15 controles fuera de la vista
//   Reebok .... 642 / 674 px de arrastre —  7 de 12 fuera
//   Joybees ... 138 / 158 px de arrastre —  2 de  7 fuera
//
// O sea: en Tommy, DIEZ opciones de filtro solo existían para quien adivinara
// que la fila se arrastra de costado. Este repo ya había pagado ese peaje una
// vez — el chip "2 bultos o más" se movió al principio de la fila el 26-jul
// justamente porque *"un filtro que no se ve no existe"*. Moverlo de lugar
// arreglaba UN chip; esto arregla la fila entera.
//
// La forma: **hasta `md` (768 px), un desplegable por grupo** — Género,
// Categoría, Estado — en una fila que ENVUELVE (`flex-wrap`), así que el
// arrastre horizontal es 0 px por construcción, no por que los chips hayan
// entrado justo. Cada disparador dice de qué filtro es Y qué está elegido
// ("Género: Women"), que es lo que la fila de píldoras no podía mostrar sin
// que uno la recorriera entera.
//
// **De `md` para arriba NO cambia NADA**: iPad (834) y escritorio (1440) siguen
// con la misma fila de píldoras, mismo marcado, mismas clases.
// ⚠️ A 834 px la fila TODAVÍA se arrastra (Tommy 559 px, Reebok 422 px). Es a
// propósito: el alcance aprobado fue el celular. Queda anotado como pendiente.
//
// El panel es `<DesplegableFlotante>` (portal a <body> + `position: fixed`), que
// es EL desplegable de la casa — un panel `absolute` acá lo recortaría el primer
// ancestro con overflow, y hay un candado (`__tests__/desplegables-flotan`) que
// pone el build rojo si alguien escribe uno nuevo.

import { useRef, useState } from "react";
import { getMarcaTheme, type MarcaUiKey } from "@/lib/catalogo/marcas-ui";
import { BULTOS_CHIP_LABEL, PRECIO_RANGO_OPTIONS, type PrecioRango } from "@/lib/catalogo/filtros-extra";
import DesplegableFlotante from "@/components/ui/DesplegableFlotante";

export type SaleFilter = "" | "oferta" | "nuevo" | "proximamente";

/** Chips de Oferta/Nuevo/Próximamente, como lista para el desplegable móvil. */
const SALE_OPTIONS: { value: SaleFilter; label: string }[] = [
  { value: "", label: "Todos" },
  { value: "oferta", label: "Oferta" },
  { value: "nuevo", label: "Nuevo" },
  { value: "proximamente", label: "Próximamente" },
];

interface FiltroDesplegableProps {
  /** Nombre del grupo, tal cual se lee en el botón: "Género", "Categoría"… */
  etiqueta: string;
  valor: string;
  opciones: { value: string; label: string }[];
  onChange: (v: string) => void;
  /** Clases del tema de la marca para el estado encendido/apagado. */
  chipActive: string;
  chipInactive: string;
}

/**
 * Un grupo de filtros del catálogo, en celular: botón + lista flotante.
 *
 * El botón muestra "<Etiqueta>: <elegido>" y se pinta como chip encendido
 * cuando hay algo elegido, así que el estado se lee sin abrirlo. La lista vive
 * en `<DesplegableFlotante>`: **cuando está cerrada no existe en el DOM**, que
 * es lo que hace que duplicar el control (píldoras en escritorio + desplegable
 * en celular) no duplique opciones ni etiquetas para nadie.
 */
function FiltroDesplegable({
  etiqueta, valor, opciones, onChange, chipActive, chipInactive,
}: FiltroDesplegableProps) {
  const [abierto, setAbierto] = useState(false);
  const anclaRef = useRef<HTMLButtonElement>(null);
  const elegida = opciones.find(o => o.value === valor);
  const activo = !!valor;

  return (
    <>
      <button
        ref={anclaRef}
        type="button"
        onClick={() => setAbierto(a => !a)}
        aria-haspopup="listbox"
        aria-expanded={abierto}
        className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium transition whitespace-nowrap min-h-[44px] ${
          activo ? chipActive : chipInactive
        }`}
      >
        <span>{etiqueta}: {elegida?.label ?? opciones[0]?.label ?? "Todos"}</span>
        <svg className="w-3 h-3 shrink-0 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      <DesplegableFlotante
        abierto={abierto}
        anclaRef={anclaRef}
        onCerrar={() => setAbierto(false)}
        marca={`catalogo-filtro-${etiqueta.toLowerCase()}`}
        role="listbox"
        aria-label={etiqueta}
        anchoMinimo={200}
        className="bg-white rounded-xl border border-black/10 shadow-lg py-1"
      >
        {opciones.map(o => (
          <button
            key={o.value || "todos"}
            type="button"
            role="option"
            aria-selected={o.value === valor}
            onClick={() => { onChange(o.value); setAbierto(false); }}
            className={`w-full min-h-[44px] px-4 flex items-center justify-between gap-2 text-left text-sm transition hover:bg-black/5 ${
              o.value === valor ? "font-semibold" : "text-gray-700"
            }`}
          >
            <span>{o.label}</span>
            {o.value === valor && (
              <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            )}
          </button>
        ))}
      </DesplegableFlotante>
    </>
  );
}

interface CatalogoFiltersProps {
  marca: MarcaUiKey;
  searchInput: string;
  onSearchChange: (v: string) => void;
  gender: string;
  onGenderChange: (v: string) => void;
  category: string;
  onCategoryChange: (v: string) => void;
  saleFilter?: SaleFilter;
  onSaleFilterChange?: (v: SaleFilter) => void;
  bultosFilter?: boolean;
  onBultosFilterChange?: (v: boolean) => void;
  precioRango?: PrecioRango;
  onPrecioRangoChange?: (v: PrecioRango) => void;
  sortBy: string;
  onSortByChange: (v: string) => void;
  filteredCount: number;
  onClearAll: () => void;
}

export default function CatalogoFilters({
  marca,
  searchInput, onSearchChange,
  gender, onGenderChange,
  category, onCategoryChange,
  saleFilter = "", onSaleFilterChange,
  bultosFilter = false, onBultosFilterChange,
  precioRango = "", onPrecioRangoChange,
  sortBy, onSortByChange,
  filteredCount, onClearAll,
}: CatalogoFiltersProps) {
  const theme = getMarcaTheme(marca)!;
  const f = theme.filtros;
  const conCategorias = theme.features.categoryChips;
  const conSale = theme.features.saleFilter && !!onSaleFilterChange;
  const conBultos = theme.features.filtroBultos && !!onBultosFilterChange;
  const conPrecio = theme.features.filtroPrecio && !!onPrecioRangoChange;

  const hasActiveFilters = !!(
    searchInput || gender || category ||
    (conSale && saleFilter) ||
    (conBultos && bultosFilter) ||
    (conPrecio && precioRango)
  );

  return (
    <div className="space-y-3 mb-6">
      {/* Search bar */}
      <div className="relative">
        <svg className={f.searchIcon} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          value={searchInput}
          onChange={e => onSearchChange(e.target.value)}
          placeholder={f.searchPlaceholder}
          className={f.searchInput}
        />
        {searchInput && (
          <button
            onClick={() => onSearchChange("")}
            className={f.searchClear}
            aria-label="Limpiar búsqueda"
          >
            &times;
          </button>
        )}
      </div>

      {/* ── CELULAR (hasta md): un desplegable por grupo, fila que ENVUELVE ──
          Es la misma información que la fila de píldoras de al lado, pero sin
          arrastre horizontal: `flex-wrap` la baja de renglón en vez de esconder
          lo que no entra. Medido a 390 px: 813 px de arrastre → 0. */}
      <div className="flex md:hidden flex-wrap items-center gap-2">
        {conBultos && (
          <button
            onClick={() => onBultosFilterChange!(!bultosFilter)}
            aria-pressed={bultosFilter}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition whitespace-nowrap min-h-[44px] ${
              bultosFilter ? f.chipActive : f.chipInactive
            }`}
          >
            {BULTOS_CHIP_LABEL}
          </button>
        )}

        <FiltroDesplegable
          etiqueta="Género"
          valor={gender}
          opciones={f.genderOptions}
          onChange={onGenderChange}
          chipActive={f.chipActive}
          chipInactive={f.chipInactive}
        />

        {conCategorias && (
          <FiltroDesplegable
            etiqueta="Categoría"
            valor={category}
            opciones={f.categoryOptions}
            onChange={onCategoryChange}
            chipActive={f.chipActive}
            chipInactive={f.chipInactive}
          />
        )}

        {conSale && (
          <FiltroDesplegable
            etiqueta="Estado"
            valor={saleFilter}
            opciones={SALE_OPTIONS}
            onChange={v => onSaleFilterChange!(v as SaleFilter)}
            chipActive={f.chipActive}
            chipInactive={f.chipInactive}
          />
        )}
      </div>

      {/* ── iPAD Y ESCRITORIO (md+): la fila de píldoras de siempre ──
          No se le tocó ni una clase salvo el `hidden md:flex` que la esconde en
          celular. En 834 y 1440 el marcado y el aspecto son idénticos a antes. */}
      <div className="hidden md:flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide -mx-4 px-4">
        {conBultos && (
          <>
            {/* Chip "2 bultos o más" (feature filtroBultos) — PRIMERO de la fila
                (Daniel, 26-jul-2026): al final quedaba detrás del Género y de
                las 7 categorías, y en móvil había que arrastrar la fila para
                encontrarlo. "Un filtro que no se ve no existe" — y este corta
                123 de 490 productos en Tommy, no es decorativo.
                Dice la REGLA y no un juicio de valor sobre el inventario: la
                card no muestra Disponibilidad ni Existencia, así que el cliente
                no tendría cómo saber por qué desaparecieron productos. "Bulto"
                ya es vocabulario de la card. Umbral: 2 bultos COMPLETOS
                (Tommy = 24 pzas). */}
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={() => onBultosFilterChange!(!bultosFilter)}
                aria-pressed={bultosFilter}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition whitespace-nowrap min-h-[44px] ${
                  bultosFilter ? f.chipActive : f.chipInactive
                }`}
              >
                {BULTOS_CHIP_LABEL}
              </button>
            </div>

            <div className={f.divider} />
          </>
        )}

        {/* Gender chips */}
        <div className="flex items-center gap-1.5 shrink-0">
          <span className={f.chipLabel}>Género</span>
          {f.genderOptions.map(opt => (
            <button
              key={opt.value}
              onClick={() => onGenderChange(gender === opt.value ? "" : opt.value)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition whitespace-nowrap min-h-[44px] ${
                gender === opt.value ? f.chipActive : f.chipInactive
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {conCategorias && (
          <>
            <div className={f.divider} />

            {/* Category chips */}
            <div className="flex items-center gap-1.5 shrink-0">
              <span className={f.chipLabel}>Categoría</span>
              {f.categoryOptions.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => onCategoryChange(category === opt.value ? "" : opt.value)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition whitespace-nowrap min-h-[44px] ${
                    category === opt.value ? f.chipActive : f.chipInactive
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </>
        )}

        {conSale && (
          <>
            <div className={f.divider} />

            {/* Sale/New/Próximamente toggle chips (feature saleFilter) */}
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={() => onSaleFilterChange!(saleFilter === "oferta" ? "" : "oferta")}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition whitespace-nowrap min-h-[44px] ${
                  saleFilter === "oferta"
                    ? "bg-[#E4002B] text-white shadow-sm"
                    : "bg-white text-[#E4002B]/70 border border-[#E4002B]/20 hover:border-[#E4002B]/40"
                }`}
              >
                Oferta
              </button>
              <button
                onClick={() => onSaleFilterChange!(saleFilter === "nuevo" ? "" : "nuevo")}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition whitespace-nowrap min-h-[44px] ${
                  saleFilter === "nuevo" ? f.chipActive : f.chipInactive
                }`}
              >
                Nuevo
              </button>
              <button
                onClick={() => onSaleFilterChange!(saleFilter === "proximamente" ? "" : "proximamente")}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition whitespace-nowrap min-h-[44px] ${
                  saleFilter === "proximamente"
                    ? "bg-amber-500 text-white shadow-sm"
                    : "bg-white text-amber-700 border border-amber-300 hover:border-amber-400"
                }`}
              >
                Próximamente
              </button>
            </div>
          </>
        )}
      </div>

      {/* Sort + count + clear.
          `flex-wrap` en las dos filas: con DOS selects (Tommy: precio + orden)
          la fila mide 404px y no entra en un iPhone de 390 — sin esto la
          PÁGINA entera se iba en scroll horizontal (medido en Chrome a 390px).
          En Reebok y Joybees no cambia nada: con un solo select nunca envuelve. */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {hasActiveFilters && (
            <button onClick={onClearAll} className={f.clearAll}>
              Limpiar filtros
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 ml-auto">
          {/* Rango de precio POR PIEZA (feature filtroPrecio). Va en un select
              y no en chips: 4 opciones no caben en la fila de chips en móvil. */}
          {conPrecio && (
            <select
              value={precioRango}
              onChange={e => onPrecioRangoChange!(e.target.value as PrecioRango)}
              aria-label="Filtrar por precio"
              className={f.sortSelect}
            >
              {PRECIO_RANGO_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          )}
          <select
            value={sortBy}
            onChange={e => onSortByChange(e.target.value)}
            className={f.sortSelect}
          >
            <option value="relevancia">Ordenar: Relevancia</option>
            <option value="precio-asc">Precio: menor a mayor</option>
            <option value="precio-desc">Precio: mayor a menor</option>
            <option value="nombre-az">Nombre A-Z</option>
          </select>
          {/* El número suelto ("490") no le decía NADA al cliente: quedaba
              pegado al select de orden como si fuera parte de él. Con la
              palabra al lado se lee solo. */}
          <span className={f.count}>
            {filteredCount} {filteredCount === 1 ? "producto" : "productos"}
          </span>
        </div>
      </div>
    </div>
  );
}
