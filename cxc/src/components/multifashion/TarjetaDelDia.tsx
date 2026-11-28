"use client";

// La tarjeta del día (`MULTIFASHION_TARJETA_DIA_2026_11`): la MISMA tarjeta
// flotante de «mes a mes» (`TarjetaResumen`), con la gráfica difuminada detrás.
// Se cierra tocando afuera. Cuentas en `lib/multifashion/tarjeta-dia.ts`.

import { TarjetaResumen } from "@/components/shared/GestosIphone";
import { ERROR_TARJETA, type EstadoLectura } from "@/components/shared/TarjetaMesAMes";
import { colorDelTono } from "@/components/celular/Piezas";
import { cn } from "@/lib/utils";
import { fmtMoneyCompact, fmtPorcentaje } from "@/lib/ventas/format";
import {
  cambioDelDia, fechaEquivalente, horaCorta, horasDeMayorVenta, horasDelDibujo, subtituloDelDia, ticketPromedio, tituloDelDia,
  type DiaDeLaTarjeta,
} from "@/lib/multifashion/tarjeta-dia";
import { notaDeCobertura } from "@/lib/multifashion/margen-estimado";

function Fila({ rotulo, nota, children }: { rotulo: string; nota?: string | null; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 py-2 text-[15px]">
      <span className="text-gray-700">
        {rotulo}
        {nota && <span className="block text-[12px] text-gray-500">{nota}</span>}
      </span>
      <span className="text-right tabular-nums text-gray-900">{children}</span>
    </div>
  );
}

function Cuerpo({ d }: { d: DiaDeLaTarjeta }) {
  const anioPrevio = d.equivalente.slice(0, 4);
  const cambio = cambioDelDia(d);
  const prom = ticketPromedio(d.venta, d.tickets);
  const promPrevio = ticketPromedio(d.ventaPrevia, d.ticketsPrevios);
  const bloque = horasDeMayorVenta(d.horas);
  const dibujo = horasDelDibujo(d.horas);
  const max = Math.max(0, ...dibujo.map((h) => d.horas[h]));
  const conPrevio = d.ticketsPrevios > 0;
  return (
    <div data-tarjeta-dia={d.fecha} className="mt-2 divide-y divide-gray-100">
      <Fila rotulo="Venta" nota={conPrevio ? `${anioPrevio}: ${fmtMoneyCompact(d.ventaPrevia)}${d.esHoy ? " (día completo)" : ""}` : null}>
        {fmtMoneyCompact(d.venta)}
        {cambio && <span data-elemento="cambio-dia" className={cn("ml-1.5", colorDelTono(cambio.tono))}>{cambio.texto}</span>}
      </Fila>
      {d.margenEstimado ? (
        <Fila rotulo="Margen" nota={(d.cobertura != null && notaDeCobertura(d.cobertura)) || "el real llega de madrugada"}>
          <span data-elemento="margen-estimado">{fmtPorcentaje(d.margen)} <span className="text-gray-500">estimado</span></span>
        </Fila>
      ) : d.esHoy ? (
        <Fila rotulo="Margen" nota="el costo llega de madrugada"><span className="text-gray-500">mañana</span></Fila>
      ) : (
        <Fila rotulo="Margen">{fmtPorcentaje(d.margen)}</Fila>
      )}
      <Fila rotulo="Tickets" nota={conPrevio ? `${anioPrevio}: ${d.ticketsPrevios}` : null}>{d.tickets}</Fila>
      <Fila rotulo="Ticket promedio" nota={promPrevio != null ? `${anioPrevio}: ${fmtMoneyCompact(promPrevio)}` : null}>
        {prom != null ? fmtMoneyCompact(prom) : "—"}
      </Fila>
      <div className="pt-2">
        <Fila rotulo="Horas de mayor venta">{bloque ? `${bloque.rotulo} · ${fmtMoneyCompact(bloque.monto)}` : "—"}</Fila>
        {max > 0 && (
          <>
            <div aria-hidden className="mt-1 flex h-12 items-end gap-1">
              {dibujo.map((h) => (
                <span
                  key={h}
                  data-hora={h}
                  className={cn("flex-1 rounded-t-[2px]", bloque && h >= bloque.desde && h < bloque.hasta ? "bg-gray-900" : "bg-gray-200")}
                  style={{ height: `${Math.max(4, (Math.max(0, d.horas[h]) / max) * 100)}%` }}
                />
              ))}
            </div>
            <div aria-hidden className="mt-1 flex gap-1">
              {dibujo.map((h, i) => (
                <span key={h} className={cn("flex-1 text-center text-[12px] text-gray-500", i % 2 && "invisible")}>{horaCorta(h)}</span>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export function TarjetaDelDia({ fecha, esHoy, estado, onCerrar }: {
  fecha: string;
  esHoy: boolean;
  estado: EstadoLectura<DiaDeLaTarjeta>;
  onCerrar: () => void;
}) {
  const cuerpo = estado.status === "cargando" ? (
    <p className="py-6 text-center text-[14px] text-gray-500">Cargando…</p>
  ) : estado.status === "error" ? (
    <p className="py-6 text-center text-[14px] text-gray-500">{ERROR_TARJETA}</p>
  ) : (
    <Cuerpo d={estado.datos} />
  );
  return (
    <TarjetaResumen
      titulo={tituloDelDia(fecha, esHoy)}
      subtitulo={subtituloDelDia(fechaEquivalente(fecha), esHoy)}
      cuerpo={cuerpo}
      onCerrar={onCerrar}
    />
  );
}
