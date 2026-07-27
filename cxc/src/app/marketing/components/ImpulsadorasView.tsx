"use client";

import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/components/ToastSystem";
import { ConfirmDeleteModal } from "@/components/ui";
import { formatearMonto } from "@/lib/marketing/normalizar";
import { etiquetaMes } from "@/lib/marketing/meses";
import type {
  ImpulsadoraConEstado,
  MkMarca,
  PagoMesEstado,
  ResultadoEliminarImpulsadora,
} from "@/lib/marketing/types";
import NuevaImpulsadoraModal from "./NuevaImpulsadoraModal";
import RegistrarPagoModal from "./RegistrarPagoModal";

interface Props {
  marcas: MkMarca[];
}

// Iniciales del nombre (hasta 2 palabras).
function iniciales(nombre: string): string {
  const partes = nombre.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "?";
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return (partes[0][0] + partes[1][0]).toUpperCase();
}

// Chip de estado de un mes. Con quincenas un mes puede quedar A MEDIAS, así que
// hay tres estados y el parcial dice qué días faltan — ni "pagado" ni
// "pendiente" a secas serían verdad.
//   ✓ Julio 2026              → mes cubierto completo (verde)
//   ◐ Julio 2026 · falta 16–31 → pagado a medias (ámbar oscuro)
//   ⏳ Julio 2026              → sin ningún pago (ámbar)
function ChipMes({ label, estado, faltan }: { label: string } & Pick<PagoMesEstado, "estado" | "faltan">) {
  const estilo =
    estado === "pagado"
      ? "bg-emerald-50 text-emerald-700"
      : estado === "parcial"
        ? "bg-amber-100 text-amber-900"
        : "bg-amber-50 text-amber-700";
  const icono = estado === "pagado" ? "✓" : estado === "parcial" ? "◐" : "⏳";
  return (
    // El chip PUEDE bajar de línea, pero nunca por la mitad de un dato: cada
    // parte va en su propio span nowrap. A 390px partía "Julio / 2026" en dos
    // columnas y no se leía; y forzar nowrap al chip entero lo hacía chocar
    // contra el botón "Registrar pago".
    <span
      className={`inline-flex flex-wrap items-center gap-x-1 rounded-full px-2 py-0.5 text-xs font-medium ${estilo}`}
    >
      <span className="whitespace-nowrap">
        {icono} {label}
      </span>
      {estado === "parcial" && faltan && (
        <span className="font-normal whitespace-nowrap">· falta {faltan}</span>
      )}
    </span>
  );
}

// Texto del modal de eliminar. Tiene que decir la VERDAD de lo que va a pasar:
// con pagos registrados la impulsadora no se borra, se oculta, y el historial
// de gastos queda. Prometer un borrado que no ocurre sería peor que no tener
// el botón.
function textoEliminar(imp: ImpulsadoraConEstado): {
  descripcion: string;
  confirmLabel: string;
} {
  const n = imp.pagosRegistrados;
  if (n === 0) {
    return {
      descripcion:
        "No tiene pagos registrados, así que se borra y no queda nada guardado.",
      confirmLabel: "Eliminar",
    };
  }
  return {
    descripcion:
      `Tiene ${n} pago${n === 1 ? "" : "s"} registrado${n === 1 ? "" : "s"}. ` +
      "No se puede borrar: se va a ocultar de la lista y el historial de esos " +
      "gastos se conserva.",
    confirmLabel: "Ocultar",
  };
}

