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
      router.push("/");
      return;
    }
    setRole(r);
    setAuthChecked(true);
  }, [router, moduleKey, allowedRoles]);

  return { authChecked, role };
}
