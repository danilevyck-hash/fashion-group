"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

interface DirClient { nombre: string; empresa: string; }

interface Props {
  onClose: () => void;
}

// This modal ONLY asks for client name, saves to sessionStorage, and navigates to catalog.
// The order is created later when the user adds products and clicks "Crear pedido".
export default function NewOrderModal({ onClose }: Props) {
  const router = useRouter();
  const [name, setName] = useState(() => {
    try {
      const role = sessionStorage.getItem("cxc_role") || "";
      if (role === "cliente") return sessionStorage.getItem("fg_user_name") || "";
    } catch { /* */ }
    return "";
  });
  const [confirmed, setConfirmed] = useState(false);
  const [suggestions, setSuggestions] = useState<DirClient[]>([]);
  const [showSugg, setShowSugg] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (confirmed || name.length < 2) { setSuggestions([]); return; }
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/catalogo/reebok/clientes-search?q=${encodeURIComponent(name)}`);
        if (res.ok) { const d = await res.json(); setSuggestions(d || []); setShowSugg((d || []).length > 0); }
      } catch { /* */ }
    }, 250);
    return () => clearTimeout(t);
  }, [name, confirmed]);

  useEffect(() => {
    function h(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setShowSugg(false); }
    document.addEventListener("mousedown", h);
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", h); document.removeEventListener("keydown", esc); };
  }, [onClose]);

  function proceed() {
    if (!name.trim()) return;
    // Auto-add new client to directorio if not from suggestions
    if (!confirmed && name.trim().length > 2) {
      fetch("/api/directorio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre: name.trim() }),
      }).catch(() => { /* best-effort */ });
    }
    // Clear any existing draft and set new client name
    sessionStorage.removeItem("reebok_draft_id");
    sessionStorage.setItem("reebok_draft_client", name.trim());
    onClose();
    router.push("/catalogo/reebok/productos");
  }

  const canProceed = confirmed || name.trim().length > 2;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-lg p-6 max-w-sm w-full mx-4" onClick={e => e.stopPropagation()}>
        <h2 className="text-base font-medium mb-1">Nuevo Pedido</h2>
        <p className="text-xs text-gray-400 mb-4">Nombre del cliente para este pedido</p>
        <div className="relative" ref={ref}>
          {confirmed ? (
            <div className="flex items-center justify-between py-2 border-b border-gray-200">
              <span className="text-sm font-medium">{name}</span>
              <button onClick={() => { setConfirmed(false); setName(""); }} className="text-xs text-gray-400 hover:text-gray-600">Cambiar</button>
            </div>
          ) : (
            <>
              <input value={name} onChange={e => setName(e.target.value)}
                onFocus={() => { if (suggestions.length) setShowSugg(true); }}
                onKeyDown={e => { if (e.key === "Enter" && canProceed) proceed(); }}
                placeholder="Ej: City Mall Paso Canó" autoFocus
                className="w-full border-b border-gray-200 py-2 text-sm outline-none focus:border-black transition" />
              {showSugg && suggestions.length > 0 && (
                <div className="absolute z-10 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
                  {suggestions.slice(0, 5).map((c, i) => (
                    <button key={i} onClick={() => { setName(c.nombre); setShowSugg(false); setConfirmed(true); }}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 border-b border-gray-50 last:border-0">
                      {c.nombre}{c.empresa && <span className="text-xs text-gray-400 ml-2">{c.empresa}</span>}
                    </button>
                  ))}
                </div>
              )}
              {!confirmed && name.length > 2 && suggestions.length === 0 && !showSugg && (
                <p className="text-xs text-amber-600 mt-1">Cliente nuevo — se agregará al directorio</p>
              )}
            </>
          )}
        </div>
        <button onClick={proceed} disabled={!canProceed}
          className="w-full mt-4 bg-black text-white py-2.5 rounded text-sm font-medium hover:bg-gray-800 transition disabled:opacity-40">
          Ir al catálogo →
        </button>
        <button onClick={onClose} className="w-full mt-2 text-xs text-gray-400 hover:text-gray-600 py-1">Cancelar</button>
      </div>
    </div>
  );
}
