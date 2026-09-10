#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# VERIFICACIÓN POR MUTACIÓN de «la persona en el centro» (10-sep-2026).
#
# Rompe cada regla A PROPÓSITO, una por vez, y comprueba que algún candado se
# pone ROJO. Un candado que no caza su propia mutación no es un candado: es un
# test que acompaña.
#
# 🩸 SE RESTAURA POR COPIA A /tmp, JAMÁS CON `git checkout`. Un
# `trap 'git checkout …' EXIT` ya borró el trabajo sin commitear de un agente
# que se trabó a mitad de la verificación. Acá el respaldo se hace ANTES de la
# primera mutación y se devuelve con `cp`, así que lo que no está commiteado
# sigue estando. (Y hay un segundo motivo: con archivos NUEVOS en la rama,
# `git checkout` aborta el comando entero sin restaurar nada.)
#
#   bash scripts/_mutar-candados-persona-en-el-centro.sh
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail
cd "$(dirname "$0")/.."

RESPALDO="$(mktemp -d /tmp/mutar-persona-centro.XXXXXX)"
ARCHIVOS=(
  "src/lib/asistencia/persona-en-el-centro.ts"
  "src/lib/asistencia/ficha-persona.ts"
  "src/lib/asistencia/cedula-foto.ts"
  "src/app/asistencia/AsistenciaClient.tsx"
  "src/app/asistencia/ConfiguracionTab.tsx"
  "src/app/asistencia/ReporteTab.tsx"
  "src/app/asistencia/JustificacionesDelPeriodo.tsx"
  "src/app/asistencia/personas/PersonaPagina.tsx"
  "src/app/asistencia/personas/FichaTexto.tsx"
  "src/app/asistencia/personas/FichaEditar.tsx"
  "src/app/asistencia/personas/CedulaFoto.tsx"
  "src/app/asistencia/personas/Seccion.tsx"
  "src/app/asistencia/personas/SeccionPrestamos.tsx"
  "src/app/asistencia/personas/SeccionJustificaciones.tsx"
  "src/app/asistencia/personas/SeccionVacaciones.tsx"
  "src/app/asistencia/personas/SeccionAsistencia.tsx"
  "src/app/asistencia/personas/[codigo]/page.tsx"
  "src/app/api/asistencia/cedula-foto/route.ts"
  "src/app/api/asistencia/reporte/route.ts"
  "src/app/api/asistencia/prestamos-deuda/route.ts"
  "supabase/migrations/20261102120000_cedula_foto_bucket.sql"
)
for f in "${ARCHIVOS[@]}"; do
  mkdir -p "$RESPALDO/$(dirname "$f")"
  cp "$f" "$RESPALDO/$f"
done
restaurar() { for f in "${ARCHIVOS[@]}"; do cp "$RESPALDO/$f" "$f"; done; }
trap 'restaurar; echo "→ archivos restaurados desde $RESPALDO"' EXIT

TESTS="src/__tests__/lib/persona-en-el-centro.test.ts \
src/__tests__/lib/asistencia-pestanas.test.ts \
src/__tests__/lib/asistencia-config.test.ts \
src/__tests__/lib/asistencia-planilla.test.ts \
src/__tests__/lib/navegacion-atras-fluido.test.ts \
src/__tests__/lib/nada-de-voseo.test.ts"

CAZADAS=0; TOTAL=0; ESCAPADAS=()

