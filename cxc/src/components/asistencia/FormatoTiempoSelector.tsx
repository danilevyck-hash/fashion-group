"use client";

// ─────────────────────────────────────────────────────────────────────────────
// CÓMO SE MUESTRAN LOS MINUTOS: LA PREFERENCIA Y SU CONTROL (29-sep-2026).
//
// Daniel: *«aplícalo y en configuración que se pueda configurar cómo
// mostrarlo»*. Es una preferencia de ESTE aparato (localStorage), no de la
// empresa: no cambia ningún número ni ningún archivo, solo el dibujo.
//
// 🔑 Las pestañas de Asistencia se ESCONDEN, no se desarman (`pestanas-vivas`):
// cambiarlo en Configuración tiene que llegarle a la tabla que ya está montada.
// Por eso se avisa con un evento de la ventana, además del `storage` de otras
// pestañas del navegador.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from "react";
import { ControlSegmentado } from "@/components/ventas/ControlSegmentado";
import {
  MODO_TIEMPO_POR_DEFECTO, modoTiempoValido, type ModoTiempo,
} from "@/lib/asistencia/formato-tiempo";

const LLAVE = "fg_asistencia_formato_tiempo";
const EVENTO = "fg-asistencia-formato-tiempo";

function leer(): ModoTiempo {
  try {
    return modoTiempoValido(localStorage.getItem(LLAVE));
  } catch {
    return MODO_TIEMPO_POR_DEFECTO; // modo privado o almacenamiento bloqueado
  }
}

export function useFormatoTiempo(): [ModoTiempo, (m: ModoTiempo) => void] {
  // Arranca con el de por defecto y lee al montar: en el servidor no hay localStorage.
  const [modo, setModo] = useState<ModoTiempo>(MODO_TIEMPO_POR_DEFECTO);
  useEffect(() => {
    const releer = () => setModo(leer());
    releer();
    window.addEventListener(EVENTO, releer);
    window.addEventListener("storage", releer);
    return () => {
      window.removeEventListener(EVENTO, releer);
      window.removeEventListener("storage", releer);
    };
  }, []);
  const elegir = useCallback((m: ModoTiempo) => {
    setModo(m);
    try { localStorage.setItem(LLAVE, m); } catch { /* modo privado: vale para esta visita */ }
    window.dispatchEvent(new Event(EVENTO));
  }, []);
  return [modo, elegir];
}

const OPCIONES = [
  { value: "hmm", label: "h:mm" },
  { value: "min", label: "minutos" },
] as const;

/** «Mostrar el tiempo en: [h:mm] [minutos]». Para montarlo en Configuración. */
export function FormatoTiempoSelector({ className }: { className?: string }) {
  const [modo, elegir] = useFormatoTiempo();
  return (
    <ControlSegmentado<ModoTiempo>
      options={OPCIONES}
      active={modo}
      onChange={elegir}
      ariaLabel="Cómo mostrar el tiempo"
      ancho="contenido"
      className={className}
    />
  );
}

export default FormatoTiempoSelector;
