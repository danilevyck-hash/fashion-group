"use client";

// ─────────────────────────────────────────────────────────────────────────────
// GUÍAS › ETIQUETAS POR ENVÍO (1-oct-2026).
//
// Daniel, 1-oct-2026: las etiquetas son POR ENVÍO = empresa + cliente +
// destino. Se elige el cliente (y la empresa, si tiene facturas en varias), se
// marcan VARIAS facturas —cada una con sus bultos y una NOTA opcional de 15
// letras, con las 3 notas MÁS USADAS a la mano— y se imprime AL FINAL, cuando
// el envío está completo. Al imprimir el envío queda CERRADO.
//
// 🔴 NUMERACIÓN CORRIDA: factura A 1–10, B 11–20, C 21–30, todas «de 30». Cada
// etiqueta lleva SU factura (y su nota). Los rangos se calculan
// (`rangosDelEnvio`), nunca se guardan.
//
// 🔴 LO IMPRESO NO SE CAMBIA: no hay «Corregir bultos». Si hay un error,
// «Anular envío» (todas sus etiquetas, firmado) y se hace de nuevo — solo si no
// salió en una guía; eso lo decide el SERVIDOR (409). Reimprimir sí: el envío
// completo o un bulto, copia idéntica.
//
// 🔴 EL MISMO SELECTOR DE CLIENTE (`ClientePicker`), la MISMA lista de facturas
// por día y la MISMA regla del destino de siempre que la pantalla de antes.
//
// 🔴 EL INTERRUPTOR: `ETIQUETAS_POR_ENVIO` en `false` devuelve «Una a la vez»
// (`EtiquetasView.tsx`), que no se tocó.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useState } from "react";
import ClientePicker from "@/components/ClientePicker";
import OverflowMenu from "@/components/ui/OverflowMenu";
import { ModalOverlay, Toast } from "@/components/ui";
import { CODIGOS_RETIRADOS_DE_GUIAS } from "@/lib/guias/american-classics";
import {
  DIAS_CON_FACTURA_VISIBLES,
  DIAS_POR_VER_MAS,
  agruparPorDia,
  alternarDia,
  diaAbierto,
  resumenDelDia,
  tituloDelDia,
  type FacturaDelCliente as Factura,
} from "@/lib/guias/atajos-facturas";
import { TEXTO_ACTUALIZANDO, TEXTO_ACTUALIZAR_AHORA } from "@/lib/ui/actualizar-ahora";
import {
  botonesDeDestino,
  destinoParaAutollenar,
  type DefinidosPorCliente,
} from "@/lib/guias/destinos-clientes";
import {
  AYUDA_FORMATO,
  MAX_CAJAS,
  TEXTO_TRAER_DE_SWITCH,
  facturasParaEtiquetar,
  rotuloEstado,
  rotuloGuia,
  textoEscondidasPorEtiqueta,
  textoEscondidasPorGuia,
  textoImprimir,
  validarCajas,
  type EtiquetaFila,
  type FormatoEtiquetas,
} from "@/lib/guias/etiquetas";
import {
  MAX_NOTA,
  agruparEnEnvios,
  facturaDelBulto,
  filtrarEnvios,
  moverEnElEnvio,
  normalizarNota,
  notasMasUsadas,
  rangosDelEnvio,
  textoRango,
  type Envio,
} from "@/lib/guias/etiquetas-por-envio";
import { abrirPdfEnPestana } from "@/lib/guias/pdf-en-pestana";
import { ETIQUETAS_2026_10 } from "@/lib/guias/guias-2026-10";
import {
  BOTON_BLANCO,
  BOTON_NEGRO,
  CHIP,
  ElegirPapel,
  Opcion,
  Paso,
  claveFactura,
  fechaCorta,
  fmtMonto,
  useFormatoEtiquetas,
} from "./etiquetas-ui";

/**
 * 🔴 EL PDF DEL ENVÍO, en pestaña nueva (la MISMA puerta que la pantalla de
 * antes: `abrirPdfEnPestana`, jsPDF por `import()`). `solo` = reimprimir un
 * bulto; sin él, el envío completo.
 */
function pdfDelEnvio(filas: readonly EtiquetaFila[], formato: FormatoEtiquetas, solo?: number | null) {
  return async () => {
    const { construirPdfEtiquetas, paginasDelEnvio } = await import("@/lib/guias/pdf-etiquetas");
    const doc = construirPdfEtiquetas(paginasDelEnvio(filas, solo), formato);
    const primera = String(filas[0]?.secuencial ?? "").replace(/[^\w.-]+/g, "");
    const papel = formato === "4x6" ? "-4x6" : "";
    const nombre = solo != null ? `Etiquetas-${primera}-bulto-${solo}${papel}.pdf` : `Etiquetas-${primera}${papel}.pdf`;
    return {
      url: doc.output("bloburl") as unknown as string,
      descargar: () => doc.save(nombre),
    };
  };
}

