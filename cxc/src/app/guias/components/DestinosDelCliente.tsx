"use client";

// ─────────────────────────────────────────────────────────────────────────────
// LOS DESTINOS DEL CLIENTE, COMO BOTONES BAJO EL CAMPO DIRECCIÓN (4-sep-2026).
//
// Se toca un botón y se llena el campo. 🔴 TODO ES ATAJO, JAMÁS CANDADO: el
// campo sigue siendo texto libre, se puede escribir encima de lo que puso el
// botón, y un cliente sin historia no muestra nada (campo vacío, como hoy).
// Daniel: *«no quiero crear fricción al usuario que ya sabe cómo usarlo, solo
// mejorarlo»*.
//
// 🔴 EL BOTÓN SE TOCA, NUNCA SE APLICA SOLO. Este componente dibuja; el que
// escribe es siempre un toque de la persona. ⚠️ Desde el 4-sep-2026 el destino
// ÚNICO se autollena — pero eso pasa al ELEGIR el cliente y vive en GuiaForm /
// `destinoParaAutollenar` (Daniel quitó su regla del 14-ago: «quita esa regla.
// Que se autollene como lo discutimos antes.»). Acá, con VARIOS destinos,
// nada se aplica solo: elegir entre varios es de la persona.
//
// D-142 (Sporting Shoes N 4) además ofrece un renglón de TIENDA opcional con
// los números ya usados y «+ otra»: tocar «6» sobre «Westland» deja
// «Westland · tienda 6» (el separador vive en `componerDestino`, UN solo lugar).
//
// Este componente entero cuelga de `GUIAS_ATAJOS_NUEVOS` (lo gatea GuiaForm):
// apagado, no se dibuja y la pantalla es EXACTAMENTE la de hoy. Y nada de esto
// cambia lo que se GUARDA: tocar un botón escribe por el MISMO camino que
// teclear (`onElegir` → `onUpdateItem("direccion", …)`).
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from "react";
import {
  baseDeDestino,
  botonesDeDestino,
  claveDestino,
  componerDestino,
  tiendasDelDestino,
} from "@/lib/guias/destinos-clientes";

interface Props {
  /** Código del cliente del renglón (D-XXX). Sin código no hay botones. */
  codigo: string;
  /** Lo que el campo Dirección dice AHORA (para marcar el activo y componer la tienda). */
  direccion: string;
  /** Destinos históricos de ese cliente (de `/api/guias/frecuencias`). */
  historicos: readonly string[];
  /** Escribe el campo — el MISMO camino que teclear. Solo corre al tocar. */
  onElegir: (v: string) => void;
}

// Chips táctiles en móvil (44 px) y densos con mouse — el mismo trato de
// puntero que CTRL_BASE en GuiaForm.
const CHIP =
  "text-xs border rounded-md px-2.5 inline-flex items-center transition " +
  "min-h-[44px] md:[@media(pointer:fine)]:min-h-0 md:[@media(pointer:fine)]:py-1";

export default function DestinosDelCliente({ codigo, direccion, historicos, onElegir }: Props) {
  const [otraAbierta, setOtraAbierta] = useState(false);
  const [otra, setOtra] = useState("");

  const botones = botonesDeDestino(codigo, historicos);
  // Cliente sin historia (y sin definición): CERO botones — como hoy.
  if (botones.length === 0) return null;

  const base = baseDeDestino(direccion);
  const claveActual = claveDestino(base);
  const tiendas = tiendasDelDestino(codigo, direccion);

  function elegirTienda(t: string) {
    onElegir(componerDestino(base, t));
    setOtra("");
    setOtraAbierta(false);
  }

  return (
    <div data-testid="destinos-del-cliente" className="mt-1.5">
      <div className="flex flex-wrap gap-x-1.5 gap-y-1">
        {botones.map((d) => {
          const activo = base !== "" && claveDestino(d) === claveActual;
          return (
            <button
              key={d}
              type="button"
              onClick={() => onElegir(d)}
              className={`${CHIP} ${
                activo
                  ? "border-gray-400 bg-gray-50 text-black"
                  : "border-gray-200 text-gray-500 hover:text-black hover:border-gray-300"
              }`}
            >
              {d}
            </button>
          );
        })}
      </div>

      {/* La tienda, OPCIONAL, solo cuando la base elegida tiene tiendas usadas. */}
      {tiendas.length > 0 && (
        <div data-testid="destinos-tiendas" className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1">
          <span className="text-xs text-gray-400">tienda:</span>
          {tiendas.map((t) => {
            const compuesto = componerDestino(base, t);
            const activa = claveDestino(direccion) === claveDestino(compuesto);
            return (
              <button
                key={t}
                type="button"
                onClick={() => elegirTienda(t)}
                className={`${CHIP} ${
                  activa
                    ? "border-gray-400 bg-gray-50 text-black"
                    : "border-gray-200 text-gray-500 hover:text-black hover:border-gray-300"
                }`}
              >
                {t}
              </button>
            );
          })}
          {otraAbierta ? (
            <span className="inline-flex items-center gap-1">
              <input
                type="text"
                value={otra}
                onChange={(e) => setOtra(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    if (otra.trim()) elegirTienda(otra);
                  }
                  if (e.key === "Escape") {
                    setOtra("");
                    setOtraAbierta(false);
                  }
                }}
                placeholder="Tienda"
                aria-label="Otra tienda"
                /* text-base en móvil: con menos de 16px Safari hace zoom al enfocar. */
                className="border-b border-gray-300 px-1 text-base sm:text-xs outline-none focus:border-black w-20 min-h-[44px] md:[@media(pointer:fine)]:min-h-0"
                autoFocus
              />
              <button
                type="button"
                onClick={() => { if (otra.trim()) elegirTienda(otra); }}
                aria-label="Usar esta tienda"
                className="text-xs text-gray-500 hover:text-black inline-flex items-center justify-center min-w-[44px] min-h-[44px] md:[@media(pointer:fine)]:min-h-0 md:[@media(pointer:fine)]:min-w-0 md:[@media(pointer:fine)]:px-1"
              >
                OK
              </button>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setOtraAbierta(true)}
              className={`${CHIP} border-transparent text-gray-400 hover:text-black`}
            >
              + otra
            </button>
          )}
        </div>
      )}
    </div>
  );
}
