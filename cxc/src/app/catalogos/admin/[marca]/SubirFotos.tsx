"use client";

// ─────────────────────────────────────────────────────────────────────────────
// UN SOLO CUADRO PARA SUBIR FOTOS (6-sep-2026).
//
// Daniel, textual: *«¿no se puede hacer un solo campo? En la que dropeo el zip,
// dropeo varias fotos, y toco el mismo cuadro y selecciono una foto y después
// al volver a tocarlo selecciono otra foto sin que se me borre la anterior»*.
//
// Reemplaza a los DOS componentes que había —`ZipB2BUpload` (solo `.zip`, un
// archivo a la vez) y `BulkPhotoUpload` (solo imágenes, y que REEMPLAZABA la
// lista en cada toque)—. Acá:
//
//   · el mismo cuadro acepta el ZIP del portal y fotos sueltas, arrastrando o
//     tocando; si vienen mezclados hace las dos cosas;
//   · la lista SUMA (ver `admin-fotos-cola.ts`) y se puede quitar una sin
//     perder las demás;
//   · 🔴 LAS FOTOS SE SUBEN SOLAS apenas caen en la lista — Daniel: *«se suben
//     solas»*. No hay botón de subir ni de guardar. Una que falla no frena a
//     las demás;
//   · la foto cuyo nombre no coincide con ningún código NO se descarta: se
//     queda y se le elige el producto a mano.
//
// El ZIP sigue procesándose 100% en el navegador (`zip-b2b-client.ts`): pesa
// 27-78 MB y Vercel corta el cuerpo de una petición en ~4,5 MB.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Ayuda } from "@/components/shared/Ayuda";
import { validateProductPhoto, uploadProductPhoto } from "./photoUpload";
import { getMarcaTheme, type AdminProducto, type MarcaUiKey } from "@/lib/catalogo/marcas-ui";
import {
  agregarFotos, asignarProducto, marcarEstado, quitarDeLaCola, resumenCola,
  separarPorTipo, siguienteParaSubir, type ItemFoto,
} from "@/lib/catalogos/admin-fotos-cola";
import { coincideBusqueda } from "@/lib/catalogos/admin-lista";
import type { ProgresoZip, ResultadoZip } from "@/lib/catalogos/zip-b2b-client";
import type { StorageMarcaKey } from "@/lib/catalogos/variantes-paths";

/**
 * Lo que el cuadro acepta: el ZIP del portal y los tipos de imagen que
 * `validateProductPhoto` deja pasar.
 *
 * 🩸 Se enumeran en vez de escribir el comodín de imagen: ese comodín lleva
 * adentro los dos caracteres con los que ARRANCA un comentario de bloque, y los
 * barridos de texto del repo borran los comentarios antes de mirar el archivo —
 * o sea que se comían la pantalla entera desde ahí hasta el próximo cierre, y
 * un candado de texto pasaba en verde sin haber leído nada.
 */
const ACEPTA = ".zip,application/zip,image/jpeg,image/png,image/webp,image/avif,image/gif";

const FASE_LABEL: Record<ProgresoZip["fase"], string> = {
  leyendo: "Abriendo el ZIP…",
  procesando: "procesadas",
  subiendo: "subidas",
  guardando: "Guardando en el catálogo…",
  listo: "Listo",
};

