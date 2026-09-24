"use client";

// ─────────────────────────────────────────────────────────────────────────────
// EL RECLAMO ABIERTO, EN EL CELULAR (3b · 3e · 6b · 7b · 8b · 11c, 24-sep-2026).
//
// 🩸 La pantalla de antes: cabecera de cinco renglones —en la computadora es una
// línea—, cuatro botones en dos filas y DOS menús que no se conocían («Descargar
// ⌄» y «···»), y al pie dos cajas siempre abiertas: Fotos (28 de los 33
// reclamos vivos no tienen ninguna) y Seguimiento (14 notas en toda la
// historia). Un reclamo ya cobrado repartía el MISMO hecho en tres cajas
// distintas: 2,7 pantallas.
//
// AHORA:
//  · 3b  — UN botón negro fijo abajo, «Marcar como cobrado». Es lo que más se
//          hace: 14 cobros, 9 en septiembre.
//  · 11c — todo lo demás en el «···» de arriba, en una hoja que sube.
//  · 3e  — Fotos y «Lo que ha pasado» son dos renglones que se abren a pantalla
//          completa, con botones de dedo.
//  · 6b  — cobrado: UNA línea verde arriba (cuánto y cuándo) y dos filas que se
//          tocan (el comprobante y la nota de crédito).
//  · 7b/8b — cobrar y mandar son hojas que suben, con Deshacer de 5 s.
//
// 🔴 NADA DE LO QUE SE GUARDA CAMBIA: cobrar llama al MISMO `onCobrar` del
// contenedor (la ruta de settlements con `markPaid`), el correo sale por
// `descargas.ts` y las fotos por los mismos manejadores.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from "react";
import { FotoLightbox, Toast } from "@/components/ui";
import UndoToast from "@/components/UndoToast";
import { useUndoAction } from "@/lib/hooks/useUndoAction";
import { fmt, fmtDate } from "@/lib/format";
import { hoyPanama } from "@/lib/fecha-panama";
import { facturasEnPantalla } from "@/lib/reclamos/facturas";
import { diasDesde } from "@/lib/reclamos/dias";
import { fechaDeCobro } from "@/lib/reclamos/portada";
import { textoReclamado } from "@/lib/reclamos/reclamado";
import { FALTA_FECHA_FACTURA } from "@/lib/reclamos/orden";
import { motivoEnPantalla } from "@/lib/reclamos/texto";
import { montoCel } from "@/lib/reclamos/celular";
import { MARCAR_COBRADO } from "@/lib/reclamos/rotulos";
import { calcSub, esPendiente, esActiveShoes, impLabel, itbmsLabel, reclamoTaxes } from "../constants";
import { bajar, mandarAlProveedor, pedirLote, textoDelEnvio, type Descarga } from "../descargas";
import type { Contacto, Foto, Reclamo } from "../types";
import { BotonMas, CtaFija, FilaCel } from "./piezas";
import {
  HojaCobrar,
  HojaCorreo,
  HojaFotos,
  HojaOpciones,
  HojaSeguimiento,
  type FilaDeCobro,
  type OpcionDeHoja,
} from "./HojasReclamosCelular";

/** Cuántos renglones se ven antes de plegar: la mitad de los reclamos tiene uno. */
const RENGLONES_A_LA_VISTA = 3;

interface Props {
  current: Reclamo;
  role: string;
  contacto?: Contacto | null;
  nota: string;
  setNota: (v: string) => void;
  onStartEdit: () => void;
  onDeleteReclamo: (id: string) => void;
  onAddNota: () => void;
  /** Vuelve a «por cobrar» — el mismo PATCH de siempre. */
  onVolverAPorCobrar: () => void;
  /** Cobra: la MISMA firma del modal de la computadora. */
  onCobrar: (filas: FilaDeCobro[], comprobante: File | null) => void;
  cobrando: boolean;
  onUploadFoto: (files: File[]) => void;
  uploadingFoto?: boolean;
  onDeleteFoto: (fotoId: string, path: string) => void;
  onReload?: () => void;
  toast: string | null;
  showToast: (msg: string) => void;
}

