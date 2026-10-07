"use client";

// ─────────────────────────────────────────────────────────────────────────────
// EL DETALLE DE UN PEDIDO, CON SUS BULTOS (6-oct-2026, `PEDIDOS_BULTOS_2026_10`)
//
// La pregunta de la pantalla: «¿en qué bulto va cada cosa de este pedido?».
//
// Se ve como el PDF de pedido de Switch, SIN «Código barra» ni «Referencia»
// —que el API no manda, medido—:
//   Bulto · Código · Descripción · Cantidad · Precio · Total
//
// 🔴 ASIGNAR UN BULTO SON DOS PASOS, NO CUATRO (Daniel, 7-oct-2026: *«¿por qué
// clic en las celdas, después asignar bulto, después ponerlo y después asignar?
// ¿pueden haber menos pasos?»*). Eran cuatro; quedan dos caminos de dos:
//   · UNA fila: se escribe el número en la casilla que ya tiene la fila y con
//     salir de ella queda asignado. Sin marcar nada y sin ninguna ventana.
//     La casilla está en las DOS pantallas: antes el celular veía un chip
//     quieto y tenía que pasar por las casillas y el botón.
//   · VARIAS filas: se marcan y el número se escribe EN LA MISMA barra de
//     abajo («Bulto [ 3 ] · Asignar»). Se fue el paso intermedio de tocar
//     «Asignar bulto» para que apareciera el campo.
// Arriba se lee «18 de 24 artículos asignados · 6 bultos».
//
// 🔴 Y LA LISTA TERMINA CON COLCHÓN: la barra de abajo no tapa la última fila
// (Daniel: *«no se ve lo de abajo»*). Es el `ALTO_COLCHON_DE_ABAJO` de la casa.
//
// 🔴 VERIFICADO = CONGELADO (7-oct-2026): con el pedido verificado las casillas
// no se dibujan y el servidor rechaza el PATCH. Para cambiar bultos, la
// secretaria lo devuelve a «Preparado».
//
// 🔑 Lo medido: 416 bultos y 56 líneas en un envío real. Por eso el bulto se
// ESCRIBE en un campo angosto (regla 9 de `docs/diseno.md`) y no se elige de una
// lista de 416; y por eso la barra de abajo es UNA sola acción, con el resultado
// en vivo (regla 3).
//
// 🔑 Talla y color van DENTRO de la descripción: Switch no los manda aparte y
// así se muestran.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ChevronDown, Printer } from "lucide-react";
import { useToast } from "@/components/ToastSystem";
import { Aviso } from "@/components/ui/Aviso";
import { ALTO_COLCHON_DE_ABAJO, useHayBarraCelular } from "@/components/celular/BarraDeControles";
import { usePublicarAltoBarraFija } from "@/lib/navegacion/useBarraFijaAbajo";
import { descargarArchivo } from "@/lib/compartir-archivo";
import { fmt } from "@/lib/format";
import {
  COLUMNAS_DETALLE,
  MAX_BULTO,
  MIN_BULTO,
  descripcionCompleta,
  resumenAsignacion,
  validarBulto,
  type LineaPedido,
} from "@/lib/guias/pedidos-bultos";

export interface PedidoDelDetalle {
  empresa_key: string;
  pedido_switch_id: number;
  secuencial: string;
  cliente_codigo: string;
  cliente_nombre: string;
}

interface Respuesta {
  lineas: LineaPedido[];
  resumen: string;
  sinTabla: boolean;
  error?: string;
}

