"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useUrlState } from "@/lib/hooks/useUrlState";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  TrendingUp, Users, UserCircle, Wallet, Package, Target, ChevronLeft, ChevronRight,
} from "lucide-react";
import type { Multifashion } from "@/components/ventas/types";
import { VendedorasSubtab } from "./VendedorasSubtab";
import { MultifashionResumenView } from "./MultifashionResumenView";
import { ClientesMultifashionSubtab } from "./ClientesMultifashionSubtab";
import { ProductosSubtab } from "./ProductosSubtab";
import { CajaSubtab } from "./CajaSubtab";
import { MetasSubtab } from "./MetasSubtab";

// iPhone: los 4 sub-tabs medían 36px de alto (py-2 + text-xs) — por debajo de
// los 44 de la regla táctil, y son el control que más se toca del módulo. Con
// min-h-[44px] el alto queda garantizado sin agrandar la letra ni el ancho (el
// más angosto, "Caja", ya medía 69px de ancho). Los tabs de /ventas ya iban en
// 44 por su py-3: esto los empareja.
//
// 🩸 EL ÍCONO SE ESCONDE HASTA `lg`, Y NO ES CAPRICHO: es lo que hace que las
// pestañas ENTREN. Con el 5º sub-tab (Productos) la tira ya había pasado de 390
// px y hubo que esconder el ícono en celular; con el 6º (Metas) volvió a pasar,
// **medido en el navegador**: 433 px contra 390 (desborda 43) y 565 contra 554
// en el iPad (desborda 11). Una tira que desborda deja la última pestaña fuera
// de la pantalla, alcanzable solo arrastrando — que es exactamente el defecto
// que ya se corrigió una vez.
//
// Cada ícono se lleva 18 px (12 del `h-3 w-3` + 6 del `gap-1.5`, que un hijo con
// `display:none` deja de generar): 6 × 18 = 108 px. Con eso el iPad pasa de 565
// a 457 sobre 554 disponibles. En celular los íconos ya estaban ocultos, así que
// ahí lo que cierra la cuenta es el relleno: `px-1.5` en vez de `px-2.5` son 8 px
// por pestaña × 6 = 48 px → 385 sobre 390. El ícono es DECORACIÓN (el rótulo
// queda entero) y desde `lg` vuelve a aparecer, donde sobra ancho de sobra.
//
// ⚠️ NO se acortó ningún rótulo: son texto que el personal lee, y cambiarlos es
// decisión de Daniel.
const SUBTAB_TRIGGER_CLASS =
  "min-h-[44px] gap-1.5 rounded-none border-b-2 border-transparent bg-transparent px-1.5 py-2 text-xs text-gray-500 lg:px-3 data-[state=active]:border-teal-700 data-[state=active]:bg-transparent data-[state=active]:text-gray-950 data-[state=active]:shadow-none";

/** El ícono de cada sub-tab: decorativo, y oculto hasta `lg` para que las 6
 *  pestañas entren sin arrastrar en celular Y en iPad. Ver la nota de arriba. */
const SUBTAB_ICON_CLASS = "hidden h-3 w-3 lg:inline-block";

interface MultifashionViewProps {
  data: Multifashion;
  selectedYear: number;
  isClosedYear: boolean;
  /** Sube +1 cada vez que el header corre un "Actualizar ahora" con éxito. Se
   *  pasa tal cual al Resumen para que re-pida el detalle del mes. */
  syncTick?: number;
}

