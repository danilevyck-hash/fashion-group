"use client";

// ============================================================================
// Cerrar el período de UNA marca — o de las TRES que se cierran juntas.
//
// 🔑 QUÉ ES CERRAR: se congela lo gastado hasta hoy para ESA marca, sale el
// reporte con SOLO su parte, y arranca un período nuevo en cero con el nombre
// que Daniel escriba ("2026", "Temporada 1"…).
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
// ============================================================================

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useToast } from "@/components/ToastSystem";
import { formatearMonto } from "@/lib/marketing/normalizar";
import { useFormModalDismiss } from "@/lib/hooks/useModalDismiss";
import type { BloqueResumen } from "./InicioMarketing";

/**
 * Qué pasó con UNA marca dentro del cierre en grupo.
 *
 * 🔴 `cerrado: false` NO ES UN ERROR, y por eso se pinta en gris y no en rojo.
 * Mientras la migración no corra, Tommy, Calvin y Karl comparten UN período:
 * al cerrarlo, la primera lo cierra y las otras dos vuelven con el motivo
 * *"todavía comparte el período con las otras marcas del grupo"* — o sea que
 * YA quedaron cerradas con ella. Una marca sin gasto vuelve igual. Pintar eso
 * de rojo diría que algo se rompió cuando en realidad salió bien.
 */
interface ResultadoMarca {
  marcaCodigo: string;
  marcaNombre: string;
  periodoId?: string | null;
  periodoNombre?: string | null;
  total?: number;
  cerrado: boolean;
  motivo?: string | null;
}

interface GrupoCierre {
  key: string;
  etiqueta: string;
  bloques: BloqueResumen[];
}

interface Props {
  bloque: BloqueResumen;
  /** El período abierto de ESA marca. `null` en modo grupo. */
  periodoId: string | null;
  /** Presente = cerrar las marcas del grupo de una sola vez. */
  grupo?: GrupoCierre;
  onClose: () => void;
  /** Se llama con el período recién cerrado, para bajar su reporte. */
  onCerrado: (periodoId: string, etiqueta: string) => void | Promise<void>;
}

function plural(n: number, uno: string, varios: string): string {
  return `${n} ${n === 1 ? uno : varios}`;
}

