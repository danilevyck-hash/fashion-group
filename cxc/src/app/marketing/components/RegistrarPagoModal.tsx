"use client";

import { createPortal } from "react-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import { useToast } from "@/components/ToastSystem";
import { useBodyScrollLock } from "@/lib/hooks/useBodyScrollLock";
import { useFormModalDismiss } from "@/lib/hooks/useModalDismiss";
import { pedirUploadUrl, subirArchivoAStorage } from "./uploadHelpers";
import { formatearMonto } from "@/lib/marketing/normalizar";
import {
  etiquetaPeriodo,
  mesCompleto,
  primeraQuincena,
  segundaQuincena,
  validarPeriodo,
} from "@/lib/marketing/periodo";
import type { ImpulsadoraConEstado } from "@/lib/marketing/types";

interface Props {
  impulsadora: ImpulsadoraConEstado;
  // Mes inicial "YYYY-MM-01" (default = mes con pago pendiente). El formulario
  // arranca con ese mes COMPLETO cargado: pagar el mes entero es 0 clics y
  // pagar una quincena es 1 (los atajos de abajo).
  mesInicial: string;
  /**
   * Foto que ya eligió la puerta de "Registrar gasto".
   *
   * 🔴 LA FOTO NO SE LIMITA POR TIPO DE GASTO. Daniel, textual: *"te dije que
   * no limites subir fotos de impulsadora porque si hago un evento y quiero
   * subir fotos del evento me lo va a limitar, todo el modulo tiene que tener
   * sentido"*. Un pago de impulsadora puede llevar foto igual que cualquier
   * otro gasto. Lo único que distingue a las impulsadoras es el AVISO del
   * cierre ("N gastos sin foto"), que no las cuenta — pero eso silencia un
   * aviso, no apaga un botón.
   */
  fotoOpcional?: File | null;
  onClose: () => void;
  onSaved: () => void;
}

