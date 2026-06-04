import { notFound } from "next/navigation";
import GroupPage from "@/components/GroupPage";
import { GROUP_ORDER, type ModuleGroup } from "@/lib/modules";

// Página de grupo genérica. Vive en /g/[grupo] para no chocar con rutas de
// módulo (ej: el grupo "ventas" no puede vivir en /ventas, que es el módulo).
// Los grupos válidos son los de GROUP_ORDER; cualquier otro → 404.
export default function GrupoPage({ params }: { params: { grupo: string } }) {
  const grupo = params.grupo;
  if (!GROUP_ORDER.includes(grupo as ModuleGroup)) notFound();
  return <GroupPage group={grupo as ModuleGroup} />;
}
