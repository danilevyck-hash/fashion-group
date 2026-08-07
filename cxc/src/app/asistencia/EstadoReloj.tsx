"use client";

// ─────────────────────────────────────────────────────────────────────────────
// El cartel del reloj + el botón "Traer ahora".
//
// 🩸 EL BOTÓN NO LLAMA AL RELOJ, Y ESO SE DICE EN PANTALLA.
// El reloj está en la oficina detrás de una IP privada; esta pantalla corre en
// internet. Lo que hace el botón es DEJAR UN PEDIDO que el programita de la PC
// recoge en su vuelta siguiente (cada ~3 minutos). Por eso el texto dice
// "Pedido enviado… la PC lo recoge en un par de minutos" y no "actualizando":
// prometer lo que no se puede cumplir es cómo se pierde la confianza en un
// botón.
//
// ⚠️ Y POR ESO ESTE BOTÓN NO PUEDE GIRAR PARA SIEMPRE. Si la PC está apagada
// nadie va a recoger el pedido nunca. Pasados 7 minutos (dos vueltas y pico) el
// spinner se apaga y aparece qué hacer: prender la PC. Un spinner eterno es la
// forma más cara de no informar nada.
//
// Se reusa el LOOK de `SyncNowButton` (mismo borde, mismo alto de 44px, mismo
// ícono girando) pero no el componente: aquel dispara un sync y espera la
// respuesta en el mismo request, que es justo lo que acá no se puede hacer.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { useToast } from "@/components/ToastSystem";

interface RelojEnPantalla {
  dispositivo: string;
  salud: "nunca" | "al_dia" | "callado" | "con_error";
  titulo: string;
  detalle: string | null;
  pedidoPendiente: boolean;
  pedidoSinRespuesta: boolean;
  leidoHasta: string | null;
}

interface Respuesta {
  relojes: RelojEnPantalla[];
  faltaMigracion?: boolean;
  avisoMigracion?: string;
}

/** Cada cuánto se vuelve a preguntar mientras hay un pedido en el aire. 10s es
 *  suficiente: la vuelta del agente dura minutos, no segundos. */
const POLL_MS = 10_000;

const COLOR: Record<RelojEnPantalla["salud"], string> = {
  al_dia: "border-gray-200 bg-white",
  // Ámbar y no rojo: la PC apagada es un trámite de 10 segundos, no una avería.
  callado: "border-amber-200 bg-amber-50",
  con_error: "border-red-200 bg-red-50",
  nunca: "border-gray-200 bg-gray-50",
};

const PUNTO: Record<RelojEnPantalla["salud"], string> = {
  al_dia: "bg-emerald-500",
  callado: "bg-amber-500",
  con_error: "bg-red-500",
  nunca: "bg-gray-300",
};

export default function EstadoReloj({ onLlegaron }: { onLlegaron?: () => void }) {
  const { toast } = useToast();
  const [datos, setDatos] = useState<Respuesta | null>(null);
  // Arranca el spinner al instante, sin esperar el GET de vuelta. Se apaga
  // cuando el servidor confirma que el agente recogió el pedido.
  const [pidiendo, setPidiendo] = useState(false);

  const cargar = useCallback(async () => {
    try {
      const r = await fetch("/api/asistencia/reloj", { cache: "no-store" });
      if (!r.ok) return;
      setDatos((await r.json()) as Respuesta);
    } catch {
      /* la red se cae: el cartel se queda con lo último que supo */
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const reloj = datos?.relojes?.[0] ?? null;
  const esperando = pidiendo || !!reloj?.pedidoPendiente;
  const rendido = !!reloj?.pedidoSinRespuesta;

  // Mientras hay un pedido en el aire se pregunta cada 10s. Cuando el agente lo
  // recoge, `pedidoPendiente` se apaga y se avisa a la pantalla del reporte para
  // que recargue: si no, llegan marcaciones nuevas y la tabla sigue vieja — el
  // mismo error que hizo obligatorio `onSuccess` en SyncNowButton.
  const teniaPedido = useRef(false);
  useEffect(() => {
    if (reloj?.pedidoPendiente) teniaPedido.current = true;
    else if (teniaPedido.current) {
      teniaPedido.current = false;
      setPidiendo(false);
      toast("Listo, ya trajo las marcaciones", "success");
      onLlegaron?.();
    }
  }, [reloj?.pedidoPendiente, onLlegaron, toast]);

  useEffect(() => {
    if (!esperando || rendido) return;
    const t = setInterval(() => void cargar(), POLL_MS);
    return () => clearInterval(t);
  }, [esperando, rendido, cargar]);

  async function pedir() {
    setPidiendo(true);
    try {
      const r = await fetch("/api/asistencia/reloj", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dispositivo: reloj?.dispositivo }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d?.error ?? "No se pudo enviar el pedido");
      await cargar();
    } catch (e) {
      setPidiendo(false);
      toast(e instanceof Error ? e.message : "No se pudo enviar el pedido", "error");
    }
  }

  if (!reloj) return null;

  const faltaMigracion = !!datos?.faltaMigracion;
  // Cuando ya se dio por vencido SÍ se puede volver a apretar: el usuario acaba
  // de prender la PC y quiere que sea ahora, no en la vuelta que le toque.
  const puedePedir = !faltaMigracion && (!esperando || rendido);

  return (
    <div className={`rounded-lg border p-3 ${COLOR[reloj.salud]}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-[200px] flex-1">
          <p className="flex items-center gap-2 text-sm font-medium text-gray-900">
            <span className={`h-2 w-2 shrink-0 rounded-full ${PUNTO[reloj.salud]}`} />
            {reloj.titulo}
          </p>
          {reloj.detalle && (
            <p className="mt-1 text-[13px] leading-relaxed text-gray-600">{reloj.detalle}</p>
          )}

          {/* El estado del pedido, en tres frases posibles y ninguna ambigua. */}
          {rendido ? (
            <p className="mt-1 text-[13px] font-medium text-amber-800">
              La PC de la oficina no ha recogido el pedido. Revisa que esté prendida — el pedido
              queda guardado y se cumple solo cuando vuelva.
            </p>
          ) : esperando ? (
            <p className="mt-1 text-[13px] text-gray-600">
              Pedido enviado. La PC de la oficina lo recoge en un par de minutos.
            </p>
          ) : null}

          {faltaMigracion && (
            <p className="mt-1 text-[13px] text-amber-800">{datos?.avisoMigracion}</p>
          )}
        </div>

        <button
          type="button"
          onClick={() => void pedir()}
          disabled={!puedePedir}
          title={faltaMigracion ? (datos?.avisoMigracion ?? undefined) : undefined}
          className="inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 transition hover:bg-gray-50 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${esperando && !rendido ? "animate-spin" : ""}`} />
          {esperando && !rendido ? "Esperando a la PC…" : "Traer ahora"}
        </button>
      </div>
    </div>
  );
}