# $1 = qué se rompe · $2 = archivo · $3 = python de la mutación
mutar() {
  local nombre="$1" archivo="$2" py="$3"
  # 🩸 SIN ESTE FRENO, UN ARCHIVO QUE NO ESTÁ EN `ARCHIVOS` SE MUTA Y NO SE
  # RESTAURA NUNCA: `restaurar` solo devuelve lo que respaldó. Ya pasó — doce
  # archivos quedaron mutados y 75 candados en rojo, y el script decía que todo
  # había sido restaurado.
  if [ ! -f "$RESPALDO/$archivo" ]; then
    echo "  ⛔ $nombre — «$archivo» NO está en ARCHIVOS: se aborta para no dejarlo mutado."
    exit 1
  fi
  TOTAL=$((TOTAL + 1))
  restaurar
  if ! python3 - "$archivo" <<PY
import io, sys
p = sys.argv[1]
s = io.open(p, encoding="utf-8").read()
o = s
$py
if s == o:
    sys.exit("LA MUTACIÓN NO APLICÓ")
io.open(p, "w", encoding="utf-8").write(s)
PY
  then
    echo "  ⚠️  $nombre — la mutación no aplicó (el ancla cambió); REVISAR"
    ESCAPADAS+=("$nombre (ancla)")
    return
  fi
  if npx vitest run $TESTS >/dev/null 2>&1; then
    echo "  ❌ ESCAPÓ: $nombre"
    ESCAPADAS+=("$nombre")
  else
    echo "  ✅ cazada: $nombre"
    CAZADAS=$((CAZADAS + 1))
  fi
}

echo "── A. EL INTERRUPTOR ───────────────────────────────────────────────────"
mutar "el interruptor arranca PRENDIDO" src/lib/asistencia/persona-en-el-centro.ts \
  's = s.replace("  return v === chr(34)" , "  return v === chr(34)")
s = s.replace("""  return v === "1" || v === "true";""", """  return v !== "0";""")'
mutar "cualquier valor lo prende" src/lib/asistencia/persona-en-el-centro.ts \
  's = s.replace("""  return v === "1" || v === "true";""", """  return !!v;""")'
