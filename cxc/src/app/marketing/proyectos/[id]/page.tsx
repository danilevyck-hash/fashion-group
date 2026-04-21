"use client";

import AppHeader from "@/components/AppHeader";
import { useAuth } from "@/lib/hooks/useAuth";
import ProyectoDetail from "../../components/ProyectoDetail";

interface PageProps {
  params: { id: string };
}

export default function ProyectoDetailPage({ params }: PageProps) {
  const { authChecked } = useAuth({
    moduleKey: "marketing",
    allowedRoles: ["admin", "secretaria", "director"],
  });

  if (!authChecked) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader
        module="Marketing"
        breadcrumbs={[{ label: "Proyecto" }]}
      />
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
        <ProyectoDetail proyectoId={params.id} />
      </main>
    </div>
  );
}
