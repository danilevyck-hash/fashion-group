"use client";

// ─────────────────────────────────────────────────────────────────────────────
// LA LISTA DE UNA EMPRESA, EN EL CELULAR (2c · 2e · 5b · 10c, 24-sep-2026).
//
// 🩸 La de antes: 45 cosas tocables. Doce botones ANTES del primer reclamo —que
// empezaba en y=423 de 844 px— y tres botones DENTRO de cada tarjeta de 174 px:
// 2,5 reclamos por pantalla. Medido: 9 correos en toda la historia del módulo
// contra 14 cobros, 9 de ellos en septiembre; el botón que más ocupaba era el
// que menos se usa.
//
// AHORA:
//  · 2c — la fila no tiene botones: se toca el reclamo y adentro está todo.
//  · 2e — un botón negro fijo abajo («Nuevo reclamo») y los otros cuatro en el
//         «···» de arriba.
//  · 5b — en «Cobrados», visto verde y la fecha DEL COBRO; los días se van.
//  · 10c — «Elegir» se pide UNA vez desde arriba: sin menú por fila, así
//         «Eliminar» no puede volver a caer encima del reclamo de abajo.
//
// 🔴 NADA DE LO QUE SE GUARDA CAMBIA: el correo y las descargas salen por
// `descargas.ts`, el MISMO módulo que usa la computadora.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from "react";
import { Toast } from "@/components/ui";
import UndoToast from "@/components/UndoToast";
import { useUndoAction } from "@/lib/hooks/useUndoAction";
import { hoyPanama } from "@/lib/fecha-panama";
import { nombreCortoEmpresa } from "@/lib/empresa-mapping";
import { fechaDeCobro } from "@/lib/reclamos/portada";
import { facturasDe } from "@/lib/reclamos/facturas";
import { diasDesde } from "@/lib/reclamos/dias";
import { filtrarPorEstado, ordenarReclamos, ordenDesdeUrl, type FiltroEstado } from "@/lib/reclamos/orden";
import { botonMandar, lineaCobrado, lineaReclamo, montoCel, tituloSeleccion } from "@/lib/reclamos/celular";
import { calcSub, empresaKeyDeReclamo, reclamoTaxes } from "../constants";
import { bajar, pedirLote, mandarAlProveedor, textoDelEnvio, type Descarga } from "../descargas";
import type { Contacto, Reclamo } from "../types";
import { BotonMas, Casilla, CtaFija, FilaCel, Visto } from "./piezas";
import { HojaCorreo, HojaOpciones, type OpcionDeHoja } from "./HojasReclamosCelular";
import { tituloCelular, usaBarraCelular } from "@/lib/navegacion/barra-controles-celular";
import { RECLAMOS_APPLE_2026_10, lineaPendientes } from "@/lib/reclamos/apple-2026-10";
import { resumenViejos } from "@/lib/reclamos/viejos";
import { estaReclamado } from "@/lib/reclamos/reclamado";
import { CLASE_TITULO_BARRA } from "@/components/celular/BarraDeControles";
import { CLASE_LINEA_TOTAL, CLASE_TOTAL_CELULAR } from "@/components/celular/CabeceraCompacta";

interface Props {
  role: string;
  activeEmpresa: string;
  reclamos: Reclamo[];
  contactos: Contacto[];
  selectionMode: boolean;
  setSelectionMode: (v: boolean) => void;
  selectedIds: string[];
  setSelectedIds: React.Dispatch<React.SetStateAction<string[]>>;
  onNewReclamo: () => void;
  onLoadDetail: (id: string) => void;
  onDeleteSelected: (ids: string[]) => void;
  onReload: () => void;
  /** `RECLAMOS_APPLE_2026_10` (5-oct-2026). Las pruebas lo fuerzan. */
  apple?: boolean;
}

