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
import { ComisionesVendedoresRango } from "@/components/comisiones/ComisionesVendedoresRango";
import { VISTA_MULTIFASHION } from "@/lib/comisiones/vistas";
import { PESTANAS_MULTIFASHION, type TabMultifashion } from "@/lib/multifashion/pestanas";
import { mesDelPeriodo, type CortePeriodo, type Periodo } from "@/lib/multifashion/periodo";
import { MULTIFASHION_CELULAR, type ClaveRenglon, type PantallaCelular } from "@/lib/multifashion/celular";
import { cn } from "@/lib/utils";
import { PRODUCTOS_FILTROS_2026_10 } from "@/lib/productos/filtros";
import { ProductosFiltrosMf } from "./ProductosFiltrosMf";
import { ResumenRangoMf } from "./ResumenRangoMf";

// iPhone: los sub-tabs medían 36px de alto (py-2 + text-xs) — por debajo de los
// 44 de la regla táctil, y son el control que más se toca del módulo. Con
// min-h-[44px] el alto queda garantizado sin agrandar la letra ni el ancho.
//
// 🩸 EL ÍCONO SE ESCONDE HASTA `lg`, Y NO ES CAPRICHO: es lo que hacía que las
// SEIS pestañas entraran (433 px medidos contra 390 disponibles en el iPhone).
// Con cuatro sobra aire, pero el ícono sigue oculto en celular por la misma
// razón de siempre: es DECORACIÓN y el rótulo se lee igual sin él.
const SUBTAB_TRIGGER_CLASS =
  "min-h-[44px] gap-1.5 rounded-none border-b-2 border-transparent bg-transparent px-2 py-2 text-xs text-gray-500 lg:px-3 data-[state=active]:border-gray-900 data-[state=active]:bg-transparent data-[state=active]:text-gray-950 data-[state=active]:shadow-none";

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
  /**
   * 🔴 EL CELULAR (24-sep-2026): las cuatro pestañas se van y quedan cuatro
   * RENGLONES en el Resumen. Sin esta prop, la vista es la de siempre.
   */
  celular?: {
    pantalla: PantallaCelular;
    onAbrir: (clave: ClaveRenglon) => void;
  };
}

export function MultifashionView({
  data, tab, onTabChange, periodo, corte, isClosedYear, syncTick, celular,
}: MultifashionViewProps) {
  // En el celular las pestañas se reemplazan por los cuatro renglones del
  // Resumen; en computadora la tira no se toca.
  const enCelular = MULTIFASHION_CELULAR && celular != null;
  // El mes que representa el período — lo que piden las pestañas que trabajan
  // por mes. Para un rango es el mes de corte.
  const { anio: selectedYear, mes } = mesDelPeriodo(periodo, corte);

  return (
    <div className="w-full">
      <Tabs value={tab} onValueChange={(v) => onTabChange(v as TabMultifashion)} className="w-full">
        <TabsList className={cn(
          "-mx-4 flex h-auto w-auto justify-start gap-0 overflow-x-auto rounded-none border-b border-gray-200 bg-transparent px-4 p-0 md:mx-0 md:px-0",
          enCelular && "hidden sm:flex",
        )}>
          {PESTANAS_MULTIFASHION.map((p) => {
            const Icon = ICONO[p.id];
            return (
              <TabsTrigger key={p.id} value={p.id} className={SUBTAB_TRIGGER_CLASS}>
                <Icon className={SUBTAB_ICON_CLASS} /> {p.label}
              </TabsTrigger>
            );
          })}
        </TabsList>

        <TabsContent value="resumen" className={enCelular ? "mt-0 sm:mt-5" : "mt-5"}>
          {/* 🔴 RESUMEN_RANGO_2026_10: con un rango, la venta retail del rango
              contra los mismos días del año pasado. El mes no cambia. */}
          {periodo.tipo === "rango" ? (
            <ResumenRangoMf desde={periodo.desde} hasta={periodo.hasta} />
          ) : (
          <MultifashionResumenView
            overview={data}
            selectedYear={selectedYear}
            isClosedYear={isClosedYear}
            mes={mes}
            syncTick={syncTick}
            celular={celular ? { ...celular, periodo, corte } : undefined}
          />
          )}
        </TabsContent>
        <TabsContent value="vendedoras" className={enCelular ? "mt-0 sm:mt-5" : "mt-5"}>
          {/* `conMetas`: la pestaña Metas vive ADENTRO de ésta. La pestaña
              espejo de Comisiones monta el MISMO componente sin la prop — no
              tiene el módulo Multifashion y `/api/multifashion/metas` le
              contestaría 403. */}
          {/* 🔴 5-oct-2026: «Rango de fechas» en Vendedoras = la consulta por
              fechas de Comisiones (ventas y comisión, sin bonos: el bono es
              por mes cerrado). */}
          {periodo.tipo === "rango" ? (
            <ComisionesVendedoresRango
              vista={VISTA_MULTIFASHION}
              rango={{ desde: periodo.desde, hasta: periodo.hasta, atajo: null }}
            />
          ) : (
          <VendedorasSubtab
            selectedYear={selectedYear}
            periodo={periodo}
            corte={corte}
            conMetas
            enCelular={enCelular}
            /* 🔴 5-oct-2026 (Daniel): la Δ va contra el MISMO MES DEL AÑO
               PASADO (mismos días si va abierto), no contra el mes anterior. */
            vsAnioPasado
            /* 🔴 5-oct-2026: lo que pagaba Comisiones › Multifashion vive aquí —
               «Bono» y «Total a pagar» por persona y la barra «TOTAL A PAGAR ·
               Multifashion»—. Comisiones ya no ofrece Multifashion. */
            conTotalAPagar
          />
          )}
        </TabsContent>
        <TabsContent value="productos" className={enCelular ? "mt-0 sm:mt-5" : "mt-5"}>
          {PRODUCTOS_FILTROS_2026_10 ? (
            <ProductosFiltrosMf selectedYear={selectedYear} mes={mes} periodo={periodo} />
          ) : (
            <ProductosSubtab selectedYear={selectedYear} mes={mes} periodo={periodo} />
          )}
        </TabsContent>
        <TabsContent value="clientes" className={enCelular ? "mt-0 sm:mt-5" : "mt-5"}>
          <ClientesMultifashionSubtab selectedYear={selectedYear} mes={mes} periodo={periodo} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
