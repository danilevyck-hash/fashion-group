"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 LO QUE SE HACE CON UNA FILA: EL PAPEL A LA VISTA, EL RESTO EN EL «···»
// (6-sep-2026)
//
// La fila ofrecía «Editar · Duplicar · Eliminar», y **«Eliminar» era el botón
// más a la vista** —rojo, al final, del tamaño de los otros dos— mientras que
// el PDF, el correo y el vendedor solo existían ADENTRO del pedido. Se invirtió:
//
//   · **«Ver PDF»** sale a la fila. Es lo que se le mandó al cliente.
//   · Editar · Duplicar · Reenviar el correo · Eliminar pasan al «···» de la
//     casa (`OverflowMenu`), el mismo de Guías, Préstamos y Caja.
//
// 🩸 EN iOS LA DESCARGA SE PIERDE SI HAY UN `await` DE RED EN EL MEDIO. El PDF
// necesita los renglones del pedido, que no viajan en la fila. Es el problema
// que Guías ya resolvió: **la lectura arranca en el `pointerdown`**, o sea antes
// del `click`, así que para cuando el toque termina la respuesta ya está (o
// está por llegar) y el `doc.save()` cae dentro del gesto. La promesa se guarda
// por id: pasar el dedo por encima no dispara dos lecturas del mismo pedido.
//
// ⚠️ **«Duplicar» solo se dibuja donde el servidor lo permite.** Hoy salía en
// las 56 filas y solo funciona en las que YA están en Switch: `duplicar-pedido`
// exige un envío activo y contesta 409 —«Este pedido no está en Switch»— a las
// otras. Un botón que muere en un error no es una acción, es una trampa.
// ─────────────────────────────────────────────────────────────────────────────

import { useRef, useState } from "react";
import OverflowMenu, { type OverflowMenuItem } from "@/components/ui/OverflowMenu";
import { nombreArchivoPapel, palabraDelPapelDeFila } from "@/lib/catalogo/papel-de-la-fila";
import { hoyPanama } from "@/lib/fecha-panama";
import type { FilaComprobante } from "@/lib/catalogo/fila-comprobante";
import type { MarcaTheme } from "@/lib/catalogo/marcas-ui";

/** Lo que hace falta del pedido completo para dibujar su papel. */
interface PedidoConItems {
  order_number?: string | null;
  client_name?: string | null;
  created_at?: string | null;
  client_email?: string | null;
  [k: string]: unknown;
}

interface ItemDelPedido {
  sku?: string | null;
  name?: string | null;
  quantity?: number | null;
  unit_price?: number | null;
  image_url?: string | null;
  category?: string | null;
  bulto_pzas?: number | null;
}

export default function AccionesComprobante({
  pedido,
  theme,
  puedeEditar,
  puedeAdministrar,
  esOrders,
  abriendo,
  onAbrir,
  onDuplicar,
  onReenviarCorreo,
  onEliminar,
  showToast,
}: {
  pedido: FilaComprobante;
  theme: MarcaTheme;
  puedeEditar: boolean;
  puedeAdministrar: boolean;
  esOrders: boolean;
  abriendo: boolean;
  onAbrir: () => void;
  onDuplicar: () => void;
  onReenviarCorreo: () => void;
  onEliminar: () => void;
  showToast: (msg: string, tono?: "error" | "success") => void;
}) {
  const [bajando, setBajando] = useState(false);
  // La lectura arrancada en el `pointerdown`, por id de pedido.
  const precarga = useRef<Map<string, Promise<PedidoConItems | null>>>(new Map());

  function leerPedido(id: string): Promise<PedidoConItems | null> {
    const ya = precarga.current.get(id);
    if (ya) return ya;
    const p = fetch(`${theme.api}/orders/${id}`)
      .then((r) => (r.ok ? (r.json() as Promise<PedidoConItems>) : null))
      .catch(() => null);
    precarga.current.set(id, p);
    return p;
  }

  async function verPdf() {
    if (bajando) return;
    setBajando(true);
    try {
      const full = await leerPedido(pedido.id_natural);
      if (!full) {
        precarga.current.delete(pedido.id_natural);
        showToast("No se pudo abrir el PDF. Intenta de nuevo.", "error");
        return;
      }
      const items = ((full[theme.itemsField] as ItemDelPedido[] | null) || []).map((i) => ({
        sku: i.sku || "",
        name: i.name || "",
        quantity: Number(i.quantity) || 0,
        unit_price: Number(i.unit_price) || 0,
        image_url: i.image_url || "",
        category: i.category || theme.pdfFallbackCategory,
        bulto_pzas: i.bulto_pzas ?? null,
      }));
      const { downloadCatalogoOrderPdf } = await import("@/lib/catalogo/order-pdf-client");
      await downloadCatalogoOrderPdf({
        marca: theme.marca,
        orderNumber: String(full.order_number ?? pedido.numero_pedido ?? ""),
        clientName: String(full.client_name ?? pedido.cliente ?? ""),
        createdAt: String(full.created_at ?? pedido.created_at),
        items,
        bultoSize: (c, bultoPzas) => theme.bulto(c || theme.pdfFallbackCategory, bultoPzas),
        documentoLabel: palabraDelPapelDeFila(pedido),
        filename: nombreArchivoPapel(pedido, hoyPanama()),
      });
      showToast("PDF listo — revisa tu carpeta de descargas", "success");
    } catch {
      showToast("No se pudo abrir el PDF. Intenta de nuevo.", "error");
    } finally {
      setBajando(false);
    }
  }

  const items: OverflowMenuItem[] = [];
  items.push({ label: puedeEditar ? "Editar" : "Ver", onClick: onAbrir, disabled: abriendo });
  // 🔴 Duplicar: solo pedidos internos que YA están en Switch (el servidor
  // contesta 409 a los demás). Ver la cabecera.
  if (puedeEditar && esOrders && pedido.en_switch) {
    items.push({ label: "Duplicar", onClick: onDuplicar });
  }
  if (puedeEditar && esOrders) {
    items.push({ label: "Reenviar el correo", onClick: onReenviarCorreo });
  }
  if (puedeAdministrar) {
    items.push({ label: "Eliminar", onClick: onEliminar, destructive: true });
  }

  return (
    <div className="inline-flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
      {esOrders && (
        <button
          // 🩸 El toque en iOS: la lectura arranca ACÁ, no en el click.
          onPointerDown={() => leerPedido(pedido.id_natural)}
          onClick={(e) => {
            e.stopPropagation();
            verPdf();
          }}
          disabled={bajando}
          className="min-h-[44px] px-3 rounded-md border border-gray-200 text-xs font-medium text-gray-600 hover:bg-gray-50 active:scale-[0.97] transition disabled:opacity-50"
        >
          {bajando ? "Abriendo…" : "Ver PDF"}
        </button>
      )}
      <OverflowMenu items={items} ariaLabel={`Más opciones de ${pedido.cliente}`} />
    </div>
  );
}
