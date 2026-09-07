"use client";

// ─────────────────────────────────────────────────────────────────────────────
// Multifashion — la tira de pestañas y el contenido de cada una.
//
// CUATRO pestañas desde el 6-sep-2026 (eran seis): Resumen · Vendedoras ·
// Productos · Clientes. Metas se mudó ENTERA adentro de Vendedoras y Caja se
// retiró de la navegación — el porqué medido, en `src/lib/multifashion/pestanas.ts`.
//
// El PERÍODO ya no vive acá: es uno solo para todo el módulo, se elige en el
// encabezado y llega por prop (ver `src/lib/multifashion/periodo.ts`). Se fueron
// de esta pantalla el selector de mes con flechas ‹ ›, el rótulo «Mes» y el
// aviso «último mes cerrado · … en curso» (que, medido, NO podía dibujarse
// nunca: `showMesCerradoHint` exigía `mes === mesDefault` y `mes !== mes actual`
// a la vez, y `mesDefault` ERA el mes actual).
// ─────────────────────────────────────────────────────────────────────────────

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TrendingUp, Users, UserCircle, Package } from "lucide-react";
import type { Multifashion } from "@/components/ventas/types";
import { VendedorasSubtab } from "./VendedorasSubtab";
import { MultifashionResumenView } from "./MultifashionResumenView";
import { ClientesMultifashionSubtab } from "./ClientesMultifashionSubtab";
import { ProductosSubtab } from "./ProductosSubtab";
import { PESTANAS_MULTIFASHION, type TabMultifashion } from "@/lib/multifashion/pestanas";
import { mesDelPeriodo, type CortePeriodo, type Periodo } from "@/lib/multifashion/periodo";

// iPhone: los sub-tabs medían 36px de alto (py-2 + text-xs) — por debajo de los
// 44 de la regla táctil, y son el control que más se toca del módulo. Con
// min-h-[44px] el alto queda garantizado sin agrandar la letra ni el ancho.
//
// 🩸 EL ÍCONO SE ESCONDE HASTA `lg`, Y NO ES CAPRICHO: es lo que hacía que las
// SEIS pestañas entraran (433 px medidos contra 390 disponibles en el iPhone).
// Con cuatro sobra aire, pero el ícono sigue oculto en celular por la misma
// razón de siempre: es DECORACIÓN y el rótulo se lee igual sin él.
const SUBTAB_TRIGGER_CLASS =
  "min-h-[44px] gap-1.5 rounded-none border-b-2 border-transparent bg-transparent px-2 py-2 text-xs text-gray-500 lg:px-3 data-[state=active]:border-teal-700 data-[state=active]:bg-transparent data-[state=active]:text-gray-950 data-[state=active]:shadow-none";

const SUBTAB_ICON_CLASS = "hidden h-3 w-3 lg:inline-block";

const ICONO: Record<TabMultifashion, typeof TrendingUp> = {
  resumen: TrendingUp,
  vendedoras: Users,
  productos: Package,
  clientes: UserCircle,
};

interface MultifashionViewProps {
  data: Multifashion;
  /** Pestaña activa — la resuelve el shell (`resolverTabMultifashion`). */
  tab: TabMultifashion;
  onTabChange: (tab: TabMultifashion) => void;
  /** Período único del módulo, ya ajustado a lo que esta pestaña sabe servir. */
  periodo: Periodo;
  corte: CortePeriodo;
  isClosedYear: boolean;
  /** Sube +1 cada vez que el header corre un "Actualizar ahora" con éxito. */
  syncTick?: number;
}

export function MultifashionView({
  data, tab, onTabChange, periodo, corte, isClosedYear, syncTick,
}: MultifashionViewProps) {
  // El mes que representa el período — lo que piden las pestañas que trabajan
  // por mes. Para un rango es el mes de corte.
  const { anio: selectedYear, mes } = mesDelPeriodo(periodo, corte);

  return (
    <div className="w-full">
      <Tabs value={tab} onValueChange={(v) => onTabChange(v as TabMultifashion)} className="w-full">
        <TabsList className="-mx-4 flex h-auto w-auto justify-start gap-0 overflow-x-auto rounded-none border-b border-gray-200 bg-transparent px-4 p-0 md:mx-0 md:px-0">
          {PESTANAS_MULTIFASHION.map((p) => {
            const Icon = ICONO[p.id];
            return (
              <TabsTrigger key={p.id} value={p.id} className={SUBTAB_TRIGGER_CLASS}>
                <Icon className={SUBTAB_ICON_CLASS} /> {p.label}
              </TabsTrigger>
            );
          })}
        </TabsList>

        <TabsContent value="resumen" className="mt-5">
          <MultifashionResumenView
            overview={data}
            selectedYear={selectedYear}
            isClosedYear={isClosedYear}
            mes={mes}
            syncTick={syncTick}
          />
        </TabsContent>
        <TabsContent value="vendedoras" className="mt-5">
          {/* `conMetas`: la pestaña Metas vive ADENTRO de ésta. La pestaña
              espejo de Comisiones monta el MISMO componente sin la prop — no
              tiene el módulo Multifashion y `/api/multifashion/metas` le
              contestaría 403. */}
          <VendedorasSubtab selectedYear={selectedYear} periodo={periodo} corte={corte} conMetas />
        </TabsContent>
        <TabsContent value="productos" className="mt-5">
          <ProductosSubtab selectedYear={selectedYear} mes={mes} periodo={periodo} />
        </TabsContent>
        <TabsContent value="clientes" className="mt-5">
          <ClientesMultifashionSubtab selectedYear={selectedYear} mes={mes} periodo={periodo} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
