"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { hasModuleAccess } from "@/lib/auth-check";

interface UseAuthOptions {
  moduleKey: string;
  allowedRoles: string[];
}

export function useAuth({ moduleKey, allowedRoles }: UseAuthOptions) {
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);
  const [role, setRole] = useState("");

  useEffect(() => {
    const r = sessionStorage.getItem("cxc_role") || "";
    if (!hasModuleAccess(moduleKey, allowedRoles)) {
      if (r) {
        // User is logged in but doesn't have access — show message briefly
        const div = document.createElement("div");
        div.className = "fixed bottom-6 left-1/2 -translate-x-1/2 bg-red-600 text-white text-sm px-5 py-2.5 rounded-full shadow-lg z-[9999]";
        div.textContent = "No tienes acceso a este modulo";
        document.body.appendChild(div);
        setTimeout(() => { div.remove(); router.push("/home"); }, 2000);
      } else {
        router.push("/");
      }
      return;
    }
    setRole(r);
    setAuthChecked(true);
  }, [router, moduleKey, allowedRoles]);

  return { authChecked, role };
}