mutar "apagado, el módulo YA NO es el de hoy (se cae Vacaciones)" src/lib/asistencia/persona-en-el-centro.ts \
  's = s.replace("""  ["vacaciones", "Vacaciones"],
  ["aprobaciones", "Aprobaciones"],
  ["configuracion", "Configuración"],
] as const;""", """  ["aprobaciones", "Aprobaciones"],
  ["configuracion", "Configuración"],
] as const;""")'
mutar "apagado, el módulo abre en Personas (que no existe ahí)" src/lib/asistencia/persona-en-el-centro.ts \
  's = s.replace("""  return personaEnElCentro ? "personas" : "reporte";""", """  return "personas";""")'
mutar "la página de la persona abre con el interruptor apagado" "src/app/asistencia/personas/[codigo]/page.tsx" \
  's = s.replace("  if (!PERSONA_EN_EL_CENTRO) redirect(\"/asistencia\");", "")'
mutar "la lista SIEMPRE lleva a la página nueva, prendido o no" src/app/asistencia/ConfiguracionTab.tsx \
  's = s.replace("                      {personaEnElCentro ? (", "                      {true ? (")'
mutar "el bloque desplegado se dibuja también en el acomodo nuevo" src/app/asistencia/ConfiguracionTab.tsx \
  's = s.replace("{!personaEnElCentro && abiertaEsta && borrador && (", "{abiertaEsta && borrador && (")'

echo
echo "── B. LAS PESTAÑAS ─────────────────────────────────────────────────────"
mutar "Personas deja de ser la primera" src/lib/asistencia/persona-en-el-centro.ts \
  's = s.replace("""  ["personas", "Personas"],
  ["planilla", "Planilla"],""", """  ["planilla", "Planilla"],
  ["personas", "Personas"],""")'
mutar "vuelve la pestaña Justificaciones al acomodo nuevo" src/lib/asistencia/persona-en-el-centro.ts \
  's = s.replace("""  ["aprobaciones", "Aprobaciones"],
  ["reporte", "Reporte"],
] as const;""", """  ["justificaciones", "Justificaciones"],
  ["aprobaciones", "Aprobaciones"],
  ["reporte", "Reporte"],
] as const;""")'
mutar "vuelve la pestaña Vacaciones al acomodo nuevo" src/lib/asistencia/persona-en-el-centro.ts \
  's = s.replace("""  ["aprobaciones", "Aprobaciones"],
  ["reporte", "Reporte"],
] as const;""", """  ["vacaciones", "Vacaciones"],
  ["aprobaciones", "Aprobaciones"],
  ["reporte", "Reporte"],
] as const;""")'
mutar "se pierde Reporte del acomodo nuevo" src/lib/asistencia/persona-en-el-centro.ts \
  's = s.replace("""  ["aprobaciones", "Aprobaciones"],
  ["reporte", "Reporte"],
] as const;""", """  ["aprobaciones", "Aprobaciones"],
] as const;""")'
mutar "Préstamos se dibuja con su interruptor APAGADO" src/lib/asistencia/persona-en-el-centro.ts \
  's = s.replace("""  return base.filter(([k]) => (k === "prestamos" ? opts.planillaUnida : true));""", """  return base;""")'
mutar "el acomodo nuevo no se aplica: siempre las de hoy" src/lib/asistencia/persona-en-el-centro.ts \
  's = s.replace("""  const base = opts.personaEnElCentro ? PESTANAS_PERSONA_EN_EL_CENTRO : PESTANAS_HOY;""", """  const base = PESTANAS_HOY;""")'
mutar "«Personas» monta un componente que no es la lista" src/app/asistencia/AsistenciaClient.tsx \
  's = s.replace("{tab === \"personas\" && <ConfiguracionTab personaEnElCentro />}", "{tab === \"personas\" && <ReporteTab />}")'
mutar "la pantalla vuelve a escribir la lista de pestañas a mano" src/app/asistencia/AsistenciaClient.tsx \
  's = s.replace("""  const visibles = pestanasDeAsistencia({
    personaEnElCentro: PERSONA_EN_EL_CENTRO,
    planillaUnida: PLANILLA_UNIDA,
  }).filter(([k]) => vePestana(rol, k));""", """  const visibles = ([["reporte", "Reporte"]] as never as ReturnType<typeof pestanasDeAsistencia>)
    .filter(([k]) => vePestana(rol, k));""")'

echo
echo "── C. LAS DIRECCIONES VIEJAS ───────────────────────────────────────────"
mutar "«?tab=configuracion» deja de aterrizar en Personas" src/lib/asistencia/persona-en-el-centro.ts \
  's = s.replace("  configuracion: \"personas\",", "")'
mutar "«?tab=vacaciones» se va a Reporte en vez de a Personas" src/lib/asistencia/persona-en-el-centro.ts \
  's = s.replace("  vacaciones: \"personas\",", "  vacaciones: \"reporte\",")'
mutar "«?tab=justificaciones» se va a Personas en vez de a Reporte" src/lib/asistencia/persona-en-el-centro.ts \
  's = s.replace("  justificaciones: \"reporte\",", "  justificaciones: \"personas\",")'
mutar "una clave desconocida deja la pantalla en blanco" src/lib/asistencia/persona-en-el-centro.ts \
  's = s.replace("""  if (puedeVer(k)) return k as ClavePestana;""", """  return k as ClavePestana;""")'
mutar "la mudanza pisa una pestaña que el rol NO puede ver" src/lib/asistencia/persona-en-el-centro.ts \
  's = s.replace("""  if (mudada && puedeVer(mudada)) return mudada;""", """  if (mudada) return mudada;""")'
mutar "la pantalla resuelve la pestaña a mano, sin la mudanza" src/app/asistencia/AsistenciaClient.tsx \
  's = s.replace("  const tab: Tab = pestanaQueSeAbre(tabRaw, visibles);", "  const tab: Tab = (visibles[0]?.[0] ?? \"reporte\") as Tab;")'
mutar "el default de la URL se vuelve a escribir a mano" src/app/asistencia/AsistenciaClient.tsx \
  's = s.replace("useUrlState<Tab>(\"tab\", pestanaPorDefecto(PERSONA_EN_EL_CENTRO))", "useUrlState<Tab>(\"tab\", \"reporte\")")'

echo
echo "── D. LA FICHA SE LEE, Y SE EDITA CON «Editar» ─────────────────────────"
mutar "el botón «Editar» desaparece" src/app/asistencia/personas/FichaTexto.tsx \
  's = s.replace("""              Editar""", """              Cambiar""")'
mutar "la ficha vuelve a ser un formulario permanente" src/app/asistencia/personas/FichaTexto.tsx \
  's = s.replace("""            <dd className={`text-sm""", """            <input defaultValue={d.valor} />
            <dd className={`text-sm""")'
mutar "se va «Cancelar»: arrepentirse deja de ser posible" src/app/asistencia/personas/FichaEditar.tsx \
  's = s.replace("""        <button type=\"button\" onClick={onCancelar}""", """        <button type=\"button\" hidden onClick={() => {}} data-x=\"1\" onDoubleClick={onCancelar}""")
