"use client";

import { useCallback, useEffect, useState } from "react";
import HistorialImpulsadoraModal from "./HistorialImpulsadoraModal";
import { useToast } from "@/components/ToastSystem";
import { ConfirmDeleteModal } from "@/components/ui";
import { formatearMonto } from "@/lib/marketing/normalizar";
import { etiquetaMes } from "@/lib/marketing/meses";
import { resumenDeLoQueDebe, type MesSinPagar } from "@/lib/marketing/meses-sin-pagar";
import { ZIP_E_IMPULSADORAS_NUEVO } from "@/lib/marketing/zip-e-impulsadoras";
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
  /** false = contabilidad: solo mira. Sin «+ Nueva», «Registrar pago» ni «Eliminar»
   *  (24-sep-2026; el servidor ya los rechazaba con 403, la pantalla los mostraba igual). */
  escribe?: boolean;
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

// 🔴 TODOS LOS MESES SIN PAGAR, EL MÁS VIEJO ARRIBA (22-sep-2026).
//
// 🩸 La tarjeta mostraba DOS chips —mes anterior y mes actual— y un mes sin
// pagar más viejo que eso no aparecía en ninguna parte. Medido contra
// producción: Ana Trejos debía julio de 2026 y la pantalla no lo decía.
//
// Se dibujan los 6 más viejos y el resto se pliega detrás de un botón que DICE
// cuántos son: veinticuatro chips de corrido tapan el monto y los botones.
const MESES_A_LA_VISTA = 6;

function MesesQueDebe({ meses }: { meses: ReadonlyArray<MesSinPagar> }) {
  const [todos, setTodos] = useState(false);
  if (meses.length === 0) {
    return <span className="text-xs text-emerald-700">Sin meses pendientes ✓</span>;
  }
  const visibles = todos ? meses : meses.slice(0, MESES_A_LA_VISTA);
  const ocultos = meses.length - visibles.length;
  return (
    <div className="space-y-1.5">
      <div className="text-[12px] font-medium text-amber-800">
        {resumenDeLoQueDebe(meses, (m) => etiquetaMes(m).toLowerCase())}
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        {visibles.map((m) => (
          <ChipMes key={m.mes} label={etiquetaMes(m.mes)} estado={m.estado} faltan={m.faltan} />
        ))}
        {ocultos > 0 && (
          <button
            type="button"
            onClick={() => setTodos(true)}
            className="rounded-full border border-gray-300 px-2 py-0.5 text-xs text-gray-600 hover:border-black hover:text-black transition"
          >
            Ver los otros {ocultos}
          </button>
        )}
      </div>
    </div>
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

export default function ImpulsadorasView({ marcas, escribe = true }: Props) {
  const { toast } = useToast();
  const [items, setItems] = useState<ImpulsadoraConEstado[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [showNueva, setShowNueva] = useState(false);
  const [pagando, setPagando] = useState<ImpulsadoraConEstado | null>(null);
  const [eliminando, setEliminando] = useState<ImpulsadoraConEstado | null>(null);
  const [viendo, setViendo] = useState<ImpulsadoraConEstado | null>(null);
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

  // 🩸 Decía «Todo al día este mes ✓» mirando SOLO el mes actual, con meses
  // viejos sin pagar debajo. Con el interruptor nuevo cuenta a quien debe
  // CUALQUIER mes, que es lo que hay que ir a pagar.
  const pendientes = (items ?? []).filter((i) =>
    i.activa &&
    (ZIP_E_IMPULSADORAS_NUEVO ? (i.mesesSinPagar ?? []).length > 0 : !i.mesActual.pagado),
  ).length;

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Impulsadoras</h1>
        </div>
        {escribe && (
          <button
            type="button"
            onClick={() => setShowNueva(true)}
            className="rounded-md bg-black text-white px-3 py-2 text-sm active:scale-[0.97] transition"
          >
            + Nueva impulsadora
          </button>
        )}
      </div>

      {!loading && (items?.length ?? 0) > 0 && (
        <div className="text-sm text-gray-600">
          {pendientes === 0 ? (
            <span className="text-emerald-700">
              {ZIP_E_IMPULSADORAS_NUEVO ? "Todo al día ✓" : "Todo al día este mes ✓"}
            </span>
          ) : (
            <span>
              <span className="font-semibold text-amber-700">{pendientes}</span>{" "}
              {ZIP_E_IMPULSADORAS_NUEVO
                ? `con meses sin pagar`
                : `pendiente${pendientes === 1 ? "" : "s"} de pago este mes`}
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
          <p className="text-sm text-gray-500">Aún no hay impulsadoras.</p>
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
                <div className="mt-2">
                  {ZIP_E_IMPULSADORAS_NUEVO ? (
                    <MesesQueDebe meses={imp.mesesSinPagar ?? []} />
                  ) : (
                    <div className="flex items-center gap-2 flex-wrap">
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
                  )}
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
                {/* Con el interruptor nuevo el botón está mientras quede UN
                    mes sin pagar, por viejo que sea — que es de lo que se
                    trata: un mes de hace cinco meses también se paga. */}
                {escribe && (ZIP_E_IMPULSADORAS_NUEVO
                  ? (imp.mesesSinPagar ?? []).length > 0
                  : !imp.mesActual.pagado || !imp.mesAnterior.pagado) && (
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
                {/* Daniel: "quiero ver y editar el historial". Antes no había
                    forma de llegar a los pagos guardados desde la tarjeta. */}
                <button
                  type="button"
                  onClick={() => setViendo(imp)}
                  className="min-h-[44px] rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:border-black hover:text-black active:scale-[0.97] transition"
                >
                  Ver historial
                </button>
                {escribe && (
                <button
                  type="button"
                  onClick={() => setEliminando(imp)}
                  aria-label={`Eliminar a ${imp.nombre}`}
                  className="min-h-[44px] min-w-[44px] rounded-md px-3 py-1.5 text-sm text-gray-500 hover:text-red-600 hover:bg-red-50 active:scale-[0.97] transition"
                >
                  Eliminar
                </button>
                )}
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
          // Arranca en el mes más viejo que todavía debe algo. Con el
          // interruptor nuevo ese mes es el primero de la lista completa, no
          // el más viejo de los dos que se miraban antes.
          mesInicial={
            (ZIP_E_IMPULSADORAS_NUEVO && (pagando.mesesSinPagar ?? [])[0]?.mes) ||
            (pagando.mesAnterior.pagado ? pagando.mesActual.mes : pagando.mesAnterior.mes)
          }
          onClose={() => setPagando(null)}
          onSaved={() => {
            setPagando(null);
            cargar();
          }}
        />
      )}

      {viendo && (
        <HistorialImpulsadoraModal
          impulsadora={viendo}
          onClose={() => setViendo(null)}
          // Anular un pago o cambiar el monto mueve los chips y el "Pagado:"
          // de la tarjeta, así que la lista se recarga sin cerrar el modal.
          onChanged={() => cargar()}
        />
      )}
    </div>
  );
}
