"use client";

// ─────────────────────────────────────────────────────────────────────────────
// NUEVA GUÍA › «+ AGREGAR SIN ETIQUETAS» (1-oct-2026, Daniel aprobó el mockup).
//
// El buscador de cliente y sus facturas, que antes era la sección «Facturas del
// cliente» de arriba, vive AQUÍ ADENTRO: se elige el cliente → sus facturas por
// día → se marcan → bultos → destino (prellenado con el de siempre del cliente)
// → «Agregar a la guía». Sale UN renglón por empresa, sin etiqueta, igual que
// los que se escribían a mano (`agregarFacturasSueltas`).
//
// 🔴 QUÉ NO SE PUEDE MARCAR, y cada una DICE por qué:
//   · «Ya salió en GT-xxx» — la factura ya va en otra guía viva (`yaSalioEn`,
//     calculado por el servidor). Hasta el 30-sep era solo aviso; Daniel lo
//     pidió bloqueado.
//   · «Va con su envío etiquetado» — tiene etiqueta pendiente: entra a la guía
//     con su envío, arriba, con sus bultos impresos (`etiquetaPendienteDeLaFactura`).
//   · «Ya está en la guía» — ya la lleva un renglón de esta guía.
//
// Siguen los dos caminos de siempre: «Traslado» y «Escribir a mano» (también
// para un cliente que no está en el directorio).
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from "react";
import ClientePicker from "@/components/ClientePicker";
import { CODIGOS_RETIRADOS_DE_GUIAS } from "@/lib/guias/american-classics";
import type { ClienteHit } from "@/lib/hooks/useBusquedaClientes";
import {
  DIAS_CON_FACTURA_VISIBLES,
  DIAS_POR_VER_MAS,
  TEXTO_TRASLADO,
  agregarFacturasSueltas,
  agruparPorDia,
  alternarDia,
  diaAbierto,
  facturaMarcada,
  resumenDelDia,
  tituloDelDia,
  type FacturaDelCliente as Factura,
} from "@/lib/guias/atajos-facturas";
import { etiquetaPendienteDeLaFactura } from "@/lib/guias/anti-doble-captura";
import { rotuloGuia, type EtiquetaFila } from "@/lib/guias/etiquetas";
import LineaDeFrescura from "@/components/shared/LineaDeFrescura";
import { emptyItem } from "./constants";
import type { GuiaItem } from "./types";

/** El chip de la factura que no se puede marcar. */
export const MOTIVO_VA_CON_SU_ENVIO = "Va con su envío etiquetado";
export const MOTIVO_YA_EN_LA_GUIA = "Ya está en la guía";

const clave = (f: Pick<Factura, "empresa_key" | "secuencial">) => `${f.empresa_key}|${f.secuencial}`;

const LINK =
  "hover:text-black transition inline-flex items-center min-h-[44px] md:[@media(pointer:fine)]:min-h-0 md:[@media(pointer:fine)]:py-1";

interface Props {
  items: GuiaItem[];
  etiquetas: readonly EtiquetaFila[];
  onReemplazarItems: (items: GuiaItem[]) => void;
  /** Abre el renglón recién agregado para escribirlo (Traslado / a mano). */
  onEditar: (uid: string) => void;
  onCerrar: () => void;
  clientesTop?: ClienteHit[];
  destinoAutollenadoDe?: (codigo: string) => string | null;
}

/** ¿Por qué no se puede marcar? `null` = se puede. */
export function motivoBloqueo(
  items: readonly GuiaItem[],
  cliente: { nombre: string; codigo: string },
  f: Factura,
  etiquetas: readonly EtiquetaFila[],
): string | null {
  if (f.yaSalioEn != null) return `Ya salió en ${rotuloGuia(f.yaSalioEn)}`;
  if (etiquetaPendienteDeLaFactura(etiquetas, f)) return MOTIVO_VA_CON_SU_ENVIO;
  if (facturaMarcada(items, cliente, f)) return MOTIVO_YA_EN_LA_GUIA;
  return null;
}