export default function EtiquetasPorEnvio() {
  const [etiquetas, setEtiquetas] = useState<EtiquetaFila[]>([]);
  const [cargando, setCargando] = useState(true);
  const [sinTabla, setSinTabla] = useState(false);
  const [errorLista, setErrorLista] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<"pendientes" | "todas">("pendientes");
  const [buscar, setBuscar] = useState("");
  const [panel, setPanel] = useState(false);
  const [reimprimiendo, setReimprimiendo] = useState<Envio | null>(null);
  const [anulando, setAnulando] = useState<Envio | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setErrorLista(null);
    try {
      const r = await fetch("/api/guias/etiquetas", { cache: "no-store" });
      const d = (await r.json()) as { etiquetas?: EtiquetaFila[]; sinTabla?: boolean; error?: string };
      if (!r.ok) throw new Error(d.error || "no ok");
      setEtiquetas(Array.isArray(d.etiquetas) ? d.etiquetas : []);
      setSinTabla(d.sinTabla === true);
    } catch {
      setEtiquetas([]);
      setErrorLista("No se pudieron cargar las etiquetas. Intenta de nuevo en unos segundos.");
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => { void cargar(); }, [cargar]);

  const envios = useMemo(() => agruparEnEnvios(etiquetas), [etiquetas]);
  const pendientes = envios.filter((v) => v.guia_numero === null).length;
  const visibles = useMemo(() => filtrarEnvios(envios, filtro, buscar), [envios, filtro, buscar]);

  async function anular() {
    if (!anulando) return;
    const r = await fetch(`/api/guias/etiquetas/${anulando.filas[0].id}`, { method: "DELETE" });
    const d = (await r.json().catch(() => ({}))) as { error?: string };
    setAnulando(null);
    if (!r.ok) { setToast(d.error || "No se pudo anular"); return; }
    setToast("Envío anulado");
    await cargar();
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
      {sinTabla && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Las etiquetas todavía no están encendidas: falta correr la migración{" "}
          <span className="font-mono">20261207120000_guias_etiquetas</span>. Guías sigue funcionando igual.
        </div>
      )}
      {errorLista && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {errorLista}
        </div>
      )}

      {panel ? (
        <PanelEnvio
          etiquetas={etiquetas}
          deshabilitado={sinTabla}
          onCerrar={() => setPanel(false)}
          onListo={async (mensaje) => { setToast(mensaje); await cargar(); }}
          onRecargar={cargar}
        />
      ) : (
        <>
          <div className="flex items-center justify-end mb-4 flex-wrap gap-4">
            <button type="button" onClick={() => setPanel(true)} className={BOTON_NEGRO} disabled={sinTabla}>
              ＋ Nuevo envío
            </button>
          </div>

          <div className="mb-4 flex flex-wrap items-center gap-4">
            <input
              type="text"
              value={buscar}
              onChange={(ev) => setBuscar(ev.target.value)}
              placeholder="Buscar factura, cliente o destino"
              aria-label="Buscar factura, cliente o destino"
              className="flex-1 min-w-[150px] max-w-sm border border-gray-200 rounded-lg px-3 text-base sm:text-sm outline-none focus:border-black transition min-h-[44px]"
            />
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                aria-pressed={filtro === "pendientes"}
                onClick={() => setFiltro("pendientes")}
                className={`${CHIP} ${filtro === "pendientes" ? "border-gray-900 bg-gray-900 font-medium text-white" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}
              >
                Pendientes de guía · {pendientes}
              </button>
              <button
                type="button"
                aria-pressed={filtro === "todas"}
                onClick={() => setFiltro("todas")}
                className={`${CHIP} ${filtro === "todas" ? "border-gray-900 bg-gray-900 font-medium text-white" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}
              >
                Todos · {envios.length}
              </button>
            </div>
          </div>

          <div className="overflow-x-auto border border-gray-200 rounded-lg">
            <table className="w-full text-sm" style={{ minWidth: 720 }}>
              <thead>
                <tr className="border-b border-gray-200">
                  {["Facturas", "Cliente", "Destino", "Bultos", "Estado", "Fecha", ""].map((h, i) => (
                    <th
                      key={h || `acc-${i}`}
                      className={`px-3 py-2.5 text-[12px] uppercase tracking-[0.06em] text-gray-400 font-semibold whitespace-nowrap ${h === "Bultos" ? "text-right" : "text-left"}`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibles.map((v) => {
                  const enGuia = v.guia_numero !== null;
                  const { rangos } = rangosDelEnvio(v.filas);
                  return (
                    <tr key={v.envio_id} data-envio={v.envio_id} className="border-b border-gray-100 last:border-0 align-top hover:bg-gray-50/60">
                      <td className="px-3 py-2.5">
                        {rangos.map((r) => (
                          <div key={r.fila.id} className="whitespace-nowrap">
                            <span className="font-mono tabular-nums">{r.fila.secuencial}</span>{" "}
                            <span className="text-gray-400 tabular-nums">· {textoRango(r)}</span>
                            {r.fila.nota && (
                              <span className="ml-2 rounded bg-gray-900 px-1.5 py-0.5 text-[12px] font-semibold text-white">{r.fila.nota}</span>
                            )}
                          </div>
                        ))}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="font-medium">{v.cliente_nombre}</div>
                        <div className="text-gray-500 whitespace-nowrap">{v.empresa}</div>
                      </td>
                      <td className="px-3 py-2.5">{v.destino}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{v.total}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[12px] ${
                            enGuia
                              ? "border-emerald-200 bg-emerald-50 font-medium text-emerald-800"
                              : "border-amber-200 bg-amber-50 text-amber-700"
                          }`}
                        >
                          {rotuloEstado(v)}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-gray-400 whitespace-nowrap">{fechaCorta(v.creado_en)}</td>
                      <td className="px-3 py-2.5 text-right">
                        <OverflowMenu
                          items={[
                            { label: "Reimprimir", onClick: () => setReimprimiendo(v) },
                            {
                              label: enGuia ? "Anular envío — bloqueado" : "Anular envío",
                              onClick: () => setAnulando(v),
                              destructive: true,
                              disabled: enGuia,
                            },
                          ]}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!cargando && visibles.length === 0 && (
              <p className="px-4 py-7 text-center text-sm text-gray-400">
                {filtro === "pendientes"
                  ? "Nada pendiente. Todo lo etiquetado ya salió en una guía."
                  : "Todavía no se ha etiquetado ningún envío."}
              </p>
            )}
            {cargando && <p className="px-4 py-7 text-center text-sm text-gray-400">Cargando…</p>}
          </div>
        </>
      )}

      {reimprimiendo && <ModalReimprimirEnvio envio={reimprimiendo} onCerrar={() => setReimprimiendo(null)} />}
      {anulando && (
        <ModalOverlay onBackdropClick={() => setAnulando(null)}>
          <div className="relative w-full max-w-sm rounded-t-2xl border border-gray-200 bg-white p-6 sm:rounded-lg">
            <h3 className="mb-1 text-base font-semibold">Anular el envío</h3>
            <p className="mb-1 text-sm text-gray-600">
              Se anulan las {anulando.total} etiquetas de {anulando.filas.length === 1 ? "la factura" : "las facturas"}{" "}
              {anulando.filas.map((f) => f.secuencial).join(", ")}. Después se pueden volver a etiquetar.
            </p>
            <p className="mb-4 text-xs text-gray-400">Queda guardado como historial: nada se borra de verdad.</p>
            <div className="flex gap-3">
              <button type="button" onClick={() => void anular()} className={`${BOTON_NEGRO} flex-1 bg-red-600 hover:bg-red-700`}>
                Anular envío
              </button>
              <button type="button" onClick={() => setAnulando(null)} className={`${BOTON_BLANCO} flex-1`}>
                Cancelar
              </button>
            </div>
          </div>
        </ModalOverlay>
      )}
      <Toast message={toast} />
    </div>
  );
}

// ─── El panel: armar el envío y, al final, imprimir ──────────────────────────

/** Una factura marcada en el envío, con lo que se le escribió. */
interface Marcada {
  clave: string;
  bultos: string;
  nota: string;
}

interface PanelProps {
  etiquetas: readonly EtiquetaFila[];
  deshabilitado: boolean;
  onCerrar: () => void;
  onListo: (mensaje: string) => Promise<void> | void;
  onRecargar: () => Promise<void> | void;
}

function PanelEnvio({ etiquetas, deshabilitado, onCerrar, onListo, onRecargar }: PanelProps) {
  const [cliente, setCliente] = useState<{ nombre: string; codigo: string } | null>(null);
  const [facturas, setFacturas] = useState<Factura[] | null>(null);
  const [cargando, setCargando] = useState(false);
  const [sinLista, setSinLista] = useState(false);
  const [actualizando, setActualizando] = useState(false);
  const [diasVisibles, setDiasVisibles] = useState(DIAS_CON_FACTURA_VISIBLES);
  const [diasAlternados, setDiasAlternados] = useState<ReadonlySet<string>>(new Set());
  const [empresaKey, setEmpresaKey] = useState<string | null>(null);
  // 🔴 EN EL ORDEN EN QUE SE MARCAN: ése es el orden de la numeración corrida.
  const [marcadas, setMarcadas] = useState<Marcada[]>([]);
  const [destino, setDestino] = useState("");
  const [destinoTocado, setDestinoTocado] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [formato, setFormato] = useFormatoEtiquetas();
  const [error, setError] = useState<string | null>(null);

  const [historicos, setHistoricos] = useState<Record<string, string[]>>({});
  const [definidos, setDefinidos] = useState<DefinidosPorCliente>({});
  useEffect(() => {
    fetch("/api/guias/frecuencias", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { destinos?: Record<string, string[]>; definidos?: DefinidosPorCliente } | null) => {
        if (!d) return;
        if (d.destinos) setHistoricos(d.destinos);
        if (d.definidos) setDefinidos(d.definidos);
      })
      .catch(() => { /* sin botones de destino; se escribe a mano */ });
  }, []);

  const cargarFacturas = useCallback(async (codigo: string) => {
    setCargando(true);
    setSinLista(false);
    try {
      const r = await fetch(`/api/guias/facturas-cliente?codigo=${encodeURIComponent(codigo)}`, { cache: "no-store" });
      if (!r.ok) throw new Error("no ok");
      const d = (await r.json()) as { facturas?: Factura[] };
      setFacturas(Array.isArray(d.facturas) ? d.facturas : []);
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

  // Lo ya etiquetado no se ofrece, y se DICE cuánto se escondió. 🔴 1-oct-2026:
  // tampoco lo que ya salió en una guía (la MISMA regla del chip «Ya salió en
  // GT-xxx» de Nueva guía), y también se dice.
  const { visibles, escondidas, yaSalieron } = facturasParaEtiquetar(facturas ?? [], etiquetas);

  // 🔴 EL ENVÍO ES DE UNA EMPRESA: si el cliente tiene facturas en varias, se
  // elige cuál; con una sola, ya viene elegida.
  const empresas = useMemo(() => {
    const vistas = new Map<string, string>();
    for (const f of visibles) if (!vistas.has(f.empresa_key)) vistas.set(f.empresa_key, f.empresa);
    return [...vistas.entries()].map(([key, nombre]) => ({ key, nombre }));
  }, [visibles]);
  const empresaElegida = empresas.length === 1 ? empresas[0].key : empresaKey;
  const deLaEmpresa = visibles.filter((f) => f.empresa_key === empresaElegida);
  const { grupos, diasOcultos } = agruparPorDia(deLaEmpresa, diasVisibles);
  const diaMasReciente = grupos[0]?.dia ?? null;

  const porClave = new Map(deLaEmpresa.map((f) => [claveFactura(f), f]));
  const enElEnvio = marcadas.filter((m) => porClave.has(m.clave));
  const atajos = useMemo(() => notasMasUsadas(etiquetas), [etiquetas]);

  // La vista previa de los rangos: lo mismo que va a salir en el papel.
  const previa = useMemo(() => {
    const filas = enElEnvio.map((m, i) => ({
      id: i + 1,
      orden_en_envio: i + 1,
      cajas: validarCajas(m.bultos).ok ? Number(m.bultos) : 0,
      clave: m.clave,
      nota: normalizarNota(m.nota),
    }));
    return rangosDelEnvio(filas);
  }, [enElEnvio]);

  const botones = cliente ? botonesDeDestino(cliente.codigo, historicos[cliente.codigo] ?? [], definidos) : [];

  function elegirCliente(nombre: string, codigo: string) {
    setCliente(codigo ? { nombre, codigo } : null);
    setFacturas(null);
    setMarcadas([]);
    setEmpresaKey(null);
    setError(null);
    setDiasVisibles(DIAS_CON_FACTURA_VISIBLES);
    setDiasAlternados(new Set());
    setDestinoTocado(false);
    setDestino(codigo ? (destinoParaAutollenar(codigo, historicos[codigo] ?? [], definidos) ?? "") : "");
  }

  function elegirEmpresa(key: string) {
    setEmpresaKey(key);
    setMarcadas([]); // un envío es de UNA empresa: lo marcado de otra no viaja
    setError(null);
  }

  function alternarFactura(clave: string) {
    setError(null);
    setMarcadas((m) => (m.some((x) => x.clave === clave) ? m.filter((x) => x.clave !== clave) : [...m, { clave, bultos: "", nota: "" }]));
  }

  /**
   * 🔴 EL ORDEN DE LOS BULTOS SE CAMBIA CON ↑ ↓ (1-oct-2026). El orden de la
   * lista ES el `orden_en_envio` que se guarda y la numeración que se imprime.
   */
  function mover(clave: string, paso: -1 | 1) {
    setError(null);
    setMarcadas((m) => {
      // Se mueve entre las del envío (las de la empresa elegida), no entre las ocultas.
      const delEnvio = m.filter((x) => porClave.has(x.clave));
      const otras = m.filter((x) => !porClave.has(x.clave));
      return [...moverEnElEnvio(delEnvio, delEnvio.findIndex((x) => x.clave === clave), paso), ...otras];
    });
  }

  function cambiar(clave: string, campo: "bultos" | "nota", valor: string) {
    setError(null);
    setMarcadas((m) => m.map((x) => (x.clave === clave ? { ...x, [campo]: valor } : x)));
  }

  /** Lo que falta para imprimir, o `null`. Las validaciones son SINCRÓNICAS a propósito. */
  function faltaAlgo(): string | null {
    if (!cliente) return "Selecciona el cliente";
    if (enElEnvio.length === 0) return "Marca al menos una factura";
    for (const m of enElEnvio) {
      const f = porClave.get(m.clave) as Factura;
      const v = validarCajas(m.bultos);
      if (!v.ok) return `${f.secuencial}: ${v.error}`;
      const n = normalizarNota(m.nota);
      if (!n.ok) return `${f.secuencial}: ${n.error}`;
      if (f.switch_factura_id == null) return `${f.secuencial} todavía no tiene su número interno. Toca «Actualizar ahora».`;
    }
    if (previa.total > MAX_CAJAS) return `Son demasiados bultos para un envío (el tope es ${MAX_CAJAS})`;
    if (!destino.trim()) return "Escribe el destino del envío";
    return null;
  }

  async function imprimirEnvio() {
    if (guardando || !cliente) return;
    const falta = faltaAlgo();
    if (falta) { setError(falta); return; }
    setGuardando(true);
    setError(null);
    const cuerpo = {
      empresa_key: empresaElegida,
      cliente_codigo: cliente.codigo,
      cliente_nombre: cliente.nombre,
      destino: destino.trim(),
      facturas: enElEnvio.map((m) => {
        const f = porClave.get(m.clave) as Factura;
        return {
          switch_factura_id: f.switch_factura_id,
          secuencial: f.secuencial,
          fecha_factura: String(f.fecha ?? "").slice(0, 10),
          cajas: Number(m.bultos),
          nota: (normalizarNota(m.nota) as { ok: true; valor: string | null }).valor,
        };
      }),
    };
    // 🔴 LA PESTAÑA DEL PDF NACE DENTRO DEL CLIC, ANTES DEL POST (Safari bloquea
    // una ventana que nace después de un `await`). Si el servidor dice que no,
    // la pestaña vacía se cierra sola.
    let creadas: EtiquetaFila[] | null = null;
    try {
      await abrirPdfEnPestana(async () => {
        const r = await fetch("/api/guias/etiquetas", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(cuerpo),
        });
        const d = (await r.json().catch(() => ({}))) as { etiquetas?: EtiquetaFila[]; error?: string };
        if (!r.ok || !Array.isArray(d.etiquetas) || d.etiquetas.length === 0) {
          setError(d.error || "No se pudo guardar");
          // 🔴 409: otra persona etiquetó alguna de estas facturas. Se relee la
          // lista para que salga escondida y se DICE cuál fue.
          if (r.status === 409) void onRecargar();
          return null;
        }
        creadas = d.etiquetas;
        return pdfDelEnvio(d.etiquetas, formato)();
      });
      const guardadas = creadas as EtiquetaFila[] | null;
      if (guardadas) {
        const total = guardadas.reduce((s, e) => s + e.cajas, 0);
        await onListo(`Listo · ${total} etiquetas — se abrieron en otra pestaña`);
        onCerrar();
      }
    } catch {
      setError("Sin conexión. No se guardó nada — revisa el internet y vuelve a intentar.");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold">Nuevo envío</h2>
        <button type="button" onClick={onCerrar} className="text-sm text-gray-500 transition hover:text-black min-h-[44px]">
          Volver a la lista
        </button>
      </div>

      {/* ── 1 · Cliente y facturas ── */}
      <div className="rounded-lg border border-gray-200 p-4">
        <Paso
          n={1}
          titulo="Cliente y facturas"
          ayuda="Marca las facturas que van juntas en este envío y escribe los bultos de cada una."
        />
        <div className="max-w-sm">
          <ClientePicker
            id="etiquetas-cliente"
            value={cliente?.nombre ?? ""}
            codigo={cliente?.codigo ?? ""}
            codigosOcultos={CODIGOS_RETIRADOS_DE_GUIAS}
            permitirOtro={false}
            onChange={elegirCliente}
          />
        </div>

        {cliente && (
          <div className="mt-4">
            {cargando && <p className="text-sm text-gray-400">Buscando facturas…</p>}
            {!cargando && sinLista && (
              <p className="text-sm text-amber-700">No se pudieron cargar las facturas. Intenta de nuevo en unos segundos.</p>
            )}
            {!cargando && facturas && facturas.length === 0 && (
              <p className="text-sm text-gray-500">Este cliente no tiene facturas registradas.</p>
            )}
            {!cargando && facturas && facturas.length > 0 && visibles.length === 0 && (
              <p className="text-sm text-gray-500">
                {yaSalieron > 0
                  ? "Este cliente no tiene facturas por etiquetar."
                  : "Todas las facturas de este cliente ya están etiquetadas — míralas en la lista."}
              </p>
            )}

            {!cargando && empresas.length > 1 && (
              <div className="mb-3">
                <div className="mb-1.5 text-xs uppercase tracking-[0.05em] text-gray-400">Empresa</div>
                <div className="flex flex-wrap gap-2" role="group" aria-label="Empresa del envío">
                  {empresas.map((e) => (
                    <button
                      key={e.key}
                      type="button"
                      aria-pressed={empresaElegida === e.key}
                      onClick={() => elegirEmpresa(e.key)}
                      className={`${CHIP} ${empresaElegida === e.key ? "border-gray-900 bg-gray-900 font-medium text-white" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}
                    >
                      {e.nombre}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {!cargando && deLaEmpresa.length > 0 && (
              <div className="space-y-4">
                {grupos.map(({ dia, facturas: fs }) => {
                  const abierto = diaAbierto(dia, diaMasReciente, diasAlternados);
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
                        <span className="text-xs tabular-nums text-gray-400">{`· ${resumenDelDia(fs.length, 0, true)}`}</span>
                      </button>
                      {abierto && (
                        <ul>
                          {fs.map((f) => {
                            const clave = claveFactura(f);
                            const m = marcadas.find((x) => x.clave === clave);
                            const rango = previa.rangos.find((r) => r.fila.clave === clave);
                            // 🔴 1-oct-2026: el NÚMERO DE ORDEN de la factura (1, 2, 3…), que es el orden de los bultos.
                            const orden = enElEnvio.findIndex((x) => x.clave === clave) + 1;
                            return (
                              <li key={clave} className="border-t border-gray-100 first:border-t-0">
                                <label className="flex min-h-[44px] cursor-pointer flex-wrap items-center gap-3 py-1.5 text-sm">
                                  <input
                                    type="checkbox"
                                    checked={Boolean(m)}
                                    onChange={() => alternarFactura(clave)}
                                    className="h-4 w-4 shrink-0 accent-black"
                                  />
                                  {ETIQUETAS_2026_10 && orden > 0 && (
                                    <span
                                      data-orden={orden}
                                      aria-label={`Orden ${orden}`}
                                      className="inline-flex h-6 min-w-[24px] shrink-0 items-center justify-center rounded-full bg-gray-900 px-1.5 text-xs font-semibold tabular-nums text-white"
                                    >
                                      {orden}
                                    </span>
                                  )}
                                  <span className="shrink-0 font-mono tabular-nums">{f.secuencial}</span>
                                  <span className="ml-auto shrink-0 tabular-nums text-gray-600">{fmtMonto(f.total)}</span>
                                </label>
                                {m && (
                                  <div className="mb-3 ml-7 flex flex-wrap items-start gap-3">
                                    <div>
                                      <label htmlFor={`envio-bultos-${clave}`} className="mb-1 block text-xs text-gray-500">Bultos</label>
                                      <input
                                        id={`envio-bultos-${clave}`}
                                        type="number"
                                        inputMode="numeric"
                                        min={1}
                                        max={MAX_CAJAS}
                                        value={m.bultos}
                                        onChange={(e) => cambiar(clave, "bultos", e.target.value)}
                                        className="w-[96px] rounded-md border border-gray-200 px-3 text-center font-mono text-lg font-semibold outline-none transition focus:border-black min-h-[44px]"
                                      />
                                      {rango && rango.hasta >= rango.desde && (
                                        <div className="mt-1 text-xs tabular-nums text-gray-500">Bultos {textoRango(rango)}</div>
                                      )}
                                    </div>
                                    <div className="min-w-[180px] flex-1">
                                      <label htmlFor={`envio-nota-${clave}`} className="mb-1 block text-xs text-gray-500">
                                        Nota <span className="text-gray-400">(opcional)</span>
                                      </label>
                                      <input
                                        id={`envio-nota-${clave}`}
                                        type="text"
                                        maxLength={MAX_NOTA}
                                        value={m.nota}
                                        autoCapitalize="characters"
                                        onChange={(e) => cambiar(clave, "nota", e.target.value.toUpperCase())}
                                        placeholder="Ej.: FRÁGIL"
                                        className="w-full max-w-[240px] rounded-md border border-gray-200 px-3 text-base uppercase sm:text-sm outline-none transition focus:border-black min-h-[44px]"
                                      />
                                      {atajos.length > 0 && (
                                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                                          {atajos.map((n) => (
                                            <button
                                              key={n}
                                              type="button"
                                              aria-pressed={m.nota === n}
                                              onClick={() => cambiar(clave, "nota", m.nota === n ? "" : n)}
                                              className={`inline-flex min-h-[44px] items-center rounded-md border px-2.5 text-xs transition md:[@media(pointer:fine)]:min-h-0 md:[@media(pointer:fine)]:py-1 ${
                                                m.nota === n
                                                  ? "border-gray-900 bg-gray-900 font-medium text-white"
                                                  : "border-gray-200 text-gray-500 hover:border-gray-300 hover:text-black"
                                              }`}
                                            >
                                              {n}
                                            </button>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                )}
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>
                  );
                })}
                {diasOcultos > 0 && (
                  <button
                    type="button"
                    onClick={() => setDiasVisibles((v) => v + DIAS_POR_VER_MAS)}
                    className="inline-flex min-h-[44px] items-center text-xs text-gray-400 transition hover:text-black md:[@media(pointer:fine)]:min-h-0"
                  >
                    Ver más días
                  </button>
                )}
              </div>
            )}

            {!cargando && escondidas > 0 && (
              <p className="mt-2 text-xs text-gray-500">{textoEscondidasPorEtiqueta(escondidas)}</p>
            )}
            {!cargando && yaSalieron > 0 && (
              <p className="mt-1 text-xs text-gray-500">{textoEscondidasPorGuia(yaSalieron)}</p>
            )}

            {!cargando && (
              <div className="mt-3 flex flex-wrap items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
                <span>{TEXTO_TRAER_DE_SWITCH}</span>
                <button
                  type="button"
                  onClick={() => void actualizarAhora()}
                  disabled={actualizando}
                  className={`${BOTON_BLANCO} ml-auto px-3 text-[13px]`}
                >
                  {actualizando ? TEXTO_ACTUALIZANDO : TEXTO_ACTUALIZAR_AHORA}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── 2 · Destino: UNO por envío ── */}
      <div className="mt-3 rounded-lg border border-gray-200 p-4">
        <Paso n={2} titulo="Destino" ayuda="Uno para todo el envío." />
        <input
          type="text"
          value={destino}
          onChange={(e) => { setDestino(e.target.value); setDestinoTocado(true); }}
          placeholder="A dónde va el envío"
          aria-label="Destino del envío"
          className="w-full max-w-sm rounded-md border border-gray-200 px-3 text-base sm:text-sm outline-none transition focus:border-black min-h-[44px]"
        />
        {botones.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-x-1.5 gap-y-1">
            {botones.map((d) => (
              <button
                key={d}
                type="button"
                aria-pressed={destino === d}
                onClick={() => { setDestino(d); setDestinoTocado(true); }}
                className={`inline-flex min-h-[44px] items-center rounded-md border px-2.5 text-xs transition md:[@media(pointer:fine)]:min-h-0 md:[@media(pointer:fine)]:py-1 ${
                  destino === d
                    ? "border-gray-900 bg-gray-900 font-medium text-white"
                    : "border-gray-200 text-gray-500 hover:border-gray-300 hover:text-black"
                }`}
              >
                {d}
              </button>
            ))}
          </div>
        )}
        {!destinoTocado && destino && (
          <p className="mt-1.5 text-xs text-gray-500">Se llenó solo con el destino de siempre de este cliente.</p>
        )}
      </div>

      {/* ── 3 · Imprimir: al final, con el envío completo ── */}
      <div className="mt-3 rounded-lg border border-gray-200 p-4">
        <Paso n={3} titulo="Imprimir" ayuda={`${AYUDA_FORMATO[formato]} Al imprimir, el envío queda cerrado.`} />
        <ElegirPapel formato={formato} onElegir={setFormato} />
        {enElEnvio.length > 0 && (
          <ul data-testid="resumen-envio" className="mb-3 text-sm">
            {previa.rangos.map((r, i) => {
              const f = porClave.get(r.fila.clave) as Factura;
              const nota = r.fila.nota;
              return (
                <li key={r.fila.clave} className="flex flex-wrap items-center gap-2 py-0.5">
                  {ETIQUETAS_2026_10 && (
                    <>
                      <span className="w-5 shrink-0 text-right text-xs font-semibold tabular-nums text-gray-500">{i + 1}</span>
                      <button
                        type="button"
                        aria-label={`Subir ${f.secuencial}`}
                        disabled={i === 0}
                        onClick={() => mover(r.fila.clave, -1)}
                        className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md border border-gray-200 text-gray-600 transition hover:text-black disabled:opacity-30 md:[@media(pointer:fine)]:min-h-[32px] md:[@media(pointer:fine)]:min-w-[32px]"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        aria-label={`Bajar ${f.secuencial}`}
                        disabled={i === previa.rangos.length - 1}
                        onClick={() => mover(r.fila.clave, 1)}
                        className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md border border-gray-200 text-gray-600 transition hover:text-black disabled:opacity-30 md:[@media(pointer:fine)]:min-h-[32px] md:[@media(pointer:fine)]:min-w-[32px]"
                      >
                        ↓
                      </button>
                    </>
                  )}
                  <span className="font-mono tabular-nums">{f.secuencial}</span>
                  <span className="tabular-nums text-gray-500">
                    {r.fila.cajas > 0 ? `bultos ${textoRango(r)} de ${previa.total}` : "faltan los bultos"}
                  </span>
                  {nota.ok && nota.valor && (
                    <span className="rounded bg-gray-900 px-1.5 py-0.5 text-[12px] font-semibold text-white">{nota.valor}</span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void imprimirEnvio()}
            disabled={guardando || deshabilitado || enElEnvio.length === 0}
            className={BOTON_NEGRO}
          >
            {guardando ? "Guardando…" : previa.total > 0 ? textoImprimir(previa.total, formato) : "Imprimir"}
          </button>
          <button type="button" onClick={onCerrar} className={BOTON_BLANCO}>Cancelar</button>
        </div>
      </div>
    </div>
  );
}

// ─── Reimprimir: el envío completo o un bulto (copia idéntica) ───────────────

function ModalReimprimirEnvio({ envio, onCerrar }: { envio: Envio; onCerrar: () => void }) {
  const [modo, setModo] = useState<"envio" | "uno">("envio");
  const [bulto, setBulto] = useState("1");
  const [formato, setFormato] = useFormatoEtiquetas();

  const n = Number(bulto);
  const valido = Number.isInteger(n) && n >= 1 && n <= envio.total;
  const deQuien = valido ? facturaDelBulto(envio.filas, n) : null;

  async function dale() {
    if (modo === "envio") await abrirPdfEnPestana(pdfDelEnvio(envio.filas, formato));
    else if (valido) await abrirPdfEnPestana(pdfDelEnvio(envio.filas, formato, n));
    onCerrar();
  }

  return (
    <ModalOverlay onBackdropClick={onCerrar}>
      <div className="relative w-full max-w-sm rounded-t-2xl border border-gray-200 bg-white p-6 sm:rounded-lg">
        <h3 className="mb-1 text-base font-semibold">Reimprimir el envío</h3>
        <p className="mb-4 text-sm text-gray-600">
          {envio.cliente_nombre} · {envio.empresa} · {envio.destino} · {envio.total} bultos
          {envio.guia_numero !== null ? ` · en ${rotuloGuia(envio.guia_numero)}` : ""}
        </p>
        <Opcion
          elegida={modo === "envio"}
          onElegir={() => setModo("envio")}
          titulo="Envío completo"
          detalle={`Las ${envio.total} etiquetas, iguales a las impresas.`}
        />
        <Opcion
          elegida={modo === "uno"}
          onElegir={() => setModo("uno")}
          titulo="Un solo bulto"
          detalle={formato === "4x6" ? "Una sola etiqueta de 4×6." : "Una hoja, la etiqueta arriba a la izquierda y el resto en blanco."}
        >
          <div className="mt-2 flex items-center gap-2.5">
            <span className="text-sm text-gray-600">Bulto</span>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={envio.total}
              value={bulto}
              onChange={(e) => setBulto(e.target.value)}
              aria-label="Bulto"
              onClick={(e) => e.stopPropagation()}
              className="w-[86px] rounded-md border border-gray-200 px-2 text-center font-mono outline-none transition focus:border-black min-h-[44px]"
            />
            <span className="text-sm text-gray-600">de {envio.total}</span>
          </div>
          {deQuien && <p className="mt-1 text-xs text-gray-500">Es de la factura {deQuien.secuencial}.</p>}
        </Opcion>
        <div className="mt-3">
          <ElegirPapel formato={formato} onElegir={setFormato} />
          <p className="text-[12.5px] text-gray-600">{AYUDA_FORMATO[formato]}</p>
        </div>
        <div className="mt-4 flex gap-3">
          <button type="button" onClick={() => void dale()} disabled={modo === "uno" && !valido} className={`${BOTON_NEGRO} flex-1`}>
            Imprimir
          </button>
          <button type="button" onClick={onCerrar} className={`${BOTON_BLANCO} flex-1`}>Cancelar</button>
        </div>
      </div>
    </ModalOverlay>
  );
}
