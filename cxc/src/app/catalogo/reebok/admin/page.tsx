"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function ReebokAdminRedirect() {
  const router = useRouter();

  useEffect(() => {
    const role = sessionStorage.getItem("cxc_role");
    if (role === "admin") {
      router.replace("/catalogo/reebok/admin/productos");
    } else {
      router.replace("/");
    }
  }, [router]);

  return null;
}