export default function AgregarSinEtiquetas({
  items,
  etiquetas,
  onReemplazarItems,
  onEditar,
  onCerrar,
  clientesTop,
  destinoAutollenadoDe,
}: Props) {
  const [cliente, setCliente] = useState<{ nombre: string; codigo: string } | null>(null);
  const [facturas, setFacturas] = useState<Factura[] | null>(null);
  const [cargando, setCargando] = useState(false);
  const [sinLista, setSinLista] = useState(false);
  const [actualizando, setActualizando] = useState(false);
  /** Hasta qué hora llegó la lista de facturas, para la línea de frescura. */
  const [hasta, setHasta] = useState<string | null>(null);
  const [diasVisibles, setDiasVisibles] = useState(DIAS_CON_FACTURA_VISIBLES);
  const [diasAlternados, setDiasAlternados] = useState<ReadonlySet<string>>(new Set());
  const [marcadas, setMarcadas] = useState<ReadonlySet<string>>(new Set());
  const [bultos, setBultos] = useState<Record<string, string>>({});
  const [destino, setDestino] = useState("");
  const [error, setError] = useState<string | null>(null);

  const cargarFacturas = useCallback(async (codigo: string) => {
    setCargando(true);
    setSinLista(false);
    try {
      const r = await fetch(`/api/guias/facturas-cliente?codigo=${encodeURIComponent(codigo)}`, { cache: "no-store" });
      if (!r.ok) throw new Error("no ok");
      const d = (await r.json()) as { facturas?: Factura[]; hasta?: string | null };
      setFacturas(Array.isArray(d.facturas) ? d.facturas : []);
      setHasta(d.hasta ?? null);
    } catch {
      setFacturas(null);
      setSinLista(true);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    if (cliente?.codigo) void cargarFacturas(cliente.codigo);
  }, [cliente?.codigo, cargarFacturas]);

  async function actualizarAhora() {
    if (!cliente?.codigo || actualizando) return;
    setActualizando(true);
    try {
      await fetch("/api/guias/facturas-hoy", { method: "POST" }).catch(() => {});
      await cargarFacturas(cliente.codigo);
    } finally {
      setActualizando(false);
    }
  }

  function elegirCliente(nombre: string, codigo: string) {
    setCliente(codigo ? { nombre, codigo } : null);
    setFacturas(null);
    setMarcadas(new Set());
    setBultos({});
    setError(null);
    setDiasVisibles(DIAS_CON_FACTURA_VISIBLES);
    setDiasAlternados(new Set());
    setDestino(codigo ? (destinoAutollenadoDe?.(codigo) ?? "") : "");
  }

  function alternar(f: Factura) {
    if (!cliente || motivoBloqueo(items, cliente, f, etiquetas)) return;
    setError(null);
    setMarcadas((m) => {
      const s = new Set(m);
      if (s.has(clave(f))) s.delete(clave(f));
      else s.add(clave(f));
      return s;
    });
  }

  const elegidas = (facturas ?? []).filter((f) => marcadas.has(clave(f)));
  const empresas = [...new Set(elegidas.map((f) => f.empresa))];

  function agregar() {
    if (!cliente) return;
    const falta: string[] = [];
    if (elegidas.length === 0) falta.push("marcar al menos una factura");
    if (empresas.some((e) => !(Number(bultos[e]) > 0))) falta.push("los bultos");
    if (!destino.trim()) falta.push("el destino");
    if (falta.length > 0) {
      setError(`Falta: ${falta.join(" · ")}`);
      return;
    }
    const porEmpresa = Object.fromEntries(empresas.map((e) => [e, Number(bultos[e])]));
    onReemplazarItems(agregarFacturasSueltas(items, cliente, elegidas, porEmpresa, destino));
    onCerrar();
  }

  /** «Traslado» o «Escribir a mano»: un renglón que se abre para escribirlo. */
  function renglonAMano(facturasTexto: string) {
    const nuevo: GuiaItem = {
      ...emptyItem(items.length + 1),
      cliente: cliente?.nombre ?? "",
      cliente_codigo: cliente?.codigo ?? "",
      direccion: cliente ? (destinoAutollenadoDe?.(cliente.codigo) ?? "") : "",
      facturas: facturasTexto,
    };
    const vacia = items.findIndex(
      (r) => !r.cliente && !r.direccion && !r.empresa && !r.facturas && !(r.bultos > 0),
    );
    const siguiente =
      vacia >= 0 ? items.map((r, i) => (i === vacia ? { ...nuevo, uid: r.uid ?? nuevo.uid } : r)) : [...items, nuevo];
    const uid = vacia >= 0 ? (items[vacia].uid ?? nuevo.uid) : nuevo.uid;
    onReemplazarItems(siguiente);
    if (uid) onEditar(uid);
    onCerrar();
  }

  const { grupos, diasOcultos } = agruparPorDia(facturas ?? [], diasVisibles);
  const diaMasReciente = grupos[0]?.dia ?? null;

  return (
    <div data-testid="agregar-sin-etiquetas" className="mt-3 rounded-lg border border-gray-200 p-4">
      <div className="max-w-sm">
        <ClientePicker
          id="agregar-cliente"
          value={cliente?.nombre ?? ""}
          codigo={cliente?.codigo ?? ""}
          topClientes={clientesTop}
          codigosOcultos={CODIGOS_RETIRADOS_DE_GUIAS}
          permitirOtro={false}
          onChange={elegirCliente}
        />
      </div>

      {cliente && (
        <div className="mt-4">
          {/* 🔴 4-oct-2026: la línea de frescura de todo el sistema (era
              «Actualizar ahora» suelto en el pie). */}
          {!cargando && <div className="mb-2"><LineaDeFrescura actualizado={hasta} onActualizar={actualizarAhora} actualizando={actualizando} /></div>}
          {cargando && <p className="text-sm text-gray-400">Buscando facturas…</p>}
          {!cargando && sinLista && (
            <p className="text-sm text-amber-700">No se pudieron cargar las facturas. Escríbelas a mano.</p>
          )}
          {!cargando && facturas && facturas.length === 0 && (
            <p className="text-sm text-gray-500">Este cliente no tiene facturas registradas. Escríbelas a mano.</p>
          )}

          {!cargando && facturas && facturas.length > 0 && (
            <div className="space-y-4">
              {grupos.map(({ dia, facturas: fs }) => {
                const abierto = diaAbierto(dia, diaMasReciente, diasAlternados);
                const delDia = fs.filter((f) => marcadas.has(clave(f))).length;
                return (
                  <div key={dia}>
                    <button
                      type="button"
                      data-dia={dia}
                      aria-expanded={abierto}
                      onClick={() => setDiasAlternados((a) => alternarDia(a, dia))}
                      className="mb-1 flex w-full min-h-[44px] items-center gap-2 text-left lg:[@media(pointer:fine)]:min-h-0 lg:[@media(pointer:fine)]:py-1"
                    >
                      <svg className={`h-2.5 w-2.5 shrink-0 text-gray-400 transition-transform ${abierto ? "rotate-90" : ""}`} fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                        <path d="M6 4l8 6-8 6V4z" />
                      </svg>
                      <span className="text-xs uppercase tracking-[0.05em] text-gray-400">{tituloDelDia(dia)}</span>
                      <span className="text-xs tabular-nums text-gray-400">{`· ${resumenDelDia(fs.length, delDia, abierto)}`}</span>
                    </button>
                    {abierto && (
                      <ul>
                        {fs.map((f) => {
                          const motivo = motivoBloqueo(items, cliente, f, etiquetas);
                          return (
                            <li key={clave(f)} className="border-t border-gray-100 first:border-t-0">
                              <label
                                className={`flex min-h-[44px] flex-wrap items-center gap-3 py-1.5 text-sm lg:[@media(pointer:fine)]:min-h-0 lg:[@media(pointer:fine)]:py-1 ${
                                  motivo ? "cursor-default text-gray-400" : "cursor-pointer"
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={marcadas.has(clave(f)) || motivo === MOTIVO_YA_EN_LA_GUIA}
                                  disabled={motivo !== null}
                                  onChange={() => alternar(f)}
                                  className="h-4 w-4 shrink-0 accent-black disabled:opacity-60"
                                />
                                <span className="shrink-0 font-mono tabular-nums" title={f.secuencial}>{f.secuencial}</span>
                                <span className="min-w-0 break-words text-gray-500">{f.empresa}</span>
                                {motivo && (
                                  <span className="shrink-0 rounded border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-xs text-gray-600">
                                    {motivo}
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
              {diasOcultos > 0 && (
                <button type="button" onClick={() => setDiasVisibles((v) => v + DIAS_POR_VER_MAS)} className={`text-xs text-gray-400 ${LINK}`}>
                  Ver más días
                </button>
              )}
            </div>
          )}

          {elegidas.length > 0 && (
            <div className="mt-4 flex flex-wrap items-end gap-4 border-t border-gray-100 pt-3">
              {empresas.map((e, i) => (
                <div key={e}>
                  <label htmlFor={`agregar-bultos-${i}`} className="mb-1 block text-xs text-gray-500">
                    {empresas.length > 1 ? `Bultos · ${e}` : "Bultos"}
                  </label>
                  <input
                    id={`agregar-bultos-${i}`}
                    type="number"
                    min={1}
                    inputMode="numeric"
                    value={bultos[e] ?? ""}
                    onChange={(ev) => { setBultos((b) => ({ ...b, [e]: ev.target.value })); setError(null); }}
                    className="w-24 rounded-md border border-gray-200 px-3 text-right text-base tabular-nums outline-none transition focus:border-black min-h-[44px] md:text-sm"
                  />
                </div>
              ))}
              <div className="min-w-[200px] flex-1">
                <label htmlFor="agregar-destino" className="mb-1 block text-xs text-gray-500">Destino</label>
                <input
                  id="agregar-destino"
                  type="text"
                  list="direcciones-list"
                  value={destino}
                  onChange={(ev) => { setDestino(ev.target.value); setError(null); }}
                  className="w-full max-w-sm rounded-md border border-gray-200 px-3 text-base outline-none transition focus:border-black min-h-[44px] md:text-sm"
                />
              </div>
              <button
                type="button"
                onClick={agregar}
                className="inline-flex min-h-[44px] items-center justify-center rounded-md bg-black px-4 text-sm font-medium text-white transition hover:bg-gray-800 active:scale-[0.97]"
              >
                Agregar a la guía
              </button>
            </div>
          )}
          {error && <p className="mt-2 text-sm text-amber-700">{error}</p>}
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-x-2 border-t border-gray-100 pt-1 text-xs text-gray-400">
        {cliente && (
          <>
            <button type="button" onClick={() => renglonAMano(TEXTO_TRASLADO)} className={LINK}>
              Traslado
            </button>
            <span aria-hidden="true">·</span>
          </>
        )}
        <button type="button" onClick={() => renglonAMano("")} className={LINK}>
          Escribir a mano
        </button>
        <span aria-hidden="true">·</span>
        <button type="button" onClick={onCerrar} className={LINK}>
          Cerrar
        </button>
      </div>
    </div>
  );
}
