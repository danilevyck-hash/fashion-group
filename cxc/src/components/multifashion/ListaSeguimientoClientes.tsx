"use client";

// ─────────────────────────────────────────────────────────────────────────────
// MULTIFASHION › CLIENTES — la lista de seguimiento y postventa (16-sep-2026).
//
// Daniel: *«quiero que Jennifer pueda entrar para poder hacerle seguimiento a
// los clientes que han comprado, con botón para escribirle al whatsapp»* y,
// cuando vio el primer mockup de siete columnas, *«¿no prefieres mantenerlo más
// minimalista para vendedoras de tercer mundo?»* · *«una vendedora no ordena:
// abre y baja»*.
//
// 🔴 LA FILA LLEVA CUATRO COSAS Y NADA MÁS: el nombre, hace cuántos días no
// compra, si ya le escribieron y el botón de WhatsApp.
//
// 🔴 UNA SOLA FILA, IGUAL EN EL TELÉFONO Y EN LA COMPUTADORA. Acá NO se repite
// el patrón de «tabla ancha en escritorio, tarjetas en celular» que sí usa la
// sección de Mayoreo: ese patrón existe para tablas de seis o más columnas, y
// esta lista tiene cuatro cosas que entran en 356 px. Dos diseños para la misma
// lista son dos cosas que se pueden desincronizar.
//
// 🔴 NO HAY ORDEN POR ENCABEZADO, y no es un olvido. ⚠️ REEMPLAZA lo que Daniel
// pidió el 15-sep («sort última compra»): al ver el mockup cambió de opinión.
// La lista viene del que más tiempo lleva sin comprar y no se reordena.
//
// 🔴 SIN TELÉFONO NO SE DIBUJA EL BOTÓN. No se inventa un número ni se deja un
// botón muerto. Medido el 16-sep-2026: de 967 clientes con compras, **105 no
// tienen teléfono** en el maestro de Switch.
//
// El orden, los chips y los textos viven en `lib/multifashion/clientes-
// seguimiento.ts` (módulo PURO). Acá solo está el dibujo.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useMemo, useState } from "react";
import useSWR from "swr";
import { Card } from "@/components/ui/card";
import { MessageCircle, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { fmtMoney } from "@/lib/ventas/format";
import { useUrlState } from "@/lib/hooks/useUrlState";
import { nombreEnPantalla } from "@/lib/multifashion/nombres";
import { FILAS_CLIENTES_AL_ABRIR } from "@/lib/multifashion/clientes-cobertura";
import type { ClienteUniverso } from "@/lib/multifashion/clientes-universo";
import type { UltimoContacto } from "@/lib/multifashion/contacto-registro";
import {
  CHIPS,
  CHIP_INICIAL,
  ROTULO_CHIP,
  conteoPorChip,
  esChip,
  lineaDelRenglon,
  listaDeSeguimiento,
  type Chip,
} from "@/lib/multifashion/clientes-seguimiento";

interface RespuestaContactos {
  hoy: string;
  porCliente: Record<string, UltimoContacto>;
}

interface Props {
  /** El universo completo, tal como lo devuelve `/api/multifashion/fidelizacion`. */
  clientes: ClienteUniverso[];
  /** La fecha de PANAMÁ del servidor. Nunca la del navegador. */
  hoy: string;
}

export function ListaSeguimientoClientes({ clientes, hoy }: Props) {
  // El chip vive en la URL: un enlace a «los que no vuelven» se puede compartir
  // y el back del navegador no cicla por los chips (van con `replace`).
  const [chipUrl, setChip] = useUrlState<string>("mfCliChip", CHIP_INICIAL);
  const chip: Chip = esChip(chipUrl) ? chipUrl : CHIP_INICIAL;

  const [abierto, setAbierto] = useState<number | null>(null);
  const [verTodos, setVerTodos] = useState(false);

  // El rastro de a quién ya le escribió la TIENDA. Es otra ruta a propósito:
  // el universo lo sirve la fidelización y esto se escribe con cada mensaje.
  const { data: contactos, mutate: mutarContactos } = useSWR<RespuestaContactos>(
    "multifashion-contactos",
    async () => {
      const r = await fetch("/api/multifashion/contactos", { cache: "no-store" });
      if (!r.ok) throw new Error(`contactos HTTP ${r.status}`);
      return r.json();
    },
    { dedupingInterval: 60_000, revalidateOnFocus: false },
  );

  const conteos = useMemo(() => conteoPorChip(clientes), [clientes]);
  const lista = useMemo(() => listaDeSeguimiento(clientes, chip), [clientes, chip]);

  const recorta = !verTodos && lista.length > FILAS_CLIENTES_AL_ABRIR;
  const visibles = recorta ? lista.slice(0, FILAS_CLIENTES_AL_ABRIR) : lista;

  const cambiarChip = (c: Chip) => {
    setChip(c);
    setVerTodos(false);
    setAbierto(null);
  };

  /**
   * Se anota que se le escribió. UI optimista: la marca aparece al toque y, si
   * el servidor no pudo anotarla, se quita sola.
   *
   * ⚠️ No se bloquea nada esperando esta respuesta: el mensaje ya salió por
   * WhatsApp. Lo único que se pierde si falla es la marca gris.
   */
  const anotarContacto = useCallback(async (id: number) => {
    const antes = contactos;
    const optimista: RespuestaContactos = {
      hoy: contactos?.hoy ?? hoy,
      porCliente: {
        ...(contactos?.porCliente ?? {}),
        [String(id)]: { canal: "whatsapp", fecha: hoy },
      },
    };
    await mutarContactos(optimista, { revalidate: false });
    try {
      const r = await fetch("/api/multifashion/contactos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cliente_switch_id: id, canal: "whatsapp" }),
      });
      const cuerpo = await r.json().catch(() => ({}));
      // `sinTabla` = la migración todavía no corrió. El mensaje salió igual.
      if (!r.ok || cuerpo?.sinTabla) await mutarContactos(antes, { revalidate: false });
    } catch {
      await mutarContactos(antes, { revalidate: false });
    }
  }, [contactos, hoy, mutarContactos]);

  return (
    <section className="space-y-3">
      <div>
        <h3 className="font-display text-sm font-semibold text-gray-950">Clientes identificados</h3>
        <p className="text-xs text-gray-500">
          {conteos.todos.toLocaleString()} con nombre y compras · toca el nombre para ver su ficha
        </p>
      </div>

      <Card className="overflow-hidden p-0">
        {/* LOS TRES CHIPS. «Frecuentes» se retiró: el que compra seguido no
            necesita que lo busquen. Las TARJETAS de arriba no se tocaron. */}
        <div className="flex flex-wrap items-center gap-1.5 border-b border-gray-100 px-3 py-2">
          {CHIPS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => cambiarChip(c)}
              aria-pressed={chip === c}
              className={cn(
                "inline-flex min-h-[44px] items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition",
                chip === c
                  ? "border-teal-700 bg-teal-700 text-white"
                  : "border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:text-gray-900",
              )}
            >
              {ROTULO_CHIP[c]}
              <span className={cn("font-mono tabular-nums", chip === c ? "text-white/80" : "text-gray-400")}>
                {conteos[c].toLocaleString()}
              </span>
            </button>
          ))}
        </div>

        {lista.length === 0 ? (
          <p className="px-3 py-8 text-center text-xs text-gray-500">
            Ningún cliente cae en &quot;{ROTULO_CHIP[chip]}&quot;.
          </p>
        ) : (
          visibles.map((c) => (
            <FilaCliente
              key={c.cliente_switch_id}
              cliente={c}
              ultimoContacto={contactos?.porCliente?.[String(c.cliente_switch_id)] ?? null}
              hoy={hoy}
              abierta={abierto === c.cliente_switch_id}
              onAbrir={() => setAbierto((p) => (p === c.cliente_switch_id ? null : c.cliente_switch_id))}
              onEscribir={() => { void anotarContacto(c.cliente_switch_id); }}
            />
          ))
        )}
      </Card>

      {recorta && (
        <button
          type="button"
          onClick={() => setVerTodos(true)}
          className="inline-flex min-h-[44px] items-center rounded-md border border-gray-200 bg-white px-3 text-xs font-medium text-gray-700 transition hover:border-gray-300 hover:text-gray-950 active:scale-[0.97]"
        >
          Ver los {lista.length}
        </button>
      )}
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function FilaCliente({
  cliente, ultimoContacto, hoy, abierta, onAbrir, onEscribir,
}: {
  cliente: ClienteUniverso;
  ultimoContacto: UltimoContacto | null;
  hoy: string;
  abierta: boolean;
  onAbrir: () => void;
  onEscribir: () => void;
}) {
  const linea = lineaDelRenglon(cliente, ultimoContacto, hoy);

  return (
    <div className="border-t border-gray-100 first:border-t-0">
      <div className="flex items-center gap-2 px-3">
        {/* Tocar el NOMBRE abre su ficha. Es el blanco grande de la fila. */}
        <button
          type="button"
          onClick={onAbrir}
          aria-expanded={abierta}
          className="flex min-h-[52px] min-w-0 flex-1 items-center gap-2 py-2 text-left active:bg-gray-50"
        >
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-gray-900">
              {nombreEnPantalla(cliente.nombre)}
            </span>
            <span className="mt-0.5 block truncate text-xs">
              {/* Ámbar = la urgencia. Gris = el aviso para no repetir. */}
              <span className="font-medium text-amber-700">{linea.dias}</span>
              {linea.contacto && <span className="text-gray-400"> · {linea.contacto}</span>}
            </span>
          </span>
          <ChevronDown
            className={cn("h-3.5 w-3.5 shrink-0 text-gray-300 transition-transform", abierta && "rotate-180")}
          />
        </button>

        {/* 🔴 SIN TELÉFONO NO SE DIBUJA EL BOTÓN. Nada ocupa su lugar: un hueco
            se lee mejor que un botón apagado que no se sabe por qué no anda. */}
        {cliente.telefono_wa && (
          <a
            href={cliente.telefono_wa}
            target="_blank"
            rel="noopener noreferrer"
            onClick={onEscribir}
            className="inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 text-xs font-medium text-emerald-700 transition hover:bg-emerald-100 active:scale-[0.97]"
          >
            <MessageCircle className="h-4 w-4" />
            WhatsApp
          </a>
        )}
      </div>

      {abierta && <FichaDelCliente cliente={cliente} />}
    </div>
  );
}

