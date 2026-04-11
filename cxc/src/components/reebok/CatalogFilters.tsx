"use client";

import { useState } from "react";

interface CatalogFiltersProps {
  searchInput: string;
  onSearchChange: (v: string) => void;
  gender: string;
  onGenderChange: (v: string) => void;
  category: string;
  onCategoryChange: (v: string) => void;
  saleFilter: "" | "oferta" | "nuevo";
  onSaleFilterChange: (v: "" | "oferta" | "nuevo") => void;
  colorFilter: string;
  onColorFilterChange: (v: string) => void;
  sizeFilter: string;
  onSizeFilterChange: (v: string) => void;
  priceFilter: string;
  onPriceFilterChange: (v: string) => void;
  sortBy: string;
  onSortByChange: (v: string) => void;
  uniqueColors: string[];
  uniqueSizes: string[];
  ofertaPrices: number[];
  filteredCount: number;
  onClearAll: () => void;
}

const COLOR_DOT_MAP: Record<string, string> = {
  black: "#000", negro: "#000", white: "#fff", blanco: "#fff",
  red: "#E4002B", rojo: "#E4002B", blue: "#1A2656", azul: "#1A2656",
  green: "#16a34a", verde: "#16a34a", yellow: "#eab308", amarillo: "#eab308",
  pink: "#ec4899", rosado: "#ec4899", gray: "#9ca3af", gris: "#9ca3af",
  brown: "#92400e", cafe: "#92400e", orange: "#f97316", naranja: "#f97316",
  purple: "#9333ea", morado: "#9333ea", navy: "#1e3a5f", beige: "#d4c5a9",
};

function getColorDot(color: string): string {
  const lower = color.toLowerCase().trim();
  for (const [key, hex] of Object.entries(COLOR_DOT_MAP)) {
    if (lower.includes(key)) return hex;
  }
  return "#94a3b8";
}

