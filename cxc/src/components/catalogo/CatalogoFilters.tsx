"use client";

// Filtros del catálogo (búsqueda + chips + orden), parametrizados por
// MARCA_THEME: opciones de género/categoría y clases vienen del tema; los
// chips de Oferta/Nuevo/Próximamente son feature (saleFilter, hoy solo Reebok),
// y el chip "2 bultos o más" + el select de precio son feature (filtroBultos /
// filtroPrecio, hoy solo Tommy — ver lib/catalogo/filtros-extra).

import { getMarcaTheme, type MarcaUiKey } from "@/lib/catalogo/marcas-ui";
import { BULTOS_CHIP_LABEL, PRECIO_RANGO_OPTIONS, type PrecioRango } from "@/lib/catalogo/filtros-extra";

export type SaleFilter = "" | "oferta" | "nuevo" | "proximamente";

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

      {/* Chip filters row */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide -mx-4 px-4">
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
          <span className={f.chipLabel}>Genero</span>
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
              <span className={f.chipLabel}>Cat.</span>
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
          <span className={f.count}>{filteredCount}</span>
        </div>
      </div>
    </div>
  );
}
