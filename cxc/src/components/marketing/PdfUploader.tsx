"use client";

import { useCallback, useRef, useState, DragEvent, ChangeEvent } from "react";
import { useToast } from "@/components/ToastSystem";

export interface UploadResult {
  url: string;
  nombreOriginal: string;
  sizeBytes: number;
}

interface PdfUploaderProps {
  onUpload: (file: File) => Promise<UploadResult>;
  label?: string;
  accept?: string;
  maxSizeMb?: number;
}

type Estado =
  | { kind: "idle" }
  | { kind: "dragging" }
  | { kind: "uploading"; progress: number; fileName: string }
  | { kind: "success"; result: UploadResult }
  | { kind: "error"; message: string };

export function PdfUploader({
  onUpload,
  label = "Sube el PDF",
  accept = "application/pdf",
  maxSizeMb = 10,
}: PdfUploaderProps) {
  const [estado, setEstado] = useState<Estado>({ kind: "idle" });
  const inputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const validar = useCallback(
    (file: File): string | null => {
      const maxBytes = maxSizeMb * 1024 * 1024;
      if (file.size > maxBytes) {
        return `El archivo pesa más de ${maxSizeMb}MB. Intenta uno más liviano.`;
      }
      // Aceptamos comparando tipos MIME o extensión
      const accepted = accept
        .split(",")
        .map((a) => a.trim())
        .filter(Boolean);
      if (accepted.length > 0) {
        const mime = file.type;
        const nombre = file.name.toLocaleLowerCase();
        const match = accepted.some((a) => {
          if (a.startsWith(".")) return nombre.endsWith(a.toLocaleLowerCase());
          if (a.endsWith("/*")) {
            const prefix = a.slice(0, -1);
            return mime.startsWith(prefix);
          }
          return mime === a;
        });
        if (!match) {
          return "Ese tipo de archivo no es válido para este campo.";
        }
      }
      return null;
    },
    [accept, maxSizeMb]
  );

  const procesar = useCallback(
    async (file: File) => {
      const error = validar(file);
      if (error) {
        setEstado({ kind: "error", message: error });
        toast(error, "error");
        return;
      }
      setEstado({ kind: "uploading", progress: 0, fileName: file.name });
      // Animación de progress simulado (el caller hace el upload real)
      let progress = 5;
      const interval = setInterval(() => {
        progress = Math.min(progress + 10, 90);
        setEstado((prev) =>
          prev.kind === "uploading" ? { ...prev, progress } : prev
        );
      }, 200);
      try {
        const result = await onUpload(file);
        clearInterval(interval);
        setEstado({ kind: "success", result });
      } catch (err: unknown) {
        clearInterval(interval);
        const message =
          err instanceof Error
            ? err.message
            : "No se pudo subir el archivo. Intenta de nuevo.";
        setEstado({ kind: "error", message });
        toast(message, "error");
      }
    },
    [onUpload, validar, toast]
  );

  const onFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) procesar(file);
    e.target.value = "";
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const file = e.dataTransfer.files?.[0];
    if (file) procesar(file);
    else setEstado({ kind: "idle" });
  };

  const onDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (estado.kind === "idle" || estado.kind === "dragging") {
      setEstado({ kind: "dragging" });
    }
  };

  const onDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (estado.kind === "dragging") setEstado({ kind: "idle" });
  };

  const quitar = () => setEstado({ kind: "idle" });
  const reintentar = () => setEstado({ kind: "idle" });

  if (estado.kind === "success") {
    return (
      <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 flex items-center gap-3">
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#059669"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
          <polyline points="22 4 12 14.01 9 11.01" />
        </svg>
        <div className="flex-1 min-w-0">
          <div className="text-sm text-emerald-800 truncate">
            {estado.result.nombreOriginal}
          </div>
          <div className="text-xs text-emerald-600">
            {(estado.result.sizeBytes / 1024).toFixed(0)} KB · subido
          </div>
        </div>
        <button
          type="button"
          onClick={quitar}
          className="text-sm text-emerald-700 hover:text-emerald-900 underline"
          aria-label="Quitar archivo"
        >
          Quitar
        </button>
      </div>
    );
  }

  if (estado.kind === "uploading") {
    return (
      <div className="rounded-md border border-gray-200 bg-white p-3">
        <div className="flex items-center gap-3 mb-2">
          <svg
            className="animate-spin"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
          </svg>
          <div className="text-sm text-gray-700 truncate flex-1">
            {estado.fileName}
          </div>
          <div className="text-xs text-gray-500 tabular-nums">
            {estado.progress}%
          </div>
        </div>
        <div className="h-1.5 w-full bg-gray-100 rounded overflow-hidden">
          <div
            className="h-full bg-black transition-all"
            style={{ width: `${estado.progress}%` }}
          />
        </div>
      </div>
    );
  }

  if (estado.kind === "error") {
    return (
      <div className="rounded-md border border-red-200 bg-red-50 p-3 flex items-center gap-3">
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#dc2626"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
        <div className="flex-1 text-sm text-red-700">{estado.message}</div>
        <button
          type="button"
          onClick={reintentar}
          className="text-sm text-red-700 underline hover:text-red-900"
        >
          Reintentar
        </button>
      </div>
    );
  }

  const dragging = estado.kind === "dragging";

  return (
    <div
      onDrop={onDrop}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      className={`rounded-md border-2 border-dashed p-6 text-center transition ${
        dragging
          ? "border-fuchsia-500 bg-fuchsia-50"
          : "border-gray-300 bg-white hover:border-gray-400"
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={onFileChange}
      />
      <div className="text-sm text-gray-600 mb-2">{label}</div>
      <div className="text-xs text-gray-400 mb-3">
        Arrastra un archivo aquí o
      </div>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="rounded-md bg-black text-white px-3 py-2 text-sm active:scale-[0.97] transition"
      >
        Elegir archivo
      </button>
      <div className="text-xs text-gray-400 mt-2">
        Máximo {maxSizeMb}MB
      </div>
    </div>
  );
}

export default PdfUploader;
