#!/usr/bin/env bash
# Verificacion por mutacion — LOS PAGOS ENTRAN A LA REGLA 1 (9-sep-2026).
#
# Rompe una regla a la vez, corre los candados y exige ROJO. Los dos ultimos son
# CONTROLES: cambios que NINGUN candado debe cazar (si se ponen rojos, los
# candados estan pegados al texto y no a la conducta).
set -u
cd "$(dirname "$0")/.."
TESTS="src/__tests__/lib/pagos-vigilados-regla-1.test.ts src/__tests__/lib/datos-viejos.test.ts src/__tests__/lib/alertas-que-llegan.test.ts src/__tests__/lib/silencio-de-datos.test.ts"
FRESCOS="src/lib/datos-frescos.ts"
SILENCIO="src/lib/alertas/silencio-de-datos.ts"
OK=0; FAIL=0

# 🩸 LA RESTAURACIÓN VA POR COPIA, NO con `git checkout` (9-sep-2026).
#
# Este script tenía `trap 'git checkout -- …' EXIT`, y el agente que lo escribió
# se quedó colgado EN MEDIO de la verificación. El trap disparó al morir el
# proceso y `git checkout` devolvió los dos archivos a HEAD — o sea, **le borró
# su propia implementación**, que todavía no estaba commiteada. Quedó el candado
# escrito y el código desaparecido.
#
# Con copia a /tmp eso no puede pasar: se restaura lo que había al EMPEZAR, esté
# commiteado o no. Es el mismo patrón que ya usan los scripts nuevos de la casa.
RESPALDO="$(mktemp -d)"
ARCHIVOS=("$FRESCOS" "$SILENCIO")
for f in "${ARCHIVOS[@]}"; do
  mkdir -p "$RESPALDO/$(dirname "$f")"
  cp "$f" "$RESPALDO/$f"
done
restaurar() { for f in "${ARCHIVOS[@]}"; do cp "$RESPALDO/$f" "$f"; done; }
trap restaurar EXIT

corre() { npx vitest run $TESTS >/tmp/_mut.log 2>&1; }

mutar() { # nombre | archivo | viejo | nuevo | espera(rojo|verde)
  local nom="$1" arch="$2" viejo="$3" nuevo="$4" espera="$5"
  cp "$arch" /tmp/_mut.bak
  python3 - "$arch" "$viejo" "$nuevo" <<'PY'
import sys
a,v,n=sys.argv[1],sys.argv[2],sys.argv[3]
s=open(a).read()
if v not in s:
    print("NO-APLICA"); sys.exit(3)
open(a,'w').write(s.replace(v,n,1))
PY
  if [ $? -eq 3 ]; then echo "  ⚠️  $nom — el texto ya no existe, revisar"; FAIL=$((FAIL+1)); cp /tmp/_mut.bak "$arch"; return; fi
  corre; local r=$?
  cp /tmp/_mut.bak "$arch"
  if [ "$espera" = rojo ]; then
    if [ $r -ne 0 ]; then echo "  ✅ cazada: $nom"; OK=$((OK+1));
    else echo "  ❌ NO CAZADA: $nom"; FAIL=$((FAIL+1)); fi
  else
    if [ $r -eq 0 ]; then echo "  ✅ control verde: $nom"; OK=$((OK+1));
    else echo "  ❌ CONTROL EN ROJO: $nom"; FAIL=$((FAIL+1)); fi
  fi
}

echo "── Mutaciones ────────────────────────────────────────────────"
mutar "los pagos salen de la lista de datos vigilados" "$FRESCOS" \
  'for (const dato of ["cartera", "ventas", "pagos"] as const)' \
  'for (const dato of ["cartera", "ventas"] as const)' rojo

mutar "los pagos caen a la lista de la cartera (7 empresas, sin Multifashion)" "$FRESCOS" \
  'if (dato === "pagos") return empresasConRecibos();' \
  'if (dato === "pagos") return empresasConEstadoCuenta();' rojo

