"use client";

interface JoybeesFiltersProps {
  searchInput: string;
  onSearchChange: (v: string) => void;
  gender: string;
  onGenderChange: (v: string) => void;
  category: string;
  onCategoryChange: (v: string) => void;
  sortBy: string;
  onSortByChange: (v: string) => void;
  filteredCount: number;
  onClearAll: () => void;
}

export default function JoybeesFilters({
  searchInput, onSearchChange,
  gender, onGenderChange,
  category, onCategoryChange,
  sortBy, onSortByChange,
  filteredCount, onClearAll,
}: JoybeesFiltersProps) {
  const genderOptions = [
    { value: "", label: "Todos" },
    { value: "adults_m", label: "Adults" },
    { value: "women", label: "Women" },
    { value: "kids", label: "Kids" },
    { value: "junior", label: "Junior" },
  ];

  const categoryOptions = [
    { value: "", label: "Todos" },
    { value: "active_clog", label: "Active Clog" },
    { value: "casual_flip", label: "Casual Flip" },
    { value: "varsity_clog", label: "Varsity Clog" },
    { value: "trekking_slide", label: "Trekking Slide" },
    { value: "trekking_shoe", label: "Trekking Shoe" },
    { value: "work_clog", label: "Work Clog" },
    { value: "friday_flat", label: "Friday Flat" },
    { value: "garden_grove_clog", label: "Garden Grove" },
    { value: "lakeshore_sandal", label: "Lakeshore" },
    { value: "riviera_sandal", label: "Riviera" },
    { value: "everyday_sandal", label: "Everyday Sandal" },
    { value: "varsity_flip", label: "Varsity Flip" },
    { value: "studio_clog", label: "Studio Clog" },
    { value: "popinz", label: "Popinz" },
  ];

  const hasActiveFilters = !!(searchInput || gender || category);

  return (
    <div className="space-y-3 mb-6">
      {/* Search bar */}
      <div className="relative">
        <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#404041]/30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          value={searchInput}
          onChange={e => onSearchChange(e.target.value)}
          placeholder="Buscar por nombre o codigo..."
          className="w-full pl-10 pr-4 py-3 bg-white rounded-xl border border-[#404041]/10 text-sm outline-none focus:border-[#FFE443] focus:ring-2 focus:ring-[#FFE443]/20 transition placeholder:text-[#404041]/25"
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
          <span className="text-[10px] font-semibold text-[#404041]/40 uppercase tracking-wider mr-0.5">Genero</span>
          {genderOptions.map(opt => (
            <button
              key={opt.value}
              onClick={() => onGenderChange(gender === opt.value ? "" : opt.value)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition whitespace-nowrap min-h-[32px] ${
                gender === opt.value
                  ? "bg-[#404041] text-white shadow-sm"
                  : "bg-white text-[#404041]/60 border border-[#404041]/10 hover:border-[#404041]/25"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Category chips removed — not needed for Joybees */}
      </div>

      {/* Sort + count + clear */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {hasActiveFilters && (
            <button
              onClick={onClearAll}
              className="text-xs text-[#404041]/40 hover:text-[#404041] transition min-h-[32px] px-2"
            >
              Limpiar filtros
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <select
            value={sortBy}
            onChange={e => onSortByChange(e.target.value)}
            className="text-xs border border-[#404041]/10 rounded-lg px-2.5 py-1.5 outline-none focus:border-[#404041]/30 transition bg-white text-[#404041]/60 min-h-[32px]"
          >
            <option value="relevancia">Ordenar: Relevancia</option>
            <option value="precio-asc">Precio: menor a mayor</option>
            <option value="precio-desc">Precio: mayor a menor</option>
            <option value="nombre-az">Nombre A-Z</option>
          </select>
          <span className="text-xs text-[#404041]/30 tabular-nums">{filteredCount}</span>
        </div>
      </div>
    </div>
  );
}
