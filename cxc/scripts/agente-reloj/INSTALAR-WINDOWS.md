# Agente del reloj — cómo instalarlo en la PC de la oficina

Esto se instala **una sola vez**, en la PC donde está el iVMS-4200 (la que está
en la misma red que el reloj de la entrada). Después no hay que abrir nada
nunca más: arranca solo cada vez que se prende la máquina.

Toma unos 10 minutos.

---

## Qué hace este programita

Cada 3 minutos le pregunta al reloj de la entrada qué marcaciones hubo y las
manda a fashiongr.com.

Hace falta porque el reloj está en la red de la oficina y fashiongr está en
internet: **no se ven entre ellos**. Alguien tiene que hacer de puente desde
adentro, y ese alguien es esta PC.

**Si esta PC está apagada no se pierde ninguna marcación.** El reloj las guarda
en su memoria; cuando la PC se prende, entran todas juntas. Lo único que pasa es
que llegan tarde.

---

## Paso 1 — Instalar Node.js (si no está)

1. Entrar a **https://nodejs.org**
2. Bajar el botón grande que dice **LTS**.
3. Instalarlo con Siguiente, Siguiente, Siguiente. No hay nada que elegir.

Si la PC ya tiene Node, saltear este paso.

---

## Paso 2 — Copiar la carpeta a la PC

Copiar la carpeta `agente-reloj` completa a algún lugar fijo de la PC, por
ejemplo:

```
C:\FashionGroup\agente-reloj
```

⚠️ **No la dejes en el Escritorio ni en Descargas**, porque el día que alguien
limpie esas carpetas el agente deja de funcionar.

---

## Paso 3 — Llenar la configuración

Dentro de la carpeta hay un archivo que se llama **`.env.ejemplo`**.

1. Copiarlo y pegarlo en la misma carpeta.
2. Cambiarle el nombre a **`.env`** (así, empezando con punto y sin nada más
   después).
3. Abrirlo con el Bloc de notas y llenar dos cosas:

   - `RELOJ_CLAVE=` la contraseña del reloj (la misma del iVMS-4200)
   - `FASHIONGR_SECRET=` la llave que te paso yo (es la variable
     `ASISTENCIA_INGEST_SECRET` de Vercel)

4. Guardar.

> **Este archivo tiene contraseñas.** No lo mandes por WhatsApp ni lo subas a
> ningún lado. Vive solo en esa PC.

---

## Paso 4 — Instalar

1. Clic **derecho** sobre **`instalar.bat`**
2. Elegir **"Ejecutar como administrador"**

Va a hacer tres cosas y te las va diciendo:

- busca Node.js
- **prueba que llega al reloj y a fashiongr** — si algo falla, te dice qué y
  **no instala nada**
- registra el agente para que arranque solo

Cuando termina dice **LISTO** en verde. Ya está.

Hace falta administrador **solo esta vez**, porque registrar algo que arranca
con Windows lo pide.

---

## Cómo saber si está funcionando

**Desde cualquier lado:** entrá a fashiongr → **Asistencia** → pestaña
**Reporte**. Arriba de todo hay un cartel que dice cómo va:

| Lo que dice | Qué significa |
|---|---|
| 🟢 *"Las marcaciones están entrando solas"* | Todo bien. |
| 🟠 *"La PC de la oficina no responde"* | Está apagada. Prendela y en unos minutos se pone al día sola. |
| 🔴 *"No pudo leer el reloj"* | La PC está prendida pero el reloj no contesta. Revisar que el reloj esté encendido y en la red. |

**Desde la PC:** abrir el archivo `agente-reloj.log` que está en la misma
carpeta. Ahí queda escrito todo lo que hizo, con fecha y hora.

---

## El botón "Traer ahora"

Está en la misma pantalla, al lado del cartel.

Ese botón **no llama al reloj** (desde internet no se puede). Lo que hace es
dejar un pedido; la PC de la oficina lo recoge en su vuelta siguiente, un par
de minutos. Mientras tanto dice *"Esperando a la PC…"*.

Si pasan 7 minutos y nadie lo recoge, el botón **deja de girar** y avisa que la
PC está apagada. No se queda dando vueltas para siempre.

---

## Si el reloj deja de responder

No hace falta que nadie esté mirando. Llega un mensaje de Telegram al canal de
sistema, pero **solo si el problema es de verdad**:

- si falla una vez y se arregla solo, no llega nada (eso pasa seguido y no es
  un problema);
- si falla **3 veces seguidas**, ahí sí llega el aviso, con qué pasó y qué
  hacer;
- si la PC lleva **más de 6 horas apagada** un día de semana, a las 10 de la
  mañana llega el aviso;
- y cuando se arregla, llega un *"ya volvieron a entrar"* para no dejar a nadie
  con la última noticia mala.

---

## Traer marcaciones viejas (rellenar un hueco)

Si la PC estuvo apagada una semana, el agente solo mira los últimos 3 días y
faltarían los otros cuatro. Para traerlos:

1. Abrir el archivo `.env`
2. Cambiar `VENTANA_DIAS=3` por `VENTANA_DIAS=30`
3. Guardar y esperar unos minutos (o reiniciar la PC)
4. **Volver a dejarlo en 3**

Traer lo mismo dos veces **no duplica nada** — las marcaciones repetidas se
ignoran solas.

---

## Para quitarlo

Clic derecho sobre **`desinstalar.bat`** → "Ejecutar como administrador".

---

## Preguntas que ya me hicieron

**¿Y si se corta la luz?**
Cuando vuelve, la PC arranca y el agente arranca con ella. Las marcaciones de
mientras estuvo apagada las trae igual, porque el reloj las guardó.

**¿Y si alguien apaga la PC a propósito?**
Lo mismo. No se pierde nada, solo llegan tarde. Y a las 10 de la mañana del día
siguiente llega el aviso a Telegram.

**¿Consume mucho la PC?**
No. Duerme casi todo el tiempo y cada 3 minutos hace una consulta que tarda
segundos.

**¿Se puede correr en dos PCs a la vez?**
Sí, no rompe nada — las marcaciones repetidas se ignoran. Pero no tiene sentido.