export function MultifashionView({ data, selectedYear, isClosedYear, syncTick }: MultifashionViewProps) {
  // Sub-tab activo en la URL (?subtab=resumen|vendedoras|clientes). Key distinta
  // a "tab" del shell para no chocar. Persiste en refresh/back-forward. Los tabs
  // viejos "overview" y "mes" (fusionados en "resumen") se normalizan acá para no
  // romper deep-links antiguos.
  const [subtabRaw, setSubtab] = useUrlState("subtab", "resumen");
  const subtab = subtabRaw === "overview" || subtabRaw === "mes" ? "resumen" : subtabRaw;

  // PERÍODO global de Multifashion: el AÑO viene del selector global de Ventas
  // (selectedYear) y el MES se eleva a este shell para compartirlo entre los
  // sub-tabs que lo usan (Resumen + Vendedoras). Clientes (rangos relativos) lo
  // ignora. El mes persiste en URL (?mfMes=), sin chocar con ?subtab= ni con el
  // ?tab= del shell de Ventas.
  //
  // FUENTE ÚNICA DE VERDAD del rango de meses navegables. La consumen el
  // dropdown, ‹ y › — no se duplica la lista de meses ni el cálculo del tope.
  //   - minMonth: primer mes con data del año (piso, ‹ se deshabilita ahí).
  //   - maxMonth: tope navegable. Año en curso = mes calendario actual (junio:
  //     navegable, es el mes en curso parcial). Año cerrado = último mes con
  //     data. › se deshabilita ahí. No se navega al futuro.
  //   - mesDefault: ÚLTIMO mes con data que NO sea el mes calendario en curso
  //     (hoy 2 jun → mayo, no junio). Solo el valor inicial del estado de UI.
  //     Fallbacks: si solo el mes en curso tiene data, ese mismo; sin data,
  //     Dic (año cerrado) / mes calendario (año en curso).
  const { minMonth, maxMonth, mesDefault } = useMemo(() => {
    const now = new Date();
    const isCurrentYear = selectedYear === now.getFullYear();
    const currentCalMonth = now.getMonth() + 1;
    const withData: number[] = [];
    data.retail.meses.forEach((m, i) => {
      if (m.tickets > 0 || m.ventas > 0) withData.push(i + 1);
    });
    const min = withData.length > 0 ? withData[0] : 1;
    const max = isCurrentYear
      ? currentCalMonth
      : (withData.length > 0 ? withData[withData.length - 1] : 12);
    const def = max;
    return { minMonth: min, maxMonth: max, mesDefault: def };
  }, [data.retail.meses, selectedYear, isClosedYear]);

  const [mes, setMes] = useUrlState("mfMes", mesDefault);

  // Meses para el dropdown: el mismo rango [minMonth, maxMonth] que limita a
  // las flechas. Una sola fuente de verdad para los tres controles.
  const navMonths = useMemo(() => {
    const out: number[] = [];
    for (let m = minMonth; m <= maxMonth; m++) out.push(m);
    return out;
  }, [minMonth, maxMonth]);

  // Límites de navegación. › tope = mes en curso (año actual) / último con data
  // (año cerrado). ‹ piso = primer mes con data. Sin cruce de año (el año se
  // cambia con el selector global de Ventas).
  const canPrev = mes > minMonth;
  const canNext = mes < maxMonth;
  const goPrev = () => { if (canPrev) setMes(mes - 1); };
  const goNext = () => { if (canNext) setMes(mes + 1); };

  // Período de Productos. Vive ACÁ y no adentro del sub-tab porque decide si el
  // selector de mes compartido tiene sentido o no: con "Últimos 12 meses" el mes
  // no elige nada, y dejar los dos controles en pantalla es la forma más fácil
  // de mirar un período creyendo que se mira otro (la advertencia que ya estaba
  // escrita en este archivo).
  const [periodoProductos, setPeriodoProductos] = useState<"mes" | "12m">("12m");

  // Sub-tabs que se manejan con el selector de mes compartido.
  const usaSelectorMes =
    subtab === "resumen" || (subtab === "productos" && periodoProductos === "mes");

  // Aclaración sutil bajo el selector: cuando muestra el ÚLTIMO MES CERRADO por
  // default (ej. mayo estando en junio) explica por qué no es el mes en curso.
  // Solo en ese caso (default + año actual + el mes no es el calendario actual);
  // navegar manualmente a otro mes lo oculta. No cambia data ni el default.
  const nowRef = new Date();
  const currentCalMonth = nowRef.getMonth() + 1;
  const showMesCerradoHint =
    selectedYear === nowRef.getFullYear() && mes === mesDefault && mes !== currentCalMonth;

  // Al cambiar el año global, snap del mes al default del nuevo año. En el
  // primer render se respeta un ?mfMes= compartido por link SOLO si cae en el
  // rango navegable; si viene fuera de rango (URL manual/obsoleta) se hace snap
  // al default. Dep en mesDefault además de selectedYear porque la data del año
  // nuevo llega un tick después (refetch en VentasShell); mesDefault es estable
  // dentro de un mismo año, así que no pisa la selección manual. setMes se omite
  // a propósito: su identidad cambia con cada update de la URL.
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      if (mes < minMonth || mes > maxMonth) setMes(mesDefault);
      return;
    }
    setMes(mesDefault);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedYear, mesDefault]);

  return (
    <div className="w-full">
      {/* Selector único de período (mes) con flechas ‹ › a los lados. Alineado a
          la derecha, mismo alto (h-9) que el selector de año global de Ventas. El
          año lo fija ese selector global; aquí solo el mes. Se muestra en Resumen
          (vista unificada del mes); Vendedoras tiene su propio control y Clientes
          usa pills propias. */}
      {/* Los sub-tabs que leen el MES del selector compartido. Vendedoras tiene
          sus propios chips y Clientes sus pills de rango relativo: mostrarles
          este selector sería un control que no hace nada. Productos sí lo usa —
          es el mismo mes del Resumen, a propósito: son la misma pregunta. */}
      {usaSelectorMes && (
      <div className="mb-4">
        <div className="flex items-center justify-end gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-gray-500">Mes</span>
        {/* iPhone: las flechas medían 36×36 y quedaban a 4px del selector —
            dedo gordo = mes equivocado. 44×44 y gap-2 (8px) de separación. */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={goPrev}
            disabled={!canPrev}
            aria-label="Mes anterior"
            className="flex h-11 w-11 items-center justify-center rounded-md border border-gray-200 bg-white text-gray-600 transition hover:border-gray-300 hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-gray-200 disabled:hover:text-gray-600"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <Select value={String(mes)} onValueChange={v => setMes(parseInt(v, 10))}>
            <SelectTrigger className="h-11 w-auto min-w-[132px] gap-1.5 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {navMonths.map(m => (
                <SelectItem key={m} value={String(m)} className="text-xs">
                  {MES_FULL_OVERVIEW[m - 1]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <button
            type="button"
            onClick={goNext}
            disabled={!canNext}
            aria-label="Mes siguiente"
            className="flex h-11 w-11 items-center justify-center rounded-md border border-gray-200 bg-white text-gray-600 transition hover:border-gray-300 hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-gray-200 disabled:hover:text-gray-600"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        </div>
        {showMesCerradoHint && (
          <p className="mt-1 text-right text-xs text-gray-400">
            último mes cerrado · {MES_FULL_OVERVIEW[currentCalMonth - 1].toLowerCase()} en curso
          </p>
        )}
      </div>
      )}

      <Tabs value={subtab} onValueChange={setSubtab} className="w-full">
        <TabsList className="-mx-4 flex h-auto w-auto justify-start gap-0 overflow-x-auto rounded-none border-b border-gray-200 bg-transparent px-4 p-0 md:mx-0 md:px-0">
          <TabsTrigger value="resumen" className={SUBTAB_TRIGGER_CLASS}>
            <TrendingUp className={SUBTAB_ICON_CLASS} /> Resumen
          </TabsTrigger>
          <TabsTrigger value="vendedoras" className={SUBTAB_TRIGGER_CLASS}>
            <Users className={SUBTAB_ICON_CLASS} /> Vendedoras
          </TabsTrigger>
          <TabsTrigger value="productos" className={SUBTAB_TRIGGER_CLASS}>
            <Package className={SUBTAB_ICON_CLASS} /> Productos
          </TabsTrigger>
          <TabsTrigger value="clientes" className={SUBTAB_TRIGGER_CLASS}>
            <UserCircle className={SUBTAB_ICON_CLASS} /> Clientes
          </TabsTrigger>
          <TabsTrigger value="caja" className={SUBTAB_TRIGGER_CLASS}>
            <Wallet className={SUBTAB_ICON_CLASS} /> Caja
          </TabsTrigger>
          <TabsTrigger value="metas" className={SUBTAB_TRIGGER_CLASS}>
            <Target className={SUBTAB_ICON_CLASS} /> Metas
          </TabsTrigger>
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
          <VendedorasSubtab data={data} selectedYear={selectedYear} mes={mes} onMesChange={setMes} />
        </TabsContent>
        <TabsContent value="productos" className="mt-5">
          <ProductosSubtab
            selectedYear={selectedYear}
            mes={mes}
            periodo={periodoProductos}
            onPeriodoChange={setPeriodoProductos}
          />
        </TabsContent>
        <TabsContent value="clientes" className="mt-5">
          <ClientesMultifashionSubtab selectedYear={selectedYear} mes={mes} />
        </TabsContent>
        <TabsContent value="caja" className="mt-5">
          {/* Cuadre diario: independiente del año/mes global — usa su propio
              selector de día (default hoy). */}
          <CajaSubtab />
        </TabsContent>
        <TabsContent value="metas" className="mt-5">
          {/* Metas: el período de una meta lo define la meta, no un selector —
              no hay control de período que pasarle. Quién puede VER el avance se
              decide en el servidor, en src/lib/multifashion/metas-permiso.ts.
              Si esta pestaña llega vacía para alguien, es porque el servidor no
              le mandó metas, no porque la UI las haya escondido. */}
          <MetasSubtab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

const MES_FULL_OVERVIEW = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];
