"use client";

import {
  useCallback,
  useRef,
  useState,
  DragEvent,
  ChangeEvent,
  useEffect,
} from "react";
import { useToast } from "@/components/ToastSystem";
import type { UploadResult } from "./PdfUploader";

interface FotoUploaderProps {
  onUpload: (file: File) => Promise<UploadResult>;
  label?: string;
  accept?: string;
  maxSizeMb?: number;
  multiple?: boolean;
}

interface Item {
  id: string;
  file: File;
  previewUrl: string;
  status: "pending" | "uploading" | "success" | "error";
  progress: number;
  result?: UploadResult;
  errorMessage?: string;
}

export function FotoUploader({
  onUpload,
  label = "Sube fotos",
  accept = "image/*",
  maxSizeMb = 10,
  multiple = true,
}: FotoUploaderProps) {
  const [items, setItems] = useState<Item[]>([]);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  // Clean up object URLs al desmontar
  useEffect(() => {
    return () => {
      items.forEach((it) => URL.revokeObjectURL(it.previewUrl));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const validar = useCallback(
    (file: File): string | null => {
      const maxBytes = maxSizeMb * 1024 * 1024;
      if (file.size > maxBytes) {
        return `"${file.name}" pesa más de ${maxSizeMb}MB.`;
      }
      const accepted = accept
        .split(",")
        .map((a) => a.trim())
        .filter(Boolean);
      if (accepted.length > 0) {
        const mime = file.type;
        const nombre = file.name.toLocaleLowerCase();
        const match = accepted.some((a) => {
          if (a.startsWith(".")) return nombre.endsWith(a.toLocaleLowerCase());
          if (a.endsWith("/*")) return mime.startsWith(a.slice(0, -1));
          return mime === a;
        });
        if (!match) return `"${file.name}" no es un tipo válido.`;
      }
      return null;
    },
    [accept, maxSizeMb]
  );

  const subirItem = useCallback(
    async (item: Item) => {
      setItems((prev) =>
        prev.map((it) =>
          it.id === item.id ? { ...it, status: "uploading", progress: 10 } : it
        )
      );
      const interval = setInterval(() => {
        setItems((prev) =>
          prev.map((it) =>
            it.id === item.id && it.status === "uploading"
              ? { ...it, progress: Math.min(it.progress + 10, 90) }
              : it
          )
        );
      }, 200);
      try {
        const result = await onUpload(item.file);
        clearInterval(interval);
        setItems((prev) =>
          prev.map((it) =>
            it.id === item.id
              ? { ...it, status: "success", progress: 100, result }
              : it
          )
        );
      } catch (err: unknown) {
        clearInterval(interval);
        const message =
          err instanceof Error ? err.message : "No se pudo subir la foto.";
        setItems((prev) =>
          prev.map((it) =>
            it.id === item.id
              ? { ...it, status: "error", errorMessage: message }
              : it
          )
        );
        toast(message, "error");
      }
    },
    [onUpload, toast]
  );

  const procesar = useCallback(
    (files: FileList | File[]) => {
      const arr = Array.from(files);
      const lista = multiple ? arr : arr.slice(0, 1);

      const nuevos: Item[] = [];
      const errores: string[] = [];

      for (const file of lista) {
        const error = validar(file);
        if (error) {
          errores.push(error);
          continue;
        }
        nuevos.push({
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          file,
          previewUrl: URL.createObjectURL(file),
          status: "pending",
          progress: 0,
        });
      }

      if (errores.length > 0) {
        toast(errores.join(" "), "error");
      }
      if (nuevos.length === 0) return;

      setItems((prev) => (multiple ? [...prev, ...nuevos] : nuevos));
      // kick off uploads
      nuevos.forEach((it) => subirItem(it));
    },
    [multiple, validar, subirItem, toast]
  );

  const onFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      procesar(e.target.files);
    }
    e.target.value = "";
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      procesar(e.dataTransfer.files);
    }
  };

  const onDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(true);
  };

  const onDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(false);
  };

  const quitar = (id: string) => {
    setItems((prev) => {
      const it = prev.find((x) => x.id === id);
      if (it) URL.revokeObjectURL(it.previewUrl);
      return prev.filter((x) => x.id !== id);
    });
  };

  const reintentar = (id: string) => {
    const it = items.find((x) => x.id === id);
    if (!it) return;
    subirItem(it);
  };

  return (
    <div className="space-y-3">
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
          multiple={multiple}
          className="hidden"
          onChange={onFileChange}
        />
        <div className="text-sm text-gray-600 mb-2">{label}</div>
        <div className="text-xs text-gray-400 mb-3">
          Arrastra {multiple ? "fotos" : "una foto"} aquí o
        </div>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="rounded-md bg-black text-white px-3 py-2 text-sm active:scale-[0.97] transition"
        >
          Elegir {multiple ? "fotos" : "foto"}
        </button>
        <div className="text-xs text-gray-400 mt-2">
          Máximo {maxSizeMb}MB por foto
        </div>
      </div>

      {items.length > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
          {items.map((it) => (
            <div
              key={it.id}
              className="relative aspect-square rounded-md border border-gray-200 overflow-hidden bg-gray-50"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={it.previewUrl}
                alt={it.file.name}
                className="w-full h-full object-cover"
              />
              {it.status === "uploading" && (
                <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                  <div className="text-xs text-white tabular-nums">
                    {it.progress}%
                  </div>
                </div>
              )}
              {it.status === "error" && (
                <div className="absolute inset-0 bg-red-600/70 flex flex-col items-center justify-center p-1 gap-1">
                  <div className="text-[10px] text-white text-center leading-tight">
                    Error
                  </div>
                  <button
                    type="button"
                    onClick={() => reintentar(it.id)}
                    className="text-[10px] text-white underline"
                  >
                    Reintentar
                  </button>
                </div>
              )}
              {it.status === "success" && (
                <div className="absolute top-1 left-1 bg-emerald-500 text-white rounded-full p-0.5">
                  <svg
                    width="10"
                    height="10"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>
              )}
              <button
                type="button"
                onClick={() => quitar(it.id)}
                aria-label="Quitar foto"
                className="absolute top-1 right-1 bg-white/90 rounded-full w-5 h-5 flex items-center justify-center text-gray-700 hover:bg-white"
              >
                <svg
                  width="10"
                  height="10"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default FotoUploader;