export default function ListaEmpresaCelular({
  role, activeEmpresa, reclamos, contactos,
  selectionMode, setSelectionMode, selectedIds, setSelectedIds,
  onNewReclamo, onLoadDetail, onDeleteSelected, onReload,
  apple: appleProp = RECLAMOS_APPLE_2026_10,
}: Props) {
  const hoy = hoyPanama();
  const esAdmin = role === "admin";
  const [filtro, setFiltro] = useState<FiltroEstado>("por-cobrar");
  const [hoja, setHoja] = useState<"mas" | "correo" | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const decir = (m: string) => { setToast(m); setTimeout(() => setToast(null), 3000); };
  // 🔴 EL CORREO SE DESHACE 5 SEGUNDOS (8b), como «Cobrar» en Cuentas por
  // Cobrar. La ventana de la computadora lo manda al toque y no se tocó: acá
  // el POST es el MISMO, solo que sale 5 segundos después.
  const { pendingUndo, scheduleAction, undoAction } = useUndoAction();

  const delEmpresa = reclamos.filter((r) => r.empresa === activeEmpresa);
  const porCobrar = filtrarPorEstado(delEmpresa, "por-cobrar");
  const cobrados = filtrarPorEstado(delEmpresa, "cobrados");
  const totalDe = (r: Reclamo) => reclamoTaxes(r.empresa, calcSub(r.reclamo_items ?? [])).total;
  // El MISMO orden de la computadora: la factura más vieja primero.
  const visibles = ordenarReclamos(filtrarPorEstado(delEmpresa, filtro), ordenDesdeUrl(""), totalDe);
  const montoPorCobrar = porCobrar.reduce((s, r) => s + totalDe(r), 0);

  const c = contactos.find((ct) => ct.empresa === activeEmpresa) || null;
  const key = empresaKeyDeReclamo(activeEmpresa);
  const nombreCorto = key ? nombreCortoEmpresa(key) : activeEmpresa;

  const elegidos = selectedIds.filter((id) => visibles.some((r) => r.id === id));
  const hayEleccion = selectionMode && elegidos.length > 0;
  /** Lo que viaja: lo elegido, o lo que se está mirando (la regla de siempre). */
  const idsObjetivo = hayEleccion ? elegidos : visibles.map((r) => r.id);
  const montoObjetivo = visibles
    .filter((r) => idsObjetivo.includes(r.id))
    .reduce((s, r) => s + totalDe(r), 0);
  const sufijo = filtro === "cobrados" ? "cobrados" : "pendientes";

  function alternar(id: string) {
    setSelectedIds((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  }

  async function descargarLote(tipo: Descarga) {
    if (ocupado || idsObjetivo.length === 0) return;
    setOcupado(true);
    try {
      const blob = await pedirLote(activeEmpresa, tipo, idsObjetivo);
      bajar(blob, `Reclamos-${sufijo}-${nombreCorto}-${hoy}.${tipo === "excel" ? "xlsx" : "pdf"}`);
      decir(`${tipo === "excel" ? "Excel" : "PDF"} descargado — ${idsObjetivo.length} reclamo${idsObjetivo.length === 1 ? "" : "s"}`);
      onReload();
    } catch (e) {
      decir(e instanceof Error ? e.message : "No se pudo armar el archivo. Intenta de nuevo.");
    } finally { setOcupado(false); }
  }

  const objetivo = visibles.filter((r) => idsObjetivo.includes(r.id));
  const facturasQueViajan = objetivo.filter((r) => !!r.factura_pdf_path).length;
  const fotosQueViajan = objetivo.reduce((s, r) => s + (r.reclamo_fotos?.length ?? 0), 0);

  const opciones: OpcionDeHoja[] = [
    ...(filtro === "por-cobrar" && idsObjetivo.length > 0
      ? [{ label: botonMandar(idsObjetivo.length), onClick: () => setHoja("correo") }]
      : []),
    ...(idsObjetivo.length > 0
      ? [
          { label: "Descargar en Excel", onClick: () => { void descargarLote("excel"); } },
          { label: "Descargar en PDF", onClick: () => { void descargarLote("pdf"); } },
        ]
      : []),
    ...(selectionMode
      ? [{ label: "Cancelar selección", onClick: () => { setSelectionMode(false); setSelectedIds([]); } }]
      : [{ label: "Seleccionar", onClick: () => { setSelectionMode(true); setSelectedIds([]); } }]),
    ...(hayEleccion && esAdmin
      ? [{ label: `Eliminar ${elegidos.length === 1 ? "el reclamo" : `los ${elegidos.length}`}`, onClick: () => onDeleteSelected(elegidos), destructive: true }]
      : []),
    ...(c?.correo
      ? [{ label: c.nombre_contacto || c.nombre ? `Enviar correo a ${c.nombre_contacto || c.nombre}` : "Enviar correo al proveedor", onClick: () => { window.location.href = `mailto:${c.correo}`; } }]
      : []),
  ];

  const seleccion = tituloSeleccion(elegidos.length, visibles.length, montoObjetivo, filtro === "cobrados");
  // 🔴 Apple (5-oct-2026, apagado): la empresa abre como la portada —el monto
  // grande y UNA línea gris con lo que pide atención y el contacto—. Solo con
  // la barra v3.3 y fuera del modo «Seleccionar», que tiene su propio título.
  const apple = appleProp && usaBarraCelular(true);
  const cabeceraApple = apple && !selectionMode;
  const lineaApple = lineaPendientes(
    porCobrar.length,
    resumenViejos(delEmpresa, hoy).n,
    porCobrar.filter((r) => !estaReclamado(r)).length,
  );
  const contactoNombre = (c?.nombre_contacto || c?.nombre || "").trim();

  return (
    <div data-celular="reclamos-lista" className="min-h-screen bg-fondo-celular pb-28">
      {cabeceraApple ? (
        <div data-cabecera-apple className="px-4">
          <div data-fila-del-avatar className="flex h-11 min-w-0 items-center gap-1">
            <h1 className={`min-w-0 flex-1 truncate ${CLASE_TITULO_BARRA}`}>{nombreCorto}</h1>
            <BotonMas onClick={() => setHoja("mas")} etiqueta="Más opciones" />
          </div>
          <span className={`${CLASE_TOTAL_CELULAR} pt-1`}>{montoCel(montoPorCobrar)}</span>
          <span className={CLASE_LINEA_TOTAL}>
            {lineaApple.texto}
            {lineaApple.alertas.map((a) => <span key={a}> · <span className="font-medium text-red-600">{a}</span></span>)}
            {contactoNombre && ` · ${contactoNombre}`}
          </span>
        </div>
      ) : (
      <div data-fila-del-avatar className="flex items-start justify-between gap-2 px-4 pt-3">
        <div className="min-w-0">
          <h1 className={tituloCelular("truncate text-[28px] font-bold leading-tight tracking-tight text-gray-900")}>
            {selectionMode ? seleccion.titulo : nombreCorto}
          </h1>
          <p className="mt-0.5 text-[15px] text-gray-500">
            {selectionMode
              ? seleccion.sub
              : `${(c?.nombre_contacto || c?.nombre || "").trim() || "Sin contacto"} · ${montoCel(montoPorCobrar)} pendiente`}
          </p>
        </div>
        <div className="flex shrink-0 items-center">
          {selectionMode && (
            <button
              type="button"
              onClick={() =>
                elegidos.length === visibles.length
                  ? setSelectedIds([])
                  : setSelectedIds(visibles.map((r) => r.id))
              }
              className="min-h-[44px] px-2 text-[15px] text-blue-600 active:opacity-60"
            >
              {elegidos.length === visibles.length ? "Ninguno" : "Todos"}
            </button>
          )}
          <BotonMas onClick={() => setHoja("mas")} etiqueta="Más opciones" />
        </div>
      </div>
      )}

      {/* Las dos pestañas de siempre: abre en «Pendientes». */}
      <div className="mx-4 mt-3 flex rounded-xl bg-control-celular p-1">
        {([["por-cobrar", `Pendientes · ${porCobrar.length}`], ["cobrados", `Cobrados · ${cobrados.length}`]] as const).map(
          ([k, txt]) => (
            <button
              key={k}
              type="button"
              aria-pressed={filtro === k}
              onClick={() => { setFiltro(k); setSelectedIds([]); }}
              className={`min-h-[36px] flex-1 rounded-lg text-[14px] font-medium transition ${
                filtro === k ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"
              }`}
            >
              {txt}
            </button>
          ),
        )}
      </div>

      {visibles.length === 0 ? (
        <p className="mx-4 mt-4 rounded-2xl bg-white px-4 py-10 text-center text-[15px] text-gray-500">
          {filtro === "por-cobrar" ? `Sin pendientes con ${nombreCorto}` : "Todavía no se cobró ninguno"}
        </p>
      ) : (
        <ul data-lista="reclamos-empresa" className="mx-4 mt-4 overflow-hidden rounded-2xl bg-white">
          {visibles.map((r) => {
            const cobrado = filtro === "cobrados";
            const fotos = r.reclamo_fotos?.length ?? 0;
            const linea = lineaReclamo({
              facturas: facturasDe(r.nro_factura),
              fotos,
              dias: diasDesde(r.fecha_factura, hoy),
            });
            return (
              <FilaCel
                key={r.id}
                marca="reclamo"
                titulo={r.nro_reclamo}
                sub={
                  cobrado ? (
                    lineaCobrado(fechaDeCobro(r), fotos)
                  ) : (
                    <>
                      <span className={linea.rojo ? "text-red-600" : undefined}>{linea.texto}</span>
                      {apple && !estaReclamado(r) && <> · <span className="text-red-600">sin reclamar</span></>}
                    </>
                  )
                }
                monto={montoCel(totalDe(r))}
                izquierda={
                  selectionMode ? <Casilla marcada={elegidos.includes(r.id)} /> : cobrado ? <Visto /> : null
                }
                onClick={() => (selectionMode ? alternar(r.id) : onLoadDetail(r.id))}
              />
            );
          })}
        </ul>
      )}

      {selectionMode ? (
        <CtaFija
          marca="seleccion"
          disabled={elegidos.length === 0 || ocupado}
          onClick={() => (filtro === "por-cobrar" ? setHoja("correo") : void descargarLote("pdf"))}
        >
          {filtro === "por-cobrar"
            ? botonMandar(elegidos.length)
            : `Descargar ${elegidos.length === 1 ? "el reclamo" : `los ${elegidos.length}`} en PDF`}
        </CtaFija>
      ) : (
        <CtaFija marca="nuevo" onClick={onNewReclamo}>Nuevo reclamo</CtaFija>
      )}

      {hoja === "mas" && (
        <HojaOpciones
          titulo={`${nombreCorto} · ${porCobrar.length} ${porCobrar.length === 1 ? "pendiente" : "pendientes"}`}
          opciones={opciones}
          onCerrar={() => setHoja(null)}
        />
      )}
      {hoja === "correo" && (
        <HojaCorreo
          empresa={activeEmpresa}
          contactoNombre={c?.nombre_contacto || c?.nombre}
          correo={c?.correo || ""}
          cuantos={idsObjetivo.length}
          facturas={facturasQueViajan}
          fotos={fotosQueViajan}
          enviando={ocupado}
          onCerrar={() => setHoja(null)}
          onMandar={(envio) => {
            const ids = [...idsObjetivo];
            setHoja(null);
            setSelectionMode(false);
            setSelectedIds([]);
            scheduleAction({
              id: `correo-${ids.join(",")}`,
              message: `Se envía a ${envio.to}`,
              execute: async () => {
                try {
                  const data = await mandarAlProveedor(activeEmpresa, ids, envio);
                  decir(textoDelEnvio(data, envio.to, envio.cc));
                  onReload();
                } catch (e) {
                  decir(e instanceof Error ? e.message : "No se pudo enviar el correo.");
                }
              },
            });
          }}
        />
      )}

      <Toast message={toast} />
      {pendingUndo && (
        <UndoToast message={pendingUndo.message} startedAt={pendingUndo.startedAt} onUndo={undoAction} />
      )}
    </div>
  );
}
