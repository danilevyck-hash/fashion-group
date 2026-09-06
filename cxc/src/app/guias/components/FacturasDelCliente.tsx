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
  desmarcarFactura,
  esDeHoy,
  facturaMarcada,
  marcarFactura,
  renglonDelCliente,
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
  const [buscandoOtraVez, setBuscandoOtraVez] = useState(false);

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

  const { grupos, diasOcultos } = agruparPorDia(facturas ?? [], diasVisibles);

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
              <div className="space-y-4">
                {/* 🔴 Los últimos días CON FACTURA, el más reciente arriba,
                    cada día con su encabezado en palabras («Miércoles 3 sep»). */}
                {grupos.map(({ dia, facturas: fs }) => (
                  <div key={dia}>
                    <div className="text-xs uppercase tracking-[0.05em] text-gray-400 mb-1">
                      {tituloDelDia(dia)}
                    </div>
                    <ul>
                      {fs.map((f) => {
                        const marcada = cliente ? facturaMarcada(items, cliente, f) : false;
                        return (
                          <li key={`${f.empresa_key}-${f.secuencial}`}>
                            <label className="flex items-center gap-3 py-1.5 min-h-[44px] cursor-pointer text-sm">
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
                  </div>
                ))}

                {diasOcultos > 0 && (
                  <button
                    type="button"
                    onClick={() => setDiasVisibles((v) => v + DIAS_POR_VER_MAS)}
                    className="text-sm text-gray-400 hover:text-black transition inline-flex items-center min-h-[44px] px-2 -mx-2"
                  >
                    Ver más días
                  </button>
                )}
              </div>
            )}

            {/* 🔴 EL OTRO CAMINO: Traslado. Son DOS y nada más — factura o
                Traslado (Daniel descartó «Factura pendiente» y «Sin factura»).
                Es del ENVÍO, no del cliente; escribe el texto «Traslado» en el
                campo facturas y la EMPRESA se elige a mano en el renglón. */}
            {!cargando && (
              <div className="mt-3 flex items-center gap-3">
                <span className="text-xs text-gray-400">o</span>
                <button
                  type="button"
                  onClick={() =>
                    onReemplazarItems(renglonDelCliente(items, cliente, TEXTO_TRASLADO, destinoAuto) as GuiaItem[])
                  }
                  className="text-sm border border-gray-200 rounded-md px-3 text-gray-600 hover:text-black hover:border-gray-300 transition inline-flex items-center min-h-[44px] md:[@media(pointer:fine)]:min-h-0 md:[@media(pointer:fine)]:py-1.5"
                >
                  Traslado
                </button>
              </div>
            )}

            {!cargando && (
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-gray-100 pt-3">
                {hasta && (
                  <span className="text-xs text-gray-400">hasta las {horaCorta(hasta)}</span>
                )}
                <button
                  type="button"
                  onClick={() => void buscarOtraVez()}
                  disabled={buscandoOtraVez}
                  className="text-xs text-gray-400 hover:text-black transition inline-flex items-center min-h-[44px] px-2 -mx-2 disabled:opacity-40"
                >
                  {buscandoOtraVez ? "Buscando…" : "Buscar otra vez"}
                </button>
                <span className="flex-1" />
                {/* La salida a mano de siempre, con el cliente ya puesto: un
                    renglón vacío en facturas para escribir el número. */}
                <button
                  type="button"
                  onClick={() => onReemplazarItems(renglonDelCliente(items, cliente, "", destinoAuto) as GuiaItem[])}
                  className="text-xs text-gray-400 hover:text-black transition inline-flex items-center min-h-[44px] px-2"
                >
                  Escribir el número
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
