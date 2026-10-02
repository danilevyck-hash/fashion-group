"use client";

import * as React from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { cn } from "@/lib/utils";

export const TooltipProvider = TooltipPrimitive.Provider;

// 🔴 EL GLOBO TAMBIÉN SE ABRE AL TOCAR (2-oct-2026). El de Radix solo se abre
// al pasar el mouse por encima, y en el iPad y el iPhone no hay mouse: tocar
// «6 empresas» en Ventas › Clientes no hacía nada (lo encontró la auditoría de
// botones, `scripts/auditar-botones.ts`). Ahora tocar lo abre; se cierra como
// siempre (al salir, con Escape o al deslizar).
const AbrirAlTocar = React.createContext<((abierto: boolean) => void) | null>(null);

export function Tooltip({ open, onOpenChange, ...props }: React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Root>) {
  const [abierto, setAbierto] = React.useState(false);
  const cambiar = React.useCallback((v: boolean) => { setAbierto(v); onOpenChange?.(v); }, [onOpenChange]);
  return (
    <AbrirAlTocar.Provider value={cambiar}>
      <TooltipPrimitive.Root open={open ?? abierto} onOpenChange={cambiar} {...props} />
    </AbrirAlTocar.Provider>
  );
}

export const TooltipTrigger = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Trigger>
>(({ onClick, ...props }, ref) => {
  const abrir = React.useContext(AbrirAlTocar);
  return (
    <TooltipPrimitive.Trigger
      ref={ref}
      // 🔑 `preventDefault` le dice a Radix que no lo cierre: su propio clic
      // cierra el globo justo después de abrirlo.
      onClick={(e) => { onClick?.(e); if (!abrir) return; e.preventDefault(); abrir(true); }}
      {...props}
    />
  );
});
TooltipTrigger.displayName = TooltipPrimitive.Trigger.displayName;

export const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 4, ...props }, ref) => (
  <TooltipPrimitive.Portal>
    <TooltipPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        "z-50 overflow-hidden rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-950 shadow-md animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
        className
      )}
      {...props}
    />
  </TooltipPrimitive.Portal>
));
TooltipContent.displayName = TooltipPrimitive.Content.displayName;
