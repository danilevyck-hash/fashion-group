"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";

interface CxcResult { id: string; nombre_normalized: string; total: number; company_key: string }
interface ReclamoResult { id: string; nro_reclamo: string; nro_factura: string; empresa: string; estado: string; fecha_reclamo: string }
interface GuiaResult { id: string; numero: number; fecha: string; transportista: string; estado: string }
interface DirResult { id: string; nombre: string; empresa: string; correo: string; celular: string }

interface SearchResults {
  cxc: CxcResult[];
  reclamos: ReclamoResult[];
  guias: GuiaResult[];
  directorio: DirResult[];
}

interface FlatItem {
  module: string;
  label: string;
  sub: string;
  href: string;
  icon: string;
}

function flatten(r: SearchResults): FlatItem[] {
  const items: FlatItem[] = [];
  for (const c of r.cxc) {
    items.push({
      module: "CxC",
      label: c.nombre_normalized,
      sub: `$${c.total.toLocaleString("en", { minimumFractionDigits: 2 })} — ${c.company_key}`,
      href: "/admin",
      icon: "📊",
    });
  }
  for (const rec of r.reclamos) {
    items.push({
      module: "Reclamos",
      label: rec.nro_reclamo,
      sub: `Factura ${rec.nro_factura} — ${rec.empresa} — ${rec.estado}`,
      href: `/reclamos?view=detail&id=${rec.id}`,
      icon: "📝",
    });
  }
  for (const g of r.guias) {
    items.push({
      module: "Guías",
      label: `Guía #${g.numero}`,
      sub: `${g.transportista || "—"} — ${g.estado}`,
      href: `/guias?id=${g.id}`,
      icon: "🚚",
    });
  }
  for (const d of r.directorio) {
    items.push({
      module: "Directorio",
      label: d.nombre,
      sub: [d.empresa, d.correo, d.celular].filter(Boolean).join(" · "),
      href: "/directorio",
      icon: "📋",
    });
  }
  return items;
}

export default function SearchBar({ darkMode }: { darkMode?: boolean }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResults | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const items = results ? flatten(results) : [];
  const hasResults = items.length > 0;
  const searched = results !== null && query.length >= 2;

  const doSearch = useCallback(async (q: string) => {
    if (q.length < 2) { setResults(null); setOpen(false); return; }
    setLoading(true);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
      if (res.ok) {
        const data = await res.json();
        setResults(data);
        setOpen(true);
        setActiveIdx(-1);
      }
    } catch { /* */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => doSearch(query), 300);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [query, doSearch]);

  // Close on click outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function navigate(item: FlatItem) {
    setOpen(false);
    setQuery("");
    setResults(null);
    router.push(item.href);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") { setOpen(false); inputRef.current?.blur(); return; }
    if (!open || !hasResults) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setActiveIdx((i) => Math.min(i + 1, items.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActiveIdx((i) => Math.max(i - 1, 0)); }
    else if (e.key === "Enter" && activeIdx >= 0) { e.preventDefault(); navigate(items[activeIdx]); }
  }

  // Group items by module for display
  const grouped: Record<string, FlatItem[]> = {};
  let globalIdx = 0;
  const idxMap: number[] = [];
  for (const item of items) {
    if (!grouped[item.module]) grouped[item.module] = [];
    grouped[item.module].push(item);
    idxMap.push(globalIdx);
    globalIdx++;
  }

  const bg = darkMode ? "bg-gray-900 border-gray-700" : "bg-white border-gray-200";
  const inputBg = darkMode ? "bg-gray-800 text-gray-100 placeholder-gray-500" : "bg-gray-50 text-gray-900 placeholder-gray-400";
  const hoverBg = darkMode ? "bg-gray-800" : "bg-gray-50";

  return (
    <div ref={wrapperRef} className="relative w-full max-w-xl mx-auto mb-6">
      <div className={`relative flex items-center rounded-xl border ${darkMode ? "border-gray-700 bg-gray-800" : "border-gray-200 bg-gray-50"} transition focus-within:border-gray-400 focus-within:shadow-sm`}>
        {/* Search icon */}
        <svg className="absolute left-3 w-4 h-4 text-gray-400 pointer-events-none" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
        </svg>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => { if (searched) setOpen(true); }}
          onKeyDown={onKeyDown}
          placeholder="Buscar clientes, reclamos, guías..."
          className={`w-full pl-10 pr-10 py-2.5 text-sm rounded-xl outline-none ${inputBg} bg-transparent`}
        />
        {/* Loading spinner or clear */}
        {loading ? (
          <div className="absolute right-3">
            <div className="w-4 h-4 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
          </div>
        ) : query.length > 0 ? (
          <button onClick={() => { setQuery(""); setResults(null); setOpen(false); }} className="absolute right-3 text-gray-400 hover:text-gray-600">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        ) : null}
      </div>

      {/* Dropdown */}
      {open && searched && (
        <div className={`absolute z-50 mt-1 w-full rounded-xl border shadow-lg overflow-hidden ${bg}`}>
          {hasResults ? (
            <div className="max-h-80 overflow-y-auto">
              {(() => {
                let idx = 0;
                return Object.entries(grouped).map(([module, moduleItems]) => (
                  <div key={module}>
                    <div className={`px-3 py-1.5 text-[10px] uppercase tracking-wider font-medium ${darkMode ? "text-gray-500 bg-gray-900" : "text-gray-400 bg-gray-50"}`}>
                      {module}
                    </div>
                    {moduleItems.map((item) => {
                      const thisIdx = idx++;
                      return (
                        <button
                          key={`${item.module}-${item.label}-${thisIdx}`}
                          onClick={() => navigate(item)}
                          onMouseEnter={() => setActiveIdx(thisIdx)}
                          className={`w-full flex items-center gap-3 px-3 py-2 text-left transition ${
                            activeIdx === thisIdx ? hoverBg : ""
                          }`}
                        >
                          <span className="text-lg flex-shrink-0">{item.icon}</span>
                          <div className="min-w-0 flex-1">
                            <div className={`text-sm truncate ${darkMode ? "text-gray-100" : "text-gray-800"}`}>{item.label}</div>
                            <div className="text-xs text-gray-400 truncate">{item.sub}</div>
                          </div>
                          <svg className="w-3.5 h-3.5 text-gray-300 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6" /></svg>
                        </button>
                      );
                    })}
                  </div>
                ));
              })()}
            </div>
          ) : (
            <div className="px-4 py-6 text-center">
              <p className="text-sm text-gray-400">Sin resultados para &quot;{query}&quot;</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
