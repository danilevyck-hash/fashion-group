"use client";

import { useState } from "react";
import { fmt } from "@/lib/format";
import {
  CONCEPTO_DANO,
  CONCEPTO_PAGO,
  CONCEPTO_PRESTAMO,
  ORIGENES_PAGO,
  ORIGEN_POR_DEFECTO,
} from "@/lib/prestamos-conceptos";
import {
  CUENTA_DANO,
  CUENTA_PRESTAMO,
  NOMBRE_CUENTA,
  type CuentaPrestamo,
} from "@/lib/prestamos-saldo";
import {
  BOTON_MANDAR_APROBACION,
  evaluarTopePrestamo,
  textoAvisoTope,
} from "@/lib/prestamos-tope";
import { MOV_TIPOS } from "./types";

/**
 * REGISTRAR UN MOVIMIENTO — tres conceptos, y las preguntas justas.
 *
 * 🔑 Lo que se pregunta depende de lo que el sistema NO puede saber:
 *   · **Baja de** solo aparece si debe LAS DOS cuentas. Viene puesta en la más
 *     vieja, y se puede cambiar. Con una sola cuenta con saldo no hay nada que
 *     preguntar.
 *   · **De dónde salió** solo aparece en un Pago, y viene en «Quincena» —que es
 *     de donde sale casi siempre—. Medido: 9 pagos reales salieron de una
 *     liquidación, del décimo o de vacaciones, y eso hoy solo se sabe si alguien
 *     lo escribió a mano en la nota.
 *   · **La nota es opcional.** 8 de cada 10 eran un eco del concepto.
 *
 * 🔴 EL TOPE SE CALCULA EN PANTALLA PARA DECIRLO ANTES, no para decidir: la
 * decisión es del servidor. Acá solo cambia el texto del botón, y el aviso dice
 * los números para que se entienda de dónde sale.
 */
