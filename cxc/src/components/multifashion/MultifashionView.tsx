"use client";

import { useEffect, useMemo, useRef } from "react";
import { useUrlState } from "@/lib/hooks/useUrlState";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  TrendingUp, Users, UserCircle, ChevronLeft, ChevronRight,
} from "lucide-react";
import type { Multifashion } from "@/components/ventas/types";
import { VendedorasSubtab } from "./VendedorasSubtab";
import { MultifashionResumenView } from "./MultifashionResumenView";
import { ClientesMultifashionSubtab } from "./ClientesMultifashionSubtab";

const SUBTAB_TRIGGER_CLASS =
  "gap-1.5 rounded-none border-b-2 border-transparent bg-transparent px-3 py-2 text-xs text-stone-500 data-[state=active]:border-teal-700 data-[state=active]:bg-transparent data-[state=active]:text-stone-950 data-[state=active]:shadow-none";

interface MultifashionViewProps {
  data: Multifashion;
  selectedYear: number;
  isClosedYear: boolean;
}

export function MultifashionView({ data, selectedYear, isClosedYear }: MultifashionViewProps) {
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
      {subtab === "resumen" && (
      <div className="mb-4">
        <div className="flex items-center justify-end gap-2">
        <span className="text-[10.5px] font-medium uppercase tracking-widest text-stone-500">Mes</span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={goPrev}
            disabled={!canPrev}
            aria-label="Mes anterior"
            className="flex h-9 w-9 items-center justify-center rounded-md border border-stone-200 bg-white text-stone-600 transition hover:border-stone-300 hover:text-stone-900 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-stone-200 disabled:hover:text-stone-600"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <Select value={String(mes)} onValueChange={v => setMes(parseInt(v, 10))}>
            <SelectTrigger className="h-9 w-auto min-w-[140px] gap-1.5 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {navMonths.map(m => (
                <SelectItem key={m} value={String(m)} className="text-xs">
                  {MES_FULL_OVERVIEW[m - 1]} {selectedYear}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <button
            type="button"
            onClick={goNext}
            disabled={!canNext}
            aria-label="Mes siguiente"
            className="flex h-9 w-9 items-center justify-center rounded-md border border-stone-200 bg-white text-stone-600 transition hover:border-stone-300 hover:text-stone-900 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-stone-200 disabled:hover:text-stone-600"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        </div>
        {showMesCerradoHint && (
          <p className="mt-1 text-right text-[10.5px] text-stone-400">
            último mes cerrado · {MES_FULL_OVERVIEW[currentCalMonth - 1].toLowerCase()} en curso
          </p>
        )}
      </div>
      )}

      <Tabs value={subtab} onValueChange={setSubtab} className="w-full">
        <TabsList className="-mx-4 flex h-auto w-auto justify-start gap-0 overflow-x-auto rounded-none border-b border-stone-200 bg-transparent px-4 p-0 md:mx-0 md:px-0">
          <TabsTrigger value="resumen" className={SUBTAB_TRIGGER_CLASS}>
            <TrendingUp className="h-3 w-3" /> Resumen
          </TabsTrigger>
          <TabsTrigger value="vendedoras" className={SUBTAB_TRIGGER_CLASS}>
            <Users className="h-3 w-3" /> Vendedoras
          </TabsTrigger>
          <TabsTrigger value="clientes" className={SUBTAB_TRIGGER_CLASS}>
            <UserCircle className="h-3 w-3" /> Clientes
          </TabsTrigger>
        </TabsList>

        <TabsContent value="resumen" className="mt-5">
          <MultifashionResumenView
            overview={data}
            selectedYear={selectedYear}
            isClosedYear={isClosedYear}
            mes={mes}
          />
        </TabsContent>
        <TabsContent value="vendedoras" className="mt-5">
          <VendedorasSubtab data={data} selectedYear={selectedYear} mes={mes} onMesChange={setMes} />
        </TabsContent>
        <TabsContent value="clientes" className="mt-5">
          <ClientesMultifashionSubtab selectedYear={selectedYear} mes={mes} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

const MES_FULL_OVERVIEW = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];
