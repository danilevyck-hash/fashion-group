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
  const [webauthnAvailable, setWebauthnAvailable] = useState(false);
  const [showWebauthnSetup, setShowWebauthnSetup] = useState(false);
  const [webauthnLoading, setWebauthnLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const expired = searchParams.get("expired") === "1";

  useEffect(() => {
    if (expired) setExpiredMsg(true);
    if (typeof window !== "undefined" && localStorage.getItem("fg_webauthn_available") === "1") {
      setWebauthnAvailable(true);
    }
  }, [expired]);

  function storeSession(data: { role: string; userId?: string; userName?: string; modules?: string[] }) {
    sessionStorage.setItem("cxc_role", data.role);
    if (data.userId) sessionStorage.setItem("fg_user_id", data.userId);
    if (data.userName) sessionStorage.setItem("fg_user_name", data.userName);
    if (data.modules) sessionStorage.setItem("fg_modules", JSON.stringify(data.modules));
  }

  async function handleFaceId() {
    setWebauthnLoading(true);
    setError("");
    try {
      const credIds = JSON.parse(localStorage.getItem("fg_webauthn_cred_ids") || "[]");
      const optRes = await fetch(`/api/auth/webauthn/authenticate?credIds=${encodeURIComponent(JSON.stringify(credIds))}`);
      if (!optRes.ok) throw new Error("No se pudo iniciar Face ID");
      const options = await optRes.json();

      const { base64urlDecode } = await import("@/lib/webauthn");

      const toBuffer = (u: Uint8Array): ArrayBuffer => { const ab = new ArrayBuffer(u.byteLength); new Uint8Array(ab).set(u); return ab; };
      const credential = await navigator.credentials.get({
        publicKey: {
          challenge: toBuffer(base64urlDecode(options.challenge)),
          rpId: options.rpId,
          allowCredentials: options.allowCredentials.map((c: { id: string; type: string }) => ({
            id: toBuffer(base64urlDecode(c.id)),
            type: c.type,
            transports: ["internal"] as AuthenticatorTransport[],
          })),
          userVerification: "preferred" as UserVerificationRequirement,
          timeout: 60000,
        },
      }) as PublicKeyCredential | null;

      if (!credential) throw new Error("Cancelado");

      const { base64urlEncode } = await import("@/lib/webauthn");
      const authResp = credential.response as AuthenticatorAssertionResponse;

      const verifyRes = await fetch("/api/auth/webauthn/authenticate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: base64urlEncode(new Uint8Array(credential.rawId)),
          response: {
            authenticatorData: base64urlEncode(new Uint8Array(authResp.authenticatorData)),
            clientDataJSON: base64urlEncode(new Uint8Array(authResp.clientDataJSON)),
            signature: base64urlEncode(new Uint8Array(authResp.signature)),
          },
        }),
      });

      if (!verifyRes.ok) throw new Error("Verificación fallida");
      const data = await verifyRes.json();
      storeSession(data);
      router.push(data.role === "cliente" ? "/catalogo/reebok" : "/home");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error desconocido";
      console.error("Face ID auth error:", msg);
      setError("No se pudo verificar. Usa tu contraseña.");
      setWebauthnAvailable(false);
    } finally {
      setWebauthnLoading(false);
    }
  }

  async function handleSetupFaceId() {
    setWebauthnLoading(true);
    try {
      const regRes = await fetch("/api/auth/webauthn/register");
      if (!regRes.ok) {
        const errData = await regRes.json().catch(() => ({}));
        throw new Error(errData.error || "No se pudo iniciar registro");
      }
      const options = await regRes.json();

      const { base64urlDecode, base64urlEncode } = await import("@/lib/webauthn");
      const toBuf = (u: Uint8Array): ArrayBuffer => { const ab = new ArrayBuffer(u.byteLength); new Uint8Array(ab).set(u); return ab; };

      const pubKeyCredential = await navigator.credentials.create({
        publicKey: {
          challenge: toBuf(base64urlDecode(options.challenge)),
          rp: options.rp,
          user: {
            id: toBuf(base64urlDecode(options.user.id)),
            name: options.user.name,
            displayName: options.user.displayName,
          },
          pubKeyCredParams: options.pubKeyCredParams,
          authenticatorSelection: options.authenticatorSelection,
          attestation: "none" as AttestationConveyancePreference,
          timeout: 60000,
        },
      }) as PublicKeyCredential | null;

      if (!pubKeyCredential) throw new Error("Cancelado");

      const attResp = pubKeyCredential.response as AuthenticatorAttestationResponse;

      const saveRes = await fetch("/api/auth/webauthn/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          credential: {
            id: base64urlEncode(new Uint8Array(pubKeyCredential.rawId)),
            rawId: base64urlEncode(new Uint8Array(pubKeyCredential.rawId)),
            type: pubKeyCredential.type,
            response: {
              attestationObject: base64urlEncode(new Uint8Array(attResp.attestationObject)),
              clientDataJSON: base64urlEncode(new Uint8Array(attResp.clientDataJSON)),
            },
          },
          challenge: options.challenge,
        }),
      });

      if (!saveRes.ok) {
        const errData = await saveRes.json().catch(() => ({}));
        throw new Error(errData.error || "No se pudo guardar");
      }

      const savedCred = await saveRes.json();
      const existing = JSON.parse(localStorage.getItem("fg_webauthn_cred_ids") || "[]");
      existing.push(savedCred.credentialId);
      localStorage.setItem("fg_webauthn_cred_ids", JSON.stringify(existing));
      localStorage.setItem("fg_webauthn_available", "1");
      setShowWebauthnSetup(false);
      router.push("/home");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error desconocido";
      console.error("Face ID setup error:", msg);
      setError(`No se pudo configurar Face ID: ${msg}`);
    } finally {
      setWebauthnLoading(false);
    }
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

      // Offer Face ID setup if not already configured and browser supports it
      if (
        !localStorage.getItem("fg_webauthn_available") &&
        typeof PublicKeyCredential !== "undefined" &&
        typeof PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable === "function"
      ) {
        const available = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
        if (available) {
          setShowWebauthnSetup(true);
          return;
        }
      }

      router.push(data.role === "cliente" ? "/catalogo/reebok" : "/home");
    } catch {
      setError("Sin conexión. Verifica tu internet e intenta de nuevo.");
    } finally {
      setLoading(false);
    }
  }

  // Face ID setup prompt after successful password login
  if (showWebauthnSetup) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-full max-w-sm space-y-4 text-center">
          <FGLogo variant="full" theme="light" size={56} />
          <div className="mt-4">
            <svg className="mx-auto mb-3" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
            <p className="text-sm text-gray-700 font-medium">¿Entrar con Face ID la próxima vez?</p>
            <p className="text-xs text-gray-400 mt-1">Más rápido y seguro</p>
          </div>
          {error && <p className="text-red-600 text-sm">{error}</p>}
          <button
            onClick={handleSetupFaceId}
            disabled={webauthnLoading}
            className="w-full bg-black text-white py-3 rounded text-sm font-medium hover:bg-gray-800 transition disabled:opacity-50"
          >
            {webauthnLoading ? "Configurando..." : "Configurar Face ID"}
          </button>
          <button
            onClick={() => router.push("/home")}
            className="w-full text-sm text-gray-400 hover:text-gray-600 transition py-2"
          >
            No, gracias
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-screen">
      <form onSubmit={handleLogin} className="w-full max-w-sm space-y-6">
        <div className="flex justify-center mb-2">
          <FGLogo variant="full" theme="light" size={56} />
        </div>

        {/* Face ID button */}
        {webauthnAvailable && (
          <button
            type="button"
            onClick={handleFaceId}
            disabled={webauthnLoading}
            className="w-full bg-black text-white py-3 rounded text-sm font-medium hover:bg-gray-800 transition disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
            {webauthnLoading ? "Verificando..." : "Entrar con Face ID"}
          </button>
        )}

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
              autoFocus={!webauthnAvailable}
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
