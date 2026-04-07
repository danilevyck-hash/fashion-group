"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import FGLogo from "@/components/FGLogo";

function ForgotPassword() {
  const [show, setShow] = useState(false);
  return (
    <div className="text-center">
      <button type="button" onClick={() => setShow(!show)} className="text-xs text-gray-400 hover:text-gray-600 transition">
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

  useEffect(() => {
    if (expired) setExpiredMsg(true);
  }, [expired]);

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

      // NOTE: sessionStorage stores non-secret UI data (role, name, modules) for
      // client-side rendering (nav visibility, display names, module access).
      // Auth is enforced server-side via httpOnly cookie (cxc_session) — these
      // values are NOT trusted for authorization, only for UX convenience.
      // Tradeoff: XSS could read these, but they contain no secrets (no tokens/passwords).
      sessionStorage.setItem("cxc_role", data.role);
      if (data.userId) sessionStorage.setItem("fg_user_id", data.userId);
      if (data.userName) sessionStorage.setItem("fg_user_name", data.userName);
      if (data.modules) sessionStorage.setItem("fg_modules", JSON.stringify(data.modules));
      router.push(data.role === "cliente" ? "/catalogo/reebok" : "/home");
    } catch {
      setError("Sin conexión. Verifica tu internet e intenta de nuevo.");
    } finally {
      setLoading(false);
    }
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
              className="w-full border border-gray-300 rounded px-4 py-3 text-sm focus:outline-none focus:border-black pr-14"
              autoCapitalize="none"
              autoCorrect="off"
              autoFocus
              disabled={loading}
            />
            <button type="button" onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-600 transition text-xs">
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
