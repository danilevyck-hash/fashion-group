"use client";

// ─────────────────────────────────────────────────────────────────────────────
// El cartel del reloj + el botón "Traer ahora". UNA TARJETA POR RELOJ.
//
// 🩸 DIBUJABA SOLO `relojes[0]` — el primero de la lista y nada más.
// Con un reloj eso no se notaba. Desde el 10-sep-2026 la misma PC lee DOS (el
// de Confecciones Boston y el de Multifashion) y el segundo habría quedado
// INVISIBLE: su cartel nunca se pinta, su "Traer ahora" no existe, y el día que
// el túnel WireGuard se caiga la pantalla seguiría diciendo 🟢 con el reloj de
// Multifashion mudo. La lista viene entera del servidor desde siempre; lo único
// que faltaba era dibujarla.
//
// ⚠️ CON UN SOLO RELOJ LA PANTALLA NO CAMBIA NI UN PÍXEL: el nombre del reloj
// se muestra solo cuando hay más de uno. Un rótulo que sale siempre es una
// palabra de más pegada a un dato.
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

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { useToast } from "@/components/ToastSystem";
import { nombreRelojEnPantalla } from "@/lib/asistencia/agente";

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
  // cuando el servidor confirma que el agente recogió el pedido. Es una LISTA
  // porque cada reloj tiene su propio botón y se pueden apretar los dos.
  const [pidiendo, setPidiendo] = useState<string[]>([]);

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

  const relojes = useMemo(() => datos?.relojes ?? [], [datos]);

  // Huella de "quién tiene un pedido en el aire". Se compara como texto para
  // que el efecto no se dispare en cada render por un arreglo nuevo.
  const huella = relojes
    .map((r) => `${r.dispositivo}:${r.pedidoPendiente ? 1 : 0}`)
    .join("|");

  // Cuando el agente recoge el pedido, `pedidoPendiente` se apaga y se avisa a
  // la pantalla del reporte para que recargue: si no, llegan marcaciones nuevas
  // y la tabla sigue vieja — el mismo error que hizo obligatorio `onSuccess` en
  // SyncNowButton.
  const teniaPedido = useRef<string[]>([]);
  useEffect(() => {
    const conPedido = relojes.filter((r) => r.pedidoPendiente).map((r) => r.dispositivo);
    const cumplidos = teniaPedido.current.filter((d) => !conPedido.includes(d));
    teniaPedido.current = conPedido;
    if (cumplidos.length === 0) return;
    setPidiendo((p) => p.filter((d) => !cumplidos.includes(d)));
    toast("Listo, ya trajo las marcaciones", "success");
    onLlegaron?.();
    // `huella` es la dependencia real: `relojes` cambia de identidad en cada
    // render y volvería a entrar sin que nada haya pasado.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [huella]);

  // Se sigue preguntando mientras QUEDE algún pedido que todavía puede cumplirse.
  const esperandoAlguno = relojes.some(
    (r) => (r.pedidoPendiente || pidiendo.includes(r.dispositivo)) && !r.pedidoSinRespuesta,
  );
  useEffect(() => {
    if (!esperandoAlguno) return;
    const t = setInterval(() => void cargar(), POLL_MS);
    return () => clearInterval(t);
  }, [esperandoAlguno, cargar]);

  const pedir = useCallback(
    async (dispositivo: string) => {
      setPidiendo((p) => (p.includes(dispositivo) ? p : [...p, dispositivo]));
      try {
        const r = await fetch("/api/asistencia/reloj", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dispositivo }),
        });
        const d = await r.json();
        if (!r.ok) throw new Error(d?.error ?? "No se pudo enviar el pedido");
        await cargar();
      } catch (e) {
        setPidiendo((p) => p.filter((x) => x !== dispositivo));
        toast(e instanceof Error ? e.message : "No se pudo enviar el pedido", "error");
      }
    },
    [cargar, toast],
  );

  if (relojes.length === 0) return null;

  const faltaMigracion = !!datos?.faltaMigracion;

  return (
    <div className="space-y-2">
      {relojes.map((reloj) => (
        <TarjetaReloj
          key={reloj.dispositivo}
          reloj={reloj}
          // El nombre del reloj solo hace falta cuando hay más de uno.
          conNombre={relojes.length > 1}
          pidiendo={pidiendo.includes(reloj.dispositivo)}
          faltaMigracion={faltaMigracion}
          avisoMigracion={datos?.avisoMigracion ?? null}
          onPedir={() => void pedir(reloj.dispositivo)}
        />
      ))}
    </div>
  );
}

