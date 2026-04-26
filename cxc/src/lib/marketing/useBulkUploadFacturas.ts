"use client";

// Orquestador del flujo "subir N PDFs como facturas":
//   1. Recibe File[] del drop o file picker.
//   2. Procesa en batches de BATCH_SIZE en paralelo:
//        a. Sube el PDF a Supabase Storage (signed URL).
//        b. Llama OCR `/api/marketing/ia/leer-factura` para pre-llenar.
//        c. Crea un BorradorFactura y lo añade al state.
//      Usa Promise.allSettled — un PDF roto no tumba a los demás.
//   3. Guardado bulk: POST /api/marketing/facturas/bulk con todas las cards.
//      Las exitosas se eliminan del state; las fallidas se quedan con la
//      razón específica visible.

import { useCallback, useRef, useState } from "react";
import { pedirUploadUrl, subirArchivoAStorage } from "@/app/marketing/components/uploadHelpers";
import type {
  BorradorFactura,
  DuplicadoItem,
  EstadoBorrador,
} from "@/components/marketing/BorradorFacturaCard";

const BATCH_SIZE = 20;

interface RespuestaIA {
  numero_factura: string | null;
  fecha_factura: string | null;
  proveedor: string | null;
  concepto: string | null;
  subtotal: number | null;
  itbms_pct: 0 | 7 | null;
}

