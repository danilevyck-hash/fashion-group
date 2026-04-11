"use client";

interface CatalogFiltersProps {
  searchInput: string;
  onSearchChange: (v: string) => void;
  gender: string;
  onGenderChange: (v: string) => void;
  category: string;
  onCategoryChange: (v: string) => void;
  saleFilter: "" | "oferta" | "nuevo";
  onSaleFilterChange: (v: "" | "oferta" | "nuevo") => void;
  sortBy: string;
  onSortByChange: (v: string) => void;
  filteredCount: number;
  onClearAll: () => void;
}

export default function CatalogFilters({
  searchInput, onSearchChange,
  gender, onGenderChange,
  category, onCategoryChange,
  saleFilter, onSaleFilterChange,
  sortBy, onSortByChange,
  filteredCount, onClearAll,
}: CatalogFiltersProps) {
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

  const hasActiveFilters = !!(searchInput || gender || category || saleFilter);

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

      {/* Sort + count + clear */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
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
    </div>
  );
}