function TarjetaReloj({
  reloj,
  conNombre,
  pidiendo,
  faltaMigracion,
  avisoMigracion,
  onPedir,
}: {
  reloj: RelojEnPantalla;
  conNombre: boolean;
  pidiendo: boolean;
  faltaMigracion: boolean;
  avisoMigracion: string | null;
  onPedir: () => void;
}) {
  const esperando = pidiendo || reloj.pedidoPendiente;
  const rendido = reloj.pedidoSinRespuesta;
  // Cuando ya se dio por vencido SÍ se puede volver a apretar: el usuario acaba
  // de prender la PC y quiere que sea ahora, no en la vuelta que le toque.
  const puedePedir = !faltaMigracion && (!esperando || rendido);

  // 🔴 UNA SOLA LÍNEA POR RELOJ (10-sep-2026). Daniel, textual: *«debe de ser
  // más chico, que no estorbe tanto»*. El punto, el nombre (si hay dos), el
  // título y el estado del pedido van en un renglón; el párrafo explicativo
  // pasó a un «?» con el texto al pasar el cursor o al tocarlo. ⚠️ El error del
  // reloj (`con_error`) SÍ se queda a la vista: es lo que dice qué revisar.
  // Nada de la lógica cambió.
  const estado = rendido
    ? "La PC de la oficina no ha recogido el pedido: revisa que esté prendida."
    : esperando
      ? "Pedido enviado, la PC lo recoge en unos minutos."
      : null;
  const explicacion = reloj.salud === "con_error" ? null : reloj.detalle;

  return (
    <div className={`rounded-lg border px-3 py-1.5 ${COLOR[reloj.salud]}`}>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <p className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-0.5 text-[13px] text-gray-900">
          <span className={`h-2 w-2 shrink-0 rounded-full ${PUNTO[reloj.salud]}`} />
          {conNombre && (
            <span className="font-semibold uppercase tracking-wide text-[11px] text-gray-500">
              {nombreRelojEnPantalla(reloj.dispositivo)}
            </span>
          )}
          <span className="font-medium">{reloj.titulo}</span>
          {explicacion && (
            <span
              tabIndex={0}
              title={explicacion}
              aria-label={explicacion}
              className="inline-flex h-5 w-5 shrink-0 cursor-help items-center justify-center rounded-full border border-gray-300 text-[11px] text-gray-500"
            >
              ?
            </span>
          )}
          {reloj.salud === "con_error" && reloj.detalle && (
            <span className="text-[12px] text-red-800">{reloj.detalle}</span>
          )}
          {estado && (
            <span className={`text-[12px] ${rendido ? "font-medium text-amber-800" : "text-gray-600"}`}>
              {estado}
            </span>
          )}
          {faltaMigracion && <span className="text-[12px] text-amber-800">{avisoMigracion}</span>}
        </p>

        <button
          type="button"
          onClick={onPedir}
          disabled={!puedePedir}
          title={faltaMigracion ? (avisoMigracion ?? undefined) : undefined}
          className="inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 transition hover:bg-gray-50 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${esperando && !rendido ? "animate-spin" : ""}`} />
          {esperando && !rendido ? "Esperando a la PC…" : "Traer ahora"}
        </button>
      </div>
    </div>
  );
}
