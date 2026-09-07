"use client";

// ─────────────────────────────────────────────────────────────────────────────
// LA FILA DE UN PRODUCTO — UNA SOLA, PARA LAS CUATRO MARCAS (6-sep-2026).
//
// 🩸 Antes había DOS dibujos de lo mismo: tarjetas (Reebok) y filas
// (Joybees/Tommy/Calvin), en dos archivos de 702 y 1.066 líneas. No era una
// decisión: era el orden en que nacieron las marcas. Lo único que de verdad
// cambia por marca es el BULTO (Tommy y Calvin lo marcan a mano) y eso se
// pregunta al tema, no al nombre de la marca.
//
// Qué quedó en la fila (aprobado por Daniel el 6-sep-2026):
//   Subir foto · Cambiar foto (las del ZIP) · Esconder — más Bulto en Tommy y
//   Calvin.
//
// 🔴 SE RETIRARON de la pantalla la ETIQUETA (Nuevo/Oferta/Próximamente) y el
// NOMBRE editado a mano: 0 usos en 1.120 productos, medido el 6-sep-2026. Las
// COLUMNAS de la base (`badge`, `nombre_manual`) NO se dropean — quedan sin
// lectores en esta pantalla, y hay candado que pone el build ROJO si una
// migración las borra o si esta pantalla vuelve a leerlas.
//
// 🔴 ARRASTRAR UNA FOTO ENCIMA DE LA FILA la sube a ESE producto, sin importar
// cómo se llame el archivo. Es el camino más corto y antes no existía.
// ─────────────────────────────────────────────────────────────────────────────

import { useRef, useState } from "react";
import Image from "next/image";
import BultoSelector from "./BultoSelector";
import VariantePicker from "./VariantePicker";
import { validateProductPhoto, uploadProductPhoto, toggleProductOculto } from "./photoUpload";
import { getMarcaTheme, type AdminProducto, type MarcaUiKey } from "@/lib/catalogo/marcas-ui";
import { fmtPrecio } from "@/lib/catalogo/precio";
import { estaEscondido, tieneFoto } from "@/lib/catalogos/admin-chips";
import { disponibleDe } from "@/lib/catalogos/admin-lista";

/** Los tipos que acepta el selector de foto de la fila — enumerados y no con el
 *  comodín de imagen, por el mismo motivo que en `SubirFotos.tsx`. */
const ACEPTA = "image/jpeg,image/png,image/webp,image/avif,image/gif";

/** Cuántas fotos ALTERNATIVAS tiene el código (lo calcula el shell, sin red). */
export type TieneVariantes = (sku: string | null) => number;