export default function CatalogFilters({
  searchInput, onSearchChange,
  gender, onGenderChange,
  category, onCategoryChange,
  saleFilter, onSaleFilterChange,
  colorFilter, onColorFilterChange,
  sizeFilter, onSizeFilterChange,
  priceFilter, onPriceFilterChange,
  sortBy, onSortByChange,
  uniqueColors, uniqueSizes, ofertaPrices,
  filteredCount, onClearAll,
}: CatalogFiltersProps) {
  const [moreFiltersOpen, setMoreFiltersOpen] = useState(false);

  const genderOptions = [
    { value: "", label: "Todos" },
    { value: "male", label: "Hombre" },
    { value: "female", label: "Mujer" },
    { value: "kids", label: "Ninos" },
  ];

  const categoryOptions = [
    { value: "", label: "Todos" },
    { value: "footwear", label: "Calzado" },
    { value: "apparel", label: "Ropa" },
    { value: "accessories", label: "Accesorios" },
  ];

  const hasActiveFilters = !!(searchInput || gender || category || saleFilter || colorFilter || sizeFilter || priceFilter);
  const secondaryFilterCount = [colorFilter, sizeFilter, priceFilter].filter(Boolean).length;

  return (
    <div className="space-y-3 mb-6">
      {/* Search bar */}
      <div className="relative">
        <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#1A2656]/30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          value={searchInput}
          onChange={e => onSearchChange(e.target.value)}
          placeholder="Buscar por nombre, codigo o color..."
          className="w-full pl-10 pr-4 py-3 bg-white rounded-xl border border-[#1A2656]/10 text-sm outline-none focus:border-[#1A2656]/30 focus:ring-2 focus:ring-[#1A2656]/5 transition placeholder:text-[#1A2656]/25"
        />
        {searchInput && (
          <button
            onClick={() => onSearchChange("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center rounded-full bg-gray-200 text-gray-500 hover:bg-gray-300 transition text-xs"
          >
            &times;
          </button>
        )}
      </div>

      {/* Chip filters row */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide -mx-4 px-4">
        {/* Gender chips */}
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-[10px] font-semibold text-[#1A2656]/40 uppercase tracking-wider mr-0.5">Genero</span>
          {genderOptions.map(opt => (
            <button
              key={opt.value}
              onClick={() => onGenderChange(gender === opt.value ? "" : opt.value)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition whitespace-nowrap min-h-[32px] ${
                gender === opt.value
                  ? "bg-[#1A2656] text-white shadow-sm"
                  : "bg-white text-[#1A2656]/60 border border-[#1A2656]/10 hover:border-[#1A2656]/25"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <div className="w-px h-5 bg-[#1A2656]/10 shrink-0" />

        {/* Category chips */}
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-[10px] font-semibold text-[#1A2656]/40 uppercase tracking-wider mr-0.5">Cat.</span>
          {categoryOptions.map(opt => (
            <button
              key={opt.value}
              onClick={() => onCategoryChange(category === opt.value ? "" : opt.value)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition whitespace-nowrap min-h-[32px] ${
                category === opt.value
                  ? "bg-[#1A2656] text-white shadow-sm"
                  : "bg-white text-[#1A2656]/60 border border-[#1A2656]/10 hover:border-[#1A2656]/25"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <div className="w-px h-5 bg-[#1A2656]/10 shrink-0" />

        {/* Sale/New toggle chips */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={() => onSaleFilterChange(saleFilter === "oferta" ? "" : "oferta")}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition whitespace-nowrap min-h-[32px] ${
              saleFilter === "oferta"
                ? "bg-[#E4002B] text-white shadow-sm"
                : "bg-white text-[#E4002B]/70 border border-[#E4002B]/20 hover:border-[#E4002B]/40"
            }`}
          >
            Oferta
          </button>
          <button
            onClick={() => onSaleFilterChange(saleFilter === "nuevo" ? "" : "nuevo")}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition whitespace-nowrap min-h-[32px] ${
              saleFilter === "nuevo"
                ? "bg-[#1A2656] text-white shadow-sm"
                : "bg-white text-[#1A2656]/60 border border-[#1A2656]/10 hover:border-[#1A2656]/25"
            }`}
          >
            Nuevo
          </button>
        </div>
      </div>

      {/* Secondary filters row + Sort */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {/* More filters button */}
          <button
            onClick={() => setMoreFiltersOpen(prev => !prev)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition min-h-[32px] ${
              moreFiltersOpen || secondaryFilterCount > 0
                ? "bg-[#1A2656]/10 text-[#1A2656]"
                : "bg-white text-[#1A2656]/50 border border-[#1A2656]/10 hover:border-[#1A2656]/20"
            }`}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
            </svg>
            Mas filtros
            {secondaryFilterCount > 0 && (
              <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-[#E4002B] text-white text-[9px] font-bold">
                {secondaryFilterCount}
              </span>
            )}
          </button>

          {/* Clear all */}
          {hasActiveFilters && (
            <button
              onClick={onClearAll}
              className="text-xs text-[#1A2656]/40 hover:text-[#E4002B] transition min-h-[32px] px-2"
            >
              Limpiar filtros
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <select
            value={sortBy}
            onChange={e => onSortByChange(e.target.value)}
            className="text-xs border border-[#1A2656]/10 rounded-lg px-2.5 py-1.5 outline-none focus:border-[#1A2656]/30 transition bg-white text-[#1A2656]/60 min-h-[32px]"
          >
            <option value="relevancia">Ordenar: Relevancia</option>
            <option value="precio-asc">Precio: menor a mayor</option>
            <option value="precio-desc">Precio: mayor a menor</option>
            <option value="nombre-az">Nombre A-Z</option>
          </select>
          <span className="text-xs text-[#1A2656]/30 tabular-nums">{filteredCount}</span>
        </div>
      </div>

      {/* Collapsible secondary filters */}
      <div
        className="overflow-hidden transition-all duration-200"
        style={{ maxHeight: moreFiltersOpen ? "200px" : "0px", opacity: moreFiltersOpen ? 1 : 0 }}
      >
        <div className="flex flex-wrap gap-3 pt-1 pb-2">
          {/* Color filter */}
          {uniqueColors.length > 1 && (
            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-semibold text-[#1A2656]/40 uppercase tracking-wider">Color</span>
              <div className="flex flex-wrap gap-1.5">
                <button
                  onClick={() => onColorFilterChange("")}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition min-h-[28px] ${
                    !colorFilter ? "bg-[#1A2656] text-white" : "bg-white text-[#1A2656]/50 border border-[#1A2656]/10"
                  }`}
                >
                  Todos
                </button>
                {uniqueColors.map(c => (
                  <button
                    key={c}
                    onClick={() => onColorFilterChange(colorFilter === c ? "" : c)}
                    className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition flex items-center gap-1.5 min-h-[28px] ${
                      colorFilter === c
                        ? "bg-[#1A2656] text-white"
                        : "bg-white text-[#1A2656]/50 border border-[#1A2656]/10 hover:border-[#1A2656]/25"
                    }`}
                  >
                    <span
                      className="w-2.5 h-2.5 rounded-full border border-black/10 shrink-0"
                      style={{ backgroundColor: getColorDot(c) }}
                    />
                    {c}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Size filter */}
          {uniqueSizes.length > 1 && (
            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-semibold text-[#1A2656]/40 uppercase tracking-wider">Talla</span>
              <div className="flex flex-wrap gap-1.5">
                <button
                  onClick={() => onSizeFilterChange("")}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition min-h-[28px] ${
                    !sizeFilter ? "bg-[#1A2656] text-white" : "bg-white text-[#1A2656]/50 border border-[#1A2656]/10"
                  }`}
                >
                  Todas
                </button>
                {uniqueSizes.map(s => (
                  <button
                    key={s}
                    onClick={() => onSizeFilterChange(sizeFilter === s ? "" : s)}
                    className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition min-h-[28px] ${
                      sizeFilter === s
                        ? "bg-[#1A2656] text-white"
                        : "bg-white text-[#1A2656]/50 border border-[#1A2656]/10 hover:border-[#1A2656]/25"
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Price filter (only when oferta is active) */}
          {saleFilter === "oferta" && ofertaPrices.length > 1 && (
            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-semibold text-[#E4002B]/60 uppercase tracking-wider">Precio</span>
              <div className="flex flex-wrap gap-1.5">
                <button
                  onClick={() => onPriceFilterChange("")}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition min-h-[28px] ${
                    !priceFilter ? "bg-[#E4002B] text-white" : "bg-white text-[#E4002B]/50 border border-[#E4002B]/20"
                  }`}
                >
                  Todos
                </button>
                {ofertaPrices.map(p => (
                  <button
                    key={p}
                    onClick={() => onPriceFilterChange(priceFilter === String(p) ? "" : String(p))}
                    className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition min-h-[28px] ${
                      priceFilter === String(p)
                        ? "bg-[#E4002B] text-white"
                        : "bg-white text-[#E4002B]/50 border border-[#E4002B]/20 hover:border-[#E4002B]/40"
                    }`}
                  >
                    ${p.toFixed(0)}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
