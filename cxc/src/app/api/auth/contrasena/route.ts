import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { supabaseServer } from "@/lib/supabase-server";
import { verifySession } from "@/lib/session-cookie";
import { logActivity } from "@/lib/log-activity";
import { AVISO_CONTRASENA_REPETIDA, contrasenaEnUso, esHashBcrypt } from "@/lib/auth/contrasena-en-uso";
import { getLoginLock, registerLoginFailure } from "@/lib/login-rate-limit";

/**
 * PUT /api/auth/contrasena — cada quien cambia SU contraseña (14-sep-2026).
 *
 * Daniel, textual: *«has que todos los usuarios puedan cambiar su contraseña»*
 * y *«no cambies la contraseña a nadie»*.
 *
 * 🔴 SOLO LA PROPIA. El usuario sale de la cookie firmada y de ningún otro
 * lado: el cuerpo NO acepta `id`, `userId` ni `name`, y si los trae se
 * ignoran. Cambiarle la contraseña a otra persona no pasa por acá — y tampoco
 * hay otra puerta para un rol que no sea admin.
 *
 * Cuerpo: `{ actual, nueva }`.
 *   · `actual` tiene que ser la de hoy (misma normalización del login: exacta
 *     o en minúsculas, por el autocapitalizar del iPhone).
 *   · `nueva`: mínimo 8, y NO puede ser la de otra persona —el login es solo
 *     contraseña, la contraseña ES la identidad—. Se comprueba con la MISMA
 *     función que usa el admin (`contrasenaEnUso`), y la respuesta es la frase
 *     de Daniel: «Crea otra, esa no se puede».
 *
 * 🔴 EL RITMO SE FRENA COMO EN EL LOGIN. «Esa no se puede» dice, sin querer,
 * que ESA contraseña es de alguien — y con login solo por contraseña, saberla
 * es entrar como esa persona. El login ya expone lo mismo (probar y ver quién
 * entra) y por eso tiene tope de 5 fallos en 15 min por IP; acá se usa el
 * MISMO contador: cada «actual» equivocada y cada «esa no se puede» suman un
 * fallo, y con el tope puesto la ruta contesta 429 sin comparar nada.
 *
 * LAS SESIONES: al cambiarla se CIERRAN LAS DEMÁS sesiones de esa persona
 * (otro teléfono, otra computadora) y se conserva la de este aparato, que es
 * la que acaba de demostrar que sabe la contraseña. Si se cambia porque
 * alguien más la sabía, ese alguien queda afuera en el acto.
 */
export const dynamic = "force-dynamic";

const COOKIE_NAME = "cxc_session";
const MINIMO = 8;

function ipDe(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
}

function frenada(retryAfter: number): NextResponse {
  const res = NextResponse.json(
    { error: "Demasiados intentos. Intenta de nuevo en unos minutos." },
    { status: 429 },
  );
  if (retryAfter > 0) res.headers.set("Retry-After", String(retryAfter));
  return res;
}

export async function PUT(req: NextRequest) {
  const parsed = verifySession(req.cookies.get(COOKIE_NAME)?.value);
  if (!parsed || !parsed.userId || !parsed.sessionToken) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const ip = ipDe(req);
  const lock = await getLoginLock(ip);
  if (lock.locked) return frenada(lock.retryAfter);

  // Un fallo que cuenta para el tope. Devuelve 429 si con éste se alcanzó.
  const fallo = async (mensaje: string, status = 400) => {
    const r = await registerLoginFailure(ip);
    return r.locked ? frenada(r.retryAfter) : NextResponse.json({ error: mensaje }, { status });
  };

  let cuerpo: { actual?: unknown; nueva?: unknown };
  try {
    cuerpo = await req.json();
  } catch {
    return NextResponse.json({ error: "Escribe la contraseña actual y la nueva." }, { status: 400 });
  }
  const actual = typeof cuerpo.actual === "string" ? cuerpo.actual : "";
  const nueva = typeof cuerpo.nueva === "string" ? cuerpo.nueva.trim() : "";
  if (!actual || !nueva) {
    return NextResponse.json({ error: "Escribe la contraseña actual y la nueva." }, { status: 400 });
  }
  if (nueva.length < MINIMO) {
    return NextResponse.json({ error: `La nueva tiene que tener al menos ${MINIMO} caracteres.` }, { status: 400 });
  }

  // 🔴 El usuario es el de la cookie. Nada del cuerpo decide a quién se le cambia.
  const { data: user, error } = await supabaseServer
    .from("fg_users")
    .select("id, name, role, password, active")
    .eq("id", parsed.userId)
    .eq("active", true)
    .maybeSingle();
  if (error || !user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  if (!esHashBcrypt(user.password)) {
    // Un centinela (usuario que todavía no tiene contraseña de verdad) no se
    // puede «confirmar»: primero se la pone el admin en Usuarios.
    return NextResponse.json({ error: "Todavía no tienes una contraseña. Pídesela al administrador." }, { status: 400 });
  }

  const coincide =
    (await bcrypt.compare(actual, user.password)) ||
    (await bcrypt.compare(actual.toLowerCase(), user.password));
  if (!coincide) {
    return fallo("La contraseña actual no es correcta.");
  }
  if (nueva === actual || nueva.toLowerCase() === actual.toLowerCase()) {
    return NextResponse.json({ error: "Es la misma de ahora. Escribe una distinta." }, { status: 400 });
  }
  if (await contrasenaEnUso(nueva, user.id)) {
    return fallo(AVISO_CONTRASENA_REPETIDA);
  }

  const hashed = await bcrypt.hash(nueva, 10);
  const { error: upErr } = await supabaseServer
    .from("fg_users")
    .update({ password: hashed, updated_at: new Date().toISOString() })
    .eq("id", user.id);
  if (upErr) {
    return NextResponse.json({ error: "No se pudo guardar. Intenta de nuevo en unos segundos." }, { status: 500 });
  }

  // Las DEMÁS sesiones de esta persona se cierran; ésta se queda.
  let sesionesCerradas = 0;
  try {
    const { data: revocadas } = await supabaseServer
      .from("user_sessions")
      .update({ revoked: true })
      .eq("user_name", user.name)
      .eq("revoked", false)
      .neq("session_token", parsed.sessionToken)
      .select("id");
    sesionesCerradas = revocadas?.length ?? 0;
  } catch { /* la contraseña ya cambió; las otras sesiones las barre el cron */ }

  await logActivity(user.role, "cambio_contrasena", "auth", { sesionesCerradas }, user.name);
  return NextResponse.json({ ok: true, sesionesCerradas });
}