export default function DetalleCelular({
  current, role, contacto, nota, setNota,
  onStartEdit, onDeleteReclamo, onAddNota, onVolverAPorCobrar,
  onCobrar, cobrando, onUploadFoto, uploadingFoto, onDeleteFoto, onReload,
  toast, showToast,
}: Props) {
  const [hoja, setHoja] = useState<"mas" | "cobrar" | "correo" | "fotos" | "seguimiento" | null>(null);
  const [verTodos, setVerTodos] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const { pendingUndo, scheduleAction, undoAction } = useUndoAction();

  const items = current.reclamo_items ?? [];
  const fotos = current.reclamo_fotos ?? [];
  const seg = current.reclamo_seguimiento ?? [];
  const sub = calcSub(items);
  const tax = reclamoTaxes(current.empresa, sub);
  const pendiente = esPendiente(current);
  const dias = diasDesde(current.fecha_factura, hoyPanama());
  const settlements = (current.reclamo_settlements ?? []).filter((s) => !s.deleted);
  const recuperado = settlements.reduce((s, x) => s + (Number(x.monto) || 0), 0);
  const reclamado = current.monto_reclamado_snapshot ?? tax.total;
  const pct = reclamado > 0 ? Math.round((recuperado / reclamado) * 100) : 0;
  const cobradoEnFecha = fechaDeCobro(current);

  const aLaVista = verTodos ? items : items.slice(0, RENGLONES_A_LA_VISTA);
  const ocultos = items.length - aLaVista.length;

  async function descargar(tipo: Descarga) {
    if (ocupado) return;
    setOcupado(true);
    try {
      const blob = await pedirLote(current.empresa, tipo, [current.id]);
      bajar(blob, `Reclamo-${current.nro_reclamo}-${hoyPanama()}.${tipo === "excel" ? "xlsx" : "pdf"}`);
      showToast(`${tipo === "excel" ? "Excel" : "PDF"} descargado`);
      onReload?.();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "No se pudo armar el archivo. Intenta de nuevo.");
    } finally { setOcupado(false); }
  }

  /** La factura del proveedor ya viene FIRMADA del servidor: acá no se firma nada. */
  async function verFactura() {
    if (!current.factura_pdf_url) return;
    window.open(current.factura_pdf_url, "_blank", "noopener,noreferrer");
  }

  const opciones: OpcionDeHoja[] = [
    ...(pendiente ? [{ label: "Mandar al proveedor", onClick: () => setHoja("correo") }] : []),
    { label: "Descargar en PDF", onClick: () => { void descargar("pdf"); } },
    { label: "Descargar en Excel", onClick: () => { void descargar("excel"); } },
    ...(current.factura_pdf_url ? [{ label: "Ver la factura del proveedor", onClick: () => { void verFactura(); } }] : []),
    { label: "Editar", onClick: onStartEdit },
    ...(!pendiente ? [{ label: "Volver a por cobrar", onClick: onVolverAPorCobrar }] : []),
    ...(role === "admin" ? [{ label: "Eliminar", onClick: () => onDeleteReclamo(current.id), destructive: true }] : []),
  ];

  const comprobanteEsPdf = /\.pdf(\?|$)/i.test(current.comprobante_path || current.comprobante_url || "");

  return (
    <div data-celular="reclamos-detalle" className="min-h-screen bg-[#F2F2F7] pb-28">

      <div className="flex items-start justify-between gap-2 px-4 pt-3">
        <div className="min-w-0">
          <h1 className="truncate text-[27px] font-bold leading-tight tracking-tight text-gray-900">
            {current.nro_reclamo}
          </h1>
          {/* La cabecera en DOS líneas, no en cinco: factura · fecha · marca · días. */}
          <p className="mt-0.5 text-[14px] leading-snug text-gray-500" data-medir="cabecera-celular">
            Factura {facturasEnPantalla(current.nro_factura) || "—"}
            {" · "}
            {current.fecha_factura
              ? fmtDate(current.fecha_factura)
              : <span className="text-[#A32D2D]">{FALTA_FECHA_FACTURA}</span>}
            {current.marca ? ` · ${current.marca}` : ""}
            {dias !== null && ` · ${dias} día${dias === 1 ? "" : "s"}`}
            {!esActiveShoes(current.empresa) && current.nro_orden_compra ? ` · OC ${current.nro_orden_compra}` : ""}
          </p>
          {pendiente && (
            <p className="mt-1 text-[13px] text-gray-400">{textoReclamado(current)}</p>
          )}
        </div>
        <BotonMas onClick={() => setHoja("mas")} etiqueta="Más opciones del reclamo" />
      </div>

      {/* 6b · UNA línea verde: cuánto y cuándo, que es lo único que se pregunta. */}
      {!pendiente && (
        <div className="mx-4 mt-3 rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3">
          <p className="text-[20px] font-semibold tabular-nums text-emerald-800">
            {montoCel(recuperado)} cobrado
          </p>
          <p className="mt-0.5 text-[14px] text-emerald-700">
            {cobradoEnFecha ? fmtDate(cobradoEnFecha) : "sin fecha"} · recuperado el {pct} %
          </p>
        </div>
      )}

      {/* 6b · el comprobante y la nota de crédito, dos filas que se tocan. */}
      {!pendiente && (
        <>
          <p className="px-4 pb-1 pt-4 text-[13px] uppercase tracking-wide text-gray-500">El cobro</p>
          <ul className="mx-4 overflow-hidden rounded-2xl bg-white">
            <FilaCel
              titulo="Comprobante de pago"
              sub={current.comprobante_url ? (current.comprobante_nota || "sin nota") : "sin comprobante"}
              chevron={!!current.comprobante_url}
              onClick={
                current.comprobante_url
                  ? () => {
                      if (comprobanteEsPdf) window.open(current.comprobante_url!, "_blank", "noopener,noreferrer");
                      else setLightbox(current.comprobante_url!);
                    }
                  : undefined
              }
            />
            {settlements.map((s) => (
              <FilaCel
                key={s.id}
                titulo="Nota de crédito"
                sub={`${montoCel(Number(s.monto) || 0)} · ${fmtDate(s.fecha)}${s.nota_credito ? ` · N° ${s.nota_credito}` : ""}`}
              />
            ))}
          </ul>
        </>
      )}

      <p className="px-4 pb-1 pt-4 text-[13px] uppercase tracking-wide text-gray-500">
        Renglones · {items.length} · total {montoCel(tax.total)}
      </p>
      <ul data-lista="reclamo-renglones" className="mx-4 overflow-hidden rounded-2xl bg-white">
        {aLaVista.map((item, i) => {
          const cant = Number(item.cantidad) || 0;
          const precio = Number(item.precio_unitario) || 0;
          const partes = [
            item.descripcion,
            `${cant} × $${fmt(precio)}`,
            item.talla ? `talla ${item.talla}` : "",
            motivoEnPantalla(item.motivo),
          ].filter(Boolean);
          return (
            <FilaCel
              key={`${item.referencia}-${i}`}
              titulo={item.referencia}
              sub={partes.join(" · ")}
              monto={montoCel(cant * precio)}
            />
          );
        })}
        {ocultos > 0 && (
          <FilaCel
            titulo={`y ${ocultos} renglón${ocultos === 1 ? "" : "es"} más`}
            chevron
            onClick={() => setVerTodos(true)}
          />
        )}
        <FilaCel
          titulo={`Importación ${impLabel(current.empresa)}${tax.hasItbms ? ` + ITBMS ${itbmsLabel(current.empresa)}` : ""}`}
          monto={montoCel(tax.importacion + tax.itbms)}
        />
        <FilaCel titulo="Total" monto={montoCel(tax.total)} />
      </ul>

      {/* 3e · dos renglones en vez de dos cajas siempre abiertas. */}
      <ul className="mx-4 mt-4 overflow-hidden rounded-2xl bg-white">
        <FilaCel
          titulo="Fotos"
          sub={fotos.length === 0 ? "todavía ninguna · tomar o elegir" : `${fotos.length} de 5`}
          chevron
          onClick={() => setHoja("fotos")}
        />
        <FilaCel
          titulo="Lo que ha pasado"
          sub={seg.length === 0 ? "nada todavía" : `${seg.length} nota${seg.length === 1 ? "" : "s"}`}
          chevron
          onClick={() => setHoja("seguimiento")}
        />
      </ul>

      {current.notas && <p className="px-4 pt-4 text-[14px] text-gray-500">Notas: {current.notas}</p>}

      {pendiente && (
        <CtaFija marca="cobrar" onClick={() => setHoja("cobrar")}>{MARCAR_COBRADO}</CtaFija>
      )}

      {hoja === "mas" && (
        <HojaOpciones
          titulo={`${current.nro_reclamo} · ${montoCel(tax.total)}`}
          opciones={opciones}
          onCerrar={() => setHoja(null)}
        />
      )}
      {hoja === "cobrar" && (
        <HojaCobrar
          nroReclamo={current.nro_reclamo}
          reclamado={reclamado}
          requiereComprobante={!current.comprobante_url && !current.comprobante_path}
          guardando={cobrando}
          onCerrar={() => setHoja(null)}
          onCobrar={(filas, file) => {
            setHoja(null);
            // 🔴 Deshacer de 5 s (7b), como «Cobrar» en Cuentas por Cobrar. El
            // POST es el MISMO: solo sale 5 segundos después.
            scheduleAction({
              id: `cobrar-${current.id}`,
              message: `Se cobra ${montoCel(filas[0]?.monto ?? 0)}`,
              execute: async () => { onCobrar(filas, file); },
            });
          }}
        />
      )}
      {hoja === "correo" && (
        <HojaCorreo
          empresa={current.empresa}
          contactoNombre={contacto?.nombre_contacto || contacto?.nombre}
          correo={contacto?.correo || ""}
          cuantos={1}
          facturas={current.factura_pdf_path ? 1 : 0}
          fotos={fotos.length}
          enviando={ocupado}
          onCerrar={() => setHoja(null)}
          onMandar={(envio) => {
            setHoja(null);
            scheduleAction({
              id: `correo-${current.id}`,
              message: `Se manda a ${envio.to}`,
              execute: async () => {
                try {
                  const data = await mandarAlProveedor(current.empresa, [current.id], envio);
                  showToast(textoDelEnvio(data, envio.to, envio.cc));
                  onReload?.();
                } catch (e) {
                  showToast(e instanceof Error ? e.message : "No se pudo enviar el correo.");
                }
              },
            });
          }}
        />
      )}
      {hoja === "fotos" && (
        <HojaFotos
          fotos={fotos as Foto[]}
          subiendo={!!uploadingFoto}
          onAgregar={onUploadFoto}
          onBorrar={(f) => onDeleteFoto(f.id, f.storage_path)}
          onVer={(url) => setLightbox(url)}
          onCerrar={() => setHoja(null)}
        />
      )}
      {hoja === "seguimiento" && (
        <HojaSeguimiento
          seguimiento={seg}
          nota={nota}
          setNota={setNota}
          onAgregar={() => { onAddNota(); setHoja(null); }}
          onCerrar={() => setHoja(null)}
        />
      )}

      <FotoLightbox src={lightbox} onClose={() => setLightbox(null)} />
      <Toast message={toast} />
      {pendingUndo && (
        <UndoToast message={pendingUndo.message} startedAt={pendingUndo.startedAt} onUndo={undoAction} />
      )}
    </div>
  );
}
