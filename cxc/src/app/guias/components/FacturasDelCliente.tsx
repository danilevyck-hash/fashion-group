"use client";

// ─────────────────────────────────────────────────────────────────────────────
// FACTURAS DEL CLIENTE — el cliente se elige UNA vez y se marcan sus facturas.
//
// Daniel aprobó el mockup: «va» (3-sep-2026). Hoy, con un cliente que compró en
// 3 empresas, se hacen 3 envíos y el cliente se escribe 3 veces; acá se marca
// cada factura y la EMPRESA y el NÚMERO los pone la factura. Al guardar salen
// los mismos envíos de siempre, uno por empresa (`guia_items`) — la tabla, la
// guía impresa y el Excel no cambian ni un campo.
//
// 🔴 TODO ES ATAJO, JAMÁS CANDADO. Elegir cliente sigue sin ser obligatorio y
// escribir cliente, empresa y facturas a mano sigue funcionando igual que hoy
// (los renglones de abajo no cambiaron). Este panel entero cuelga de
// `GUIAS_ATAJOS_NUEVOS` — en `false` no se dibuja y la pantalla es la de hoy.
//
// 🔴 «Ya salió en otra guía» es AVISO, nunca bloqueo: la casilla se puede
// marcar igual. Y el sistema puede afirmar «ya salió», pero NO lo contrario
// (hay facturas sin guía que son mostrador o retiro en bodega).
//
// Fail-open de punta a punta: si la lista no carga, se dice y se escribe a
// mano como siempre. «Buscar otra vez» dispara la lectura corta de HOY
// (/api/guias/facturas-hoy) y vuelve a pedir la lista.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from "react";
import ClientePicker from "@/components/ClientePicker";
import { CODIGOS_RETIRADOS_DE_GUIAS } from "@/lib/guias/american-classics";
import type { ClienteHit } from "@/lib/hooks/useBusquedaClientes";
import type { GuiaItem } from "./types";
import { hoyPanama } from "@/lib/fecha-panama";
import {
  DIAS_CON_FACTURA_VISIBLES,
  DIAS_POR_VER_MAS,
  TEXTO_TRASLADO,
  agruparPorDia,
  alternarDia,
  desmarcarFactura,
  diaAbierto,
  esDeHoy,
  facturaMarcada,
  marcarFactura,
  renglonDelCliente,
  resumenDelDia,
  tituloDelDia,
  type FacturaDelCliente as Factura,
} from "@/lib/guias/atajos-facturas";

interface Props {
  items: GuiaItem[];
  /** Reemplaza los renglones del formulario (el hook renumera y asigna uid). */
  onReemplazarItems: (items: GuiaItem[]) => void;
  /** Clientes más usados en guías, para elegir sin teclear. */
  clientesTop?: ClienteHit[];
  /**
   * El destino que se AUTOLLENA al marcar la primera factura del cliente
   * (4-sep-2026, Daniel: «sí quiero que se llene sola…»): lo calcula GuiaForm
   * con `destinoParaAutollenar` — UN solo destino (definido o único en la
   * historia agrupada) o null. Solo entra en filas que nacen acá; lo escrito
   * a mano nunca se pisa.
   */
  destinoAutollenadoDe?: (codigo: string) => string | null;
}