s = s.replace("          Cancelar\n", "          Volver\n")'
mutar "guardar deja de ir al endpoint de siempre" src/app/asistencia/personas/PersonaPagina.tsx \
  's = s.replace("""      const r = await fetch(\"/api/asistencia/configuracion\", {
        method: \"PUT\",""", """      const r = await fetch(\"/api/asistencia/persona\", {
        method: \"PUT\",""")'
mutar "la ficha se lee de una ruta nueva, no de la de siempre" src/app/asistencia/personas/PersonaPagina.tsx \
  's = s.replace("""      const r = await fetch(\"/api/asistencia/configuracion\", { cache: \"no-store\" });""", """      const r = await fetch(\"/api/asistencia/ficha\", { cache: \"no-store\" });""")'
mutar "aparece un botón de BORRAR la ficha" src/app/asistencia/personas/FichaEditar.tsx \
  's = s.replace("""            Dar de baja…""", """            Eliminar ficha""")'
mutar "las excepciones dejan de estar plegadas" src/app/asistencia/personas/FichaEditar.tsx \
  's = s.replace("useState(() => tieneExcepciones(b))", "useState(true)")'
mutar "el salario vacío se muestra como $0.00" src/lib/asistencia/ficha-persona.ts \
  's = s.replace("""const money = (n: number | null | undefined): string =>
  n === null || n === undefined || !Number.isFinite(n)
    ? SIN_DATO""", """const money = (n: number | null | undefined): string =>
  false
    ? SIN_DATO""")
s = s.replace("`$${Number(n).toLocaleString", "`$${Number(n ?? 0).toLocaleString")'
mutar "se pierde un dato de la ficha (la cédula)" src/lib/asistencia/ficha-persona.ts \
  's = s.replace("""    { clave: \"cedula\", etiqueta: \"Cédula\", valor: texto(p.cedula) },\n""", "")'
mutar "el nombre deja de capitalizarse" src/lib/asistencia/ficha-persona.ts \
  's = s.replace("""  return n === \"\" ? `Código ${p.codigo}` : capitalizarNombre(n);""", """  return n === \"\" ? `Código ${p.codigo}` : n;""")'

echo
echo "── E. LO RARO SE VE; LO NORMAL NO ──────────────────────────────────────"
mutar "«Paga seguros» sale SIEMPRE, también en las 36 normales" src/lib/asistencia/ficha-persona.ts \
  's = s.replace("  if (!p.pagaSeguros) {", "  if (true) {")'
mutar "«No marca reloj» sale en todas las fichas" src/lib/asistencia/ficha-persona.ts \
  's = s.replace("  if (p.noMarcaReloj) {", "  if (!p.noMarcaReloj) {")'
mutar "el servicio profesional deja de marcarse" src/lib/asistencia/ficha-persona.ts \
  's = s.replace("  if (p.servicioProfesional) {", "  if (false) {")'
mutar "una base de seguros en CERO deja de contarse" src/lib/asistencia/ficha-persona.ts \
  's = s.replace("""  if (p.baseSeguros !== null && p.baseSeguros !== undefined) {""", """  if (p.baseSeguros) {""")'
mutar "el sueldo repartido deja de avisar" src/lib/asistencia/ficha-persona.ts \
  's = s.replace("  if ((p.reparto ?? []).length > 0) {", "  if (false) {")'
mutar "las excepciones dejan de traer su explicación" src/lib/asistencia/ficha-persona.ts \
  's = s.replace("""      ayuda: \"Cobra fijo: sus horas no salen del reloj.\",""", """      ayuda: \"\",""")'
