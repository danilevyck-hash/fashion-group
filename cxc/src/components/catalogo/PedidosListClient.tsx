"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 LA PANTALLA DE COMPROBANTES — LA ÚNICA (25-ago-2026)
//
// Daniel, textual: *"En pedidos de los catálogos. En administrar y pedidos
// debería ser la misma pestaña, no dos aparte."*
//
// Antes había DOS pantallas del mismo dato: ésta (`/catalogo/<marca>/pedidos`,
// la que se abre con el botón «Pedidos» del catálogo, y por la que entra
// Daniel) y la pestaña del panel de administrar. Ahora hay una, y **vive acá**
// por tres razones medidas, no por gusto:
//
//   1. Es la ruta a la que llegan LOS TRES roles que trabajan pedidos —admin,
//      secretaria y vendedor— con datos de verdad. La del admin le responde
//      403 al vendedor: unificar allá habría obligado a abrirle un permiso, y
//      los permisos no se tocan.
//   2. Su feed (`/orders`) es el que CUADRA CON EL DETALLE. Medido: en 5
//      pedidos de Tommy el panel del admin mostraba hasta $680 de más
//      (TOM-024 $3.324 donde el detalle dice $3.100), porque `/pedidos-unificado`
//      no pasa las piezas por bulto del estilo. Ver `fila-comprobante.ts`.
//   3. El panel de administrar es una COLA DE FOTOS: se entra a subir imágenes
//      y a ocultar productos. Los comprobantes eran un invitado ahí.
//
// La pestaña vieja (`/catalogos/admin/<marca>?tab=pedidos`) SIGUE LLEGANDO: la
// `key` no se tocó y la página redirige acá, igual que se hizo con
// `/saldos-banco`. Un marcador guardado no se puede romper.
//
// Lo que se ve y lo que se puede hacer sale del ROL, no de la puerta:
// `ComprobantesPanel` esconde borrar/borrado masivo/exportar a quien no
// administra — y el SERVIDOR ya se los negaba con 403 antes de este cambio.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useToast } from "@/components/ToastSystem";
import ComprobantesPanel from "@/components/catalogo/ComprobantesPanel";
import { filasDeOrders, type FilaComprobante, type FilaDeOrders } from "@/lib/catalogo/fila-comprobante";
import { CATALOGO_ADMIN_ROLES } from "@/lib/catalogo/roles";
import { PANEL_COMPROBANTES } from "@/lib/catalogo/numeros-pedido";
import { getMarcaTheme, type MarcaUiKey } from "@/lib/catalogo/marcas-ui";

export default function PedidosListClient({ marca }: { marca: MarcaUiKey }) {
  const theme = getMarcaTheme(marca)!;
  const router = useRouter();
  const { toast } = useToast();
  const [pedidos, setPedidos] = useState<FilaComprobante[]>([]);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<string | null>(null);

  useEffect(() => {
    const r = sessionStorage.getItem("cxc_role") || "";
    if (!r) { router.push("/"); return; }
    setRole(r);
  }, [router]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${theme.api}/orders`);
      if (r.ok) setPedidos(filasDeOrders((await r.json()) as FilaDeOrders[]));
    } catch { /* la lista queda como estaba */ }
    setLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { load(); }, [load]);

  // 🩸 Cosmética, no candado: el servidor ya responde 403 a quien no está acá.
  const puedeAdministrar = (CATALOGO_ADMIN_ROLES as readonly string[]).includes(String(role ?? ""));

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      <Link href={theme.catalogoHref} className="text-xs text-gray-400 hover:text-gray-600 transition">← Catálogo</Link>
      <h1 className="text-2xl font-light mt-2 mb-6">{PANEL_COMPROBANTES}</h1>

      {loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => <div key={i} className="h-14 bg-gray-100 rounded-lg animate-pulse" />)}
        </div>
      ) : (
        <ComprobantesPanel
          marca={marca}
          pedidos={pedidos}
          onRefresh={load}
          showToast={(m, tono) => toast(m, tono)}
          puedeAdministrar={puedeAdministrar}
        />
      )}
    </div>
  );
}
