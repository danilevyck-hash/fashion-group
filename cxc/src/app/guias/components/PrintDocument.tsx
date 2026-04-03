import { fmtDate } from "@/lib/format";
import type { Guia } from "./types";

interface PrintDocumentProps {
  guia: Guia;
}

export default function PrintDocument({ guia: g }: PrintDocumentProps) {
  const guiaItems = g.guia_items || [];
  const bultos = guiaItems.reduce((s, i) => s + (i.bultos || 0), 0);
  const isDirect = g.tipo_despacho === "directo";

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
        <h1 className="text-center text-lg font-bold mb-6 uppercase tracking-wide">
          Guia de Transporte Interior
        </h1>

        <div className="print-header grid grid-cols-2 gap-4 mb-4 text-sm">
          <div className="flex gap-2">
            <span className="font-medium">N GUIA:</span>
            <span className="border-b border-gray-300 flex-1 text-center">{g.numero}</span>
          </div>
          <div className="flex gap-2">
            <span className="font-medium">FECHA:</span>
            <span className="border-b border-gray-300 flex-1 text-center">{fmtDate(g.fecha)}</span>
          </div>
          <div className="flex gap-2">
            <span className="font-medium">TRANSPORTISTA:</span>
            <span className="border-b border-gray-300 flex-1 text-center">{g.transportista}</span>
          </div>
          <div className="flex gap-2">
            <span className="font-medium">PLACA / VEHICULO:</span>
            <span className="border-b border-gray-300 flex-1 text-center">
              {g.placa || "\u00A0"}
            </span>
          </div>
          <div className="flex gap-2">
            <span className="font-medium">ENTREGADO POR:</span>
            <span className="border-b border-gray-300 flex-1 text-center">
              {g.entregado_por || "\u00A0"}
            </span>
          </div>
          <div className="flex gap-2">
            <span className="font-medium">TIPO:</span>
            <span className="border-b border-gray-300 flex-1 text-center">
              {isDirect ? "Entrega directa" : "Transportista externo"}
            </span>
          </div>
          {g.numero_guia_transp && (
            <div className="flex gap-2">
              <span className="font-medium">N GUIA TRANSP.:</span>
              <span className="border-b border-gray-300 flex-1 text-center">
                {g.numero_guia_transp}
              </span>
            </div>
          )}
          {isDirect && g.nombre_chofer && (
            <div className="flex gap-2">
              <span className="font-medium">CHOFER:</span>
              <span className="border-b border-gray-300 flex-1 text-center">
                {g.nombre_chofer}
              </span>
            </div>
          )}
        </div>

        <hr className="border-gray-300 mb-4" />

        <table className="w-full text-xs border-collapse mb-4">
          <thead>
            <tr className="bg-gray-100">
              <th className="border border-gray-300 px-2 py-1.5 font-medium w-8">#</th>
              <th className="border border-gray-300 px-2 py-1.5 font-medium text-left">CLIENTE</th>
              <th className="border border-gray-300 px-2 py-1.5 font-medium text-left">DIRECCION</th>
              <th className="border border-gray-300 px-2 py-1.5 font-medium text-left">EMPRESA</th>
              <th className="border border-gray-300 px-2 py-1.5 font-medium text-left">FACTURA(S)</th>
              <th className="border border-gray-300 px-2 py-1.5 font-medium w-16 text-center">BULTOS</th>
              <th className="border border-gray-300 px-2 py-1.5 font-medium text-left">N GUIA TRANSP.</th>
            </tr>
          </thead>
          <tbody>
            {guiaItems.map((item, i) => (
              <tr key={i}>
                <td className="border border-gray-300 px-2 py-1 text-center">{i + 1}</td>
                <td className="border border-gray-300 px-2 py-1">{item.cliente}</td>
                <td className="border border-gray-300 px-2 py-1">{item.direccion}</td>
                <td className="border border-gray-300 px-2 py-1">{item.empresa}</td>
                <td className="border border-gray-300 px-2 py-1">{item.facturas}</td>
                <td className="border border-gray-300 px-2 py-1 text-center">{item.bultos || ""}</td>
                <td className="border border-gray-300 px-2 py-1">{g.numero_guia_transp || "\u00A0"}</td>
              </tr>
            ))}
            <tr className="font-bold bg-gray-50">
              <td colSpan={5} className="border border-gray-300 px-2 py-1.5 text-right uppercase text-xs">
                Total de bultos despachados
              </td>
              <td className="border border-gray-300 px-2 py-1.5 text-center">{bultos}</td>
              <td className="border border-gray-300"></td>
            </tr>
          </tbody>
        </table>

        <div className="print-obs mb-8 text-xs">
          <div className="font-medium uppercase mb-1">Observaciones Generales del Envio</div>
          <div className="border border-gray-300 rounded p-2 min-h-[40px] whitespace-pre-wrap">
            {g.observaciones || ""}
          </div>
        </div>

        <div className="print-signatures grid grid-cols-2 gap-12 mt-12 text-xs">
          {/* Left column */}
          <div>
            <div className="font-medium uppercase mb-6">
              {isDirect ? "Chofer" : "Entregado por"}
            </div>
            <div className="mb-4">
              NOMBRE:{" "}
              <span className="ml-1 font-medium">
                {isDirect ? (g.nombre_chofer || "") : (g.entregado_por || "")}
              </span>
              {!(isDirect ? g.nombre_chofer : g.entregado_por) && (
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
            {!isDirect && (
              <div className="mb-4">
                PLACA:{" "}
                <span className="ml-1 font-medium">{g.placa || ""}</span>
                {!g.placa && <span className="border-b border-gray-400 inline-block w-48 ml-1">&nbsp;</span>}
              </div>
            )}
            <div className="mb-4">
              NOMBRE:{" "}
              <span className="ml-1 font-medium">{g.receptor_nombre || ""}</span>
              {!g.receptor_nombre && <span className="border-b border-gray-400 inline-block w-48 ml-1">&nbsp;</span>}
            </div>
            <div className="mb-4">
              CEDULA:{" "}
              <span className="ml-1 font-medium">{g.cedula || ""}</span>
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
            <div className="text-gray-400 mt-2 italic">Nombre, cedula y firma</div>
          </div>
        </div>

        <div className="print-footer mt-8 pt-4 border-t border-gray-200 text-[9px] text-gray-400 text-center leading-relaxed">
          La firma del transportista constituye aceptacion expresa de la mercancia detallada en este
          documento, en la cantidad y condicion indicadas. Cualquier faltante o dano no reportado al
          momento de la recepcion sera responsabilidad exclusiva del transportista.
        </div>
      </div>
    </>
  );
}