mutar "lo que es plata perdida deja de marcarse en ámbar" src/lib/asistencia/ficha-persona.ts \
  's = s.replace("""      ayuda: \"No se le retienen el seguro social ni el educativo.\",
      ojo: true,""", """      ayuda: \"No se le retienen el seguro social ni el educativo.\",""")'
mutar "la lista de Personas deja de dibujar las excepciones" src/app/asistencia/ConfiguracionTab.tsx \
  's = s.replace("const excepciones = personaEnElCentro ? excepcionesDeLaFicha(p) : [];", "const excepciones: ReturnType<typeof excepcionesDeLaFicha> = [];")'

echo
echo "── F. UNA PERSONA NUEVA ABRE EN EDITAR ─────────────────────────────────"
mutar "una persona nueva abre en modo texto, con diez guiones" src/lib/asistencia/persona-en-el-centro.ts \
  's = s.replace("""  return esPersonaNueva(codigo) || !existe;""", """  return false;""")'
mutar "una ficha que NO existe abre en modo texto" src/lib/asistencia/persona-en-el-centro.ts \
  's = s.replace("""  return esPersonaNueva(codigo) || !existe;""", """  return esPersonaNueva(codigo);""")'
mutar "«nueva» en mayúsculas deja de reconocerse" src/lib/asistencia/persona-en-el-centro.ts \
  's = s.replace(".trim().toLowerCase() === \"nueva\"", ".trim() === \"nueva\"")'
mutar "la dirección de una persona deja de codificar el código" src/lib/asistencia/persona-en-el-centro.ts \
  's = s.replace("`${RUTA_PERSONAS}/${encodeURIComponent(String(codigo).trim())}`", "`${RUTA_PERSONAS}/${String(codigo).trim()}`")'
mutar "la página no aplica la regla del alta" src/app/asistencia/personas/PersonaPagina.tsx \
  's = s.replace("if (abreEnEditar(codigo, !!persona)) {", "if (false) {")'

echo
echo "── G. LA FOTO DE LA CÉDULA ─────────────────────────────────────────────"
mutar "🔴 la foto se sirve con una dirección PÚBLICA y eterna" src/app/api/asistencia/cedula-foto/route.ts \
  's = s.replace(".createSignedUrl(path, SEGUNDOS_URL_FIRMADA);", ".getPublicUrl(path);")'
mutar "🔴 el bucket nace PÚBLICO" supabase/migrations/20261102120000_cedula_foto_bucket.sql \
  "s = s.replace(\"'asistencia-cedulas', 'asistencia-cedulas', false\", \"'asistencia-cedulas', 'asistencia-cedulas', true)\".replace(chr(41), chr(41)))"
mutar "el enlace deja de vencer (un año)" src/lib/asistencia/cedula-foto.ts \
  's = s.replace("export const SEGUNDOS_URL_FIRMADA = 60 * 60;", "export const SEGUNDOS_URL_FIRMADA = 60 * 60 * 24 * 365;")'
