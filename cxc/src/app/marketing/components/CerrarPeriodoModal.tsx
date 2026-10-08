"use client";

// ============================================================================
// Cerrar el período de UNA marca.
//
// 🔑 QUÉ ES CERRAR: se congela lo gastado hasta hoy para ESA marca, sale el
// reporte con SOLO su parte, y arranca un período nuevo en cero con el nombre
// que Daniel escriba ("2026", "Temporada 1"…).
//
// 🔴 CADA MARCA SE CIERRA SOLA. El camino de grupo ("Cerrar las tres") se
// retiró el 11-ago-2026 — Daniel, textual: *"que sea por separado mejor no?"*.
// Este modal cierra UN período de UNA marca y nada más.
//
// 🔴 LOS PROYECTOS NO SE CIERRAN. Lo que se congela es la parte de esa marca
// dentro de cada proyecto: un proyecto con Tommy y Reebok, al cerrar Tommy,
// conserva su parte de Reebok viva y editable. Por eso el modal enumera
// facturas y muebles, y NO habla de proyectos.
//
// 🔴 EL MODAL AVISA LO QUE FALTA, Y SON DOS PAPELES DISTINTOS. Daniel, textual:
// *"pero impulsadora tambien necesita comprobante, pero no foto. aunq el
// comprobante sea una foto"*.
//   · COMPROBANTE — respalda la plata. Lo lleva TODO gasto, impulsadoras
//     incluidas. Mandar un reporte sin comprobantes es lo que le rebota.
//   · FOTO — la de instalación (el letrero puesto, el mueble armado). Solo la
//     esperan los gastos CON cliente; las impulsadoras no la tienen nunca.
// Puede cerrar igual, pero enterado. Con los dos en cero no se dibuja nada —
// un aviso que dice "todo bien" es ruido.
//
// 🩸 EL NOMBRE DEL PERÍODO NUEVO ES OBLIGATORIO Y LO ELIGE DANIEL. No se
// autogenera: es cómo va a reconocer después ese archivo en la lista de
// períodos cerrados, y un "Período 3" puesto por el sistema no le dice nada
// dentro de un año.
//
// ⚠️ NO SE PUEDE DESHACER, y el modal lo dice antes de que toque el botón.
//
// 🔴 EL CIERRE DEL REDISEÑO (22-sep-2026):
// Daniel, *«no quiero pipeline, cuando lo cierro es porque lo cobré»*. El
// modal pide el NOMBRE con el que se cierra ESTE período (obligatorio — es lo
// que la marca reconoce) y la nota de crédito como TEXTO libre (opcional, sin
// ningún cálculo: *«no enredes ni hagas de más»*). NO baja ningún reporte: el
// ZIP se baja cuando se quiera desde el período. El siguiente se abre solo,
// con nombre por defecto («Desde el 22 sept 2026»). El total que se muestra
// es lo REPORTADO; lo apagado se dice en gris y no suma. El modal de antes
// (`CerrarPeriodoModalDeAntes`) se borró el 8-oct-2026.
// ============================================================================

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useToast } from "@/components/ToastSystem";
import { formatearMonto } from "@/lib/marketing/normalizar";
import { MSG_FALTA_NOMBRE } from "@/lib/marketing/periodo-estado";
import { useFormModalDismiss } from "@/lib/hooks/useModalDismiss";
import type { BloqueResumen } from "./tipos-inicio";
import { Aviso } from "@/components/ui/Aviso";
import { MKT_SOLO_COBRABLE_2026_10 } from "@/lib/marketing/solo-cobrable-2026-10";

interface Props {
  bloque: BloqueResumen;
  /** El período abierto de ESA marca. */
  periodoId: string;
  onClose: () => void;
  /** Se llama con el período recién cerrado, para bajar su reporte. */
  onCerrado: (periodoId: string, etiqueta: string) => void | Promise<void>;
  /**
   * 🔴 SOLO LO COBRABLE (7-oct-2026, apagado): las tiendas del período, para
   * avisar cuáles no tienen foto. Nunca frena el cierre.
   */
  tiendas?: ReadonlyArray<{ codigo: string | null; nombre: string }>;
}

function plural(n: number, uno: string, varios: string): string {
  return `${n} ${n === 1 ? uno : varios}`;
}

