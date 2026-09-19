#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# ¿Los candados de «EL PRIMER PINTADO YA SABE QUIÉN MIRA» (19-sep-2026) CAZAN?
#
# Lo que cubren:
#   1  🔴 el primer pintado trae contenido (la semilla del SERVIDOR en `useAuth`)
#   2  🔴 el servidor decide con la MISMA regla que el navegador, no con «hay cookie»
#   3  🔴 el rol y `isOwner` del primer cuadro son los de la cookie, no vacíos
#   4  🔴 después de hidratar manda sessionStorage: lo dibujado se RETIRA si dice no
#   5  🔴 la regla vive UNA vez (`tieneAccesoAlModulo`), sin copias
#   6  🔴 la semilla NUNCA lleva el token (se enumera, no se copia el payload)
#   7  🔴 el servidor solo cree en la FIRMA, y falla ABIERTA
#   8  🔴 el layout provee la semilla; GroupPage arranca con ella y se retira
#
# Se rompe el código a propósito, una cosa por vez, y se exige que los tests se
# pongan ROJOS. Los dos CONTROLES (cambios inocuos) tienen que SOBREVIVIR.
#
#   bash scripts/_mutar-candados-sesion-semilla.sh
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail
cd "$(dirname "$0")/.."

TESTS="src/__tests__/lib/sesion-semilla-primer-pintado.test.tsx \
src/__tests__/lib/catalogo-roles.test.ts"

ARCHIVOS=(
  "src/lib/hooks/useAuth.ts"
  "src/lib/auth-check.ts"
  "src/lib/sesion-semilla.ts"
  "src/lib/sesion-semilla-servidor.ts"
  "src/app/layout.tsx"
  "src/components/GroupPage.tsx"
)

RESPALDO="$(mktemp -d)"
for f in "${ARCHIVOS[@]}"; do
  mkdir -p "$RESPALDO/$(dirname "$f")"
  cp "$f" "$RESPALDO/$f"
done
restaurar() { for f in "${ARCHIVOS[@]}"; do cp "$RESPALDO/$f" "$f"; done; }
trap restaurar EXIT

cazadas=0; sobrevivientes=0; controles_ok=0; controles_mal=0

probar() { # $1 = nombre de la mutación
  local salida fallos
  salida="$(npx vitest run $TESTS 2>&1)"
  if ! grep -qE "^ *Tests " <<<"$salida"; then
    echo "  ⚠️  LA CORRIDA MURIÓ — no hay resumen que leer: $1"
    sobrevivientes=$((sobrevivientes + 1)); return
  fi
  fallos="$(grep -oE "[0-9]+ failed" <<<"$salida" | head -1 | grep -oE "[0-9]+" || echo 0)"
  if [ "${fallos:-0}" -gt 0 ]; then
    echo "  ✅ CAZADA ($fallos fallos) — $1"
    cazadas=$((cazadas + 1))
  else
    echo "  🔴 SOBREVIVIÓ — $1"
    sobrevivientes=$((sobrevivientes + 1))
  fi
}

probar_control() { # $1 = nombre del control (NO debe ser cazado)
  local salida fallos
  salida="$(npx vitest run $TESTS 2>&1)"
  fallos="$(grep -oE "[0-9]+ failed" <<<"$salida" | head -1 | grep -oE "[0-9]+" || echo 0)"
  if [ "${fallos:-0}" -eq 0 ]; then
    echo "  ✅ CONTROL SANO (no cazado) — $1"
    controles_ok=$((controles_ok + 1))
  else
    echo "  🔴 CONTROL CAZADO (el candado es demasiado estricto) — $1"
    controles_mal=$((controles_mal + 1))
  fi
}

aplicar() { # $1 archivo, $2 viejo, $3 nuevo
  restaurar
  python3 - "$1" "$2" "$3" <<'PY'
import sys
ruta, viejo, nuevo = sys.argv[1], sys.argv[2], sys.argv[3]
s = open(ruta).read()
if viejo not in s:
    print(f"  ⚠️  el patrón no está en {ruta}: {viejo[:70]}")
    sys.exit(3)
open(ruta, "w").write(s.replace(viejo, nuevo, 1))
PY
}

mutar() { # $1 archivo, $2 viejo, $3 nuevo, $4 nombre
  aplicar "$1" "$2" "$3"
  [ $? -eq 3 ] && { sobrevivientes=$((sobrevivientes + 1)); return; }
  probar "$4"
}

control() { # $1 archivo, $2 viejo, $3 nuevo, $4 nombre
  aplicar "$1" "$2" "$3"
  [ $? -eq 3 ] && { controles_mal=$((controles_mal + 1)); return; }
  probar_control "$4"
}

echo "── mutando ──────────────────────────────────────────────────────────────"

# 1 · el defecto original, tal cual: el gancho arranca en «no sé»
mutar "src/lib/hooks/useAuth.ts" \
  'const [authChecked, setAuthChecked] = useState(segunElServidor);' \
  'const [authChecked, setAuthChecked] = useState(false);' \
  "1 · useAuth vuelve a arrancar en false: el HTML del servidor sale vacío"

# 2 · el servidor dice que sí a cualquiera que tenga cookie (sin mirar el rol)
mutar "src/lib/hooks/useAuth.ts" \
  'const segunElServidor = accesoConSemilla(semilla, moduleKey, allowedRoles);' \
  'const segunElServidor = semilla !== null;' \
  "2 · con cookie basta: bodega vería la pantalla de admin en el primer cuadro"