export default function CerrarPeriodoModal({
  bloque,
  periodoId,
  grupo,
  onClose,
  onCerrado,
}: Props) {
  const { toast } = useToast();
  const [nombreSiguiente, setNombreSiguiente] = useState("");
  const [cerrando, setCerrando] = useState(false);
  // Qué pasó con cada marca del grupo. Ver el comentario de `ResultadoMarca`.
  const [resultado, setResultado] = useState<ResultadoMarca[] | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Hooks SIEMPRE antes del return condicional.
  const cerrar = useCallback(() => onClose(), [onClose]);
  const { panelRef, backdrop } = useFormModalDismiss(mounted, cerrar, !cerrando);

  // En modo grupo se cierran varias marcas de un saque, así que lo que se
  // enumera son SUS bloques. En modo marca, el único bloque es el suyo.
  const enJuego = useMemo(
    () => (grupo ? grupo.bloques : [bloque]),
    [grupo, bloque],
  );

  // 🩸 Los pendientes se SUMAN de lo que ya vino contado por bloque. Nunca se
  // recuenta acá: dos verdades sobre la misma lista de gastos es exactamente
  // cómo el aviso terminaría diciendo un número y el reporte otro.
  const pendientes = useMemo(() => {
    let sinComprobante = 0;
    let sinFoto = 0;
    for (const b of enJuego) {
      sinComprobante += b.sinComprobante ?? 0;
      sinFoto += b.sinFoto ?? 0;
    }
    return { sinComprobante, sinFoto };
  }, [enJuego]);

  const totales = useMemo(() => {
    let facturasCount = 0;
    let facturasTotal = 0;
    let mueblesCount = 0;
    let mueblesTotal = 0;
    let total = 0;
    for (const b of enJuego) {
      facturasCount += b.facturas.count;
      facturasTotal += b.facturas.total;
      mueblesCount += b.muebles.count;
      mueblesTotal += b.muebles.total;
      total += b.total;
    }
    return { facturasCount, facturasTotal, mueblesCount, mueblesTotal, total };
  }, [enJuego]);

  const titulo = grupo
    ? `Cerrar ${grupo.etiqueta}`
    : `Cerrar el período de ${bloque.nombre}`;
  const quien = grupo ? grupo.etiqueta : bloque.nombre;
  const nombrePeriodo = bloque.periodoAbierto?.nombre ?? "Período actual";
  const puedeCerrar = nombreSiguiente.trim().length > 0 && !cerrando;

  const confirmar = async () => {
    if (!puedeCerrar) return;
    setCerrando(true);
    try {
      const url = grupo
        ? "/api/marketing/periodos/cerrar-grupo"
        : `/api/marketing/periodos/${periodoId}/cerrar`;
      const body = grupo
        ? { grupo: grupo.key, nombreSiguiente: nombreSiguiente.trim() }
        : { nombreSiguiente: nombreSiguiente.trim() };
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => null)) as {
        error?: string;
        marcas?: ResultadoMarca[];
      } | null;
      if (!res.ok) {
        throw new Error(data?.error ?? "No se pudo cerrar el período");
      }
      toast(`Período cerrado. ${quien} arranca "${nombreSiguiente.trim()}".`, "success");
      // En modo grupo NO se baja un reporte solo: cada marca tiene el suyo y se
      // bajan de a uno desde la tira de períodos cerrados (Safari en iPhone
      // bloquea las descargas múltiples). Se enseña qué pasó con cada una y el
      // modal NO se cierra solo: leerlo es el punto.
      if (grupo) {
        setResultado(Array.isArray(data?.marcas) ? data.marcas : []);
        setCerrando(false);
      } else {
        await onCerrado(
          periodoId as string,
          `${bloque.nombre} · ${nombrePeriodo} · ${formatearMonto(bloque.total)}`,
        );
      }
    } catch (err) {
      toast(
        err instanceof Error ? err.message : "No se pudo cerrar el período",
        "error",
      );
      setCerrando(false);
    }
  };

  if (!mounted) return null;

  const hayPendientes =
    pendientes.sinComprobante > 0 || pendientes.sinFoto > 0;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4"
      {...backdrop}
    >
      <div className="absolute inset-0 bg-black/40" aria-hidden="true" />
      <div
        ref={panelRef}
        className="relative bg-white w-full sm:max-w-md rounded-lg max-h-[90vh] overflow-y-auto border border-gray-200"
      >
        <div className="border-b border-gray-100 pl-5 pr-2 py-2.5 flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-gray-900">{titulo}</h2>
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

        {resultado ? (
          <>
            <div className="p-5 space-y-3">
              <p className="text-sm text-gray-700">
                Listo. Así quedó cada marca:
              </p>
              <ul className="rounded-lg border border-gray-200 divide-y divide-gray-100">
                {resultado.map((r) => (
                  <li
                    key={r.marcaCodigo}
                    className="px-3 py-2 flex items-start justify-between gap-3 text-sm"
                  >
                    <span className="text-gray-900">{r.marcaNombre}</span>
                    <span
                      className={`text-right ${
                        r.cerrado ? "text-teal-800 font-medium" : "text-gray-500"
                      }`}
                    >
                      {r.cerrado
                        ? `Cerrada${r.periodoNombre ? ` · ${r.periodoNombre}` : ""}`
                        : (r.motivo ?? "Ya quedó cerrada con las otras")}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-gray-500">
                El ZIP de cada marca se baja desde la tira de períodos cerrados,
                de a uno.
              </p>
            </div>
            <div className="border-t border-gray-100 px-5 py-4 flex items-center justify-end">
              <button
                type="button"
                onClick={() => onCerrado("", quien)}
                className="rounded-md bg-black text-white px-4 min-h-[44px] inline-flex items-center justify-center text-sm active:scale-[0.97] transition"
              >
                Listo
              </button>
            </div>
          </>
        ) : (
        <>
        <div className="p-5 space-y-4">
          {grupo && (
            <p className="text-sm text-gray-600">
              Se cierran juntas: {grupo.bloques.map((b) => b.nombre).join(", ")}.
              Cada una queda con su propio reporte.
            </p>
          )}

          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
            <div className="text-xs text-gray-500">
              Se va a congelar todo lo de {quien} en{" "}
              <span className="font-medium text-gray-700">{nombrePeriodo}</span>:
            </div>
            <ul className="mt-2 space-y-1 text-sm text-gray-800">
              {totales.facturasCount > 0 && (
                <li className="flex items-center justify-between gap-3">
                  <span>{plural(totales.facturasCount, "factura", "facturas")}</span>
                  <span className="tabular-nums font-medium">
                    {formatearMonto(totales.facturasTotal)}
                  </span>
                </li>
              )}
              {totales.mueblesCount > 0 && (
                <li className="flex items-center justify-between gap-3">
                  <span>
                    {plural(totales.mueblesCount, "entrega de muebles", "entregas de muebles")}
                  </span>
                  <span className="tabular-nums font-medium">
                    {formatearMonto(totales.mueblesTotal)}
                  </span>
                </li>
              )}
              <li className="flex items-center justify-between gap-3 border-t border-gray-200 pt-1.5 font-semibold">
                <span>Total a reportar</span>
                <span className="tabular-nums">{formatearMonto(totales.total)}</span>
              </li>
            </ul>
          </div>

          {/* --------------------------------------------------------------- */}
          {/* LO QUE FALTA. Dos papeles distintos, dichos por separado para que */}
          {/* no se confundan. Se puede cerrar igual — pero enterado.           */}
          {/* --------------------------------------------------------------- */}
          {hayPendientes && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-2">
              <div className="text-sm font-semibold text-amber-900">
                Antes de cerrar, fíjate
              </div>
              <ul className="space-y-2 text-sm text-amber-900">
                {pendientes.sinComprobante > 0 && (
                  <li>
                    <span className="font-medium">
                      {plural(pendientes.sinComprobante, "gasto", "gastos")} sin
                      comprobante.
                    </span>{" "}
                    <span className="text-amber-800">
                      Es el papel que respalda la plata. Un reporte sin
                      comprobantes le va a rebotar al encargado.
                    </span>
                  </li>
                )}
                {pendientes.sinFoto > 0 && (
                  <li>
                    <span className="font-medium">
                      {plural(pendientes.sinFoto, "gasto", "gastos")} sin foto.
                    </span>{" "}
                    <span className="text-amber-800">
                      Es la foto de la instalación — el letrero puesto, el mueble
                      armado. Solo se cuentan los gastos que tienen cliente.
                    </span>
                  </li>
                )}
              </ul>
              <p className="text-xs text-amber-800">
                Puedes cerrar igual. La foto se puede agregar después, aunque el
                período ya esté cerrado; la plata no.
              </p>
            </div>
          )}

          <div>
            <label
              htmlFor="mk-nombre-periodo-nuevo"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              ¿Cómo se llama el período que empieza?
              <span className="text-red-500 ml-0.5">*</span>
            </label>
            <input
              id="mk-nombre-periodo-nuevo"
              type="text"
              value={nombreSiguiente}
              onChange={(e) => setNombreSiguiente(e.target.value)}
              placeholder="Ej. 2026, Temporada 1"
              disabled={cerrando}
              /* text-base en móvil: con 14 px Safari hace zoom al enfocar. */
              className="w-full rounded-md border border-gray-300 px-3 py-2 min-h-[44px] text-base sm:text-sm focus:border-black focus:outline-none disabled:bg-gray-50"
            />
            <p className="text-xs text-gray-500 mt-1">
              Los gastos nuevos de {quien} van a entrar en ese período.
            </p>
          </div>

          <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-md p-3">
            Después de cerrarlo no se puede deshacer: los montos de adentro ya no
            se pueden editar. La foto sí se puede agregar después.
          </p>
        </div>

        <div className="border-t border-gray-100 px-5 py-4 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={cerrando}
            className="px-3 min-h-[44px] inline-flex items-center justify-center rounded-md text-sm text-gray-600 hover:text-black transition disabled:opacity-40"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={confirmar}
            disabled={!puedeCerrar}
            className="rounded-md bg-black text-white px-4 min-h-[44px] inline-flex items-center justify-center text-sm active:scale-[0.97] transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {cerrando ? "Cerrando…" : grupo ? "Cerrar las tres" : "Cerrar y bajar reporte"}
          </button>
        </div>
        </>
        )}
      </div>
    </div>,
    document.body,
  );
}
