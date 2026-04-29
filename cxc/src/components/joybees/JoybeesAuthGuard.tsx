"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function JoybeesAuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    try {
      const mods = sessionStorage.getItem("fg_modules");
      if (mods) {
        const arr = JSON.parse(mods);
        if (Array.isArray(arr) && arr.includes("catalogos")) {
          setAuthorized(true);
          return;
        }
      }
    } catch { /* */ }
    router.push("/");
  }, [router]);

  if (!authorized) return null;
  return <>{children}</>;
}
