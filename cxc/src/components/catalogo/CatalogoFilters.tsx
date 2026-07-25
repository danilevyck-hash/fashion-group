"use client";

// Filtros del catálogo (búsqueda + chips + orden), parametrizados por
// MARCA_THEME: opciones de género/categoría y clases vienen del tema; los
// chips de Oferta/Nuevo/Próximamente son feature (saleFilter, hoy solo Reebok).

import { getMarcaTheme, type MarcaUiKey } from "@/lib/catalogo/marcas-ui";

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
  sortBy, onSortByChange,
  filteredCount, onClearAll,
}: CatalogoFiltersProps) {
  const theme = getMarcaTheme(marca)!;
  const f = theme.filtros;
  const conCategorias = theme.features.categoryChips;
  const conSale = theme.features.saleFilter && !!onSaleFilterChange;

  const hasActiveFilters = !!(searchInput || gender || category || (conSale && saleFilter));

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

      {/* Sort + count + clear */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {hasActiveFilters && (
            <button onClick={onClearAll} className={f.clearAll}>
              Limpiar filtros
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
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
