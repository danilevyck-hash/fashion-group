"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();

  function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    const adminPw = process.env.NEXT_PUBLIC_ADMIN_PASSWORD;
    const uploadPw = process.env.NEXT_PUBLIC_UPLOAD_PASSWORD;
    const directorPw = process.env.NEXT_PUBLIC_DIRECTOR_PASSWORD;

    if (password === adminPw) {
      sessionStorage.setItem("cxc_role", "admin");
      router.push("/admin");
    } else if (password === directorPw) {
      sessionStorage.setItem("cxc_role", "director");
      router.push("/admin");
    } else if (password === uploadPw) {
      sessionStorage.setItem("cxc_role", "upload");
      router.push("/upload");
    } else {
      setError("Contraseña incorrecta");
    }
  }

  return (
    <div className="flex items-center justify-center min-h-screen">
      <form onSubmit={handleLogin} className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <img src="/logo.jpeg" alt="Fashion Group" className="w-24 h-24 mx-auto rounded-xl mb-3" />
          <h1 className="text-2xl font-bold">Fashion Group</h1>
          <p className="text-sm text-gray-500 mt-1">Cuentas por Cobrar</p>
        </div>

        <div>
          <input
            type="password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setError("");
            }}
            placeholder="Contraseña"
            className="w-full border border-gray-300 rounded px-4 py-3 text-sm focus:outline-none focus:border-black"
            autoFocus
          />
        </div>

        {error && <p className="text-red-600 text-sm text-center">{error}</p>}

        <button
          type="submit"
          className="w-full bg-black text-white py-3 rounded text-sm font-medium hover:bg-gray-800 transition"
        >
          Ingresar
        </button>
      </form>
    </div>
  );
}
