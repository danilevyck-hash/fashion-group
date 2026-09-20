import { fmtDate, fmtGuia } from "@/lib/format";
import {
  ETIQUETA_TIPO_DESPACHO,
  esEntregaDirecta,
  numeroTranspImpreso,
  numeroTranspUnicoImpreso,
  sinCeroPelado,
  tipoDespachoEfectivo,
} from "@/lib/guias/modo-despacho";
import { nombreDespachadoPor } from "@/lib/guias/despachado-por";
import { facturasParaElPapel } from "@/lib/guias/numero-factura";
import { rayaDeLaCasilla } from "@/lib/guias/casilla-en-blanco";
import { cedulaParaMostrar } from "@/lib/guias/cedula";
import { observacionesVisibles } from "@/lib/guias/observaciones";
import { FG_LOGO_BASE64 } from "@/lib/pdf-logo";
import type { Guia } from "./types";

interface PrintDocumentProps {
  guia: Guia;
}

export default function PrintDocument({ guia: g }: PrintDocumentProps) {
  const guiaItems = g.guia_items || [];
  const bultos = guiaItems.reduce((s, i) => s + (i.bultos || 0), 0);
  // 🔴 EL PAPEL TIENE QUE DECIR LA VERDAD. Acá decía `g.tipo_despacho ===
  // "directo"`, y esa columna trae DEFAULT 'externo' en la base: una guía sin
  // despachar salía impresa como "Transportista externo" aunque se hubiera
  // creado como entrega directa. Ver `modo-despacho.ts`.
  const isDirect = esEntregaDirecta(g);
  // ⚠️ EL N° DEL TRANSPORTISTA ES POR LÍNEA. El encabezado solo lo anuncia
  // cuando en toda la guía hay UNO SOLO — que es el caso de las guías viejas,
  // donde el mismo número se repetía en todos los renglones. Con varios
  // números distintos, un encabezado con uno de ellos sería una mentira
  // impresa en un documento que alguien firma.
  const transpUnico = numeroTranspUnicoImpreso(guiaItems, g.numero_guia_transp);
  // Un "0" no es una placa: es lo que alguien tecleó para pasar la validación.
  const placa = sinCeroPelado(g.placa);
  // 🔴 UNA CASILLA VACÍA SALE CON RAYA PARA ESCRIBIRLA A MANO (19-sep-2026).
  // La que lo pidió fue PLACA / VEHÍCULO —el papel se imprime ANTES de que
  // llegue el camión—, y la regla vale para todas las del encabezado: la misma
  // diferencia que las casillas de NOMBRE, CÉDULA y FIRMA ya hacían abajo.
  // Vive en `casilla-en-blanco.ts` para que el PDF no pueda decir otra cosa.
  const raya = (v: string | null | undefined) =>
    `border-b ${rayaDeLaCasilla(v)} flex-1 text-center`;

  return (
    <>
      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 8mm; }
          #print-document {
            font-size: 10px !important;
            padding: 12px !important;
            position: absolute; left: 0; top: 0; width: 100%;
          }
          #print-document h1 { font-size: 13px !important; margin-bottom: 8px !important; }
          #print-document table { font-size: 9px !important; }
          #print-document table th,
          #print-document table td { padding: 2px 4px !important; }
          #print-document .print-header { margin-bottom: 6px !important; gap: 4px !important; }
          #print-document .print-header > div { gap: 2px !important; }
          #print-document .print-obs { margin-bottom: 8px !important; }
          #print-document .print-obs > div:last-child { min-height: 24px !important; padding: 4px !important; }
          #print-document .print-signatures { margin-top: 10px !important; gap: 16px !important; }
          #print-document .print-signatures > div > div:first-child { margin-bottom: 8px !important; }
          #print-document .print-signatures img { height: 30px !important; }
          #print-document .print-footer { margin-top: 8px !important; padding-top: 4px !important; }
          #print-document * { page-break-inside: avoid; }
        }
      `}</style>
      <div
        id="print-document"
        className="border border-gray-200 rounded-lg p-8"
        style={{ fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif" }}
      >
        <div className="flex items-center justify-center gap-3 mb-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={FG_LOGO_BASE64} alt="FG" className="w-9 h-9 rounded" />
          <h1 className="text-lg font-bold uppercase tracking-wide">
            Guía de Transporte Interior
          </h1>
        </div>

        <div className="print-header grid grid-cols-2 gap-4 mb-4 text-sm">
          <div className="flex gap-2">
            <span className="font-medium">N GUÍA:</span>
            <span className={raya(fmtGuia(g.numero))}>{fmtGuia(g.numero)}</span>
          </div>
          <div className="flex gap-2">
            <span className="font-medium">FECHA:</span>
            <span className={raya(fmtDate(g.fecha))}>{fmtDate(g.fecha)}</span>
          </div>
          <div className="flex gap-2">
            <span className="font-medium">TRANSPORTISTA:</span>
            <span className={raya(g.transportista)}>{g.transportista}</span>
          </div>
          {/* En entrega directa no existe placa que declarar: es nuestro cami\u00F3n. */}
          {!isDirect && (
            <div className="flex gap-2">
              <span className="font-medium">PLACA / VEHÍCULO:</span>
              <span className={raya(placa)}>{placa || "\u00A0"}</span>
            </div>
          )}
          <div className="flex gap-2">
            <span className="font-medium">DESPACHADO POR:</span>
            <span className={raya(nombreDespachadoPor(g.entregado_por))}>
              {nombreDespachadoPor(g.entregado_por) || "\u00A0"}
            </span>
          </div>
          <div className="flex gap-2">
            <span className="font-medium">TIPO:</span>
            <span className={raya(ETIQUETA_TIPO_DESPACHO[tipoDespachoEfectivo(g)])}>
              {ETIQUETA_TIPO_DESPACHO[tipoDespachoEfectivo(g)]}
            </span>
          </div>
          {!isDirect && transpUnico && (
            <div className="flex gap-2">
              <span className="font-medium">N GUÍA TRANSP.:</span>
              <span className={raya(transpUnico)}>{transpUnico}</span>
            </div>
          )}
          {isDirect && g.nombre_chofer && (
            <div className="flex gap-2">
              <span className="font-medium">CHOFER:</span>
              <span className={raya(g.nombre_chofer)}>{g.nombre_chofer}</span>
            </div>
          )}
        </div>

        <hr className="border-gray-300 mb-4" />

        <table className="w-full text-xs border-collapse mb-4">
          <thead>
            <tr className="bg-gray-100">
              <th className="border border-gray-300 px-2 py-1.5 font-medium w-8">#</th>
              <th className="border border-gray-300 px-2 py-1.5 font-medium text-left">CLIENTE</th>
              <th className="border border-gray-300 px-2 py-1.5 font-medium text-left">DIRECCIÓN</th>
              <th className="border border-gray-300 px-2 py-1.5 font-medium text-left">EMPRESA</th>
              <th className="border border-gray-300 px-2 py-1.5 font-medium text-left">FACTURA(S)</th>
              <th className="border border-gray-300 px-2 py-1.5 font-medium w-16 text-center">BULTOS</th>
              {!isDirect && (
                <th className="border border-gray-300 px-2 py-1.5 font-medium text-left">N GUÍA TRANSP.</th>
              )}
            </tr>
          </thead>
          <tbody>
            {guiaItems.map((item, i) => (
              <tr key={i}>
                <td className="border border-gray-300 px-2 py-1 text-center">{i + 1}</td>
                <td className="border border-gray-300 px-2 py-1">{item.cliente}</td>
                <td className="border border-gray-300 px-2 py-1">{item.direccion}</td>
                <td className="border border-gray-300 px-2 py-1">{item.empresa}</td>
                <td className="border border-gray-300 px-2 py-1">{facturasParaElPapel(item.facturas)}</td>
                <td className="border border-gray-300 px-2 py-1 text-center">{item.bultos || ""}</td>
                {!isDirect && (
                  <td className="border border-gray-300 px-2 py-1">
                    {numeroTranspImpreso(item.numero_guia_transp, g.numero_guia_transp) || "\u00A0"}
                  </td>
                )}
              </tr>
            ))}
            <tr className="font-bold bg-gray-50">
              <td colSpan={5} className="border border-gray-300 px-2 py-1.5 text-right uppercase text-xs">
                Total de bultos despachados
              </td>
              <td className="border border-gray-300 px-2 py-1.5 text-center">{bultos}</td>
              {!isDirect && <td className="border border-gray-300"></td>}
            </tr>
          </tbody>
        </table>

        <div className="print-obs mb-8 text-xs">
          <div className="font-medium uppercase mb-1">Observaciones Generales del Envío</div>
          <div className="border border-gray-300 rounded p-2 min-h-[40px] whitespace-pre-wrap">
            {observacionesVisibles(g.observaciones)}
          </div>
        </div>

        <div className="print-signatures grid grid-cols-2 gap-12 mt-12 text-xs">
          {/* Left column */}
          <div>
            <div className="font-medium uppercase mb-6">
              {isDirect ? "Chofer" : "Despachado por"}
            </div>
            <div className="mb-4">
              NOMBRE:{" "}
              <span className="ml-1 font-medium">
                {isDirect ? (g.nombre_chofer || "") : nombreDespachadoPor(g.entregado_por)}
              </span>
              {!(isDirect ? g.nombre_chofer : nombreDespachadoPor(g.entregado_por)) && (
                <span className="border-b border-gray-400 inline-block w-48 ml-1">&nbsp;</span>
              )}
            </div>
            <div>
              FIRMA:{" "}
              {g.firma_base64 ? (
                <img src={g.firma_base64} alt="Firma" style={{ height: 40 }} className="inline-block ml-1" />
              ) : (
                <span className="border-b border-gray-400 inline-block w-48 ml-1">&nbsp;</span>
              )}
            </div>
            <div className="text-gray-400 mt-2 italic">Nombre y firma</div>
          </div>
          {/* Right column */}
          <div>
            <div className="font-medium uppercase mb-6">
              {isDirect ? "Recibido por — Cliente" : "Recibido Conforme — Transportista"}
            </div>
            <div className="mb-4">
              NOMBRE:{" "}
              <span className="ml-1 font-medium">{g.receptor_nombre || ""}</span>
              {!g.receptor_nombre && <span className="border-b border-gray-400 inline-block w-48 ml-1">&nbsp;</span>}
            </div>
            <div className="mb-4">
              CÉDULA:{" "}
              {/* Con guiones, como se escribe una cédula. Solo al MOSTRARLA:
                  la base no se toca — ver `lib/guias/cedula.ts`. */}
              <span className="ml-1 font-medium">{cedulaParaMostrar(g.cedula)}</span>
              {!g.cedula && <span className="border-b border-gray-400 inline-block w-48 ml-1">&nbsp;</span>}
            </div>
            <div>
              FIRMA:{" "}
              {g.firma_entregador_base64 ? (
                <img src={g.firma_entregador_base64} alt="Firma" style={{ height: 40 }} className="inline-block ml-1" />
              ) : (
                <span className="border-b border-gray-400 inline-block w-48 ml-1">&nbsp;</span>
              )}
            </div>
            <div className="text-gray-400 mt-2 italic">Nombre, cédula y firma</div>
          </div>
        </div>

        <div className="print-footer mt-8 pt-4 border-t border-gray-200 text-xs text-gray-400 text-center leading-relaxed">
          La firma del transportista constituye aceptación expresa de la mercancía detallada en este
          documento, en la cantidad y condición indicadas. Cualquier faltante o daño no reportado al
          momento de la recepción será responsabilidad exclusiva del transportista.
        </div>
      </div>
    </>
  );
}
