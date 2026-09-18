#!/usr/bin/env bash
# Verificación por MUTACIÓN del candado «todo de lunes a sábado en Multifashion,
# y sin deuda de día libre» (18-sep-2026):
# `src/__tests__/lib/multifashion-sabado-y-dia-libre.test.ts`, más los candados
# vecinos que NO se pueden romper (`dia-libre-empresa`, `horario-configurable`,
# `asistencia-reglas-de-la-contable`, `asistencia-dia-31`).
#
# Se rompe cada regla a propósito y se comprueba que el candado se pone ROJO;
# dos CONTROLES (cambios que NO alteran la regla) tienen que quedar en verde.
#
# 🩸 La restauración va por COPIA, no por `git checkout`: hay archivos NUEVOS en
# esta rama y git aborta el comando entero sin restaurar NADA. Y el reemplazo lo
# hace `_mutar-aplicar.py` con textos LITERALES, no `perl -0pi`.
set -uo pipefail
cd "$(dirname "$0")/.."

REGLA=src/lib/asistencia/horario-configurable.ts
PER=src/lib/asistencia/periodo.ts
PRO=src/lib/asistencia/prorrateo-ingreso.ts
DL=src/lib/asistencia/dia-libre-empresa.ts
DLS=src/lib/asistencia/dia-libre-empresa-server.ts
MOT=src/lib/asistencia/motivos.ts
RUTA=src/app/api/asistencia/planilla/route.ts
FORM=src/app/asistencia/JustificarForm.tsx

TESTS=(
  src/__tests__/lib/multifashion-sabado-y-dia-libre.test.ts
  src/__tests__/lib/dia-libre-empresa.test.ts
  src/__tests__/lib/horario-configurable.test.ts
  src/__tests__/lib/asistencia-reglas-de-la-contable.test.ts
  src/__tests__/lib/asistencia-dia-31.test.ts
)

ARCHIVOS=("$REGLA" "$PER" "$PRO" "$DL" "$DLS" "$MOT" "$RUTA" "$FORM")

TMP=$(mktemp -d)
for f in "${ARCHIVOS[@]}"; do cp "$f" "$TMP/$(echo "$f" | tr / _)"; done
restaurar() { for f in "${ARCHIVOS[@]}"; do cp "$TMP/$(echo "$f" | tr / _)" "$f"; done; }
trap restaurar EXIT INT TERM PIPE

cazadas=0; total=0; muertas=0; controles_ok=0; controles=0

mutar() { python3 scripts/_mutar-aplicar.py "$@"; }

correr() { npx vitest run "${TESTS[@]}" 2>&1; }

probar() {  # $1 = nombre de la mutación — TIENE que cazarse
  total=$((total + 1))
  local salida; salida=$(correr)
  if ! echo "$salida" | grep -qE "Test Files"; then
    echo "  ⛔ CORRIDA MUERTA — $1"; muertas=$((muertas + 1)); restaurar; return
  fi
  if echo "$salida" | grep -qE "Tests +.*failed"; then
    echo "  ✅ CAZADA ($(echo "$salida" | grep -oE "[0-9]+ failed" | head -1)) — $1"; cazadas=$((cazadas + 1))
  else
    echo "  ❌ SOBREVIVIÓ — $1"
  fi
  restaurar
}

controlar() {  # $1 = nombre del control — NO tiene que cazarse
  controles=$((controles + 1))
  local salida; salida=$(correr)
  if echo "$salida" | grep -qE "Test Files" && ! echo "$salida" | grep -qE "Tests +.*failed"; then
    echo "  ✅ CONTROL en verde (esperado) — $1"; controles_ok=$((controles_ok + 1))
  else
    echo "  ❌ CONTROL se puso rojo (NO esperado) — $1"
  fi
  restaurar
}

