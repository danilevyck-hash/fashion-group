"use client";

import { useState } from "react";
import {
  generarZipCobranza,
  descargarZip,
  nombreArchivoZip,
  type FetchFile,
} from "@/lib/marketing/generar-cobranza";
import { useToast } from "@/components/ToastSystem";
import type {
  MkCobranza,
  MkFactura,
  MkMarca,
  MkAdjunto,
  ProyectoConMarcas,
} from "@/lib/marketing/types";

interface DatosZipResponse {
  cobranza: MkCobranza;
  proyecto: ProyectoConMarcas;
  marca: MkMarca;
  facturas: MkFactura[];
  adjuntosFacturas: MkAdjunto[];
  fotosProyecto: MkAdjunto[];
}

interface DescargarZipButtonProps {
  cobranzaId: string;
  onDescargado?: () => void;
  variant?: "primary" | "secondary";
  label?: string;
}

const fetchFile: FetchFile = async (url) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`No se pudo descargar ${url}`);
  return res.blob();
};

export function DescargarZipButton({
  cobranzaId,
  onDescargado,
  variant = "primary",
  label = "Descargar ZIP",
}: DescargarZipButtonProps) {
  const { toast } = useToast();
  const [cargando, setCargando] = useState(false);

  const handleClick = async () => {
    if (cargando) return;
    setCargando(true);
    try {
      const res = await fetch(
        `/api/marketing/cobranzas/${cobranzaId}/datos-zip`,
        { cache: "no-store" }
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => ({ error: "" }))) as {
          error?: string;
        };
        throw new Error(body.error || "No se pudieron cargar los datos");
      }
      const data = (await res.json()) as DatosZipResponse;

      const blob = await generarZipCobranza(
        {
          cobranza: data.cobranza,
          proyecto: data.proyecto,
          marca: data.marca,
          facturas: data.facturas,
          adjuntos: data.adjuntosFacturas,
          fotos: data.fotosProyecto,
        },
        fetchFile
      );

      const nombre = nombreArchivoZip(data.marca, data.proyecto);
      descargarZip(blob, nombre);
      toast("ZIP descargado — envíalo por email", "success");
      onDescargado?.();
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "No se pudo generar el ZIP";
      toast(message, "error");
    } finally {
      setCargando(false);
    }
  };

  const baseClase =
    "rounded-md px-3 py-2 text-sm transition active:scale-[0.97] disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2";
  const variantClase =
    variant === "secondary"
      ? "bg-white border border-gray-300 text-gray-900 hover:bg-gray-50"
      : "bg-black text-white hover:bg-gray-800";

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={cargando}
      className={`${baseClase} ${variantClase}`}
      aria-label={label}
    >
      {cargando ? (
        <>
          <span
            className="inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"
            aria-hidden="true"
          />
          Generando…
        </>
      ) : (
        label
      )}
    </button>
  );
}

export default DescargarZipButton;
