"use client";

import { useState } from "react";
import type {
  MkCobranza,
  ProyectoConMarcas,
  MkMarca,
  MkFactura,
  MkAdjunto,
} from "@/lib/marketing/types";
import { useToast } from "@/components/ToastSystem";
import { PasoInstruccion } from "./PasoInstruccion";
import { formatearMonto } from "@/lib/marketing/normalizar";

interface CobranzaPreviewProps {
  cobranza: MkCobranza;
  proyecto: ProyectoConMarcas;
  marca: MkMarca;
  facturas: MkFactura[];
  adjuntos: MkAdjunto[];
  fotos: MkAdjunto[];
  onMarcarEnviada: () => Promise<void>;
  onDescargarZip: () => Promise<void>;
  onCopiarCuerpo: () => void;
}

export function CobranzaPreview({
  cobranza,
  proyecto,
  marca,
  facturas,
  adjuntos,
  fotos,
  onMarcarEnviada,
  onDescargarZip,
  onCopiarCuerpo,
}: CobranzaPreviewProps) {
  const { toast } = useToast();
  const [paso2Hecho, setPaso2Hecho] = useState(false);
  const [paso3Hecho, setPaso3Hecho] = useState(false);
  const [descargando, setDescargando] = useState(false);
  const [marcando, setMarcando] = useState(false);

  const puedeMarcar = paso2Hecho && paso3Hecho && !marcando;

  const handleDescargar = async () => {
    try {
      setDescargando(true);
      await onDescargarZip();
      setPaso2Hecho(true);
      toast("ZIP descargado", "success");
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : "No se pudo descargar el ZIP. Intenta de nuevo.";
      toast(message, "error");
    } finally {
      setDescargando(false);
    }
  };

  const handleCopiar = () => {
    try {
      onCopiarCuerpo();
      setPaso3Hecho(true);
      toast("Cuerpo copiado al portapapeles", "success");
    } catch {
      toast("No se pudo copiar el cuerpo.", "error");
    }
  };

  const handleMarcar = async () => {
    try {
      setMarcando(true);
      await onMarcarEnviada();
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : "No se pudo marcar como enviada. Intenta de nuevo.";
      toast(message, "error");
    } finally {
      setMarcando(false);
    }
  };

  const totalAdjuntos = adjuntos.length;
  const totalFotos = fotos.length;

  return (
    <div className="space-y-4">
      {/* Preview del email */}
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-2">
        <div className="flex items-baseline gap-2 text-sm">
          <span className="text-gray-500 shrink-0">Para:</span>
          <span className="text-gray-900 font-mono truncate">
            {cobranza.email_destino || "—"}
          </span>
        </div>
        <div className="flex items-baseline gap-2 text-sm">
          <span className="text-gray-500 shrink-0">Asunto:</span>
          <span className="text-gray-900 truncate">
            {cobranza.asunto || "—"}
          </span>
        </div>
        <div className="text-sm">
          <div className="text-gray-500 mb-1">Cuerpo:</div>
          <pre className="whitespace-pre-wrap text-sm font-mono text-gray-800 bg-white rounded-md border border-gray-200 p-3 max-h-60 overflow-auto">
            {cobranza.cuerpo || "—"}
          </pre>
        </div>
        <div className="flex items-center gap-4 text-xs text-gray-500 pt-2 border-t border-gray-200">
          <span>
            {marca.nombre} · {proyecto.tienda}
          </span>
          <span className="tabular-nums">{formatearMonto(cobranza.monto)}</span>
          <span>
            {facturas.length} facturas · {totalAdjuntos} adjuntos ·{" "}
            {totalFotos} fotos
          </span>
        </div>
      </div>

      {/* 5 pasos instruccionales */}
      <PasoInstruccion
        numero={1}
        titulo="Revisa la vista previa del email"
        descripcion="Asegúrate de que el destinatario, asunto y cuerpo estén correctos antes de enviar."
      />

      <PasoInstruccion
        numero={2}
        titulo="Descarga el ZIP con todos los adjuntos"
        descripcion="El ZIP incluye las facturas en PDF, las fotos del proyecto y un desglose."
        completado={paso2Hecho}
        accion={{
          label: descargando ? "Descargando…" : "Descargar ZIP",
          onClick: handleDescargar,
          disabled: descargando,
          variant: "primary",
        }}
      />

      <PasoInstruccion
        numero={3}
        titulo="Copia el cuerpo del email"
        descripcion="Cópialo al portapapeles para pegarlo en Outlook."
        completado={paso3Hecho}
        accion={{
          label: "Copiar cuerpo",
          onClick: handleCopiar,
          variant: "secondary",
        }}
      />

      <PasoInstruccion
        numero={4}
        titulo="Envía desde Outlook con cuenta daniel@fashiongr.com"
        descripcion="Abre Outlook, crea un email nuevo, pega el cuerpo, adjunta el ZIP y envía al destinatario."
      />

      <PasoInstruccion
        numero={5}
        titulo="Marca como enviada"
        descripcion="Solo hazlo cuando ya enviaste el email desde Outlook."
        accion={{
          label: marcando ? "Marcando…" : "Marcar como enviada",
          onClick: handleMarcar,
          disabled: !puedeMarcar,
          variant: "primary",
        }}
      />
    </div>
  );
}

export default CobranzaPreview;
