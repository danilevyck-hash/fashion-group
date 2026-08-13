"use client";

// ─────────────────────────────────────────────────────────────────────────────
// Selector de cliente de Switch — UNA sola pieza para los DOS lugares donde se
// elige (12-ago-2026): el modal de "Duplicar pedido" y el bloque "Cliente
// Switch" del detalle. Antes el buscador vivía escrito a mano dentro del
// detalle; duplicarlo en el duplicar era garantizar que se separaran.
//
// Busca contra `GET /api/catalogo/<marca>/clientes-switch?q=` (tabla LOCAL
// switch_clientes, que llena el sync — NO toca la API de Switch). Los clientes
// nuevos se crean desde el panel de Switch: acá no hay alta.
//
// 🔴 CONTADO ES UNA OPCIÓN, NO UN DEFAULT SILENCIOSO. Va primera en la lista y
// se elige de un toque, pero hay que TOCARLA: quien no elija nada no puede
// seguir. Ese es el pedido de Daniel — *"un vendedor TIENE que elegir un
// cliente de switch, todos siempre"*— y por eso el componente no preselecciona
// nada por su cuenta (`valor === undefined` = todavía no eligió).
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from "react";

export interface ClienteSwitchOpcion {
  /** null = Contado (mostrador). */
  id: number | null;
  nombre: string | null;
  codigo: string | null;
}

interface FilaCliente {
  cliente_switch_id: number;
  codigo: string | null;
  nombre: string | null;
}

export const CONTADO: ClienteSwitchOpcion = { id: null, nombre: "Contado (mostrador)", codigo: null };

/** Texto de UNA opción, igual en el selector y en donde se muestra lo elegido. */
export function nombreDeCliente(c: ClienteSwitchOpcion | null | undefined): string {
  if (!c) return "Contado (mostrador)";
  if (c.id == null) return "Contado (mostrador)";
  return c.nombre || c.codigo || `Cliente ${c.id}`;
}

interface Props {
  /** Base de la API de la marca, ej. "/api/catalogo/calvin". */
  api: string;
  /** Nombre del directorio Switch de la marca (para los textos de ayuda). */
  directorioLabel: string;
  /** Elegido. `undefined` = todavía no eligió (el padre no deja continuar). */
  valor: ClienteSwitchOpcion | undefined;
  onElegir: (c: ClienteSwitchOpcion) => void;
  /** Deshabilita todo mientras el padre tiene algo en vuelo. */
  disabled?: boolean;
}

export default function ClienteSwitchPicker({ api, directorioLabel, valor, onElegir, disabled }: Props) {
  const [query, setQuery] = useState("");
  const [resultados, setResultados] = useState<FilaCliente[]>([]);
  const [buscando, setBuscando] = useState(true);
  const [error, setError] = useState(false);

  // Debounce 300ms. Con el query vacío lista los primeros — así el selector
  // nunca abre en blanco y Contado no es la única opción visible.
  useEffect(() => {
    let vivo = true;
    const t = setTimeout(async () => {
      setBuscando(true);
      try {
        const r = await fetch(`${api}/clientes-switch?q=${encodeURIComponent(query)}`);
        if (!vivo) return;
        if (r.ok) {
          const d = await r.json();
          setResultados(d.clientes || []);
          setError(false);
        } else {
          setError(true);
        }
      } catch {
        if (vivo) setError(true);
      }
      if (vivo) setBuscando(false);
    }, 300);
    return () => { vivo = false; clearTimeout(t); };
  }, [api, query]);

  const elegido = valor !== undefined;

  return (
    <div>
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        disabled={disabled}
        placeholder="Buscar por nombre o código..."
        className="w-full border border-gray-200 rounded-md px-3 py-2 min-h-[44px] text-base sm:text-sm outline-none focus:border-black transition mb-2 disabled:opacity-50"
      />
      <div className="border border-gray-100 rounded-md divide-y divide-gray-50 max-h-56 overflow-y-auto">
        <button
          type="button"
          onClick={() => onElegir(CONTADO)}
          disabled={disabled}
          aria-pressed={elegido && valor!.id == null}
          className={`w-full text-left px-3 py-2.5 min-h-[44px] text-sm transition disabled:opacity-40 ${
            elegido && valor!.id == null ? "bg-black text-white" : "hover:bg-gray-50"
          }`}
        >
          Contado (mostrador)
        </button>
        {error ? (
          <div className="px-3 py-2.5 text-xs text-red-600">
            No se pudo cargar el directorio de clientes. Revisa tu conexión e intenta de nuevo.
          </div>
        ) : buscando ? (
          <div className="px-3 py-2.5 text-xs text-gray-400">Buscando...</div>
        ) : resultados.length === 0 ? (
          <div className="px-3 py-2.5 text-xs text-gray-400">
            {query
              ? "Sin resultados — los clientes nuevos se crean desde el panel de Switch"
              : `Escribe para buscar clientes de ${directorioLabel}`}
          </div>
        ) : (
          resultados.map((c) => {
            const activo = elegido && valor!.id === c.cliente_switch_id;
            return (
              <button
                key={c.cliente_switch_id}
                type="button"
                onClick={() => onElegir({ id: c.cliente_switch_id, nombre: c.nombre, codigo: c.codigo })}
                disabled={disabled}
                aria-pressed={activo}
                className={`w-full text-left px-3 py-2.5 min-h-[44px] text-sm transition disabled:opacity-40 ${
                  activo ? "bg-black text-white" : "hover:bg-gray-50"
                }`}
              >
                {c.nombre || `Cliente ${c.cliente_switch_id}`}
                {c.codigo && (
                  <span className={`text-xs font-mono ml-2 ${activo ? "text-white/60" : "text-gray-400"}`}>{c.codigo}</span>
                )}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