export default function SubirFotos({
  marca, products, onFotoSubida, onZipListo, showToast,
}: {
  marca: MarcaUiKey;
  /** Catálogo completo de la marca — de aquí salen los códigos del pareo. */
  products: AdminProducto[];
  onFotoSubida: () => Promise<void>;
  onZipListo: () => Promise<void>;
  showToast: (msg: string) => void;
}) {
  const theme = getMarcaTheme(marca)!;
  const inputRef = useRef<HTMLInputElement>(null);
  const [encima, setEncima] = useState(false);

  const [cola, setCola] = useState<ItemFoto<File>[]>([]);
  const colaRef = useRef<ItemFoto<File>[]>([]);
  const subiendoRef = useRef(false);

  const [zipsEnEspera, setZipsEnEspera] = useState<File[]>([]);
  const [zipProgreso, setZipProgreso] = useState<ProgresoZip | null>(null);
  const [zipResultado, setZipResultado] = useState<ResultadoZip | null>(null);
  const [zipError, setZipError] = useState<string | null>(null);
  const zipCorriendoRef = useRef(false);

  const actualizarCola = useCallback((f: (c: ItemFoto<File>[]) => ItemFoto<File>[]) => {
    setCola((c) => {
      const n = f(c);
      colaRef.current = n;
      return n;
    });
  }, []);

  /** Lo que cayó en el cuadro, sea lo que sea. Suma, nunca reemplaza. */
  const recibir = useCallback(
    (lista: FileList | File[] | null) => {
      const todos = Array.from(lista ?? []);
      if (todos.length === 0) return;
      const { zips, fotos } = separarPorTipo(todos);
      if (fotos.length > 0) {
        actualizarCola((c) => agregarFotos(c, fotos, products, validateProductPhoto));
      }
      if (zips.length > 0) {
        setZipError(null);
        setZipResultado(null);
        setZipsEnEspera((z) => [...z, ...zips]);
      }
    },
    [products, actualizarCola],
  );

  // ── Subida sola, de a una, sin botón ───────────────────────────────────────
  useEffect(() => {
    if (subiendoRef.current) return;
    const sig = siguienteParaSubir(cola);
    if (!sig || !sig.productoId) return;
    subiendoRef.current = true;
    void (async () => {
      actualizarCola((c) => marcarEstado(c, sig.clave, "subiendo"));
      try {
        await uploadProductPhoto(marca, { id: sig.productoId!, sku: sig.sku || "" }, sig.archivo);
        actualizarCola((c) => marcarEstado(c, sig.clave, "lista"));
      } catch (e) {
        // Una que falla no frena a las demás: se marca y se sigue con la fila.
        actualizarCola((c) =>
          marcarEstado(c, sig.clave, "error", e instanceof Error ? e.message : "No se pudo subir."),
        );
      } finally {
        subiendoRef.current = false;
      }
      // Se revalida el catálogo cuando la fila se vacía, no en cada foto.
      if (!siguienteParaSubir(colaRef.current)) await onFotoSubida();
    })();
  }, [cola, marca, actualizarCola, onFotoSubida]);

  // ── El ZIP, de a uno ───────────────────────────────────────────────────────
  useEffect(() => {
    if (zipCorriendoRef.current || zipsEnEspera.length === 0) return;
    const file = zipsEnEspera[0];
    zipCorriendoRef.current = true;
    void (async () => {
      setZipProgreso({ fase: "leyendo", hechas: 0, total: 0 });
      try {
        // Import dinámico: JSZip y el canvas no entran al bundle inicial.
        const { procesarZipB2B } = await import("@/lib/catalogos/zip-b2b-client");
        const res = await procesarZipB2B(file, {
          marca: marca as StorageMarcaKey,
          apiBase: theme.api,
          skusCatalogo: products.map((p) => p.sku || "").filter(Boolean),
          onProgreso: setZipProgreso,
        });
        setZipResultado(res);
        showToast(`${res.asignadas} fotos asignadas`);
        await onZipListo();
      } catch (e) {
        setZipError(e instanceof Error ? e.message : "No se pudo procesar el ZIP.");
      } finally {
        setZipProgreso(null);
        zipCorriendoRef.current = false;
        setZipsEnEspera((z) => z.slice(1));
      }
    })();
  }, [zipsEnEspera, marca, theme.api, products, onZipListo, showToast]);

  const resumen = useMemo(() => resumenCola(cola), [cola]);
  const zipTrabajando = zipProgreso != null;
  const pct =
    zipProgreso && zipProgreso.total > 0
      ? Math.round((zipProgreso.hechas / zipProgreso.total) * 100)
      : null;

  return (
    <section className="mb-6 rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-1">
          <h2 className="text-sm font-semibold text-gray-900">Subir fotos</h2>
          {/* Metodología —cómo trata el ZIP— dentro del ⓘ: se aprende una vez.
              🔴 La REGLA DEL NOMBRE POR SKU no entra acá: sin ella la subida no
              hace nada, así que se queda a la vista, pegada al cuadro. */}
          <Ayuda titulo="Cómo funciona">
            Arrastra el ZIP tal como lo bajas del portal, sin descomprimirlo. Se guardan todas las
            fotos de cada código y se elige la mejor automáticamente. Puede pesar 80 MB — se procesa
            en tu navegador, no se sube entero.
          </Ayuda>
        </div>
        {(cola.length > 0 || zipResultado || zipError) && (
          <button
            onClick={() => {
              actualizarCola(() => []);
              setZipResultado(null);
              setZipError(null);
              if (inputRef.current) inputRef.current.value = "";
            }}
            className="min-h-[44px] px-2 text-xs text-gray-400 hover:text-gray-700"
          >
            Limpiar la lista
          </button>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={ACEPTA}
        multiple
        className="hidden"
        onChange={(e) => {
          recibir(e.target.files);
          // Se vacía para poder volver a elegir EL MISMO archivo si hizo falta.
          if (inputRef.current) inputRef.current.value = "";
        }}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setEncima(true); }}
        onDragLeave={() => setEncima(false)}
        onDrop={(e) => { e.preventDefault(); setEncima(false); recibir(e.dataTransfer.files); }}
        className={`w-full min-h-[44px] cursor-pointer rounded-lg border-2 border-dashed px-4 py-6 text-center transition ${
          encima ? "border-gray-500 bg-gray-50" : "border-gray-300 hover:border-gray-400"
        }`}
      >
        <svg className="w-7 h-7 mx-auto text-gray-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.9A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 13l3-3m0 0l3 3m-3-3v9" />
        </svg>
        <p className="text-sm text-gray-600 font-medium">
          Arrastra aquí el ZIP o las fotos, o toca para elegirlas
        </p>
        <p className="text-xs text-gray-400 mt-1">
          El nombre del archivo debe ser el código (SKU). Ej. GH8228.jpg — toca de nuevo y se suman
          a las de arriba.
        </p>
      </button>

      {/* ── El ZIP ── */}
      {zipTrabajando && (
        <div className="mt-4 rounded-lg border border-gray-200 px-4 py-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="w-4 h-4 border-2 border-gray-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-sm font-medium text-gray-700 tabular-nums">
              {zipProgreso.fase === "procesando" || zipProgreso.fase === "subiendo"
                ? `${zipProgreso.hechas}/${zipProgreso.total} ${FASE_LABEL[zipProgreso.fase]}`
                : FASE_LABEL[zipProgreso.fase]}
            </span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-gray-100 overflow-hidden">
            <div className="h-full bg-gray-800 transition-all duration-200" style={{ width: `${pct ?? 4}%` }} />
          </div>
          <p className="text-xs text-gray-400 mt-2">No cierres esta pestaña hasta que termine.</p>
        </div>
      )}

      {zipError && (
        <div className="mt-3 rounded-lg border border-red-200 bg-red-50/50 px-4 py-3">
          <p className="text-sm text-red-700">{zipError}</p>
        </div>
      )}

      {zipResultado && !zipTrabajando && (
        <div className="mt-3 rounded-lg border border-gray-200 divide-y divide-gray-100">
          <div className="px-4 py-3 flex flex-wrap gap-2 text-xs">
            <span className="px-2 py-1 rounded-full bg-emerald-50 text-emerald-700 font-medium">
              {zipResultado.asignadas} fotos asignadas
            </span>
            {zipResultado.manuales > 0 && (
              <span className="px-2 py-1 rounded-full bg-blue-50 text-blue-700 font-medium">
                {zipResultado.manuales} ya tenían foto elegida a mano
              </span>
            )}
            {zipResultado.sinMatch.length > 0 && (
              <span className="px-2 py-1 rounded-full bg-amber-50 text-amber-700 font-medium">
                {zipResultado.sinMatch.length} códigos sin producto
              </span>
            )}
            <span className="px-2 py-1 rounded-full bg-gray-100 text-gray-600 font-medium">
              {zipResultado.variantesSubidas} fotos guardadas
            </span>
          </div>
          {zipResultado.sinMatch.length > 0 && (
            <div className="px-4 py-3">
              <p className="text-xs font-medium text-amber-700 mb-1">
                Códigos del ZIP que no existen en el catálogo:
              </p>
              <div className="max-h-32 overflow-y-auto text-[11px] font-mono text-gray-500 leading-relaxed">
                {zipResultado.sinMatch.join(" · ")}
              </div>
            </div>
          )}
          {zipResultado.errores.length > 0 && (
            <div className="px-4 py-3">
              <p className="text-xs font-medium text-red-600 mb-1">No se pudieron guardar:</p>
              <ul className="max-h-32 overflow-y-auto text-[11px] text-red-700 space-y-0.5">
                {zipResultado.errores.map((e, i) => <li key={i}>{e}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* ── Las fotos sueltas ── */}
      {cola.length > 0 && (
        <div className="mt-4">
          <p className="text-xs text-gray-500 mb-2 tabular-nums">
            {resumen.listas} de {resumen.total} subidas
            {resumen.pendientes > 0 && ` · ${resumen.pendientes} esperan que elijas el producto`}
            {resumen.conError > 0 && ` · ${resumen.conError} con problema`}
          </p>
          <ul className="rounded-lg border border-gray-200 divide-y divide-gray-100 max-h-96 overflow-y-auto">
            {cola.map((it) => (
              <li key={it.clave} className="px-3 py-2 text-sm">
                <div className="flex items-center gap-3">
                  <Punto estado={it.estado} />
                  <span className="font-mono text-xs text-gray-500 truncate max-w-[45%]">{it.archivo.name}</span>
                  {it.nombreProducto ? (
                    <span className="text-gray-900 font-medium truncate">
                      {it.sku} · {it.nombreProducto}
                    </span>
                  ) : (
                    <span className="text-gray-500 truncate">{it.motivo}</span>
                  )}
                  {it.reemplaza && it.estado === "esperando" && (
                    <span className="shrink-0 text-[11px] text-amber-600 font-medium">reemplaza</span>
                  )}
                  {it.estado === "error" && (
                    <span className="shrink-0 text-[11px] text-red-600">{it.motivo}</span>
                  )}
                  <button
                    onClick={() => actualizarCola((c) => quitarDeLaCola(c, it.clave))}
                    aria-label={`Quitar ${it.archivo.name} de la lista`}
                    className="ml-auto shrink-0 min-w-[44px] min-h-[44px] flex items-center justify-center text-gray-300 hover:text-gray-600 transition"
                  >
                    ✕
                  </button>
                </div>
                {it.estado === "pendiente" && (
                  <ElegirProducto
                    products={products}
                    onElegir={(p) => actualizarCola((c) => asignarProducto(c, it.clave, p))}
                  />
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function Punto({ estado }: { estado: ItemFoto["estado"] }) {
  if (estado === "subiendo")
    return <span className="w-4 h-4 shrink-0 border-2 border-gray-700 border-t-transparent rounded-full animate-spin" />;
  if (estado === "lista")
    return (
      <span className="w-4 h-4 shrink-0 rounded-full bg-emerald-500 flex items-center justify-center">
        <svg width="9" height="7" viewBox="0 0 10 8" fill="none" aria-hidden="true"><path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" /></svg>
      </span>
    );
  if (estado === "error")
    return <span className="w-4 h-4 shrink-0 rounded-full bg-red-600 flex items-center justify-center text-white text-[10px] font-bold leading-none">!</span>;
  if (estado === "pendiente")
    return <span className="w-4 h-4 shrink-0 rounded-full border-2 border-amber-400" />;
  return <span className="w-4 h-4 shrink-0 rounded-full border-2 border-gray-300" />;
}

/** Elegir a mano el producto de una foto cuyo nombre no dice a cuál va. */
function ElegirProducto({
  products, onElegir,
}: {
  products: AdminProducto[];
  onElegir: (p: { id: string; sku: string | null; name: string; image_url: string | null }) => void;
}) {
  const [q, setQ] = useState("");
  const candidatos = useMemo(() => {
    if (!q.trim()) return [];
    return products.filter((p) => coincideBusqueda(p, q)).slice(0, 8);
  }, [q, products]);

  return (
    <div className="mt-2 ml-7">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Busca el producto por código o nombre…"
        className="w-full max-w-md min-h-[44px] px-3 bg-white border border-gray-200 rounded-lg text-sm outline-none focus:border-gray-400 transition"
      />
      {candidatos.length > 0 && (
        <ul className="mt-1 rounded-lg border border-gray-200 divide-y divide-gray-100 max-w-md overflow-hidden">
          {candidatos.map((p) => (
            <li key={p.id}>
              <button
                onClick={() => onElegir(p)}
                className="w-full min-h-[44px] px-3 py-2 text-left text-sm text-gray-800 hover:bg-gray-50 transition"
              >
                <span className="font-mono text-xs text-gray-500 mr-2">{p.sku}</span>
                {p.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