export default function ProductoFila({
  marca, product, onCambio, tieneVariantes, showToast,
}: {
  marca: MarcaUiKey;
  product: AdminProducto;
  onCambio: () => Promise<void>;
  tieneVariantes: TieneVariantes;
  showToast: (msg: string) => void;
}) {
  const theme = getMarcaTheme(marca)!;
  const inputRef = useRef<HTMLInputElement>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [encima, setEncima] = useState(false);

  const escondido = estaEscondido(product);
  const [confirmando, setConfirmando] = useState(false);
  const [guardandoEscondido, setGuardandoEscondido] = useState(false);

  const disponible = disponibleDe(product);
  const agotado = disponible <= 0;

  async function subirFoto(file: File) {
    setError(null);
    const malo = validateProductPhoto(file);
    if (malo) { setError(malo); return; }
    setSubiendo(true);
    try {
      await uploadProductPhoto(marca, { id: product.id, sku: product.sku || "" }, file);
      showToast("Foto subida");
      await onCambio();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo subir la foto.");
    } finally {
      setSubiendo(false);
    }
  }

  async function alternarEscondido() {
    setGuardandoEscondido(true);
    try {
      await toggleProductOculto(marca, { id: product.id, sku: product.sku || "" }, !escondido);
      showToast(escondido ? "Listo — el producto vuelve a verse en el catálogo" : "Listo — el producto quedó escondido");
      await onCambio();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "No se pudo actualizar el producto.");
    } finally {
      setGuardandoEscondido(false);
      setConfirmando(false);
    }
  }

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setEncima(true); }}
      onDragLeave={() => setEncima(false)}
      onDrop={(e) => {
        e.preventDefault();
        setEncima(false);
        const f = e.dataTransfer.files?.[0];
        if (f) void subirFoto(f);
      }}
      className={`bg-white border rounded-lg p-2.5 transition ${
        encima ? "border-gray-800 bg-gray-50" : escondido ? "border-gray-100 opacity-80" : "border-gray-200"
      }`}
    >
      <div className="flex flex-wrap sm:flex-nowrap items-center gap-3">
        {/* Miniatura */}
        <div className="relative w-[88px] h-[88px] shrink-0 rounded-md overflow-hidden bg-gray-100">
          {tieneFoto(product) ? (
            <Image src={product.image_url!} alt={product.name} fill sizes="88px" className="object-contain" unoptimized />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-gray-300">
              <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14M4 6h16a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V8a2 2 0 012-2z" />
              </svg>
            </div>
          )}
          {subiendo && (
            <div className="absolute inset-0 bg-white/70 flex items-center justify-center">
              <span className="w-5 h-5 border-2 border-gray-700 border-t-transparent rounded-full animate-spin" />
            </div>
          )}
        </div>

        {/* Datos */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {product.sku && (
              <span className="shrink-0 text-[11px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded font-medium tabular-nums">
                {product.sku}
              </span>
            )}
            <h3 className="text-sm font-semibold text-gray-900 truncate">{product.name}</h3>
            {escondido && (
              <span className="shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded bg-gray-700 text-white">Escondido</span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-1 text-xs">
            {product.price != null && (
              <span className="font-bold text-gray-900 tabular-nums">{fmtPrecio(product.price)}</span>
            )}
            <span className={`tabular-nums ${agotado ? "text-gray-400" : "text-gray-700"}`}>
              {agotado ? "Agotado" : `Disponible: ${disponible}`}
            </span>
            {product.existencia != null && (
              <span className="text-gray-400 tabular-nums">En bodega: {product.existencia}</span>
            )}
          </div>
          {error && <p className="text-[11px] text-red-600 leading-tight mt-1">{error}</p>}
        </div>

        {/* Acciones */}
        <div className="shrink-0 flex flex-wrap items-center gap-2">
          <input
            ref={inputRef}
            type="file"
            accept={ACEPTA}
            className="hidden"
            disabled={subiendo}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void subirFoto(f);
              if (inputRef.current) inputRef.current.value = "";
            }}
          />
          <button
            onClick={() => inputRef.current?.click()}
            disabled={subiendo}
            className="min-h-[44px] px-3 rounded-md text-xs font-semibold border border-gray-200 text-gray-600 hover:bg-gray-50 active:scale-[0.97] disabled:opacity-50 transition whitespace-nowrap"
          >
            {subiendo ? "Subiendo…" : tieneFoto(product) ? "Subir otra" : "Subir foto"}
          </button>

          {/* Piezas por bulto — solo donde se marcan a mano (Tommy y Calvin). */}
          {theme.admin.bultoEditable && (
            <BultoSelector
              marca={marca}
              productId={theme.admin.productEdit.idField === "sku" ? (product.sku ?? "") : product.id}
              productName={product.name}
              bultoPzas={product.bulto_pzas}
              onSaved={onCambio}
              showToast={showToast}
              compacto
            />
          )}

          {confirmando ? (
            <span className="flex items-center gap-1.5 text-xs">
              <span className="text-gray-500 whitespace-nowrap">
                {escondido ? "¿Mostrar en el catálogo?" : "¿Esconder del catálogo?"}
              </span>
              <button
                onClick={alternarEscondido}
                disabled={guardandoEscondido}
                className="min-h-[44px] px-3 rounded-md font-semibold bg-gray-900 text-white hover:bg-gray-800 active:scale-[0.97] disabled:opacity-50 transition"
              >
                {guardandoEscondido ? "…" : "Sí"}
              </button>
              <button
                onClick={() => setConfirmando(false)}
                disabled={guardandoEscondido}
                className="min-h-[44px] px-3 rounded-md font-semibold border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-50 transition"
              >
                No
              </button>
            </span>
          ) : (
            <button
              onClick={() => setConfirmando(true)}
              className={`min-h-[44px] px-3 rounded-md text-xs font-semibold border transition active:scale-[0.97] whitespace-nowrap ${
                escondido
                  ? "border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                  : "border-gray-200 text-gray-500 hover:bg-gray-50"
              }`}
            >
              {escondido ? "Mostrar" : "Esconder"}
            </button>
          )}
        </div>
      </div>

      {/* Las otras fotos que trajo el ZIP del B2B. */}
      <div className="mt-2 sm:pl-[100px]">
        <VariantePicker
          marca={marca}
          product={product}
          alternativas={tieneVariantes(product.sku)}
          onSaved={onCambio}
          showToast={showToast}
          compacto
        />
      </div>
    </div>
  );
}
