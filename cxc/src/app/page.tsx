"use client";

import React, { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import FGLogo from "@/components/FGLogo";

function ForgotPassword() {
  const [show, setShow] = useState(false);
  return (
    <div className="text-center">
      {/* 18px de alto al tacto. min-h-[44px] sin cambiar el tamaño de letra. */}
      <button type="button" onClick={() => setShow(!show)} className="inline-flex min-h-[44px] items-center justify-center px-4 text-xs text-gray-400 hover:text-gray-600 transition">
        ¿Olvidaste tu contraseña?
      </button>
      {show && <p className="text-xs text-gray-500 mt-2">Contacta al administrador para restablecer tu contraseña.</p>}
    </div>
  );
}

function LoginForm() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [expiredMsg, setExpiredMsg] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const expired = searchParams.get("expired") === "1";
  // Reanudar sesión (3-sep-2026): si la cookie de 7 días sigue viva, no se pide
  // la contraseña otra vez. Mientras se verifica, NO se muestra el formulario
  // (solo el logo); si el server dice que no hay sesión, aparece como hoy.
  // Con ?expired=1 el middleware acaba de borrar la cookie: directo al formulario.
  const [verificandoSesion, setVerificandoSesion] = useState(!expired);

  useEffect(() => {
    if (expired) setExpiredMsg(true);
  }, [expired]);

  useEffect(() => {
    if (expired) return;
    let cancelado = false;
    (async () => {
      try {
        // El middleware + el endpoint validan TODO fail-closed: firma HMAC,
        // token vivo en user_sessions, mismo usuario, usuario activo. Cualquier
        // cosa que no sea un 200 con rol → la contraseña, como hoy.
        const res = await fetch("/api/auth/sesion", { credentials: "same-origin" });
        if (!res.ok) throw new Error("sin sesión");
        const data = await res.json();
        if (!data?.role) throw new Error("sin rol");
        if (cancelado) return;
        storeSession(data);
        router.replace(data.role === "cliente" ? "/catalogo/reebok" : "/home");
      } catch {
        if (!cancelado) setVerificandoSesion(false);
      }
    })();
    return () => { cancelado = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expired]);

  function storeSession(data: { role: string; userId?: string; userName?: string; modules?: string[]; empresaFilter?: string; guiasReadonly?: boolean; isOwner?: boolean }) {
    sessionStorage.setItem("cxc_role", data.role);
    if (data.userId) sessionStorage.setItem("fg_user_id", data.userId);
    if (data.userName) sessionStorage.setItem("fg_user_name", data.userName);
    if (data.modules) sessionStorage.setItem("fg_modules", JSON.stringify(data.modules));
    if (data.empresaFilter) sessionStorage.setItem("fg_empresa_filter", data.empresaFilter);
    else sessionStorage.removeItem("fg_empresa_filter");
    if (data.guiasReadonly) sessionStorage.setItem("fg_guias_readonly", "1");
    else sessionStorage.removeItem("fg_guias_readonly");
    if (data.isOwner) sessionStorage.setItem("fg_is_owner", "1");
    else sessionStorage.removeItem("fg_is_owner");
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Contraseña incorrecta");
        return;
      }

      storeSession(data);
      router.push(data.role === "cliente" ? "/catalogo/reebok" : "/home");
    } catch {
      setError("Sin conexión. Verifica tu internet e intenta de nuevo.");
    } finally {
      setLoading(false);
    }
  }

  // Mientras se verifica si hay una sesión vigente, solo el logo — el
  // formulario de contraseña NO se muestra (evita el destello de pedirla
  // cuando el usuario va a entrar directo).
  if (verificandoSesion) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <FGLogo variant="full" theme="light" size={56} />
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-screen">
      <form onSubmit={handleLogin} className="w-full max-w-sm space-y-6">
        <div className="flex justify-center mb-2">
          <FGLogo variant="full" theme="light" size={56} />
        </div>

        <div>
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError(""); }}
              placeholder="Contraseña"
              className="w-full border border-gray-300 rounded px-4 py-3 text-sm focus:outline-none focus:border-black pr-16"
              autoCapitalize="none"
              autoCorrect="off"
              autoFocus
              disabled={loading}
            />
            {/* Medía 19×18: imposible de pegarle con el pulgar. 44×44. */}
            <button type="button" onClick={() => setShowPassword(!showPassword)}
              aria-label={showPassword ? "Ocultar contraseña" : "Ver contraseña"}
              className="absolute right-1 top-1/2 -translate-y-1/2 flex min-w-[44px] h-11 items-center justify-center px-1 text-gray-300 hover:text-gray-600 transition text-xs">
              {showPassword ? "ocultar" : "ver"}
            </button>
          </div>
        </div>

        {expiredMsg && <p className="text-amber-600 text-sm text-center mb-4">Tu sesión expiró. Inicia sesión de nuevo.</p>}
        {error && <p className="text-red-600 text-sm text-center">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-black text-white py-3 rounded text-sm font-medium hover:bg-gray-800 transition disabled:opacity-50"
        >
          {loading ? "Verificando..." : "Ingresar"}
        </button>

        <ForgotPassword />
      </form>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