export default function NuevoMovimientoModal({
  nombre, empleadoId, saldoPrestamo, saldoDano, cuentaMasVieja, salarioMensual, hoy,
  onCancelar, onGuardar,
}: {
  nombre: string;
  empleadoId: string;
  saldoPrestamo: number;
  saldoDano: number;
  cuentaMasVieja: CuentaPrestamo | null;
  salarioMensual: number | null;
  hoy: string;
  onCancelar: () => void;
  onGuardar: (payload: Record<string, unknown>) => Promise<void>;
}) {
  const [concepto, setConcepto] = useState<string>(CONCEPTO_PRESTAMO);
  const [fecha, setFecha] = useState(hoy);
  const [monto, setMonto] = useState("");
  const [cuenta, setCuenta] = useState<CuentaPrestamo>(cuentaMasVieja ?? CUENTA_PRESTAMO);
  const [origen, setOrigen] = useState<string>(ORIGEN_POR_DEFECTO);
  const [notas, setNotas] = useState("");
  const [guardando, setGuardando] = useState(false);

  const debeLasDos = saldoPrestamo > 0 && saldoDano > 0;
  const deudaTotal = saldoPrestamo + saldoDano;
  const esPago = concepto === CONCEPTO_PAGO;

  // 🔴 El tope solo mira el PRÉSTAMO. Un daño de mercancía se registra siempre:
  // no es plata que se entrega, es plata que ya se perdió.
  const evaluacion = concepto === CONCEPTO_PRESTAMO && Number(monto) > 0
    ? evaluarTopePrestamo({ deudaActual: deudaTotal, monto: Number(monto), salarioMensual })
    : null;
  const necesitaAprobacion = evaluacion !== null && !evaluacion.pasa;

  const listo = Number(monto) > 0 && !!fecha && !guardando;

  async function guardar() {
    if (!listo) return;
    setGuardando(true);
    await onGuardar({
      empleado_id: empleadoId,
      fecha,
      concepto,
      monto: Number(monto),
      notas: notas.trim() || null,
      ...(esPago ? { origen_pago: origen, cuenta: debeLasDos ? cuenta : undefined } : {}),
    });
    setGuardando(false);
  }

  return (
    <>
      <h2 className="font-medium mb-1">Nuevo movimiento</h2>
      <p className="mb-4 text-sm text-gray-500">{nombre}</p>

      <div className="grid grid-cols-3 gap-2 mb-4">
        {MOV_TIPOS.map((t) => (
          <button
            key={t.concepto}
            type="button"
            onClick={() => setConcepto(t.concepto)}
            className={`min-h-[44px] rounded-lg border px-2 py-2 text-left text-xs transition ${
              concepto === t.concepto ? t.color : "border-gray-200 text-gray-500 hover:border-gray-400"
            }`}
          >
            <span aria-hidden="true" className="mr-1">{t.icon}</span>
            <span className="font-medium">{t.label}</span>
          </button>
        ))}
      </div>

      <div className="space-y-4">
        {esPago && debeLasDos && (
          <div>
            <label className="text-xs text-gray-400 uppercase">Baja de</label>
            <div className="mt-1 flex flex-wrap gap-2">
              {([CUENTA_PRESTAMO, CUENTA_DANO] as CuentaPrestamo[]).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCuenta(c)}
                  className={`min-h-[44px] rounded-md border px-3 text-sm transition ${
                    cuenta === c ? "border-black bg-black text-white" : "border-gray-200 text-gray-600 hover:border-gray-400"
                  }`}
                >
                  {NOMBRE_CUENTA[c]} · ${fmt(c === CUENTA_DANO ? saldoDano : saldoPrestamo)}
                </button>
              ))}
            </div>
          </div>
        )}

        <div>
          <label className="text-xs text-gray-400 uppercase">Fecha *</label>
          <input type="date" max={hoy} value={fecha} onChange={e => setFecha(e.target.value)} className="w-full min-h-[44px] border-b border-gray-200 py-2 text-sm outline-none focus:border-black transition" />
        </div>

        <div>
          <label className="text-xs text-gray-400 uppercase">Monto ($) *</label>
          <input type="number" step="0.01" min="0.01" value={monto} onChange={e => setMonto(e.target.value)} className="w-full min-h-[44px] border-b border-gray-200 py-2 text-sm outline-none focus:border-black transition" placeholder="0.00" />
        </div>

        {esPago && (
          <div>
            <label className="text-xs text-gray-400 uppercase">De dónde salió</label>
            <div className="mt-1 flex flex-wrap gap-2">
              {ORIGENES_PAGO.map((o) => (
                <button
                  key={o}
                  type="button"
                  onClick={() => setOrigen(o)}
                  className={`min-h-[44px] rounded-md border px-3 text-sm transition ${
                    origen === o ? "border-black bg-black text-white" : "border-gray-200 text-gray-600 hover:border-gray-400"
                  }`}
                >
                  {o}
                </button>
              ))}
            </div>
          </div>
        )}

        {necesitaAprobacion && evaluacion && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            {textoAvisoTope(evaluacion)}
          </div>
        )}

        <div>
          <label className="text-xs text-gray-400 uppercase">Notas (opcional)</label>
          <textarea value={notas} onChange={e => setNotas(e.target.value)} rows={2} className="w-full border-b border-gray-200 py-2 text-sm outline-none focus:border-black transition resize-none" placeholder={concepto === CONCEPTO_DANO ? "Qué se dañó, de qué cliente…" : ""} />
        </div>
      </div>

      <div className="flex gap-3 mt-6">
        <button onClick={onCancelar} className="flex-1 inline-flex min-h-[44px] items-center justify-center border border-gray-200 rounded-md text-sm hover:border-gray-400 transition">Cancelar</button>
        <button onClick={guardar} disabled={!listo} className="flex-1 inline-flex min-h-[44px] items-center justify-center bg-black text-white rounded-md text-sm hover:bg-gray-800 transition disabled:opacity-50">
          {guardando ? "Guardando..." : necesitaAprobacion ? BOTON_MANDAR_APROBACION : "Registrar"}
        </button>
      </div>
    </>
  );
}