function fmtMonto(n: number): string {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** La hora solo cuando es de hoy: el encabezado del día ya dice la fecha. */
function rotuloFecha(fechaIso: string, hoy: string): string {
  if (!esDeHoy(fechaIso, hoy)) return "";
  return horaCorta(fechaIso);
}

function horaCorta(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("es-PA", {
    timeZone: "America/Panama",
    hour: "numeric",
    minute: "2-digit",
  }).format(d);
}

export default function FacturasDelCliente({ items, onReemplazarItems, clientesTop, destinoAutollenadoDe }: Props) {
  const [cliente, setCliente] = useState<{ nombre: string; codigo: string } | null>(null);
  const [facturas, setFacturas] = useState<Factura[] | null>(null);
  const [hasta, setHasta] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [sinLista, setSinLista] = useState(false);
  // 🔴 Los últimos 3 días CON factura (no de calendario); «Ver más días» trae
  // 3 más cada vez. Medido: 77% de las facturas usadas en guías salen del
  // último día facturado, 95% de los últimos 3.
  const [diasVisibles, setDiasVisibles] = useState(DIAS_CON_FACTURA_VISIBLES);
  // 🔴 LOS DÍAS SE PLIEGAN Y SOLO EL MÁS RECIENTE ABRE (10-sep-2026, Daniel:
  // «que ya venga plegado solo el último día desplegado by default»). Acá no se
  // guarda «qué está abierto» sino QUÉ TOCÓ LA PERSONA: abierto se DERIVA con
  // `diaAbierto`. Así los días que trae «Ver más días» nacen plegados sin
  // ningún efecto de inicialización que los pueda abrir por accidente.
  const [diasAlternados, setDiasAlternados] = useState<ReadonlySet<string>>(new Set());
  const [buscandoOtraVez, setBuscandoOtraVez] = useState(false);
  /** Contador para devolverle el foco al buscador DESPUÉS del re-render. */
  const [pedirFoco, setPedirFoco] = useState(0);

  const hoy = hoyPanama();

  const cargarFacturas = useCallback(async (codigo: string) => {
    setCargando(true);
    setSinLista(false);
    try {
      const r = await fetch(`/api/guias/facturas-cliente?codigo=${encodeURIComponent(codigo)}`, {
        cache: "no-store",
      });
      if (!r.ok) throw new Error("no ok");
      const d = (await r.json()) as { facturas?: Factura[]; hasta?: string | null };
      setFacturas(Array.isArray(d.facturas) ? d.facturas : []);
      setHasta(d.hasta ?? null);
    } catch {
      // Fail-open: sin lista se escribe a mano, como siempre.
      setFacturas(null);
      setSinLista(true);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    if (cliente?.codigo) void cargarFacturas(cliente.codigo);
  }, [cliente?.codigo, cargarFacturas]);

  useEffect(() => {
    if (pedirFoco === 0) return;
    const campo = document.getElementById("facturas-cliente");
    if (campo instanceof HTMLInputElement) campo.focus();
  }, [pedirFoco]);

  /** «Buscar otra vez»: primero la lectura corta de HOY, después la lista. */
  async function buscarOtraVez() {
    if (!cliente?.codigo || buscandoOtraVez) return;
    setBuscandoOtraVez(true);
    try {
      await fetch("/api/guias/facturas-hoy", { method: "POST" }).catch(() => {});
      await cargarFacturas(cliente.codigo);
    } finally {
      setBuscandoOtraVez(false);
    }
  }

  /** El destino único del cliente elegido (o null): viaja a marcar, desmarcar
   *  y a los dos botones de siempre, para que el renglón nazca con su destino. */
  const destinoAuto = cliente ? (destinoAutollenadoDe?.(cliente.codigo) ?? null) : null;

  function toggle(f: Factura) {
    if (!cliente) return;
    const marcada = facturaMarcada(items, cliente, f);
    const nuevos = marcada
      ? desmarcarFactura(items, cliente, f, destinoAuto)
      : marcarFactura(items, cliente, f, destinoAuto);
    onReemplazarItems(nuevos as GuiaItem[]);
  }

  /**
   * 🔴 «+ OTRO CLIENTE» — UNA GUÍA LLEVA FACTURAS DE VARIOS CLIENTES
   * (10-sep-2026). Daniel, textual: *«Una guía lleva facturas de varios
   * clientes en un mismo despacho»*, *«un cliente a la vez»*, *«se quedan
   * abajo»*.
   *
   * 🔴 LO ÚNICO QUE HACE ES LIMPIAR EL BUSCADOR. Los renglones ya marcados NO
   * se tocan: siguen abajo, en «Detalle de Envío», que es donde viven desde el
   * primer día (`items` nunca se limpió al cambiar de cliente — lo que faltaba
   * era la invitación a seguir con el siguiente).
   *
   * 🔴 Y REUSA EL MISMO `ClientePicker`, no dibuja un segundo selector: el
   * sistema tiene UNO solo y hay barrido que lo exige
   * (`un-solo-selector-de-cliente.test.ts`).
   */
  function otroCliente() {
    setCliente(null);
    setFacturas(null);
    setHasta(null);
    setSinLista(false);
    setDiasVisibles(DIAS_CON_FACTURA_VISIBLES);
    setDiasAlternados(new Set());
    // El foco vuelve al buscador para escribir el siguiente nombre. Sin mouse
    // (iPad) esto es la diferencia entre seguir de un toque o tener que buscar
    // el campo con el dedo.
    //
    // 🩸 Va por un efecto y NO acá mismo: enfocando en el acto, el selector
    // todavía no re-renderizó y su `onFocus` copia al buscador el nombre del
    // cliente ANTERIOR (`query = value`) — o sea, el campo se veía «limpio»
    // con el nombre viejo escrito adentro.
    setPedirFoco((n) => n + 1);
  }

  /**
   * ¿Este cliente ya dejó algo en la guía? (una factura marcada, un Traslado o
   * un «Escribir el número»). Es lo que decide si se dibuja «+ Otro cliente»:
   * sin nada hecho, el botón no ofrece nada que el buscador no ofrezca ya.
   */
  const clienteYaTieneRenglon = Boolean(
    cliente && items.some((r) => (r.cliente_codigo ?? "").trim() === cliente.codigo),
  );

  const { grupos, diasOcultos } = agruparPorDia(facturas ?? [], diasVisibles);
  /** El día de arriba: el ÚNICO que abre solo. */
  const diaMasReciente = grupos[0]?.dia ?? null;

  return (
    <div data-testid="facturas-del-cliente" className="mb-8">
      <div className="text-xs uppercase tracking-[0.05em] text-gray-400 mb-4">
        Facturas del cliente
      </div>
      <div className="border border-gray-200 rounded-lg p-4">
        <div className="max-w-sm">
          <ClientePicker
            id="facturas-cliente"
            value={cliente?.nombre ?? ""}
            codigo={cliente?.codigo ?? ""}
            topClientes={clientesTop}
            // 🔴 D-201 «American Classics» no se ofrece: duplicado de D-108
            // (5-sep-2026). Ver `american-classics.ts`.
            codigosOcultos={CODIGOS_RETIRADOS_DE_GUIAS}
            // Acá el cliente sale del directorio: las facturas viven amarradas
            // a su código. El que no está se escribe a mano en los envíos de
            // abajo, exactamente como hoy.
            permitirOtro={false}
            onChange={(nombre, codigo) => {
              setDiasVisibles(DIAS_CON_FACTURA_VISIBLES);
              setDiasAlternados(new Set());
              // El `nombre` ya viene con el alias que la bodega usa (lo aplica
              // el selector, `nombreParaMostrar`): el renglón nace con ese texto.
              setCliente(codigo ? { nombre, codigo } : null);
              if (!codigo) setFacturas(null);
            }}
          />
        </div>

        {cliente && (
          <div className="mt-4">
            {cargando && <p className="text-sm text-gray-400">Buscando facturas…</p>}

            {!cargando && sinLista && (
              <p className="text-sm text-amber-700">
                No se pudieron cargar las facturas. Escribe los datos a mano abajo, como siempre.
              </p>
            )}

            {!cargando && facturas && facturas.length === 0 && (
              <p className="text-sm text-gray-500">
                Este cliente no tiene facturas registradas. Escribe los datos a mano abajo.
              </p>
            )}

            {!cargando && facturas && facturas.length > 0 && (
              <div>
                {/* 🔴 Los últimos días CON FACTURA, el más reciente arriba,
                    cada día con su encabezado en palabras («Miércoles 3 sep»). */}
                <div className="space-y-4">
                {grupos.map(({ dia, facturas: fs }) => {
                  const abierto = diaAbierto(dia, diaMasReciente, diasAlternados);
                  const marcadasDelDia = cliente
                    ? fs.filter((f) => facturaMarcada(items, cliente, f)).length
                    : 0;
                  return (
                  <div key={dia}>
                    {/* 🔴 EL DÍA SE PLIEGA DE UN TOQUE. 44 px con el dedo; en la
                        computadora (pointer fino) la línea se aprieta. */}
                    <button
                      type="button"
                      data-dia={dia}
                      aria-expanded={abierto}
                      onClick={() => setDiasAlternados((a) => alternarDia(a, dia))}
                      className="w-full flex items-center gap-2 text-left mb-1 min-h-[44px] lg:[@media(pointer:fine)]:min-h-0 lg:[@media(pointer:fine)]:py-1"
                    >
                      <svg
                        className={`w-2.5 h-2.5 text-gray-400 shrink-0 transition-transform ${abierto ? "rotate-90" : ""}`}
                        fill="currentColor"
                        viewBox="0 0 20 20"
                        aria-hidden="true"
                      >
                        <path d="M6 4l8 6-8 6V4z" />
                      </svg>
                      <span className="text-xs uppercase tracking-[0.05em] text-gray-400">
                        {tituloDelDia(dia)}
                      </span>
                      <span className="text-xs text-gray-400 tabular-nums">
                        {`· ${resumenDelDia(fs.length, marcadasDelDia, abierto)}`}
                      </span>
                    </button>
                    {abierto && (
                    <ul>
                      {fs.map((f) => {
                        const marcada = cliente ? facturaMarcada(items, cliente, f) : false;
                        return (
                          <li key={`${f.empresa_key}-${f.secuencial}`}>
                            {/* 44 px con el dedo (celular e iPad); en la
                                computadora la fila se aprieta — Daniel: «algo
                                un poco más reducido sin consumir mucho espacio
                                de pantalla».

                                🔴 `flex-wrap` para que en 390 px NADA se salga
                                de lado: todo lo de esta fila es `shrink-0`
                                menos el nombre de la empresa, así que con la
                                etiqueta «Ya salió en GT-XXX» —que se queda
                                COMPLETA, Daniel: «el ya salió no me molesta»—
                                la fila pide más ancho del que tiene el iPhone.
                                Envolviendo, la etiqueta baja un renglón en vez
                                de empujar la página. En la computadora todo
                                entra en una línea y no cambia nada. */}
                            <label className="flex flex-wrap items-center gap-3 py-1.5 min-h-[44px] lg:[@media(pointer:fine)]:min-h-0 lg:[@media(pointer:fine)]:py-1 cursor-pointer text-sm">
                              <input
                                type="checkbox"
                                checked={marcada}
                                onChange={() => toggle(f)}
                                className="w-4 h-4 shrink-0 accent-black"
                              />
                              <span className="font-mono tabular-nums shrink-0">{f.secuencial}</span>
                              <span className="text-gray-500 truncate">{f.empresa}</span>
                              <span className="tabular-nums text-gray-600 ml-auto shrink-0">
                                {fmtMonto(f.total)}
                              </span>
                              <span className="text-gray-400 tabular-nums shrink-0 w-14 text-right">
                                {rotuloFecha(f.fecha, hoy)}
                              </span>
                              {/* 🔴 AVISO, NUNCA BLOQUEO: se puede marcar igual. */}
                              {f.yaSalioEn != null && (
                                <span className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5 shrink-0">
                                  Ya salió en GT-{String(f.yaSalioEn).padStart(3, "0")}
                                </span>
                              )}
                            </label>
                          </li>
                        );
                      })}
                    </ul>
                    )}
                  </div>
                  );
                })}
                </div>

                {diasOcultos > 0 && (
                  <button
                    type="button"
                    onClick={() => setDiasVisibles((v) => v + DIAS_POR_VER_MAS)}
                    className="text-xs text-gray-400 hover:text-black transition inline-flex items-center min-h-[44px] md:[@media(pointer:fine)]:min-h-0 md:[@media(pointer:fine)]:mt-1"
                  >
                    Ver más días
                  </button>
                )}
              </div>
            )}

            {/* 🔴 EL PIE ES UNA SOLA LÍNEA (10-sep-2026). Daniel: *«abajo de
                ver más días en guías, se desperdicia mucho espacio con esa
                info, cómo la puedes hacer más minimalista»* y *«todo siempre
                minimalista»*. Eran TRES renglones —el «o [Traslado]» en una
                caja, la frescura y «Buscar otra vez» a la izquierda, «Escribir
                el número» empujado a la derecha—; ahora es un renglón de texto
                chico separado por puntos medios.

                🔴 NO SE FUE NINGUNA FUNCIÓN, solo la caja y los renglones:
                  · «Traslado» es el OTRO CAMINO del envío (Daniel descartó
                    «Factura pendiente» y «Sin factura»): escribe el TEXTO
                    `Traslado` en el campo facturas y la empresa se elige a
                    mano en el renglón.
                  · «Escribir el número» es la salida a mano de siempre.
                  · La frescura sigue A LA VISTA y no en un `title`: en el iPad
                    no hay mouse, y saber hasta qué hora llegó la lista es lo
                    que dice si una factura recién hecha puede faltar. */}
            {!cargando && (
              <div
                data-testid="pie-facturas"
                className="mt-3 flex flex-wrap items-center gap-x-2 border-t border-gray-100 pt-1 text-xs text-gray-400"
              >
                <button
                  type="button"
                  onClick={() =>
                    onReemplazarItems(renglonDelCliente(items, cliente, TEXTO_TRASLADO, destinoAuto) as GuiaItem[])
                  }
                  className="hover:text-black transition inline-flex items-center min-h-[44px] md:[@media(pointer:fine)]:min-h-0 md:[@media(pointer:fine)]:py-1"
                >
                  Traslado
                </button>
                <span aria-hidden="true">·</span>
                <button
                  type="button"
                  onClick={() => onReemplazarItems(renglonDelCliente(items, cliente, "", destinoAuto) as GuiaItem[])}
                  className="hover:text-black transition inline-flex items-center min-h-[44px] md:[@media(pointer:fine)]:min-h-0 md:[@media(pointer:fine)]:py-1"
                >
                  Escribir el número
                </button>
                {hasta && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>Actualizado {horaCorta(hasta)}</span>
                  </>
                )}
                <span aria-hidden="true">·</span>
                <button
                  type="button"
                  onClick={() => void buscarOtraVez()}
                  disabled={buscandoOtraVez}
                  className="hover:text-black transition inline-flex items-center min-h-[44px] md:[@media(pointer:fine)]:min-h-0 md:[@media(pointer:fine)]:py-1 disabled:opacity-40"
                >
                  {buscandoOtraVez ? "Buscando…" : "Buscar otra vez"}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 🔴 «+ OTRO CLIENTE» VA DEBAJO DEL CUADRO, NO ADENTRO (10-sep-2026).
          Daniel, textual: *«agregar otro cliente debería estar abajo de ese
          cuadro, no dentro»* — adentro se leía como una acción MÁS del cliente
          que se está mirando; afuera se lee como lo que es: terminaste con
          éste, sigue con el próximo.

          🔴 Lo que HACE no cambió: limpia el buscador y deja el foco ahí; los
          renglones ya marcados se quedan abajo, en «Detalle de Envío». Y se
          dibuja solo cuando este cliente ya dejó algo en la guía. */}
      {!cargando && clienteYaTieneRenglon && (
        <button
          type="button"
          data-testid="otro-cliente"
          onClick={otroCliente}
          className="mt-2 text-sm text-gray-500 hover:text-black transition inline-flex items-center min-h-[44px] md:[@media(pointer:fine)]:min-h-0 md:[@media(pointer:fine)]:py-1"
        >
          + Otro cliente
        </button>
      )}
    </div>
  );
}
