"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const ALLOWED_ROLES = ["admin", "director", "vendedor", "cliente"];

export default function ReebokAuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    const role = sessionStorage.getItem("cxc_role") || "";
    if (!role || !ALLOWED_ROLES.includes(role)) {
      router.push("/");
    } else {
      setAuthorized(true);
    }
  }, [router]);

  if (!authorized) return null;

  return <>{children}</>;
}