echo "== 1. el contador único ignora la lista de días: vuelve a lunes a viernes para todos =="
mutar "$REGLA" '    if (esDiaLaborable(iso, dias)) out.push(iso);' \
               '    if (esDiaLaborable(iso)) out.push(iso);' \
&& probar 'el sábado de Multifashion no se cuenta en ninguna de las tres cuentas'

echo "== 2. la unión de empresas devuelve siempre lunes a viernes =="
mutar "$REGLA" '  return out.size ? [...out].sort((a, b) => a - b) : DIAS_LABORABLES_DEFAULT;' \
               '  return DIAS_LABORABLES_DEFAULT;' \
&& probar '«faltan N días» de las cuatro juntas pierde el sábado'

echo "== 3. el domingo entra si la lista lo trae =="
mutar "$REGLA" '  if (dow === DOMINGO) return false;' \
               '  if (dow === DOMINGO && !dias) return false;' \
&& probar 'el domingo pierde su recargo'

echo "== 4. «faltan N días hábiles» deja de recibir los días =="
mutar "$PER" '  return diasLaborablesDelRango(desde, hasta, dias).filter((iso) => !diaYaPaso(iso, hoy)).length;' \
             '  return diasLaborablesDelRango(desde, hasta).filter((iso) => !diaYaPaso(iso, hoy)).length;' \
&& probar 'el aviso cuenta lunes a viernes también para Multifashion'

echo "== 5. el aviso no le pasa los días al contador =="
mutar "$PER" '  const diasHabiles = diasHabilesPendientes(desde, hasta, hoy, dias);' \
             '  const diasHabiles = diasHabilesPendientes(desde, hasta, hoy);' \
&& probar 'avisoPeriodoAbierto ignora la lista'

echo "== 6. diasHabilesEntre deja de recibir los días =="
mutar "$PRO" '  return diasLaborablesDelRango(desde, hasta, dias).length;' \
             '  return diasLaborablesDelRango(desde, hasta).length;' \
&& probar 'el prorrateo de Multifashion paga de menos el sábado'

echo "== 7. el prorrateo cuenta los días trabajados sin la lista =="
mutar "$PRO" '  const habilesTrabajados = fin < inicio ? 0 : diasHabilesEntre(inicio, fin, dias);' \
             '  const habilesTrabajados = fin < inicio ? 0 : diasHabilesEntre(inicio, fin);' \
&& probar 'quien entra un lunes en Multifashion cobra 7 y no 8'

echo "== 8. la deuda del día libre ignora los días de la persona =="
mutar "$DL" '  return diasLaborablesDelRango(desde, hasta, dias, 32);' \
            '  return diasLaborablesDelRango(desde, hasta, undefined, 32);' \
&& probar 'quien tiene el sábado configurado no debe el sábado regalado'

echo "== 9. Multifashion sale de la lista de «sin deuda» =="
mutar "$MOT" 'export const EMPRESAS_SIN_DIA_LIBRE: readonly string[] = Object.freeze(["american_classic"]);' \
             'export const EMPRESAS_SIN_DIA_LIBRE: readonly string[] = Object.freeze([]);' \
&& probar 'a Multifashion se le vuelve a cargar deuda'

echo "== 10. la pantalla ofrece los siete motivos a todo el mundo =="
mutar "$MOT" '  return ofreceDiaLibreDeLaEmpresa(empresa)
    ? MOTIVOS_JUSTIFICACION
    : MOTIVOS_JUSTIFICACION.filter((m) => !esDiaLibreDeLaEmpresa(m));' \
             '  return MOTIVOS_JUSTIFICACION;' \
&& probar 'Multifashion ve «Día libre de la empresa» en el desplegable'

echo "== 11. el plan deja pasar a la persona de Multifashion (la empresa de la ficha ya no se mira) =="
mutar "$DLS" '  if (noLleva) return { ...vacio, dias, error: noLleva };' \
             '  if (noLleva && false) return { ...vacio, dias, error: noLleva };' \
&& probar 'por persona se le arma la deuda igual'

