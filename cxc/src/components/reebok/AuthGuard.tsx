"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const ALLOWED_ROLES = ["admin", "director", "vendedor", "cliente"];

export default function ReebokAuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    const role = sessionStorage.getItem("cxc_role") || "";

    // New system: check fg_modules for 'reebok'
    try {
      const mods = sessionStorage.getItem("fg_modules");
      if (mods) {
        const arr = JSON.parse(mods);
        if (Array.isArray(arr) && arr.includes("reebok")) { setAuthorized(true); return; }
      }
    } catch { /* */ }

    // Legacy: check role
    if (role && ALLOWED_ROLES.includes(role)) {
      setAuthorized(true);
    } else {
      router.push("/");
    }
  }, [router]);

  if (!authorized) return null;
  return <>{children}</>;
}
