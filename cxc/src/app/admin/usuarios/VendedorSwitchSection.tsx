"use client";

// Sección "Vendedor en Switch" del modal de edición de usuario (Sistema →
// Usuarios). Mapea al fg_user con su vendedorId de Switch POR EMPRESA de
// catálogo — el checkout usa este mapeo para setear el vendedor del pedido
// automáticamente según quién esté logueado.
// Autocontenida: carga vendedores en vivo + mapeos, y guarda al cambiar.
//
// 🩸 LA LISTA SE DERIVA DE LAS MARCAS, NO SE ESCRIBE A MANO (6-ago-2026).
// Estaba escrita a mano con DOS entradas —Reebok y Joybees— y cuando se
// encendió el catálogo de Tommy nadie se acordó de agregar la tercera. El
// resultado no era un selector incompleto: era que **ningún pedido de Tommy
// podía salir a Switch**. Daniel lo vio con un pedido de $1.584,00 armado y el
// botón "Enviar a Switch" apagado, diciendo "No tienes vendedor de
// Switch asignado" — sin forma de asignarlo, porque Tommy no estaba en esta
// lista.
//
// Todo lo demás YA era genérico: la tabla de mapeos y `/api/admin/vendedor-
// mapping` aceptan cualquier `empresa_key`, y el checkout busca por
// `cfg.empresaKey`. El único lugar que sabía "solo hay dos marcas" era este
// arreglo. Derivarlo de `MARCAS_UI` hace que la cuarta marca aparezca sola.
//
// ⚠️ Cada empresa de la lista abre una sesión de Switch al abrir el modal
// (secuencial, sesión única por empresa). No es nuevo —ya pasaba con las dos
// anteriores— pero ahora son tres: abrir este modal justo en la ventana del
// cron de esa empresa puede tumbarle el token. Es el riesgo aceptado de
// siempre, anotado acá para que nadie lo redescubra.

import { useEffect, useState } from "react";
import { Ayuda } from "@/components/shared/Ayuda";
import { MARCAS_UI, getMarcaTheme } from "@/lib/catalogo/marcas-ui";
import { EMPRESA_KEY_TO_NAME } from "@/lib/empresa-mapping";

const EMPRESAS = MARCAS_UI.map((marca) => {
  const theme = getMarcaTheme(marca)!;
  return {
    key: theme.empresaKey,
    // "Tommy Hilfiger (Fashion Shoes)" — la marca es lo que el vendedor
    // reconoce; la empresa es lo que hay que elegir en Switch.
    label: `${theme.label} (${EMPRESA_KEY_TO_NAME[theme.empresaKey] ?? theme.empresaKey})`,
  };
});

interface Vendedor { id: number; nombre: string }
interface Mapping { user_id: string; empresa_key: string; vendedor_id: number; vendedor_nombre: string | null }

export default function VendedorSwitchSection({ userId, showToast }: { userId: string; showToast: (m: string) => void }) {
  const [vendedores, setVendedores] = useState<Record<string, Vendedor[] | null>>({});
  const [mapping, setMapping] = useState<Record<string, number | "">>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [ddlPendiente, setDdlPendiente] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // Mapeos actuales del usuario.
    fetch("/api/admin/vendedor-mapping")
      .then(async (r) => {
        if (r.status === 503) { if (!cancelled) setDdlPendiente(true); return { mappings: [] }; }
        return r.ok ? r.json() : { mappings: [] };
      })
      .then((d: { mappings: Mapping[] }) => {
        if (cancelled) return;
        const m: Record<string, number | ""> = {};
        for (const row of d.mappings ?? []) {
          if (row.user_id === userId) m[row.empresa_key] = row.vendedor_id;
        }
        setMapping(m);
      })
      .catch(() => { /* la sección degrada a selects vacíos */ });
    // Vendedores en vivo por empresa (secuencial: sesión única por instancia).
    (async () => {
      for (const e of EMPRESAS) {
        try {
          const r = await fetch(`/api/admin/switch-vendedores?empresa=${e.key}`);
          const d = r.ok ? await r.json() : null;
          if (!cancelled) setVendedores((prev) => ({ ...prev, [e.key]: d?.vendedores ?? null }));
        } catch {
          if (!cancelled) setVendedores((prev) => ({ ...prev, [e.key]: null }));
        }
      }
    })();
    return () => { cancelled = true; };
  }, [userId]);

  async function save(empresaKey: string, value: string) {
    const vendedorId = value === "" ? null : Number(value);
    const lista = vendedores[empresaKey] ?? [];
    const nombre = lista.find((v) => v.id === vendedorId)?.nombre ?? null;
    setSaving(empresaKey);
    try {
      const res = await fetch("/api/admin/vendedor-mapping", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId, empresa_key: empresaKey, vendedor_id: vendedorId, vendedor_nombre: nombre }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { showToast(data?.error || "No se pudo guardar el vendedor"); return; }
      setMapping((prev) => ({ ...prev, [empresaKey]: vendedorId ?? "" }));
      showToast(vendedorId ? `Vendedor asignado: ${nombre}` : "Vendedor quitado");
    } catch {
      showToast("Error de conexión al guardar el vendedor");
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="mt-5 border-t border-gray-100 pt-4">
      <div className="flex items-center gap-1 mb-1">
        <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">
          Vendedor en Switch <span className="normal-case font-normal text-gray-400">· para pedidos de catálogos</span>
        </div>
        <Ayuda titulo="Para qué sirve" className="-my-2 shrink-0">
          <p>Cuando este usuario arma un pedido desde un catálogo, el pedido sale a Switch a nombre del vendedor que elijas aquí, uno por marca.</p>
        </Ayuda>
      </div>
      {/* 🩸 AVISO, NO metodología: mientras esto aparezca, el vendedor NO se
          puede asignar y el pedido no sale a Switch. Va en pantalla, nunca
          adentro del ⓘ. El nombre del archivo .sql se sacó a propósito: quien
          usa esta pantalla no tiene por qué ver una ruta de migración, tiene
          que saber a quién avisarle. */}
      {ddlPendiente ? (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
          Todavía no se puede asignar el vendedor de Switch: falta activar esta función en el sistema. Avísale a Daniel.
        </p>
      ) : (
        <div className="space-y-2">
          {EMPRESAS.map((e) => {
            const lista = vendedores[e.key];
            return (
              <label key={e.key} className="block">
                <span className="text-xs text-gray-500">{e.label}</span>
                <select
                  value={mapping[e.key] ?? ""}
                  onChange={(ev) => save(e.key, ev.target.value)}
                  disabled={saving === e.key || lista === undefined}
                  className="mt-1 w-full border border-gray-200 rounded-md px-3 min-h-[44px] text-sm bg-white outline-none focus:border-black transition disabled:opacity-50"
                >
                  <option value="">
                    {lista === undefined ? "Cargando vendedores…" : lista === null ? "Switch no respondió — reintenta" : "Sin asignar"}
                  </option>
                  {(lista ?? []).map((v) => (
                    <option key={v.id} value={v.id}>{v.nombre}</option>
                  ))}
                </select>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}
