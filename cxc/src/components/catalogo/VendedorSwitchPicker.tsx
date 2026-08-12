"use client";

// ─────────────────────────────────────────────────────────────────────────────
// Selector de VENDEDOR de Switch — UNA sola pieza para los DOS lugares donde se
// elige (12-ago-2026): el bloque "Vendedor" del detalle del pedido y el del
// checkout del carrito. Mismo par que ClienteSwitchPicker.
//
// 🔴 LA LISTA NO SE PIDE POR TECLA. Sale de `/api/admin/switch-vendedores`
// —la MISMA ruta que alimenta Sistema → Usuarios— que va EN VIVO contra Switch
// y cachea 15 min por empresa. Se lee UNA vez al abrir y se filtra en el
// navegador: son decenas de vendedores, no miles como los clientes. Un debounce
// contra el servidor acá sería un login contra Switch por tecleo, y Switch
// admite un solo login por empresa.
//
// 🔴 ACÁ SÍ HAY DEFAULT, al revés que en el cliente. El vendedor mapeado al
// login viene puesto y `valor` nunca es `undefined`: cambiarlo es opcional.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState } from "react";
import { nombreDeVendedor } from "@/lib/catalogo/vendedor-switch";

export interface VendedorOpcion {
  id: number;
  nombre: string;
}

interface Props {
  /** Empresa Switch de la marca (ej. "fashion_shoes"). */
  empresa: string;
  /** Nombre del directorio Switch de la marca (para los textos de ayuda). */
  directorioLabel: string;
  /** El vendedor puesto hoy (el del login, o el que ya tiene el pedido). */
  valor: { id: number; nombre?: string | null } | null;
  onElegir: (v: VendedorOpcion) => void;
  /** Deshabilita todo mientras el padre tiene algo en vuelo. */
  disabled?: boolean;
}

export default function VendedorSwitchPicker({ empresa, directorioLabel, valor, onElegir, disabled }: Props) {
  const [query, setQuery] = useState("");
  const [vendedores, setVendedores] = useState<VendedorOpcion[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const r = await fetch(`/api/admin/switch-vendedores?empresa=${encodeURIComponent(empresa)}`);
        if (!vivo) return;
        if (r.ok) {
          const d = await r.json();
          setVendedores(Array.isArray(d.vendedores) ? d.vendedores : []);
          setError(false);
        } else {
          setError(true);
        }
      } catch {
        if (vivo) setError(true);
      }
    })();
    return () => { vivo = false; };
  }, [empresa]);

  // Filtro en el navegador (ver cabecera). Sin acentos y sin mayúsculas, que es
  // como la gente teclea un apellido.
  const filtrados = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q || !vendedores) return vendedores ?? [];
    const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const nq = norm(q);
    return vendedores.filter((v) => norm(v.nombre).includes(nq) || String(v.id) === q);
  }, [vendedores, query]);

  return (
    <div>
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        disabled={disabled}
        placeholder="Buscar vendedor..."
        className="w-full border border-gray-200 rounded-md px-3 py-2 min-h-[44px] text-base sm:text-sm outline-none focus:border-black transition mb-2 disabled:opacity-50"
      />
      <div className="border border-gray-100 rounded-md divide-y divide-gray-50 max-h-56 overflow-y-auto">
        {error ? (
          <div className="px-3 py-2.5 text-xs text-red-600">
            No se pudo cargar la lista de vendedores de Switch. Intenta de nuevo en unos segundos.
          </div>
        ) : vendedores === null ? (
          <div className="px-3 py-2.5 text-xs text-gray-400">Cargando vendedores...</div>
        ) : filtrados.length === 0 ? (
          <div className="px-3 py-2.5 text-xs text-gray-400">
            {query
              ? "Sin resultados — los vendedores se crean desde el panel de Switch"
              : `${directorioLabel} no tiene vendedores en Switch`}
          </div>
        ) : (
          filtrados.map((v) => {
            const activo = valor?.id === v.id;
            return (
              <button
                key={v.id}
                type="button"
                onClick={() => onElegir(v)}
                disabled={disabled}
                aria-pressed={activo}
                className={`w-full text-left px-3 py-2.5 min-h-[44px] text-sm transition disabled:opacity-40 ${
                  activo ? "bg-black text-white" : "hover:bg-gray-50"
                }`}
              >
                {nombreDeVendedor(v)}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