# 3 · el rol del primer cuadro sale vacío aunque la cookie lo traiga
mutar "src/lib/hooks/useAuth.ts" \
  'const [role, setRole] = useState(segunElServidor && semilla ? semilla.role : "");' \
  'const [role, setRole] = useState("");' \
  "3 · el primer cuadro se dibuja sin rol (los botones por rol parpadearían)"

# 4 · isOwner del primer cuadro siempre en false
mutar "src/lib/hooks/useAuth.ts" \
  'const [isOwner, setIsOwner] = useState(segunElServidor && semilla ? semilla.isOwner : false);' \
  'const [isOwner, setIsOwner] = useState(false);' \
  "4 · isOwner arranca en false y aparece después (lo que solo ve el dueño parpadea)"

# 5 · el navegador dice que no, pero lo que el servidor dibujó se queda
mutar "src/lib/hooks/useAuth.ts" \
  '      setAuthChecked(false);
      setRole("");
      setIsOwner(false);' \
  '      setRole("");
      setIsOwner(false);' \
  "5 · sessionStorage niega y la pantalla no se retira"

# 6 · la regla pierde el atajo del admin
mutar "src/lib/auth-check.ts" \
  '  if (role === "admin") return true;
' \
  '' \
  "6 · admin ya no entra a todo"

# 7 · la regla ignora los módulos del usuario
mutar "src/lib/auth-check.ts" \
  'return Array.isArray(modules) && modules.includes(moduleKey);' \
  'return false;' \
  "7 · el acceso por módulo (bodega en Guías) deja de valer"

# 8 · hasModuleAccess reescribe la regla en vez de llamarla (dos reglas)
mutar "src/lib/auth-check.ts" \
  'return tieneAccesoAlModulo(role, mods, moduleKey, allowedRoles);' \
  'if (!role) return false;
  if (role === "admin") return true;
  if (allowedRoles.includes(role)) return true;
  return Array.isArray(mods) && (mods as string[]).includes(moduleKey);' \
  "8 · la regla vive dos veces"

# 9 · la semilla copia el payload entero: el token viaja al navegador
mutar "src/lib/sesion-semilla.ts" \
  '  return {
    role: payload.role,' \
  '  return {
    ...(payload as Record<string, unknown>),
    role: payload.role,' \
  "9 · la semilla arrastra el token y todo lo demás de la cookie"

# 10 · sin semilla, «que pase»
mutar "src/lib/sesion-semilla.ts" \
  '  if (!semilla) return false;
  return tieneAccesoAlModulo(' \
  '  if (!semilla) return true;
  return tieneAccesoAlModulo(' \
  "10 · sin semilla se dibuja igual"

# 11 · el servidor decodifica la cookie por su cuenta, sin mirar la firma
mutar "src/lib/sesion-semilla-servidor.ts" \
  'return semillaDeSesion(verifySession(raw));' \
  'return semillaDeSesion(raw ? JSON.parse(Buffer.from(raw.split(".")[0], "base64url").toString("utf8")) : null);' \
  "11 · una cookie forjada da semilla"

# 12 · el lector deja de fallar abierto
mutar "src/lib/sesion-semilla-servidor.ts" \
  '  try {
    const raw = cookies().get("cxc_session")?.value;
    return semillaDeSesion(verifySession(raw));
  } catch {
    return null;
  }' \
  '  const raw = cookies().get("cxc_session")?.value;
  return semillaDeSesion(verifySession(raw));' \
  "12 · si cookies() revienta, la página entera revienta"

# 13 · el layout deja de proveer la semilla
mutar "src/app/layout.tsx" \
  'const semilla = leerSemillaDeSesion();' \
  'const semilla = null;' \
  "13 · el layout no lee la cookie: ninguna pantalla recibe semilla"

# 14 · GroupPage ignora la semilla
mutar "src/components/GroupPage.tsx" \
  'useState(semilla !== null)' \
  'useState(false)' \
  "14 · la página de grupo vuelve a salir vacía del servidor"

# 15 · GroupPage no se retira cuando el navegador no tiene sesión
mutar "src/components/GroupPage.tsx" \
  'if (!r) { setAuthChecked(false); router.push("/"); return; }' \
  'if (!r) { router.push("/"); return; }' \
  "15 · la página de grupo se queda dibujada mientras redirige"

echo "── controles ────────────────────────────────────────────────────────────"

# C1 · un comentario más en el gancho
control "src/lib/hooks/useAuth.ts" \
  'const semilla = useSemillaSesion();' \
  'const semilla = useSemillaSesion(); // la semilla del layout raíz' \
  "C1 · un comentario en useAuth"

# C2 · el orden de los campos de la semilla cambia (el contenido no)
control "src/lib/sesion-semilla.ts" \
  '    isOwner: payload.isOwner === true,
    userName: typeof payload.userName === "string" ? payload.userName : "",
  };' \
  '    userName: typeof payload.userName === "string" ? payload.userName : "",
    isOwner: payload.isOwner === true,
  };' \
  "C2 · los campos de la semilla en otro orden"

restaurar
echo "─────────────────────────────────────────────────────────────────────────"
echo "mutaciones cazadas: $cazadas · sobrevivientes: $sobrevivientes"
echo "controles sanos: $controles_ok · controles cazados: $controles_mal"
[ "$sobrevivientes" -eq 0 ] && [ "$controles_mal" -eq 0 ]