mutar "la subida la puede hacer cualquiera que entre a Asistencia" src/app/api/asistencia/cedula-foto/route.ts \
  's = s.replace("""  if (!cerrarPlanillaRoles().includes(String(auth.role ?? \"\"))) {
    return NextResponse.json(
      { error: \"La foto de la cédula la cargan Daniel y contabilidad.\" },
      { status: 403 },
    );
  }

  let form: FormData;""", """  let form: FormData;""")'
mutar "el servidor deja de validar el archivo" src/app/api/asistencia/cedula-foto/route.ts \
  's = s.replace("""  const malo = validarArchivoCedula({
    nombre: archivo.name,
    tipo: archivo.type,
    bytes: archivo.size,
  });
  if (malo) return NextResponse.json({ error: malo }, { status: 400 });""", """  const malo = null;
  if (malo) return NextResponse.json({ error: malo }, { status: 400 });""")'
mutar "entra un .exe disfrazado" src/lib/asistencia/cedula-foto.ts \
  's = s.replace("""  if (!(TIPOS_CEDULA_ACEPTADOS as readonly string[]).includes(tipo)) {""", """  if (false) {""")'
mutar "un archivo VACÍO se acepta" src/lib/asistencia/cedula-foto.ts \
  's = s.replace("""  if (!Number.isFinite(bytes) || bytes <= 0) {""", """  if (false) {""")'
mutar "el tope de peso desaparece" src/lib/asistencia/cedula-foto.ts \
  's = s.replace("  if (bytes > MAX_BYTES_CEDULA) {", "  if (false) {")'
mutar "el mensaje de error se vuelve jerga" src/lib/asistencia/cedula-foto.ts \
  's = s.replace("""    return `La foto pesa ${mb(bytes)} y el máximo son ${mb(MAX_BYTES_CEDULA)}. Sácala de nuevo con menos calidad o recórtala.`;""", """    return \"Error 413: payload too large\";""")'
mutar "en la base se guarda la URL firmada en vez del path" src/lib/asistencia/cedula-foto.ts \
  's = s.replace("""  if (/^https?:\\/\\//i.test(v)) return false;""", """  if (/^https?:\\/\\//i.test(v)) return true;""")'
mutar "la foto pierde su marca de tiempo (el caché muestra la vieja)" src/lib/asistencia/cedula-foto.ts \
  's = s.replace("""  return `${cod}/cedula-${m}.${extensionDeCedula(tipo, nombre)}`;""", """  return `${cod}/cedula.${extensionDeCedula(tipo, nombre)}`;""")'
mutar "no se puede QUITAR la foto que se subió" src/app/asistencia/personas/CedulaFoto.tsx \
  's = s.replace("""              <button type=\"button\" disabled={ocupado} onClick={() => void quitar()}""", """              <button type=\"button\" hidden disabled={ocupado} onClick={() => void quitar()}""")
s = s.replace("                Quitar\n", "                Sacar\\n")'

echo
echo "── H. LAS CUATRO SECCIONES ─────────────────────────────────────────────"
mutar "se pierde una sección (Vacaciones)" src/lib/asistencia/ficha-persona.ts \
  's = s.replace("""  { clave: \"vacaciones\", titulo: \"Vacaciones\", boton: \"+ Vacación\" },\n""", "")'
mutar "«Asistencia del período» estrena un botón que no hace falta" src/lib/asistencia/ficha-persona.ts \
  's = s.replace("""  { clave: \"asistencia\", titulo: \"Asistencia del período\", boton: null },""", """  { clave: \"asistencia\", titulo: \"Asistencia del período\", boton: \"+ Día\" },""")'
mutar "la página deja de montar la sección de préstamos" src/app/asistencia/personas/PersonaPagina.tsx \
  's = s.replace("                <SeccionPrestamos codigo={codigo} refresco={refresco} />\n", "")'
mutar "justificar estrena un endpoint propio" src/app/asistencia/personas/SeccionJustificaciones.tsx \
  's = s.replace("""      const r = await fetch(\"/api/asistencia/justificaciones\", {
        method: \"POST\",""", """      const r = await fetch(\"/api/asistencia/justificar-persona\", {
        method: \"POST\",""")'
mutar "la vacación se manda sin la persona" src/app/asistencia/personas/SeccionVacaciones.tsx \
  's = s.replace("JSON.stringify({ codigo, desde, hasta, yaPagadas })", "JSON.stringify({ desde, hasta, yaPagadas })")'
mutar "vuelve el selector de persona adentro de la sección" src/app/asistencia/personas/SeccionJustificaciones.tsx \
  's = s.replace("""          <label className=\"block\">
            <span className=\"mb-1 block text-[11px] font-medium uppercase tracking-wide text-gray-500\">Motivo</span>""", """          <optgroup label=\"Personas\" />
          <label className=\"block\">
            <span className=\"mb-1 block text-[11px] font-medium uppercase tracking-wide text-gray-500\">Motivo</span>""")'
mutar "se puede crear un préstamo desde acá, sin la aprobación de Daniel" src/app/asistencia/personas/SeccionPrestamos.tsx \
  's = s.replace("""  const filas = ficha""", """  async function crear() {
    await fetch(\"/api/prestamos/movimientos\", { method: \"POST\" });
  }
  const filas = ficha""")'
mutar "«+ Préstamo» deja de llevar al módulo de Préstamos" src/app/asistencia/personas/SeccionPrestamos.tsx \
  's = s.replace(chr(60) + "Link href=" + chr(34) + "/prestamos" + chr(34), chr(60) + "Link href=" + chr(34) + "/asistencia" + chr(34))'
mutar "la deuda en cero se escribe $0.00" src/lib/asistencia/ficha-persona.ts \
  's = s.replace("""  if (!Number.isFinite(n) || n <= 0) return \"No debe nada\";""", """  if (false) return \"No debe nada\";""")'