/**
 * La ficha, a un toque. Daniel: lo que salió de la fila no se pierde, se mueve
 * acá — *«cuánto compró, cuántas veces y la fecha exacta»*. Lo miran él y
 * Jennifer, no quien está atendiendo.
 */
function FichaDelCliente({ cliente }: { cliente: ClienteUniverso }) {
  return (
    <dl className="flex flex-wrap gap-x-6 gap-y-2 border-t border-gray-100 bg-gray-50/50 px-3 py-2.5">
      <Dato rotulo="Compró" valor={fmtMoney(cliente.total_comprado)} />
      <Dato
        rotulo="Veces"
        valor={`${cliente.visitas.toLocaleString()} ${cliente.visitas === 1 ? "visita" : "visitas"}`}
      />
      <Dato rotulo="Última compra" valor={fechaLarga(cliente.ultima_compra)} />
      {cliente.estado5 === "disponible" && <Dato rotulo="5%" valor="Disponible" />}
      {cliente.estado5 === "usado" && <Dato rotulo="5%" valor="Ya lo usó" />}
    </dl>
  );
}

function Dato({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div>
      <dt className="text-xs text-gray-400">{rotulo}</dt>
      <dd className="font-mono text-sm tabular-nums text-gray-900">{valor}</dd>
    </div>
  );
}

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** «7 jul 2026». La fecha se parte a mano: `new Date(iso)` la corre un día. */
function fechaLarga(iso: string | null): string {
  if (!iso) return "—";
  const [a, m, d] = iso.slice(0, 10).split("-").map(Number);
  if (!a || !m || !d) return "—";
  return `${d} ${MESES[m - 1]} ${a}`;
}