mutar "los pagos se vigilan solo en las 6 del grupo (lista recortada)" "$FRESCOS" \
  'if (dato === "pagos") return empresasConRecibos();' \
  'if (dato === "pagos") return empresasConRecibos().filter((e) => e !== "confecciones_boston" && e !== "american_classic");' rojo

mutar "la lista de pagos se escribe a mano en vez de derivarse" "$FRESCOS" \
  'if (dato === "pagos") return empresasConRecibos();' \
  'if (dato === "pagos") return ["vistana", "fashion_wear", "fashion_shoes", "active_shoes", "active_wear", "joystep", "american_classic"];' rojo

mutar "los pagos estrenan un umbral propio (48 h en vez de 24)" "$FRESCOS" \
  'return estados.filter((e) => e.horas === null || e.horas > horasUmbral);' \
  'return estados.filter((e) => e.horas === null || e.horas > (e.dato === "pagos" ? 48 : horasUmbral));' rojo

mutar "el umbral de la regla 1 deja de ser 24 h" "$FRESCOS" \
  'export const HORAS_DATO_VIEJO = 24;' \
  'export const HORAS_DATO_VIEJO = 36;' rojo

mutar "el dedup de los pagos se separa del de la regla 1" "$FRESCOS" \
  'export const HORAS_ENTRE_AVISOS = 20;' \
  'export const HORAS_ENTRE_AVISOS = 8;' rojo

mutar "un pago que NUNCA sincronizo deja de contar como viejo (fail-open)" "$FRESCOS" \
  'return estados.filter((e) => e.horas === null || e.horas > horasUmbral);' \
  'return estados.filter((e) => e.horas !== null && e.horas > horasUmbral);' rojo

mutar "los pagos se leen de la TABLA en vez del sync (el falso positivo eterno)" "$FRESCOS" \
  ': await ultimoSyncExitoso(empresa, "recibos", "pagos");' \
  ': await ultimaCartera(empresa);' rojo

mutar "el mensaje nombra el dato en jerga («recibos»)" "$FRESCOS" \
  'pagos: "los pagos (la plata que te entra)",' \
  'pagos: "los recibos",' rojo

mutar "el mensaje deja de nombrar las empresas" "$FRESCOS" \
  '    lineas.push(`  Empresas: ${items.map((i) => i.empresa).join(", ")}`);' \
  '    lineas.push(`  Empresas: ${items.length}`);' rojo

mutar "el peor caso deja de mandar (toma el primero)" "$FRESCOS" \
  '    const peor = items.reduce(' \
  '    const peor = [items[0]].reduce(' rojo

mutar "🔴 la tabla de recibos entra a la alerta B (26 mensajes de ruido)" "$SILENCIO" \
  'export const TABLAS_VIGILADAS: readonly TablaVigilada[] = [' \
  'export const TABLAS_VIGILADAS: readonly TablaVigilada[] = [
  {
    tabla: "switch_recibos",
    columna: "synced_at",
    modulo: "Cobros",
    que: "los pagos de los clientes",
    horas: HORAS_SIN_ESCRIBIR,
  },' rojo

echo "── Controles (NO deben ponerse rojos) ────────────────────────"
mutar "CONTROL · retocar una frase que ningun candado fija" "$FRESCOS" \
  'Qué hacer: cxc/docs/runbook-base-lenta.md' \
  'Qué hacer: mira cxc/docs/runbook-base-lenta.md' verde

mutar "CONTROL · reescribir un literal de forma equivalente" "$FRESCOS" \
  'const out: EstadoDato[] = [];' \
  'const out: EstadoDato[] = new Array<EstadoDato>();' verde

echo "──────────────────────────────────────────────────────────────"
echo "Cazadas/verdes: $OK   ·   Problemas: $FAIL"
[ $FAIL -eq 0 ]
