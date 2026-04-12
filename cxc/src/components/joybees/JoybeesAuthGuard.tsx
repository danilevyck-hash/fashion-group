"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const ALLOWED_ROLES = ["admin", "vendedor"];

export default function JoybeesAuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    const role = sessionStorage.getItem("cxc_role") || "";

    // Check fg_modules for 'joybees'
    try {
      const mods = sessionStorage.getItem("fg_modules");
      if (mods) {
        const arr = JSON.parse(mods);
        if (Array.isArray(arr) && arr.includes("joybees")) { setAuthorized(true); return; }
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