export default function ImpulsadorasView({ marcas }: Props) {
  const { toast } = useToast();
  const [items, setItems] = useState<ImpulsadoraConEstado[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [showNueva, setShowNueva] = useState(false);
  const [pagando, setPagando] = useState<ImpulsadoraConEstado | null>(null);
  const [eliminando, setEliminando] = useState<ImpulsadoraConEstado | null>(null);
  const [borrando, setBorrando] = useState(false);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/marketing/impulsadoras", { cache: "no-store" });
      if (!res.ok) throw new Error();
      const data = (await res.json()) as ImpulsadoraConEstado[];
      setItems(Array.isArray(data) ? data : []);
    } catch {
      setItems([]);
      toast("No se pudieron cargar las impulsadoras.", "error");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  // El desenlace lo decide el SERVIDOR (borrar vs ocultar). Acá solo se cuenta
  // lo que respondió, así que el mensaje nunca puede contradecir a la base.
  const confirmarEliminar = useCallback(async () => {
    if (!eliminando) return;
    setBorrando(true);
    try {
      const res = await fetch(`/api/marketing/impulsadoras/${eliminando.id}`, {
        method: "DELETE",
      });
      const data = (await res.json().catch(() => ({}))) as
        | ResultadoEliminarImpulsadora
        | { error?: string };
      if (!res.ok) {
        throw new Error(
          ("error" in data && data.error) || "No se pudo eliminar.",
        );
      }
      if ("accion" in data && data.accion === "ocultada") {
        const conservado =
          data.pagos === 1
            ? "Se conservó su pago."
            : data.pagos > 1
              ? `Se conservaron sus ${data.pagos} pagos.`
              : "Se conservaron sus gastos registrados.";
        toast(`${data.nombre} ya no aparece en la lista. ${conservado}`, "success");
      } else {
        toast(`${eliminando.nombre} fue eliminada.`, "success");
      }
      setEliminando(null);
      await cargar();
    } catch (err) {
      toast(
        err instanceof Error ? err.message : "No se pudo eliminar.",
        "error",
      );
    } finally {
      setBorrando(false);
    }
  }, [eliminando, toast, cargar]);

  const pendientes = (items ?? []).filter((i) => i.activa && !i.mesActual.pagado).length;

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Impulsadoras</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Pago mensual fijo por marca · con comprobante
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowNueva(true)}
          className="rounded-md bg-black text-white px-3 py-2 text-sm active:scale-[0.97] transition"
        >
          + Nueva impulsadora
        </button>
      </div>

      {!loading && (items?.length ?? 0) > 0 && (
        <div className="text-sm text-gray-600">
          {pendientes === 0 ? (
            <span className="text-emerald-700">Todo al día este mes ✓</span>
          ) : (
            <span>
              <span className="font-semibold text-amber-700">{pendientes}</span> pendiente
              {pendientes === 1 ? "" : "s"} de pago este mes
            </span>
          )}
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 rounded-lg bg-gray-100 animate-pulse" />
          ))}
        </div>
      ) : (items?.length ?? 0) === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 p-8 text-center">
          <p className="text-sm text-gray-500">
            Aún no hay impulsadoras. Agrega la primera con “+ Nueva impulsadora”.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {items!.map((imp) => (
            <div
              key={imp.id}
              className="rounded-xl border border-gray-200 bg-white p-4 flex items-start gap-4"
            >
              <div className="shrink-0 h-11 w-11 rounded-full bg-gray-900 text-white flex items-center justify-center text-sm font-semibold">
                {iniciales(imp.nombre)}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-gray-900">{imp.nombre}</span>
                  {!imp.activa && (
                    <span className="rounded bg-gray-100 text-gray-500 text-xs px-1.5 py-0.5">
                      Inactiva
                    </span>
                  )}
                </div>
                <div className="text-[12px] text-gray-500 mt-0.5 truncate">
                  {imp.marcas.length > 0
                    ? imp.marcas.map((m) => `${m.marca.nombre} ${m.porcentaje}%`).join(" · ")
                    : "Sin marcas"}
                </div>
                <div className="mt-2 flex items-center gap-2 flex-wrap">
                  <ChipMes
                    label={etiquetaMes(imp.mesAnterior.mes)}
                    estado={imp.mesAnterior.estado}
                    faltan={imp.mesAnterior.faltan}
                  />
                  <ChipMes
                    label={etiquetaMes(imp.mesActual.mes)}
                    estado={imp.mesActual.estado}
                    faltan={imp.mesActual.faltan}
                  />
                </div>
                {/* Sin truncate: a 390px cortaba el año ("1–15 jul 202…").
                    Es una línea secundaria, que envuelva no molesta. */}
                {imp.ultimosPeriodos.length > 0 && (
                  <div className="text-[12px] text-gray-500 mt-1.5 leading-tight">
                    Pagado: {imp.ultimosPeriodos.join(" · ")}
                  </div>
                )}
              </div>

              <div className="shrink-0 text-right flex flex-col items-end gap-2">
                <div>
                  <div className="font-semibold text-gray-900 tabular-nums">
                    {formatearMonto(imp.monto_mensual)}
                  </div>
                  <div className="text-xs text-gray-400">/ mes</div>
                </div>
                {/* Con quincenas el mes anterior puede haber quedado a medias:
                    si falta algo en cualquiera de los dos meses, el botón está.
                    Antes solo miraba el mes actual y dejaba sin forma de cargar
                    la quincena que faltaba del mes pasado. */}
                {(!imp.mesActual.pagado || !imp.mesAnterior.pagado) && (
                  <button
                    type="button"
                    onClick={() => setPagando(imp)}
                    className="min-h-[44px] rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:border-black hover:text-black transition"
                  >
                    Registrar pago
                  </button>
                )}
                {/* Visible, no escondido en un menú "···": Daniel entró a
                    buscarlo y no lo encontró. Target táctil de 44px de alto y
                    de ancho para el pulgar en iPhone. */}
                <button
                  type="button"
                  onClick={() => setEliminando(imp)}
                  aria-label={`Eliminar a ${imp.nombre}`}
                  className="min-h-[44px] min-w-[44px] rounded-md px-3 py-1.5 text-sm text-gray-500 hover:text-red-600 hover:bg-red-50 active:scale-[0.97] transition"
                >
                  Eliminar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showNueva && (
        <NuevaImpulsadoraModal
          marcas={marcas}
          onClose={() => setShowNueva(false)}
          onCreated={() => {
            setShowNueva(false);
            cargar();
          }}
        />
      )}

      <ConfirmDeleteModal
        open={eliminando !== null}
        title={eliminando ? `¿Eliminar a ${eliminando.nombre}?` : ""}
        description={eliminando ? textoEliminar(eliminando).descripcion : ""}
        confirmLabel={eliminando ? textoEliminar(eliminando).confirmLabel : "Eliminar"}
        loadingLabel={
          eliminando && eliminando.pagosRegistrados > 0
            ? "Ocultando..."
            : "Eliminando..."
        }
        loading={borrando}
        onConfirm={confirmarEliminar}
        onCancel={() => {
          if (!borrando) setEliminando(null);
        }}
      />

      {pagando && (
        <RegistrarPagoModal
          impulsadora={pagando}
          // Arranca en el mes más viejo que todavía debe algo.
          mesInicial={
            pagando.mesAnterior.pagado ? pagando.mesActual.mes : pagando.mesAnterior.mes
          }
          onClose={() => setPagando(null)}
          onSaved={() => {
            setPagando(null);
            cargar();
          }}
        />
      )}
    </div>
  );
}
