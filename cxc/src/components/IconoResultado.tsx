"use client";

import { BarChart3, ClipboardList, FileText, HandCoins, Landmark, Megaphone, Package, Truck, Wallet, type LucideIcon } from "lucide-react";
import { ICONOS_DE_LINEA_EN_TODO } from "@/lib/ui/revision-110-ajustes";

/**
 * Revisión 110 · ajustes (6): el ícono de cada resultado de la búsqueda global,
 * de LÍNEA como el resto del sistema. Los resultados siguen trayendo su emoji
 * (`icon`); aquí se traduce. Interruptor apagado = el emoji de siempre.
 */
const DE_LINEA: Readonly<Record<string, LucideIcon>> = {
  "📊": BarChart3,
  "📝": FileText,
  "🚚": Truck,
  "📋": ClipboardList,
  "🏦": Landmark,
  "💰": Wallet,
  "🤝": HandCoins,
  "📦": Package,
  "📣": Megaphone,
};

export function IconoResultado({ icon }: { icon: string }) {
  const Icono = ICONOS_DE_LINEA_EN_TODO ? DE_LINEA[icon] : undefined;
  if (!Icono) return <>{icon}</>;
  return <Icono aria-hidden className="h-[18px] w-[18px] text-gray-500" strokeWidth={1.8} />;
}