export default function PedidoBultos({
  pedido,
  puedePoner,
  verificado = false,
  onVolver,
}: {
  pedido: PedidoDelDetalle;
  /**
   * Bodega pone bultos; quien solo mira ve la columna, quieta. 🔴 El vendedor
   * NUNCA la puede poner: antes veía la casilla prendida y el servidor le
   * contestaba 403 (`puedeMarcarPedidos`, 7-oct-2026).
   */
  puedePoner: boolean;
  /** 🔴 Verificado = congelado: el detalle ya no se toca (7-oct-2026). */
  verificado?: boolean;
  onVolver: () => void;
}) {
  const { toast } = useToast();
  const barraCelular = useHayBarraCelular();
  const [lineas, setLineas] = useState<LineaPedido[] | null>(null);
  const [sinTabla, setSinTabla] = useState(false);
  const [error, setError] = useState(false);
  const [marcadas, setMarcadas] = useState<ReadonlySet<number>>(new Set());
  const [imprimirAbierto, setImprimirAbierto] = useState(false);
  const [numero, setNumero] = useState("");
  const [guardando, setGuardando] = useState(false);
  // Lo tecleado en cada celda mientras no se guarda (la verdad sigue en `lineas`).
  const [enCelda, setEnCelda] = useState<Record<number, string>>({});
  // La barra de abajo publica su alto para que el ☰ redondo del celular se le
  // suba encima (`useBarraFijaAbajo`), como las otras cinco barras negras.
  const barraRef = useRef<HTMLDivElement | null>(null);
  usePublicarAltoBarraFija(barraRef, puedePoner && marcadas.size > 0);

  const clave = `empresa_key=${encodeURIComponent(pedido.empresa_key)}&pedido_switch_id=${pedido.pedido_switch_id}`;

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const r = await fetch(`/api/guias/pedidos/detalle?${clave}`, { cache: "no-store" });
        if (!r.ok) throw new Error(String(r.status));
        const d = (await r.json()) as Respuesta;
        if (!vivo) return;
        setLineas(d.lineas);
        setSinTabla(d.sinTabla);
        setError(false);
      } catch {
        if (vivo) setError(true);
      }
    })();
    return () => {
      vivo = false;
    };
  }, [clave]);

  const resumen = useMemo(() => (lineas ? resumenAsignacion(lineas) : ""), [lineas]);
  // 🔴 Las columnas de plata se dibujan solo si el SERVIDOR las mandó. A bodega
  // no le viajan, así que acá no hay nada que esconder: no están.
  const conPlata = !!lineas?.some((l) => l.precio != null);

  function alternar(id: number) {
    setMarcadas((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  function marcarTodas(todas: boolean) {
    setMarcadas(todas ? new Set((lineas ?? []).map((l) => l.codigo_barra_id)) : new Set());
  }

  /** `bulto: null` = quitar del bulto. */
  async function guardar(bulto: number | null) {
    setGuardando(true);
    try {
      const r = await fetch("/api/guias/pedidos/detalle", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          empresa_key: pedido.empresa_key,
          pedido_switch_id: pedido.pedido_switch_id,
          codigo_barra_ids: [...marcadas],
          bulto,
        }),
      });
      const d = (await r.json().catch(() => null)) as Respuesta | null;
      if (!r.ok) throw new Error(d?.error ?? String(r.status));
      setLineas(d?.lineas ?? []);
      setMarcadas(new Set());
      setNumero("");
      toast(bulto == null ? "Bulto quitado" : `Bulto ${bulto} asignado`, "success");
    } catch (e) {
      toast(e instanceof Error && e.message.length < 90 ? e.message : "No se pudo guardar el bulto. Intenta de nuevo.", "error");
    } finally {
      setGuardando(false);
    }
  }

  /**
   * 🔴 EL PRIMER CAMINO DE DOS PASOS (Daniel, 6 y 7-oct-2026): el número del
   * bulto se escribe DIRECTO en la casilla de la fila y con Tab se pasa a la
   * siguiente, sin marcar nada y sin abrir ninguna ventana. Se guarda al salir
   * de la casilla o con Enter —no en cada tecla—, así escribir «416» es UNA
   * llamada y no tres.
   * 🔴 7-oct-2026: la casilla está TAMBIÉN en el celular. Antes ahí se veía un
   * chip quieto y el único camino eran las casillas de la izquierda más el
   * botón de abajo: cuatro toques para una sola fila.
   */
  async function guardarUna(id: number, texto: string) {
    const crudo = texto.trim();
    const linea = (lineas ?? []).find((x) => x.codigo_barra_id === id);
    const antes = linea?.bulto ?? null;
    // Vaciar la casilla saca la línea de su bulto; escribir lo mismo no hace nada.
    const bulto = crudo === "" ? null : Number(crudo);
    if (bulto === antes) return;
    if (crudo !== "") {
      const v = validarBulto(crudo);
      if (!v.ok) {
        toast(v.error, "warning");
        setEnCelda((m) => ({ ...m, [id]: antes == null ? "" : String(antes) }));
        return;
      }
    }
    // Optimista: el número queda puesto mientras viaja, y se revierte si falla.
    setLineas((xs) => (xs ?? []).map((x) => (x.codigo_barra_id === id ? { ...x, bulto } : x)));
    try {
      const r = await fetch("/api/guias/pedidos/detalle", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          empresa_key: pedido.empresa_key,
          pedido_switch_id: pedido.pedido_switch_id,
          codigo_barra_ids: [id],
          bulto,
        }),
      });
      const d = (await r.json().catch(() => null)) as Respuesta | null;
      if (!r.ok) throw new Error(d?.error ?? String(r.status));
      setLineas(d?.lineas ?? []);
    } catch (e) {
      setLineas((xs) => (xs ?? []).map((x) => (x.codigo_barra_id === id ? { ...x, bulto: antes } : x)));
      setEnCelda((m) => ({ ...m, [id]: antes == null ? "" : String(antes) }));
      toast(e instanceof Error && e.message.length < 90 ? e.message : "No se pudo guardar el bulto.", "error");
    }
  }

  function confirmarBulto() {
    const v = validarBulto(numero);
    if (!v.ok) return toast(v.error, "warning");
    void guardar(v.valor!);
  }

  /** El alto que sobra al final para que la barra no tape la última fila. */
  const colchon = barraCelular ? ALTO_COLCHON_DE_ABAJO : "calc(var(--fg-alto-barra-fija, 0px) + 1rem)";

  /**
   * 🔴 EL PAPEL LO DIBUJA EL SERVIDOR (6-oct-2026). Daniel pidió que bodega no
   * vea Precio ni Total y que el papel SIEMPRE los lleve: las dos cosas solo se
   * cumplen si el PDF se arma allá, donde los números existen. Acá solo se pide
   * y se abre — y por eso las DOS formas las puede imprimir cualquiera que entre
   * a Pedidos, bodega incluida.
   */
  async function imprimir(conPrecios: boolean) {
    try {
      const r = await fetch(`/api/guias/pedidos/detalle/papel?${clave}&precios=${conPrecios ? "si" : "no"}`, { cache: "no-store" });
      if (!r.ok) throw new Error(String(r.status));
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const ventana = window.open(url, "_blank");
      if (ventana) {
        ventana.addEventListener("load", () => ventana.print(), { once: true });
      } else {
        descargarArchivo(new File([blob], `pedido-${pedido.secuencial}${conPrecios ? "" : "-sin-precios"}.pdf`, { type: "application/pdf" }));
        toast("Papel descargado — ábrelo para imprimir", "success");
      }
      // El navegador necesita la URL viva mientras abre la pestaña.
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      toast("No se pudo preparar el papel. Intenta de nuevo.", "error");
    }
  }

  /**
   * El bulto de una línea: una casilla que se escribe y queda asignado al salir
   * de ella (Tab o Enter pasan a la siguiente). 🔴 La MISMA casilla en el
   * celular y en la computadora (7-oct-2026). Quien no puede asignar bultos
   * —el vendedor, o cualquiera con el pedido ya verificado— ve el chip quieto.
   */
  const celdaBulto = (l: LineaPedido) => {
    if (!puedePoner) {
      return l.bulto == null ? (
        <span className="text-gray-400">—</span>
      ) : (
        <span className="inline-flex h-7 items-center rounded-full border border-emerald-200 bg-emerald-50 px-2 text-xs font-medium text-emerald-700">
          {l.bulto}
        </span>
      );
    }
    const valor = enCelda[l.codigo_barra_id] ?? (l.bulto == null ? "" : String(l.bulto));
    return (
      <input
        type="number"
        inputMode="numeric"
        min={MIN_BULTO}
        max={MAX_BULTO}
        value={valor}
        aria-label={`Bulto de ${l.descripcion}`}
        onChange={(e) => setEnCelda((m) => ({ ...m, [l.codigo_barra_id]: e.target.value }))}
        onFocus={(e) => e.currentTarget.select()}
        onBlur={(e) => void guardarUna(l.codigo_barra_id, e.target.value)}
        onKeyDown={(e) => {
          // Enter guarda y baja a la siguiente; Tab ya baja solo.
          if (e.key !== "Enter") return;
          e.preventDefault();
          e.currentTarget.blur();
          const casillas = [...(e.currentTarget.closest("tbody")?.querySelectorAll<HTMLInputElement>('input[type="number"]') ?? [])];
          casillas[casillas.indexOf(e.currentTarget) + 1]?.focus();
        }}
        // 44 px de alto en el celular (regla 10 de `docs/diseno.md`).
        className="h-11 w-14 rounded-md border border-gray-300 px-1.5 text-right tabular-nums focus:border-gray-900 focus:outline-none sm:h-9 sm:w-16 sm:px-2"
      />
    );
  };

  const todasMarcadas = !!lineas && lineas.length > 0 && marcadas.size === lineas.length;

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      {/* El título va en la misma línea que «← Volver» (docs/diseno.md). */}
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-0.5">
          <button
            type="button"
            onClick={onVolver}
            className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800"
          >
            <ArrowLeft size={15} strokeWidth={1.8} aria-hidden /> Pedidos
          </button>
          <p className="text-base font-semibold text-gray-900">
            Pedido {pedido.secuencial} · {pedido.cliente_nombre}
          </p>
          {resumen && <p className="text-xs text-gray-500">{resumen}</p>}
        </div>
        {/* 🔴 UN SOLO BOTÓN «Imprimir» (Daniel, 6-oct-2026): al tocarlo
            aparecen las dos formas. Antes estaban las dos a la vista y pesaban
            demasiado para una acción que es la misma. Las dos las puede usar
            cualquiera que entre a Pedidos: el papel se arma en el servidor. */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setImprimirAbierto((v) => !v)}
            disabled={!lineas || lineas.length === 0}
            aria-expanded={imprimirAbierto}
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-gray-300 px-3 text-[13px] font-medium text-gray-700 transition active:scale-[0.97] disabled:opacity-40"
          >
            <Printer size={15} strokeWidth={1.8} aria-hidden /> Imprimir
            <ChevronDown size={14} strokeWidth={1.8} aria-hidden />
          </button>
          {imprimirAbierto && (
            <>
              {/* Tocar afuera cierra. */}
              <button type="button" aria-label="Cerrar" onClick={() => setImprimirAbierto(false)} className="fixed inset-0 z-10 cursor-default" />
              {/* En el celular el botón está a la izquierda: el menú se abre
                  hacia la derecha o se sale de la pantalla. */}
              <div className="absolute left-0 z-20 mt-1 w-40 overflow-hidden rounded-md border border-gray-200 bg-white py-1 shadow-lg sm:left-auto sm:right-0">
                {[
                  { conPrecios: true, texto: "Con precios" },
                  { conPrecios: false, texto: "Sin precios" },
                ].map((o) => (
                  <button
                    key={o.texto}
                    type="button"
                    onClick={() => { setImprimirAbierto(false); void imprimir(o.conPrecios); }}
                    className="block w-full px-3 py-2 text-left text-[13px] text-gray-700 hover:bg-gray-50"
                  >
                    {o.texto}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {error ? (
        <Aviso tono="error">No se pudo leer el detalle del pedido. Intenta de nuevo.</Aviso>
      ) : sinTabla ? (
        <Aviso tono="info">El detalle de los pedidos todavía no está instalado.</Aviso>
      ) : !lineas ? (
        <p className="py-10 text-center text-sm text-gray-500">Cargando…</p>
      ) : lineas.length === 0 ? (
        <p className="py-10 text-center text-sm text-gray-500">Este pedido no tiene artículos</p>
      ) : (
        <div className="-mx-4 border-y border-gray-200 bg-white sm:mx-0 sm:rounded-lg sm:border-x">
          <table className="w-full text-left text-xs sm:text-sm">
            <thead className="border-b border-gray-200 text-xs font-medium text-gray-400 sm:uppercase sm:tracking-wide">
              <tr>
                {puedePoner && (
                  <th className="w-11 py-2 pl-1.5 sm:pl-2">
                    <input
                      type="checkbox"
                      aria-label="Seleccionar todos los artículos"
                      checked={todasMarcadas}
                      onChange={(e) => marcarTodas(e.target.checked)}
                      className="h-[18px] w-[18px] rounded border-gray-300"
                    />
                  </th>
                )}
                {/* 🔴 El BULTO va primero: es lo que bodega llena.
                    🩸 En el celular, Código NO tiene columna propia: con las 7
                    columnas a 390 px el chip del Bulto quedaba CORTADO («41» en
                    vez de 416). El código va bajo la descripción, como el n.º de
                    pedido va bajo el cliente en la lista. */}
                {/* 🔴 ANCHOS REPARTIDOS (Daniel, 6-oct-2026: «la descripción
                    casi nunca es larga, no le reserves tanto ancho»). Medido en
                    el pedido real: «REEBOK BASE TRAIL MID» es lo más largo. Así
                    que la descripción lleva un ancho propio y lo que sobra va a
                    Código, Cantidad, Precio y Total, que son los que se leen de
                    corrido. */}
                <th className="w-20 py-2 pl-1 pr-1 sm:px-3">{COLUMNAS_DETALLE[0]}</th>
                <th className="hidden px-3 py-2 sm:table-cell sm:w-44">{COLUMNAS_DETALLE[1]}</th>
                <th className="py-2 pl-1 pr-1 sm:w-[26%] sm:px-3">{COLUMNAS_DETALLE[2]}</th>
                <th className="w-16 px-1 py-2 text-right sm:w-28 sm:px-3">
                  {/* En el celular, «Cant.» —la misma abreviatura del papel—:
                      «Cantidad» entero quedaba recortado contra el borde. */}
                  <span className="sm:hidden">Cant.</span>
                  <span className="hidden sm:inline">{COLUMNAS_DETALLE[3]}</span>
                </th>
                {/* 🔴 Precio y Total solo si el SERVIDOR los mandó: a bodega no
                    le llegan, así que la columna ni se dibuja. */}
                {conPlata && <th className="hidden px-3 py-2 text-right sm:table-cell sm:w-32">{COLUMNAS_DETALLE[4]}</th>}
                {conPlata && <th className="hidden px-3 py-2 text-right sm:table-cell sm:w-36">{COLUMNAS_DETALLE[5]}</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 align-top">
              {lineas.map((l) => (
                <tr key={l.codigo_barra_id} className={marcadas.has(l.codigo_barra_id) ? "bg-gray-50" : undefined}>
                  {puedePoner && (
                    <td className="py-2 pl-1.5 sm:pl-2">
                      <label className="flex h-11 w-9 items-center justify-center">
                        <span className="sr-only">{l.descripcion}</span>
                        <input
                          type="checkbox"
                          checked={marcadas.has(l.codigo_barra_id)}
                          onChange={() => alternar(l.codigo_barra_id)}
                          className="h-[18px] w-[18px] rounded border-gray-300"
                        />
                      </label>
                    </td>
                  )}
                  <td className="whitespace-nowrap py-2 pl-1 pr-1 tabular-nums sm:px-3">{celdaBulto(l)}</td>
                  <td className="hidden whitespace-nowrap px-3 py-2 tabular-nums text-gray-700 sm:table-cell">{l.codigo}</td>
                  {/* La categoría de Switch, con su talla y su color si los manda. */}
                  <td className="break-words py-2 pl-1 pr-1 font-medium text-gray-900 sm:px-3">
                    {descripcionCompleta(l)}
                    <span className="block tabular-nums text-xs font-normal text-gray-500 sm:hidden">{l.codigo}</span>
                  </td>
                  <td className="whitespace-nowrap px-1 py-2 text-right tabular-nums text-gray-700 sm:px-3">{l.cantidad}</td>
                  {conPlata && (
                    <td className="hidden whitespace-nowrap px-3 py-2 text-right tabular-nums text-gray-700 sm:table-cell">
                      ${fmt(l.precio ?? 0)}
                    </td>
                  )}
                  {conPlata && (
                    <td className="hidden whitespace-nowrap px-3 py-2 text-right tabular-nums text-gray-900 sm:table-cell">
                      ${fmt(l.total ?? 0)}
                    </td>
                  )}

                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Verificado = congelado. UNA línea al pie, sin cartel permanente arriba
          (docs/diseno.md: «lo que aporta va en UNA línea gris al final»). */}
      {verificado && lineas && lineas.length > 0 && (
        <p className="pt-2 text-xs text-gray-500">Pedido verificado · los bultos ya no se cambian</p>
      )}

      {/* 🔴 EL COLCHÓN DEL FINAL (Daniel, 7-oct-2026: «no se ve lo de abajo»).
          La barra fija de abajo publica su alto y la última fila sube por
          encima de ella y del ☰ redondo del celular. */}
      <div aria-hidden data-colchon-pedido style={{ height: colchon }} />

      {/* UNA sola acción principal, abajo, con el resultado en vivo y apagada
          hasta que haya algo que guardar (docs/diseno.md, regla 3). */}
      {puedePoner && marcadas.size > 0 && (
        <div
          ref={barraRef}
          className="fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-white px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6"
        >
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-gray-600">
              {marcadas.size} {marcadas.size === 1 ? "artículo seleccionado" : "artículos seleccionados"}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void guardar(null)}
                disabled={guardando}
                className="h-11 rounded-md px-3 text-sm font-medium text-blue-600 hover:text-blue-800 disabled:opacity-40"
              >
                Quitar bulto
              </button>
              {/* 🔴 EL SEGUNDO CAMINO DE DOS PASOS (Daniel, 7-oct-2026): el
                  número se escribe EN LA MISMA BARRA. Se fue el botón
                  «Asignar bulto» que solo servía para hacer aparecer este
                  campo —un toque que no decidía nada—. */}
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <span>Bulto</span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={MIN_BULTO}
                  max={MAX_BULTO}
                  value={numero}
                  autoFocus
                  onChange={(e) => setNumero(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && confirmarBulto()}
                  // Un dato de 1 a 4 caracteres usa un campo angosto (regla 9).
                  className="h-11 w-20 rounded-md border border-gray-300 px-2 text-right tabular-nums"
                />
              </label>
              <button
                type="button"
                onClick={confirmarBulto}
                disabled={guardando || !numero.trim()}
                className="h-11 rounded-md bg-black px-4 text-sm font-medium text-white transition hover:bg-gray-800 active:scale-[0.97] disabled:opacity-40"
              >
                Asignar bulto
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
