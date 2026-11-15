"use client";

import { Banknote, Bell, type LucideIcon } from "lucide-react";
import { FICHA_MOTIVO, type Motivo } from "@/lib/recordatorios/motivos";
import { ICONOS_DE_LINEA_EN_TODO } from "@/lib/ui/revision-110-ajustes";

/**
 * Revisión 110 · ajustes (6): el ícono del motivo, de LÍNEA (lucide) como el
 * resto del sistema — nunca el emoji 💵 / 🔔. Interruptor apagado = el emoji.
 */
/** Uno por motivo: un motivo nuevo sin ícono no compila. */
const ICONO: Record<Motivo, LucideIcon> = { cheque: Banknote, nota: Bell };

export default function IconoMotivo({ motivo, className = "h-4 w-4" }: { motivo: Motivo; className?: string }) {
  if (!ICONOS_DE_LINEA_EN_TODO) return <>{FICHA_MOTIVO[motivo].icono}</>;
  const Icono = ICONO[motivo];
  return <Icono aria-hidden className={`text-gray-500 ${className}`} strokeWidth={1.8} />;
}