// EL MODAL DEL REDISEÑO — nombre al cerrar + nota de crédito, sin reporte.
export default function CerrarPeriodoModal({ bloque, periodoId, onClose, onCerrado, tiendas }: Props) {
  const { toast } = useToast();
  // 🔴 SOLO LO COBRABLE: qué tiendas no tienen foto. Falla ABIERTA: sin la
  // lectura, no se dice nada y el cierre sigue igual.
  const [tiendasSinFoto, setTiendasSinFoto] = useState<string[]>([]);
  // La lista llega nueva en cada dibujo: se compara por sus códigos.
  const claveTiendas = (tiendas ?? []).map((t) => t.codigo ?? "").join(",");
  useEffect(() => {
    if (!MKT_SOLO_COBRABLE_2026_10 || !tiendas || tiendas.length === 0) return;
    const conCodigo = tiendas.filter((t): t is { codigo: string; nombre: string } => !!t.codigo);
    if (conCodigo.length === 0) return;
    let cancelado = false;
    const qs = encodeURIComponent(conCodigo.map((t) => t.codigo).join(","));
    fetch(`/api/marketing/periodos/${periodoId}/tiendas-sin-foto?tiendas=${qs}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { sinFoto?: string[] } | null) => {
        if (cancelado || !d?.sinFoto) return;
        const faltan = new Set(d.sinFoto);
        setTiendasSinFoto(conCodigo.filter((t) => faltan.has(t.codigo.toUpperCase())).map((t) => t.nombre));
      })
      .catch(() => {});
    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claveTiendas, periodoId]);
  // Arranca con el nombre que el período ya tiene: Daniel lo cambia si quiere.
  const [nombre, setNombre] = useState(bloque.periodoAbierto?.nombre ?? "");
  const [notaCredito, setNotaCredito] = useState("");
  const [cerrando, setCerrando] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const cerrar = useCallback(() => onClose(), [onClose]);
  const { panelRef, backdrop } = useFormModalDismiss(mounted, cerrar, !cerrando);

  // Los pendientes VIENEN ya contados por bloque. Nunca se recuenta acá.
  const pendientes = {
    sinComprobante: bloque.sinComprobante ?? 0,
    sinFoto: bloque.sinFoto ?? 0,
  };
  const noReportado = bloque.noReportado ?? { count: 0, total: 0 };
  const gastos = bloque.facturas.count + bloque.muebles.count;
  const nombrePeriodo = bloque.periodoAbierto?.nombre ?? "Período actual";
  const puedeConfirmar = nombre.trim().length > 0 && !cerrando;

  const confirmar = async () => {
    if (!puedeConfirmar) return;
    setCerrando(true);
    try {
      const res = await fetch(`/api/marketing/periodos/${periodoId}/cerrar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nombreAlCerrar: nombre.trim(),
          notaCredito: notaCredito.trim() || null,
        }),
      });
      const data = (await res.json().catch(() => null)) as {
        error?: string;
        siguiente?: { nombre?: string };
      } | null;
      if (!res.ok) throw new Error(data?.error ?? "No se pudo cerrar el período");
      toast(
        `Cerrado «${nombre.trim()}». ${bloque.nombre} sigue en «${data?.siguiente?.nombre ?? "el período nuevo"}».`,
        "success",
      );
      await onCerrado(periodoId, `${bloque.nombre} · ${nombre.trim()} · ${formatearMonto(bloque.total)}`);
    } catch (err) {
      toast(err instanceof Error ? err.message : "No se pudo cerrar el período", "error");
      setCerrando(false);
    }
  };

  if (!mounted) return null;

  // 🔴 SOLO LO COBRABLE: si ya se dice QUÉ tiendas no tienen foto, el conteo
  // de «gastos sin foto» sobra (un solo aviso por cosa).
  const sinFotoEnElAviso = MKT_SOLO_COBRABLE_2026_10 && tiendasSinFoto.length > 0 ? 0 : pendientes.sinFoto;
  const hayPendientes = pendientes.sinComprobante > 0 || sinFotoEnElAviso > 0;

  // 🔴 10a — LA MISMA PANTALLA, VESTIDA DE HOJA DE iOS (24-sep-2026). Daniel:
  // *«No hay nada que arreglar»* en el cierre — cabe entera en un iPhone, dice
  // qué va a pasar, avisa del gasto sin foto, pide el nombre y la nota de
  // crédito y advierte en rojo. Lo único que cambia en el celular es que SUBE
  // DESDE ABAJO y que «Cerrar período» es un botón ancho al alcance del pulgar.
  // 🔴 NINGUNA REGLA DEL CIERRE SE TOCA: mismo endpoint, mismos campos, mismo
  // aviso, misma validación.
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4"
      {...backdrop}
    >
      <div className="absolute inset-0 bg-black/40" aria-hidden="true" />
      <div
        ref={panelRef}
        className="relative bg-white w-full rounded-t-[20px] sm:rounded-lg sm:max-w-md max-h-[92vh] sm:max-h-[90vh] overflow-y-auto border border-gray-200"
      >
        <div className="border-b border-gray-100 pl-5 pr-2 py-2.5 flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-gray-900">Cerrar el período de {bloque.nombre}</h2>
          <button
            type="button"
            onClick={onClose}
            disabled={cerrando}
            aria-label="Cerrar"
            className="shrink-0 w-11 h-11 flex items-center justify-center rounded-md text-gray-500 hover:text-black active:scale-[0.97] transition disabled:opacity-40"
          >
            <span aria-hidden="true" className="text-xl leading-none">
              &times;
            </span>
          </button>
        </div>

        <div className="p-5 space-y-4">
          <p className="text-sm text-gray-600">
            Cerrar quiere decir que ya lo cobraste. El período que sigue se abre solo.
          </p>

          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
            <div className="text-xs text-gray-500">
              Lo de {bloque.nombre} en <span className="font-medium text-gray-700">{nombrePeriodo}</span>:
            </div>
            <ul className="mt-2 space-y-1 text-sm text-gray-800">
              <li className="flex items-center justify-between gap-3">
                <span>{plural(gastos, "gasto reportado", "gastos reportados")}</span>
                <span className="tabular-nums font-semibold">{formatearMonto(bloque.total)}</span>
              </li>
              {noReportado.count > 0 && (
                <li className="flex items-center justify-between gap-3 text-gray-500">
                  <span>{plural(noReportado.count, "gasto que no se reporta", "gastos que no se reportan")}</span>
                  <span className="tabular-nums">{formatearMonto(noReportado.total)}</span>
                </li>
              )}
            </ul>
          </div>

          {hayPendientes && (
            <Aviso
              tono="aviso"
            >
              <span className="font-medium">Documentación pendiente:</span>{" "}
              {[
                pendientes.sinComprobante > 0 ? `${plural(pendientes.sinComprobante, "gasto", "gastos")} sin comprobante` : null,
                sinFotoEnElAviso > 0 ? `${plural(sinFotoEnElAviso, "gasto", "gastos")} sin foto` : null,
              ].filter(Boolean).join(" · ")}.
            </Aviso>
          )}

          {MKT_SOLO_COBRABLE_2026_10 && tiendasSinFoto.length > 0 && (
            <Aviso tono="aviso">
              <span className="font-medium">Tiendas sin foto:</span> {tiendasSinFoto.join(" · ")}. Se puede cerrar igual.
            </Aviso>
          )}

          <div>
            <label htmlFor="mk-nombre-al-cerrar" className="block text-sm font-medium text-gray-700 mb-1">
              ¿Con qué nombre se cierra este período?
              <span className="text-red-500 ml-0.5">*</span>
            </label>
            <input
              id="mk-nombre-al-cerrar"
              type="text"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej. Temporada 2026, Enero–junio 2026"
              disabled={cerrando}
              maxLength={120}
              className="w-full rounded-md border border-gray-300 px-3 py-2 min-h-[44px] text-base sm:text-sm focus:border-black focus:outline-none disabled:bg-gray-50"
            />
            {nombre.trim().length === 0 && (
              <p className="mt-1 text-xs text-red-700">{MSG_FALTA_NOMBRE}</p>
            )}
          </div>

          <div>
            <label htmlFor="mk-nota-credito" className="block text-sm font-medium text-gray-700 mb-1">
              Nota de crédito <span className="text-gray-400 font-normal">(opcional)</span>
            </label>
            <input
              id="mk-nota-credito"
              type="text"
              value={notaCredito}
              onChange={(e) => setNotaCredito(e.target.value)}
              placeholder="Ej. NC-000123"
              disabled={cerrando}
              maxLength={300}
              className="w-full rounded-md border border-gray-300 px-3 py-2 min-h-[44px] text-base sm:text-sm focus:border-black focus:outline-none disabled:bg-gray-50"
            />
          </div>

          <Aviso
            tono="error"
          >
            Después de cerrarlo no se puede deshacer: los montos de adentro ya no se pueden editar.
          </Aviso>
        </div>

        {/* En el celular «Cerrar período» es ancho y Cancelar baja debajo; en la
            computadora, los dos botones de siempre a la derecha. */}
        <div className="border-t border-gray-100 px-4 py-4 pb-8 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-end sm:px-5 sm:pb-4">
          <button
            type="button"
            onClick={onClose}
            disabled={cerrando}
            className="min-h-[44px] w-full sm:w-auto px-3 inline-flex items-center justify-center rounded-md text-[17px] sm:text-sm text-gray-600 hover:text-black transition disabled:opacity-40"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={confirmar}
            disabled={!puedeConfirmar}
            className="w-full sm:w-auto rounded-[14px] sm:rounded-md bg-black text-white px-4 py-4 sm:py-0 min-h-[44px] inline-flex items-center justify-center text-[17px] font-semibold sm:text-sm sm:font-normal active:scale-[0.98] transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {cerrando ? "Cerrando…" : "Cerrar período"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