mutar "el desglose dibuja las tres cuentas aunque estén en cero" src/lib/asistencia/ficha-persona.ts \
  's = s.replace("""    .filter((f) => Number.isFinite(f.n) && f.n > 0)""", """    .filter(() => true)""")'
mutar "sin saldo de vacaciones se escribe «0 días»" src/lib/asistencia/ficha-persona.ts \
  's = s.replace("""    return \"Falta el saldo\";""", """    return \"0 días\";""")'
mutar "la tercera cuenta deja de viajar en la respuesta" src/app/api/asistencia/prestamos-deuda/route.ts \
  's = s.replace("        saldoTerceros: f.saldoTerceros,\n", "")'
mutar "el reporte de una persona se filtra por TEXTO, no por código exacto" src/app/api/asistencia/reporte/route.ts \
  's = s.replace("""          (m) => (m.empleado_codigo ?? \"\").trim() === soloCodigo,""", """          (m) => (m.empleado_codigo ?? \"\").includes(soloCodigo),""")'
mutar "el filtro por código deja de existir" src/app/api/asistencia/reporte/route.ts \
  's = s.replace("""  const soloCodigo = (sp.get(\"codigo\") ?? \"\").trim();""", """  const soloCodigo = \"\";""")'

echo
echo "── I. EL SALDO EN PERSONAS, LAS JUSTIFICACIONES EN REPORTE ─────────────"
mutar "se va la columna Vacaciones de la lista" src/app/asistencia/ConfiguracionTab.tsx \
  's = s.replace("""                  {personaEnElCentro && <span className=\"text-right\">Vacaciones</span>}\n""", "")'
mutar "la columna usa un saldo propio en vez del motor de siempre" src/app/asistencia/ConfiguracionTab.tsx \
  's = s.replace("(saldo ? textoSaldo(saldo) : \"Falta el saldo\")", "(saldo ? `${saldo.saldo ?? 0} días` : \"Falta el saldo\")")'
mutar "el chip «Sin saldo» deja de filtrar" src/app/asistencia/ConfiguracionTab.tsx \
  's = s.replace("""    if (filtro === \"sin-saldo\") {
      const cods = new Set(sinSaldo.map((p) => p.codigo));
      return activos.filter((p) => cods.has(p.codigo));
    }
""", "")'
mutar "el chip «Sin saldo» se dibuja aunque sean cero" src/app/asistencia/ConfiguracionTab.tsx \
  's = s.replace("{personaEnElCentro && sinSaldo.length > 0 && (", "{personaEnElCentro && (")'
mutar "la rejilla del escritorio se queda sin su columna nueva" src/app/asistencia/ConfiguracionTab.tsx \
  's = s.replace("""  \"lg:grid lg:grid-cols-[minmax(0,1fr)_9rem_5rem_6.5rem_6rem_7rem_5rem] lg:items-center lg:gap-x-3\";""", """  \"lg:grid lg:grid-cols-[minmax(0,1fr)_9rem_5rem_6.5rem_6rem_5rem] lg:items-center lg:gap-x-3\";""")'
mutar "Reporte deja de ofrecer las justificaciones del período" src/app/asistencia/ReporteTab.tsx \
  's = s.replace("      {PERSONA_EN_EL_CENTRO && (", "      {false && (")'