interface ComprobanteSubido {
  path: string;
  tipo: "pdf_factura" | "foto_factura";
  nombreOriginal: string;
  sizeBytes: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export default function RegistrarPagoModal({
  impulsadora,
  mesInicial,
  fotoOpcional,
  onClose,
  onSaved,
}: Props) {
  const { toast } = useToast();
  useBodyScrollLock(true);
  // Período trabajado: dos fechas "YYYY-MM-DD". Arranca en el mes completo.
  const inicial = mesCompleto(mesInicial);
  const [desde, setDesde] = useState(inicial.desde);
  const [hasta, setHasta] = useState(inicial.hasta);
  const [monto, setMonto] = useState(String(impulsadora.monto_mensual));
  const [comprobante, setComprobante] = useState<ComprobanteSubido | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const montoNum = Number(monto) || 0;
  const errorPeriodo = validarPeriodo(desde, hasta);
  // Los atajos operan sobre el mes de "desde" (o el mes inicial si está vacío).
  const mesBase = /^\d{4}-\d{2}/.test(desde) ? desde : mesInicial;
  const aplicar = (p: { desde: string; hasta: string }) => {
    setDesde(p.desde);
    setHasta(p.hasta);
  };

  // Distribución por marca según el split (cuadrando centavos en la última).
  const distribucion = useMemo(() => {
    const marcas = impulsadora.marcas;
    let acum = 0;
    return marcas.map((m, i) => {
      const esUltima = i === marcas.length - 1;
      const porcion = esUltima
        ? round2(montoNum - acum)
        : round2((montoNum * m.porcentaje) / 100);
      acum = round2(acum + porcion);
      return { nombre: m.marca.nombre, porcentaje: m.porcentaje, monto: porcion };
    });
  }, [impulsadora.marcas, montoNum]);

  const concepto = errorPeriodo
    ? `Impulsadora ${impulsadora.nombre}`
    : `Impulsadora ${impulsadora.nombre} — ${etiquetaPeriodo({ desde, hasta })}`;

  const onFile = async (file: File | null) => {
    if (!file) return;
    const esPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
    if (file.size > 10 * 1024 * 1024) {
      toast("El archivo supera 10MB.", "error");
      return;
    }
    setSubiendo(true);
    try {
      const { uploadUrl, path } = await pedirUploadUrl({ file, impulsadoraId: impulsadora.id });
      await subirArchivoAStorage(uploadUrl, file);
      setComprobante({
        path,
        tipo: esPdf ? "pdf_factura" : "foto_factura",
        nombreOriginal: file.name,
        sizeBytes: file.size,
      });
      toast("Comprobante subido", "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : "No se pudo subir el comprobante", "error");
    } finally {
      setSubiendo(false);
    }
  };

  const puedeGuardar =
    montoNum > 0 && !!comprobante && !errorPeriodo && !subiendo && !guardando;

  const guardar = async () => {
    if (!puedeGuardar || !comprobante) return;
    setGuardando(true);
    try {
      // La foto (si la hay) se sube ANTES del pago: así el único paso que puede
      // fallar a medias es el que no mueve plata. Si falla, se avisa y el pago
      // se guarda igual — perder el pago por una foto sería el peor canje.
      let foto: { path: string; nombreOriginal: string; sizeBytes: number } | null =
        null;
      if (fotoOpcional) {
        try {
          const { uploadUrl, path } = await pedirUploadUrl({
            file: fotoOpcional,
            impulsadoraId: impulsadora.id,
          });
          await subirArchivoAStorage(uploadUrl, fotoOpcional);
          foto = {
            path,
            nombreOriginal: fotoOpcional.name,
            sizeBytes: fotoOpcional.size,
          };
        } catch {
          toast("La foto no subió. El pago se guarda igual.", "warning");
        }
      }

      const res = await fetch(`/api/marketing/impulsadoras/${impulsadora.id}/pagos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          desde,
          hasta,
          monto: montoNum,
          ...(foto ? { foto } : {}),
          comprobante: {
            path: comprobante.path,
            tipo: comprobante.tipo,
            nombreOriginal: comprobante.nombreOriginal,
            sizeBytes: comprobante.sizeBytes,
          },
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error ?? "No se pudo registrar el pago");
      }
      // El pago entró seguro. La foto es aparte y puede NO haber entrado
      // (pre-DDL la base todavía no acepta `foto_instalacion`): si el server
      // dice que no la guardó, se AVISA — una foto perdida en silencio deja a
      // Daniel creyendo que el papel está cuando no está.
      const data = (await res.json().catch(() => null)) as {
        fotoGuardada?: boolean | null;
      } | null;
      if (foto && data?.fotoGuardada === false) {
        toast(
          "Pago registrado, pero la foto no se pudo guardar. Vuelve a subirla desde el gasto.",
          "warning",
        );
      } else {
        toast("Pago registrado", "success");
      }
      onSaved();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Error al guardar", "error");
    } finally {
      setGuardando(false);
    }
  };

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Clic fuera + Escape. Si ya cambió mes/monto, no cierra (sale con Cancelar).
  // El comprobante ya subido no es un input, así que se bloquea aparte: con un
  // comprobante cargado tampoco cierra por accidente.
  // El hook va ANTES del return condicional (reglas de hooks).
  const periodoTocado = desde !== inicial.desde || hasta !== inicial.hasta;
  const { panelRef, backdrop } = useFormModalDismiss(
    mounted,
    onClose,
    !guardando && !subiendo && !comprobante && !periodoTocado,
  );

  if (!mounted) return null;

  return createPortal(
    /* Sin slide-up y centrado en todos los anchos: regla de la casa. */
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
      <div className="absolute inset-0 bg-black/40" {...backdrop} />
      <div
        ref={panelRef}
        className="relative bg-white w-full sm:max-w-lg rounded-lg max-h-[90vh] overflow-y-auto border border-gray-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white border-b border-gray-100 pl-6 pr-2 py-2.5 flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-gray-900">
            Registrar pago — {impulsadora.nombre}
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={guardando || subiendo}
            aria-label="Cerrar"
            className="shrink-0 w-11 h-11 flex items-center justify-center rounded-md text-gray-500 hover:text-black active:scale-[0.97] transition disabled:opacity-40"
          >
            <span aria-hidden="true" className="text-xl leading-none">
              &times;
            </span>
          </button>
        </div>

        <div className="p-6 space-y-5">
          <div>
            <div className="text-sm font-medium text-gray-700 mb-2">Período trabajado</div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="periodo-desde"
                  className="block text-xs text-gray-500 mb-1"
                >
                  Desde
                </label>
                <input
                  id="periodo-desde"
                  type="date"
                  value={desde}
                  onChange={(e) => setDesde(e.target.value)}
                  className="w-full min-h-[44px] rounded-md border border-gray-300 px-3 py-2 text-base sm:text-sm focus:border-black focus:outline-none"
                />
              </div>
              <div>
                <label
                  htmlFor="periodo-hasta"
                  className="block text-xs text-gray-500 mb-1"
                >
                  Hasta
                </label>
                <input
                  id="periodo-hasta"
                  type="date"
                  value={hasta}
                  onChange={(e) => setHasta(e.target.value)}
                  className="w-full min-h-[44px] rounded-md border border-gray-300 px-3 py-2 text-base sm:text-sm focus:border-black focus:outline-none"
                />
              </div>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {[
                { label: "1ª quincena", p: primeraQuincena(mesBase) },
                { label: "2ª quincena", p: segundaQuincena(mesBase) },
                { label: "Mes completo", p: mesCompleto(mesBase) },
              ].map((a) => (
                <button
                  key={a.label}
                  type="button"
                  onClick={() => aplicar(a.p)}
                  className={`min-h-[44px] rounded-md border px-3 text-sm transition ${
                    desde === a.p.desde && hasta === a.p.hasta
                      ? "border-black bg-black text-white"
                      : "border-gray-300 text-gray-700 hover:border-black hover:text-black"
                  }`}
                >
                  {a.label}
                </button>
              ))}
            </div>
            {errorPeriodo && (
              <p className="mt-2 text-sm text-red-600">{errorPeriodo}</p>
            )}
          </div>

          <div>
            <label
              htmlFor="pago-monto"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Monto
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">$</span>
              <input
                id="pago-monto"
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                value={monto}
                onChange={(e) => setMonto(e.target.value)}
                className="w-full min-h-[44px] rounded-md border border-gray-300 pl-7 pr-3 py-2 text-base sm:text-sm tabular-nums focus:border-black focus:outline-none"
              />
            </div>
          </div>

          <div>
            <div className="text-sm font-medium text-gray-700 mb-1">Concepto</div>
            <div className="rounded-md bg-gray-50 border border-gray-200 px-3 py-2 text-sm text-gray-600">
              {concepto}
            </div>
          </div>

          <div>
            <div className="text-sm font-medium text-gray-700 mb-2">Distribución por marca</div>
            <div className="rounded-md border border-gray-200 divide-y divide-gray-100">
              {distribucion.map((d) => (
                <div key={d.nombre} className="flex items-center justify-between px-3 py-2 text-sm">
                  <span className="text-gray-700">
                    {d.nombre} <span className="text-gray-400">· {d.porcentaje}%</span>
                  </span>
                  <span className="tabular-nums text-gray-900">{formatearMonto(d.monto)}</span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="text-sm font-medium text-gray-700 mb-2">
              Comprobante <span className="text-red-600">*</span>{" "}
              <span className="text-xs font-normal text-gray-400">(foto o PDF, obligatorio)</span>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*,application/pdf"
              className="hidden"
              onChange={(e) => onFile(e.target.files?.[0] ?? null)}
            />
            {comprobante ? (
              <div className="flex items-center justify-between rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm">
                <span className="text-emerald-800 truncate">✓ {comprobante.nombreOriginal}</span>
                <button
                  type="button"
                  onClick={() => setComprobante(null)}
                  disabled={guardando}
                  className="text-gray-500 hover:text-black text-xs shrink-0 ml-3"
                >
                  Cambiar
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={subiendo}
                className="w-full rounded-md border border-dashed border-gray-300 px-3 min-h-[44px] py-3 text-sm text-gray-600 hover:border-gray-500 hover:text-black transition disabled:opacity-50"
              >
                {subiendo ? "Subiendo…" : "Subir comprobante"}
              </button>
            )}
          </div>

          {fotoOpcional && (
            <div className="text-sm text-gray-600">
              Foto lista:{" "}
              <span className="text-gray-900">{fotoOpcional.name}</span> — se
              sube con el pago.
            </div>
          )}
        </div>

        <div className="sticky bottom-0 bg-white border-t border-gray-100 px-6 py-4 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={guardando || subiendo}
            className="px-3 min-h-[44px] inline-flex items-center justify-center rounded-md text-sm text-gray-600 hover:text-black transition disabled:opacity-40"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={guardar}
            disabled={!puedeGuardar}
            className="rounded-md bg-black text-white px-4 min-h-[44px] inline-flex items-center justify-center text-sm active:scale-[0.97] transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {guardando ? "Guardando…" : "Guardar pago"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