echo "== 12. el plan deja pasar a la empresa entera =="
mutar "$DLS" '  if (!codigo && porQueNoLlevaDeuda(empresa)) {' \
             '  if (false) {' \
&& probar 'por empresa se lee la base antes de rechazar'

echo "== 13. la puerta que escribe ya no se corta =="
mutar "$DLS" '  if (noLleva) throw new Error(porQueNoLlevaDeuda(noLleva.empresaKey) ?? "");' \
             '  if (noLleva && false) throw new Error(porQueNoLlevaDeuda(noLleva.empresaKey) ?? "");' \
&& probar 'una deuda de Multifashion se escribe si alguien se salta el plan'

echo "== 14. la deuda se arma con una lista global y no con los días de cada quien =="
mutar "$DLS" '    for (const fecha of diasHabilesDelRango(opts.desde, opts.hasta, diasLaborables.get(cod))) {' \
             '    for (const fecha of dias) {' \
&& probar 'Boston debe el sábado que no trabaja'

echo "== 15. la ruta de planilla prorratea sin los días de la persona =="
mutar "$RUTA" '      const p = prorrateoPorVigencia(v, q.desde, q.hasta, diasLaborables.get(codigo));' \
              '      const p = prorrateoPorVigencia(v, q.desde, q.hasta);' \
&& probar 'la planilla real paga de menos a Multifashion'

echo "== 16. la ruta de planilla avisa con lunes a viernes aunque mire Multifashion =="
mutar "$RUTA" '      : diasLaborablesDeEmpresas(empresa ? [empresa] : EMPRESAS_ASISTENCIA);' \
              '      : undefined;' \
&& probar '«faltan N días» no cuenta el sábado'

echo "== 17. el formulario filtra sin mirar la empresa =="
mutar "$FORM" '  const motivos = motivosParaElegir(empresa);' \
              '  const motivos = motivosParaElegir(null);' \
&& probar 'la pantalla le ofrece el día libre a Multifashion'

echo "== CONTROL A. un comentario cambia (nada de conducta) =="
mutar "$MOT" '/** ¿A esta empresa se le carga el día libre (con su deuda)? Sin empresa, sí: lo de siempre. */' \
             '/** ¿A esta empresa se le carga el día libre (con su deuda)? Sin empresa, sí. */' \
&& controlar 'comentario en motivos.ts'

echo "== CONTROL B. se renombra una variable interna (misma conducta) =="
mutar "$REGLA" '  const out: string[] = [];
  if (!ES_FECHA.test(desde) || !ES_FECHA.test(hasta)) return out;
  let t = Date.parse(`${desde}T12:00:00Z`);
  const fin = Date.parse(`${hasta}T12:00:00Z`);
  if (!Number.isFinite(t) || !Number.isFinite(fin)) return out;
  for (let i = 0; t <= fin && i < tope; i += 1, t += DIA_MS) {
    const iso = new Date(t).toISOString().slice(0, 10);
    if (esDiaLaborable(iso, dias)) out.push(iso);
  }
  return out;' \
               '  const lista: string[] = [];
  if (!ES_FECHA.test(desde) || !ES_FECHA.test(hasta)) return lista;
  let t = Date.parse(`${desde}T12:00:00Z`);
  const fin = Date.parse(`${hasta}T12:00:00Z`);
  if (!Number.isFinite(t) || !Number.isFinite(fin)) return lista;
  for (let i = 0; t <= fin && i < tope; i += 1, t += DIA_MS) {
    const iso = new Date(t).toISOString().slice(0, 10);
    if (esDiaLaborable(iso, dias)) lista.push(iso);
  }
  return lista;' \
&& controlar 'nombre de variable dentro de diasLaborablesDelRango'

echo
echo "== RESULTADO: $cazadas de $total mutaciones cazadas · $muertas corridas muertas · $controles_ok de $controles controles en verde =="
