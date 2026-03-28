import { fmtDate } from "@/lib/format";
import type { Guia } from "./types";

interface PrintDocumentProps {
  guia: Guia;
}

export default function PrintDocument({ guia: g }: PrintDocumentProps) {
  const guiaItems = g.guia_items || [];
  const bultos = guiaItems.reduce((s, i) => s + (i.bultos || 0), 0);

  return (
    <div
      id="print-document"
      className="border border-gray-200 rounded-lg p-8"
      style={{ fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif" }}
    >
      <h1 className="text-center text-lg font-bold mb-6 uppercase tracking-wide">
        Guía de Transporte Interior
      </h1>

      <div className="grid grid-cols-2 gap-4 mb-4 text-sm">
        <div className="flex gap-2">
          <span className="font-medium">N° GUÍA:</span>
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
          <span className="font-medium">PLACA / VEHÍCULO:</span>
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
        {g.numero_guia_transp && (
          <div className="flex gap-2">
            <span className="font-medium">N° GUÍA TRANSP.:</span>
            <span className="border-b border-gray-300 flex-1 text-center">
              {g.numero_guia_transp}
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
            <th className="border border-gray-300 px-2 py-1.5 font-medium text-left">DIRECCIÓN</th>
            <th className="border border-gray-300 px-2 py-1.5 font-medium text-left">EMPRESA</th>
            <th className="border border-gray-300 px-2 py-1.5 font-medium text-left">FACTURA(S)</th>
            <th className="border border-gray-300 px-2 py-1.5 font-medium w-16 text-center">
              BULTOS
            </th>
            <th className="border border-gray-300 px-2 py-1.5 font-medium text-left">
              N° GUÍA TRANSP.
            </th>
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
              <td className="border border-gray-300 px-2 py-1 text-center">
                {item.bultos || ""}
              </td>
              <td className="border border-gray-300 px-2 py-1">
                {g.numero_guia_transp || "\u00A0"}
              </td>
            </tr>
          ))}
          <tr className="font-bold bg-gray-50">
            <td
              colSpan={5}
              className="border border-gray-300 px-2 py-1.5 text-right uppercase text-xs"
            >
              Total de bultos despachados
            </td>
            <td className="border border-gray-300 px-2 py-1.5 text-center">{bultos}</td>
            <td className="border border-gray-300"></td>
          </tr>
        </tbody>
      </table>

      <div className="mb-8 text-xs">
        <div className="font-medium uppercase mb-1">Observaciones Generales del Envío</div>
        <div className="border border-gray-300 rounded p-2 min-h-[40px] whitespace-pre-wrap">
          {g.observaciones || ""}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-12 mt-12 text-xs">
        <div>
          <div className="font-medium uppercase mb-6">Entregado por</div>
          <div className="mb-4">
            NOMBRE: <span className="ml-1 font-medium">{g.entregado_por || ""}</span>
            {!g.entregado_por && (
              <span className="border-b border-gray-400 inline-block w-48 ml-1">&nbsp;</span>
            )}
          </div>
          <div>
            FIRMA:{" "}
            {g.firma_entregador_base64 ? (
              <img
                src={g.firma_entregador_base64}
                alt="Firma entregador"
                style={{ height: 40 }}
                className="inline-block ml-1"
              />
            ) : (
              <span className="border-b border-gray-400 inline-block w-48 ml-1">&nbsp;</span>
            )}
          </div>
          <div className="text-gray-400 mt-2 italic">Nombre y firma</div>
        </div>
        <div>
          <div className="font-medium uppercase mb-6">Recibido Conforme — Transportista</div>
          {g.placa ? (
            <>
              <div className="mb-4">
                PLACA: <span className="ml-1 font-medium">{g.placa}</span>
              </div>
              <div className="mb-4">
                NOMBRE: <span className="ml-1 font-medium">{g.receptor_nombre || ""}</span>
              </div>
              <div className="mb-4">
                CÉDULA: <span className="ml-1 font-medium">{g.cedula || ""}</span>
              </div>
              <div>
                FIRMA:{" "}
                {g.firma_base64 ? (
                  <img
                    src={g.firma_base64}
                    alt="Firma"
                    style={{ height: 40 }}
                    className="inline-block ml-1"
                  />
                ) : (
                  <span className="border-b border-gray-400 inline-block w-48 ml-1">&nbsp;</span>
                )}
              </div>
            </>
          ) : (
            <>
              <div className="mb-4">
                NOMBRE:{" "}
                <span className="border-b border-gray-400 inline-block w-48 ml-1">&nbsp;</span>
              </div>
              <div className="mb-4">
                CÉDULA:{" "}
                <span className="border-b border-gray-400 inline-block w-48 ml-1">&nbsp;</span>
              </div>
              <div>
                FIRMA:{" "}
                <span className="border-b border-gray-400 inline-block w-48 ml-1">&nbsp;</span>
              </div>
            </>
          )}
          <div className="text-gray-400 mt-2 italic">Nombre, cédula y firma</div>
        </div>
      </div>

      <div className="mt-8 pt-4 border-t border-gray-200 text-[9px] text-gray-400 text-center leading-relaxed">
        La firma del transportista constituye aceptación expresa de la mercancía detallada en este
        documento, en la cantidad y condición indicadas. Cualquier faltante o daño no reportado al
        momento de la recepción será responsabilidad exclusiva del transportista.
      </div>
    </div>
  );
}