mutar "la vista de justificaciones arranca ABIERTA" src/app/asistencia/ReporteTab.tsx \
  's = s.replace("  const [verJustificaciones, setVerJustificaciones] = useState(false);", "  const [verJustificaciones, setVerJustificaciones] = useState(true);")'
mutar "en Reporte se puede AGREGAR una justificación" src/app/asistencia/JustificacionesDelPeriodo.tsx \
  's = s.replace("""  async function quitar(id: string) {""", """  async function agregar() {
    await fetch(\"/api/asistencia/justificaciones\", { method: \"POST\" });
  }
  async function quitar(id: string) {""")'
mutar "en Reporte deja de poderse QUITAR" src/app/asistencia/JustificacionesDelPeriodo.tsx \
  's = s.replace("method: " + chr(34) + "DELETE" + chr(34) + ",", "method: " + chr(34) + "PATCH" + chr(34) + ",")'
mutar "la lista de Reporte trae TODAS, no las del período" src/app/asistencia/JustificacionesDelPeriodo.tsx \
  's = s.replace("`/api/asistencia/justificaciones?desde=${desde}&hasta=${hasta}`", "\"/api/asistencia/justificaciones\"")'
mutar "los nombres de Reporte vuelven a gritar" src/app/asistencia/JustificacionesDelPeriodo.tsx \
  's = s.replace("return capitalizarNombre(etiquetaPersona(codigo, p?.nombre ?? null));", "return etiquetaPersona(codigo, p?.nombre ?? null);")'
mutar "el nombre deja de llevar a su página" src/app/asistencia/JustificacionesDelPeriodo.tsx \
  's = s.replace("rutaDePersona(j.empleado_codigo)", "\"/asistencia\"")'

echo
echo "── J. EL CELULAR Y EL IDIOMA ───────────────────────────────────────────"
mutar "un botón de la página baja de 44 px" src/app/asistencia/personas/Seccion.tsx \
  's = s.replace("className=\"min-h-[44px] shrink-0 rounded-md border", "className=\"h-8 shrink-0 rounded-md border")'
mutar "se cuela un voseo en la pantalla nueva" src/app/asistencia/personas/FichaTexto.tsx \
  's = s.replace("Este código todavía no tiene ficha.", "Este código todavía no tiene ficha, mirá.")'
mutar "se cuela un «acá» en el módulo puro" src/lib/asistencia/ficha-persona.ts \
  's = s.replace("Ya no trabaja aquí.", "Ya no trabaja acá.")'

echo
echo "── CONTROLES: NO se tienen que cazar ───────────────────────────────────"
control() {
  local nombre="$1" archivo="$2" py="$3"
  restaurar
  python3 - "$archivo" <<PY >/dev/null 2>&1
import io, sys
p = sys.argv[1]
s = io.open(p, encoding="utf-8").read()
o = s
$py
if s == o:
    sys.exit("LA MUTACIÓN NO APLICÓ")
io.open(p, "w", encoding="utf-8").write(s)
PY
  if npx vitest run $TESTS >/dev/null 2>&1; then
    echo "  ✅ control OK (no se cazó): $nombre"
  else
    echo "  ❌ CONTROL CAZADO (el candado es demasiado estricto): $nombre"
    ESCAPADAS+=("CONTROL: $nombre")
  fi
}
control "cambia la redacción del vacío de una sección" src/app/asistencia/personas/Seccion.tsx \
  's = s.replace("text-[13px] text-gray-400", "text-[13px] text-gray-500")'
control "mueve el separador de la ficha unos píxeles" src/app/asistencia/personas/FichaTexto.tsx \
  's = s.replace("gap-x-4 gap-y-3 px-4 py-3", "gap-x-5 gap-y-3 px-4 py-3")'

restaurar
echo
echo "═══════════════════════════════════════════════════════════════════════"
echo "  $CAZADAS de $TOTAL mutaciones cazadas · 2 de 2 controles OK"
if [ ${#ESCAPADAS[@]} -gt 0 ]; then
  echo "  ESCAPARON:"
  for e in "${ESCAPADAS[@]}"; do echo "    · $e"; done
fi
echo "═══════════════════════════════════════════════════════════════════════"
