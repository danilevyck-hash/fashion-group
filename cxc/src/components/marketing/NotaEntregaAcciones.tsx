"use client";

// ============================================================================
// Marketing › Mobiliario — COMPARTIR e IMPRIMIR la nota de entrega
// ============================================================================
//
// Daniel la describió así: *"es como un pedido para un cliente"*, y la quiere
// **para las dos cosas: compartir e imprimir**. Por eso hay exactamente dos
// botones, no un menú.
//
// 🩸 EL PDF SE ARMA ANTES DEL CLIC, no dentro. Safari en iOS sólo abre la
//   hoja de compartir dentro del gesto del toque; un `await` largo en el medio
//   (pedirle el papel al servidor) hace que deje de contar como tal y lo
//   bloquea. Por eso este componente pide los DATOS al desplegarse
//   (`/api/marketing/entregas-pdf/<id>/datos`) y, cuando se toca, sólo dibuja
//   —que es sincrónico—. Mientras los datos no estén, los botones dicen
//   "Preparando…" y no se pueden tocar: es honesto y evita el bloqueo.
//   El porqué completo está en `src/lib/compartir-archivo.ts`.
//
// 🔑 UN SOLO GENERADOR. El dibujo sale de `lib/marketing/pdf-entrega-mueble.ts`,
//   el mismo módulo que usa la ruta del PDF del servidor (la del link del
//   Excel del ZIP). No hay dos papeles posibles.
//
// IMPRIMIR abre el PDF en una pestaña con el diálogo de impresión ya lanzado
// (`autoPrint`). Eso reemplaza al viejo "Ver comprobante" sin perder nada: la
// pestaña muestra el mismo papel, y además ofrece imprimirlo. Si el navegador
// bloquea la pestaña, el archivo se descarga — que es lo que la persona
// quería.
// ============================================================================

import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/components/ToastSystem";
import { compartirArchivo, descargarArchivo } from "@/lib/compartir-archivo";
import {
  buildComprobanteEntregaDoc,
  nombreArchivoComprobante,
  numeroComprobante,
  type EntregaMueblePdfData,
} from "@/lib/marketing/pdf-entrega-mueble";

interface Props {
  entregaId: string;
}

export default function NotaEntregaAcciones({ entregaId }: Props) {
  const { toast } = useToast();
  const [datos, setDatos] = useState<EntregaMueblePdfData | null>(null);
  const [error, setError] = useState(false);
  const [compartiendo, setCompartiendo] = useState(false);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/marketing/entregas-pdf/${entregaId}/datos`,
          { cache: "no-store" },
        );
        if (!res.ok) throw new Error("no se pudo");
        const data = (await res.json()) as EntregaMueblePdfData;
        if (!cancelado) setDatos(data);
      } catch {
        if (!cancelado) setError(true);
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [entregaId]);

  /** Nombre del archivo, el mismo que usa el ZIP. */
  const nombreArchivo = useCallback(
    (d: EntregaMueblePdfData) => `${nombreArchivoComprobante(d)}.pdf`,
    [],
  );

  const compartir = async () => {
    if (!datos) return;
    setCompartiendo(true);
    try {
      // Sin `await` entre el clic y `compartirArchivo`: el blob se arma acá.
      // CON bultos: esta es la nota de ENVÍO, el papel que viaja con la
      // mercancía (el comprobante para la marca sale del ZIP, sin bultos).
      const blob = buildComprobanteEntregaDoc(datos, {
        incluirBultos: true,
      }).output("blob");
      const archivo = new File([blob], nombreArchivo(datos), {
        type: "application/pdf",
      });
      const r = await compartirArchivo(archivo, {
        title: `Nota de entrega ${numeroComprobante(datos)}`,
        text: `Nota de entrega ${numeroComprobante(datos)} — ${datos.cliente}`,
      });
      if (r === "descargado") {
        toast("Nota descargada — revisa tu carpeta de descargas", "success");
      }
    } catch {
      toast("No se pudo preparar la nota. Intenta de nuevo.", "error");
    } finally {
      setCompartiendo(false);
    }
  };

  const imprimir = () => {
    if (!datos) return;
    try {
      const doc = buildComprobanteEntregaDoc(datos, { incluirBultos: true });
      // `autoPrint` deja el PDF pidiendo el diálogo de impresión al abrirse.
      doc.autoPrint();
      const url = doc.output("bloburl") as unknown as string;
      const ventana = window.open(url, "_blank");
      if (!ventana) {
        // Pestaña bloqueada: que igual se lleve el papel.
        const blob = doc.output("blob");
        descargarArchivo(
          new File([blob], nombreArchivo(datos), { type: "application/pdf" }),
        );
        toast("Nota descargada — ábrela para imprimir", "success");
      }
    } catch {
      toast("No se pudo preparar la nota. Intenta de nuevo.", "error");
    }
  };

  const listo = datos !== null;
  const etiqueta = error ? "No disponible" : listo ? null : "Preparando…";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={(ev) => {
          ev.stopPropagation();
          void compartir();
        }}
        disabled={!listo || compartiendo}
        className="text-xs rounded-md bg-black text-white px-3 min-h-[44px] inline-flex items-center active:scale-[0.97] transition disabled:opacity-50"
        title="Compartir la nota de entrega por WhatsApp, correo o lo que ofrezca el teléfono"
      >
        {compartiendo ? "Preparando…" : (etiqueta ?? "Compartir")}
      </button>
      <button
        type="button"
        onClick={(ev) => {
          ev.stopPropagation();
          imprimir();
        }}
        disabled={!listo}
        className="text-xs rounded-md border border-gray-300 bg-white text-gray-700 px-3 min-h-[44px] inline-flex items-center hover:bg-gray-50 active:scale-[0.97] transition disabled:opacity-50"
        title="Abrir la nota de entrega e imprimirla"
      >
        {etiqueta ?? "Imprimir"}
      </button>
    </div>
  );
}
