"use client";

/**
 * Las pestañas del CXC: "Fashion Group" y "Confecciones Boston".
 *
 * 🔴 QUÉ PESTAÑAS SE DIBUJAN LO DECIDE EL ROL, y la lista sale del MISMO lugar
 * que el permiso del endpoint (`lib/cxc/boston-roles.ts`). No hay una segunda
 * lista acá a propósito: si el permiso cambia, esto lo sigue solo.
 *
 * Vive en su propio archivo para poder PINTARLO en un test y comprobar que un
 * vendedor no ve la pestaña de Boston — dentro de `page.tsx` eso exigiría montar
 * el panel entero, y el candado terminaría siendo un barrido de texto.
 */
import { pestanasCxc, type TabCxc } from "@/lib/cxc/boston-roles";

interface Props {
  role: string;
  tab: TabCxc;
  onTab: (t: TabCxc) => void;
}

export default function TabsCartera({ role, tab, onTab }: Props) {
  const pestanas = pestanasCxc(role);

  return (
    // Encabezado compacto: las pestañas viven en la misma línea que Exportar
    // para no gastar alto vertical (pedido de Daniel). Sin título grande.
    <div className="max-w-6xl mx-auto px-4 pt-2">
      {/* `data-pestanas` es el asidero de la MEDICIÓN. Buscar la barra por su
          clase de Tailwind devuelve media pantalla y el script pasa en verde sin
          haber mirado la barra: es el mismo motivo por el que las tarjetas del
          CXC llevan `data-vista`. */}
      <div data-pestanas="cxc" className="flex items-center gap-1 border-b border-gray-200">
        {pestanas.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => onTab(key)}
            aria-current={tab === key ? "page" : undefined}
            className={`min-h-[44px] px-3 text-sm whitespace-nowrap border-b-2 -mb-px transition
                        ${tab === key ? "border-gray-900 text-gray-900 font-medium" : "border-transparent text-gray-400 hover:text-gray-600"}`}
          >
            {label}
          </button>
        ))}
        {/* 1-oct-2026, Daniel: nombres normales de ERP — sin coletilla
            («Confecciones Boston · se lleva aparte» era coloquial). */}
      </div>
    </div>
  );
}
