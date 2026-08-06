"use client";

// ─────────────────────────────────────────────────────────────────────────────
// PIEZAS POR BULTO de un estilo — solo Tommy.
//
// Daniel: *"hay aveces que los bultos son de 8 y otros de 12, la mayorria son
// de 12"*. No hay de dónde deducirlo (las cuatro fuentes posibles están vacías,
// ver `tommy-bulto.ts`), así que se marca acá.
//
// Dos pastillas y no un campo de texto: la respuesta es 8 o 12, y escribirla a
// mano abre la puerta a un 0 —que dividiría el cálculo del pedido— o a un 88
// por dedo pesado. Mismo patrón que las salidas de Asistencia.
//
// Guardar "12" escribe NULL, no un 12. El default de la marca ya dice 12; una
// fila con 12 escrito a mano sería un segundo lugar donde vive el mismo número.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from "react";
import { updateProductBulto } from "./photoUpload";
import type { MarcaUiKey } from "@/lib/catalogo/marcas-ui";
import { BULTO_TOMMY_DEFAULT } from "@/lib/tommy-bulto";

/** Las que existen en el negocio. Cambiarlas es una decisión de Daniel. */
const OPCIONES = [BULTO_TOMMY_DEFAULT, 8] as const;

interface Props {
  marca: MarcaUiKey;
  /** El valor del campo con el que esta marca edita (`id` o `sku`). */
  productId: string;
  productName: string;
  /** Lo guardado hoy. Vacío = el default de la marca. */
  bultoPzas: number | null | undefined;
  onSaved: () => Promise<unknown> | void;
  showToast: (msg: string) => void;
  compacto?: boolean;
}

export default function BultoSelector({
  marca, productId, productName, bultoPzas, onSaved, showToast, compacto,
}: Props) {
  // El optimista vive SOLO mientras guarda; la fuente de verdad vuelve a ser la
  // prop en cuanto revalida. Sembrar useState desde props deja el valor viejo
  // pegado cuando el producto cambia — el bug que ya documenta el badge.
  const [pendiente, setPendiente] = useState<number | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [guardado, setGuardado] = useState(false);

  const actual = guardando ? pendiente : (bultoPzas ?? null);
  const efectivo = actual ?? BULTO_TOMMY_DEFAULT;

  async function elegir(n: number) {
    // El default se guarda como NULL (ver cabecera).
    const next = n === BULTO_TOMMY_DEFAULT ? null : n;
    if (next === (bultoPzas ?? null)) return;
    setPendiente(next);
    setGuardando(true);
    setGuardado(false);
    try {
      await updateProductBulto(marca, productId, next);
      await onSaved();
      setGuardado(true);
      setTimeout(() => setGuardado(false), 2000);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "No se pudo guardar las piezas por bulto.");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className={compacto ? "flex items-center gap-1.5" : ""}>
      <div className="flex items-center justify-between mb-1">
        {!compacto && (
          <span className="text-[11px] font-medium text-gray-500">Piezas por bulto</span>
        )}
        {guardando ? (
          <span className="text-[10px] text-gray-400">Guardando…</span>
        ) : guardado ? (
          <span className="text-[10px] font-medium text-emerald-600">✓ Guardado</span>
        ) : null}
      </div>
      <div className="flex gap-1" role="group" aria-label={`Piezas por bulto de ${productName}`}>
        {OPCIONES.map((n) => (
          <button
            key={n}
            type="button"
            disabled={guardando}
            onClick={() => void elegir(n)}
            aria-pressed={efectivo === n}
            className={`min-h-[44px] min-w-[44px] rounded-md border px-2.5 text-[13px] tabular-nums transition active:scale-[0.97] disabled:opacity-50 ${
              efectivo === n
                ? "border-[#152342] bg-[#152342] text-white"
                : "border-gray-200 text-gray-600 hover:border-gray-400"
            }`}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}