function isoHoy(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function nuevoCardId(): string {
  return `card-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function borradorVacio(file: File): BorradorFactura {
  return {
    cardId: nuevoCardId(),
    pdfNombre: file.name,
    pdfPath: null,
    pdfSize: file.size,
    estado: { tipo: "ocr-pendiente" },
    numeroFactura: "",
    fechaFactura: isoHoy(),
    proveedor: "",
    concepto: "",
    subtotalStr: "",
    itbmsOption: "0",
    marcaIds: [],
    duplicados: [],
    verificandoDuplicado: false,
    permitirDuplicado: false,
  };
}

function aplicarOCR(
  borrador: BorradorFactura,
  ia: RespuestaIA,
): BorradorFactura {
  return {
    ...borrador,
    numeroFactura: ia.numero_factura ?? borrador.numeroFactura,
    fechaFactura: ia.fecha_factura ?? borrador.fechaFactura,
    proveedor: ia.proveedor ?? borrador.proveedor,
    concepto: ia.concepto ?? borrador.concepto,
    subtotalStr:
      ia.subtotal !== null && Number.isFinite(ia.subtotal)
        ? String(ia.subtotal)
        : borrador.subtotalStr,
    itbmsOption:
      ia.itbms_pct === 7 ? "7" : ia.itbms_pct === 0 ? "0" : borrador.itbmsOption,
    estado: { tipo: "editando" } as EstadoBorrador,
  };
}

export interface BulkUploadProgress {
  totalArchivos: number;
  procesados: number; // sumados después de OCR (éxito o error)
  enProceso: boolean;
}

interface UseArgs {
  proyectoId: string;
}

export function useBulkUploadFacturas({ proyectoId }: UseArgs) {
  const [borradores, setBorradores] = useState<BorradorFactura[]>([]);
  const [progress, setProgress] = useState<BulkUploadProgress>({
    totalArchivos: 0,
    procesados: 0,
    enProceso: false,
  });
  const [guardando, setGuardando] = useState(false);
  // Lock anti-doble-procesamiento del mismo File por dropear varias veces.
  const procesandoRef = useRef(false);
  // Debounce timers por card para verificación de duplicados.
  const dupTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // ── Helpers de mutación de state ────────────────────────────────────────
  const upsertBorrador = useCallback((cardId: string, patch: Partial<BorradorFactura>) => {
    setBorradores((prev) =>
      prev.map((b) => (b.cardId === cardId ? { ...b, ...patch } : b)),
    );
  }, []);

  // Verifica duplicado contra el backend para un par (numero, proveedor).
  // Resetea permitirDuplicado al re-verificar (el user debe re-confirmar
  // si cambió cualquiera de los dos campos).
  const verificarDuplicado = useCallback(
    async (cardId: string, numero: string, proveedor: string) => {
      const num = numero.trim();
      const prov = proveedor.trim();
      if (!num || !prov) {
        upsertBorrador(cardId, { duplicados: [], verificandoDuplicado: false });
        return;
      }
      upsertBorrador(cardId, { verificandoDuplicado: true });
      try {
        const qs = new URLSearchParams({
          numero_factura: num,
          proveedor: prov,
          proyecto_id_actual: proyectoId,
        });
        const res = await fetch(
          `/api/marketing/facturas/check-duplicate?${qs.toString()}`,
          { cache: "no-store" },
        );
        if (!res.ok) {
          upsertBorrador(cardId, { duplicados: [], verificandoDuplicado: false });
          return;
        }
        const data = (await res.json()) as { facturas: DuplicadoItem[] };
        upsertBorrador(cardId, {
          duplicados: data.facturas ?? [],
          verificandoDuplicado: false,
          permitirDuplicado: false,
        });
      } catch {
        upsertBorrador(cardId, { duplicados: [], verificandoDuplicado: false });
      }
    },
    [proyectoId, upsertBorrador],
  );

  // Programa una verificación de duplicado con debounce de 500ms para una card.
  const programarVerificacionDup = useCallback(
    (cardId: string, numero: string, proveedor: string) => {
      const existing = dupTimersRef.current[cardId];
      if (existing) clearTimeout(existing);
      dupTimersRef.current[cardId] = setTimeout(() => {
        verificarDuplicado(cardId, numero, proveedor);
      }, 500);
    },
    [verificarDuplicado],
  );

  const updateCard = useCallback(
    (cardId: string, patch: Partial<BorradorFactura>) => {
      // Cuando el usuario edita un campo, si la card estaba en "error",
      // limpiamos el error para que vuelva a "editando".
      setBorradores((prev) =>
        prev.map((b) => {
          if (b.cardId !== cardId) return b;
          const nextEstado: EstadoBorrador =
            b.estado.tipo === "error" ? { tipo: "editando" } : b.estado;
          const merged = { ...b, ...patch, estado: nextEstado };
          // Si cambian numero o proveedor, re-disparar verificación.
          const numChanged =
            patch.numeroFactura !== undefined && patch.numeroFactura !== b.numeroFactura;
          const provChanged =
            patch.proveedor !== undefined && patch.proveedor !== b.proveedor;
          if (numChanged || provChanged) {
            programarVerificacionDup(cardId, merged.numeroFactura, merged.proveedor);
          }
          return merged;
        }),
      );
    },
    [programarVerificacionDup],
  );

  const setPermitirDuplicado = useCallback(
    (cardId: string, valor: boolean) => {
      upsertBorrador(cardId, { permitirDuplicado: valor });
    },
    [upsertBorrador],
  );

  const descartar = useCallback((cardId: string) => {
    setBorradores((prev) => prev.filter((b) => b.cardId !== cardId));
  }, []);

  const limpiarTodo = useCallback(() => {
    setBorradores([]);
  }, []);

  // ── Procesar 1 archivo: subir a Storage + OCR ───────────────────────────
  async function procesarArchivo(file: File): Promise<void> {
    const borrador = borradorVacio(file);
    setBorradores((prev) => [...prev, borrador]);

    try {
      // 1. Subir PDF a Storage
      const { uploadUrl, path } = await pedirUploadUrl({
        file,
        proyectoId,
      });
      await subirArchivoAStorage(uploadUrl, file);
      upsertBorrador(borrador.cardId, { pdfPath: path });

      // 2. OCR
      const res = await fetch("/api/marketing/ia/leer-factura", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path }),
      });
      if (!res.ok) {
        upsertBorrador(borrador.cardId, {
          estado: { tipo: "ocr-error" },
        });
        return;
      }
      const ia = (await res.json()) as RespuestaIA;
      setBorradores((prev) =>
        prev.map((b) =>
          b.cardId === borrador.cardId ? aplicarOCR(b, ia) : b,
        ),
      );
      // Tras OCR, disparar verificación de duplicado si se obtuvieron
      // numero_factura y proveedor del PDF.
      if (ia.numero_factura && ia.proveedor) {
        programarVerificacionDup(borrador.cardId, ia.numero_factura, ia.proveedor);
      }
    } catch (err) {
      console.warn(
        `bulk-upload[${file.name}]:`,
        err instanceof Error ? err.message : err,
      );
      // Si falló la subida, dejamos la card como ocr-error para que el
      // usuario vea que algo salió mal (no podrá guardar sin pdfPath; el
      // botón global lo bloqueará por validación).
      upsertBorrador(borrador.cardId, { estado: { tipo: "ocr-error" } });
    }
  }

  // ── Recibir archivos del drop / file picker ─────────────────────────────
  const agregarArchivos = useCallback(
    async (files: File[]) => {
      if (procesandoRef.current) return;
      const pdfs = files.filter(
        (f) => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf"),
      );
      if (pdfs.length === 0) return;

      procesandoRef.current = true;
      setProgress({
        totalArchivos: pdfs.length,
        procesados: 0,
        enProceso: true,
      });

      try {
        // Procesar en batches de BATCH_SIZE en paralelo (allSettled).
        for (let i = 0; i < pdfs.length; i += BATCH_SIZE) {
          const batch = pdfs.slice(i, i + BATCH_SIZE);
          const settled = await Promise.allSettled(
            batch.map((f) => procesarArchivo(f)),
          );
          setProgress((p) => ({
            ...p,
            procesados: p.procesados + settled.length,
          }));
        }
      } finally {
        setProgress((p) => ({ ...p, enProceso: false }));
        procesandoRef.current = false;
      }
    },
    [proyectoId],
  );

  // ── Validación pre-save por card ────────────────────────────────────────
  function esValida(b: BorradorFactura): boolean {
    if (b.estado.tipo === "ocr-pendiente" || b.estado.tipo === "guardando") {
      return false;
    }
    if (!b.numeroFactura.trim()) return false;
    if (!b.fechaFactura.trim()) return false;
    if (!b.proveedor.trim()) return false;
    if (!b.concepto.trim()) return false;
    const sub = Number(b.subtotalStr);
    if (!Number.isFinite(sub) || sub <= 0) return false;
    if (b.marcaIds.length === 0) return false;
    return true;
  }

  const cardsListas = borradores.filter(esValida);
  const cardsIncompletas = borradores.filter((b) => !esValida(b));
  const borradoresConDuplicadoSinConfirmar = borradores.filter(
    (b) => b.duplicados.length > 0 && !b.permitirDuplicado,
  );
  const puedeGuardar =
    !guardando &&
    !progress.enProceso &&
    borradores.length > 0 &&
    cardsIncompletas.length === 0;

  // ── Guardado bulk ───────────────────────────────────────────────────────
  const guardarTodas = useCallback(async (): Promise<{
    exitosas: number;
    errores: number;
  }> => {
    if (cardsListas.length === 0) return { exitosas: 0, errores: 0 };
    setGuardando(true);

    // Marcar todas como "guardando".
    setBorradores((prev) =>
      prev.map((b) =>
        cardsListas.some((c) => c.cardId === b.cardId)
          ? { ...b, estado: { tipo: "guardando" } as EstadoBorrador }
          : b,
      ),
    );

    try {
      const items = cardsListas.map((b) => {
        const sub = Number(b.subtotalStr);
        const itbms = b.itbmsOption === "7" ? round2(sub * 0.07) : 0;
        return {
          cardId: b.cardId,
          numeroFactura: b.numeroFactura.trim(),
          fechaFactura: b.fechaFactura,
          proveedor: b.proveedor.trim(),
          concepto: b.concepto.trim(),
          subtotal: round2(sub),
          itbms,
          marcaIds: b.marcaIds,
          // Solo permite duplicado si el user lo confirmó explícitamente.
          // Caller debe verificar `borradoresConDuplicadoSinConfirmar` antes
          // de invocar guardarTodas — si hay alguno, el backend rechaza.
          permitirDuplicado: b.permitirDuplicado === true,
          pdfPath: b.pdfPath ?? undefined,
          pdfNombre: b.pdfNombre,
          pdfSize: b.pdfSize ?? undefined,
        };
      });

      const res = await fetch("/api/marketing/facturas/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proyectoId, items }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error ?? `HTTP ${res.status}`);
      }
      const data = (await res.json()) as {
        exitosas: Array<{ cardId: string; facturaId: string }>;
        errores: Array<{ cardId: string; razon: string }>;
      };

      const exitosasIds = new Set(data.exitosas.map((e) => e.cardId));
      const erroresMap = new Map(
        data.errores.map((e) => [e.cardId, e.razon] as const),
      );

      setBorradores((prev) =>
        prev
          // Eliminar las exitosas
          .filter((b) => !exitosasIds.has(b.cardId))
          // Marcar las que fallaron con su razón
          .map((b) => {
            const razon = erroresMap.get(b.cardId);
            if (!razon) return b;
            return {
              ...b,
              estado: { tipo: "error", razon } as EstadoBorrador,
            };
          }),
      );

      return {
        exitosas: data.exitosas.length,
        errores: data.errores.length,
      };
    } catch (err) {
      // Falló el endpoint completo: revertir todas a "editando" con error genérico.
      const msg = err instanceof Error ? err.message : "Error de red";
      setBorradores((prev) =>
        prev.map((b) =>
          b.estado.tipo === "guardando"
            ? { ...b, estado: { tipo: "error", razon: msg } as EstadoBorrador }
            : b,
        ),
      );
      throw err;
    } finally {
      setGuardando(false);
    }
  }, [cardsListas, proyectoId]);

  return {
    borradores,
    progress,
    guardando,
    puedeGuardar,
    cardsListas,
    cardsIncompletas,
    borradoresConDuplicadoSinConfirmar,
    agregarArchivos,
    updateCard,
    descartar,
    limpiarTodo,
    guardarTodas,
    setPermitirDuplicado,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
