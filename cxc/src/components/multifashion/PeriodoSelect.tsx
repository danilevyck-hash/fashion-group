"use client";

// El ÚNICO control de tiempo de Multifashion. Ver `src/lib/multifashion/periodo.ts`
// para el porqué (tres controles a la vez, seis píldoras en tres filas en el
// teléfono, y una pestaña cuyo rango lo decidía un selector que no se dibujaba).
//
// Misma forma que Comisiones y Ventas: un desplegable que dice el período con
// todas las letras. Los grupos («Rangos», «2026», «2025»…) son rótulos, no
// opciones: no se pueden tocar.

import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import type { OpcionPeriodo } from "@/lib/multifashion/periodo";
import PanelPeriodo from "@/components/ui/PanelPeriodo";

export const PLACEHOLDER_PERIODO = "Seleccionar período";

interface PeriodoSelectProps {
  valor: string;
  opciones: OpcionPeriodo[];
  onChange: (valor: string) => void;
  disabled?: boolean;
  /** ‹ y › (5-oct-2026): el valor del mes vecino, o `null` para apagarla. */
  anterior?: string | null;
  siguiente?: string | null;
  /** CALENDARIO_SIMPLE_2026_10: más angosto en el celular, para que «Rango» entre al lado. */
  compacto?: boolean;
}

const FLECHA = "inline-flex h-11 w-9 shrink-0 items-center justify-center rounded-md text-lg text-gray-600 transition hover:bg-gray-100 active:scale-[0.97] disabled:pointer-events-none disabled:text-gray-300";

export function PeriodoSelect({ valor, opciones, onChange, disabled, anterior, siguiente, compacto = false }: PeriodoSelectProps) {
  // Los grupos se dibujan en el orden en que aparecen (rangos primero, después
  // los años del más nuevo al más viejo) — el mismo orden que arma `opcionesPeriodo`.
  const grupos: { nombre: string; items: OpcionPeriodo[] }[] = [];
  for (const o of opciones) {
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo.nombre === o.grupo) ultimo.items.push(o);
    else grupos.push({ nombre: o.grupo, items: [o] });
  }

  // CALENDARIO_SIMPLE_2026_10 (`compacto`): en el celular el mes va corto,
  // «Oct 2026», igual que Comisiones; en la computadora, «Octubre 2026».
  const rotulo = opciones.find((o) => o.valor === valor)?.label;
  const corto = rotulo?.replace(/^(\S{3})\S*( \d{4})$/, "$1$2");

  // CALENDARIO_SIMPLE_2026_10: lo que el panel compacto necesita, sacado de
  // las MISMAS opciones (así nunca ofrece algo que la lista no ofrecía).
  const panel = (() => {
    const meses = new Map<number, number[]>();
    for (const o of opciones) {
      const m = /^(\d{4})-(\d{2})$/.exec(o.valor);
      if (m) meses.set(Number(m[1]), [...(meses.get(Number(m[1])) ?? []), Number(m[2])]);
    }
    const anios = [...meses.keys()];
    const sel = /^(\d{4})-(\d{2})$/.exec(valor);
    return {
      meses,
      anios: anios.length ? anios : [new Date().getFullYear()],
      conAnio: opciones.some((o) => /^\d{4}$/.test(o.valor)),
      ventanas: opciones.map((o) => /^u(\d+)$/.exec(o.valor)).filter(Boolean).map((m) => Number(m![1])),
      seleccion: sel
        ? { anio: Number(sel[1]), mes: Number(sel[2]) }
        : { anio: /^\d{4}$/.test(valor) ? Number(valor) : Math.max(...(anios.length ? anios : [new Date().getFullYear()])), mes: null },
    };
  })();

  return (
    // `compacto`: el trigger baja en el celular (sin tocar su clase).
    <div className={compacto ? "flex items-center [&_[role=combobox]]:min-w-[112px] sm:[&_[role=combobox]]:min-w-[168px]" : "flex items-center"}>
    <button
      type="button"
      aria-label="Mes anterior"
      data-flecha="anterior"
      className={FLECHA}
      disabled={disabled || !anterior}
      onClick={() => anterior && onChange(anterior)}
    >
      ‹
    </button>
    {compacto ? (
      <PanelPeriodo
        rotulo={rotulo ?? PLACEHOLDER_PERIODO}
        rotuloCorto={corto}
        anios={panel.anios}
        mesesDe={(a) => panel.meses.get(a) ?? []}
        seleccion={panel.seleccion}
        onMes={(a, m) => onChange(`${a}-${String(m).padStart(2, "0")}`)}
        todoElAnio={panel.conAnio ? {
          activo: /^\d{4}$/.test(valor) ? Number(valor) : null,
          onElegir: (a) => { if (opciones.some((o) => o.valor === String(a))) onChange(String(a)); },
        } : undefined}
        ventanas={panel.ventanas.map((n, k) => ({
          clave: `u${n}`,
          rotulo: k === 0 ? `Últimos ${n} meses` : String(n),
          activo: valor === `u${n}`,
          onElegir: () => onChange(`u${n}`),
        }))}
        disabled={disabled}
      />
    ) : (
    <Select value={valor} onValueChange={onChange}>
      {/* h-11 = 44 px exactos, la regla táctil de la casa. */}
      <SelectTrigger
        aria-label="Período"
        className="h-11 w-auto min-w-[168px] gap-1.5 text-xs"
        disabled={disabled}
      >
        {/* Si el mes de corte no tiene venta todavía (el día 1, antes del
            primer sync) la opción no existe y el desplegable quedaba EN
            BLANCO (11-sep-2026). Con el placeholder, dice qué hacer. */}
        {compacto && rotulo ? (
          <SelectValue placeholder={PLACEHOLDER_PERIODO}>
            <span className="sm:hidden">{corto}</span><span className="hidden sm:inline">{rotulo}</span>
          </SelectValue>
        ) : (
          <SelectValue placeholder={PLACEHOLDER_PERIODO} />
        )}
      </SelectTrigger>
      <SelectContent align="end" className="max-h-[60vh]">
        {grupos.map((g) => (
          <div key={g.nombre}>
            <div className="px-2 py-1.5 text-xs font-medium uppercase tracking-wide text-gray-400">
              {g.nombre}
            </div>
            {g.items.map((o) => (
              <SelectItem key={o.valor} value={o.valor} className="text-xs">
                {o.label}
              </SelectItem>
            ))}
          </div>
        ))}
      </SelectContent>
    </Select>
    )}
    <button
      type="button"
      aria-label="Mes siguiente"
      data-flecha="siguiente"
      // `compacto`: sin mes siguiente (el mes en curso) la › no aparece y no
      // deja hueco: «Rango» va pegado (Daniel, 5-oct-2026).
      className={`${FLECHA} ${compacto && !siguiente ? "hidden" : ""}`}
      disabled={disabled || !siguiente}
      onClick={() => siguiente && onChange(siguiente)}
    >
      ›
    </button>
    </div>
  );
}
