# Simulación para presentación

Sección extra de BiblioAforo VR (`#/presentacion`). Usa la misma biblioteca, gente y gráficos de **Hora punta**, pero con el **piso 1 y el sótano llenos**: la única mesa con sitio es la **mesa piloto 1-01**, con **2 de sus 4 sillas libres**. La persona se pone el Meta Quest 3, camina de verdad hacia el sensor S1; cuando el **sensor real** la detecta, en el simulador también entra. Luego va a la mesa piloto, elige una silla libre, se sienta y se queda.

No cambia las otras experiencias: solo se registró en la lista de experiencias (`src/app.js`) y en el menú (`src/juego/menu.js`, tarjeta «Sección extra», tecla `6`). Todo lo que ajusta al entrar (mundo lleno, mesa piloto, tótem) lo deshace al salir.

## Archivos

| Archivo | Qué hace |
| --- | --- |
| `src/presentacion/presentacion.js` | La sección: mundo lleno, máquina de estados, HUD, panel lateral (Presentación y Conexión), visor y teclado. |
| `src/presentacion/sensores.js` | Lee los sensores reales (USB o sala en vivo): ingresos S1 y salidas S2 sin duplicados, reinicio del ESP32, estado de la conexión, **traductor** para el Arduino del compañero y velocidad del puerto. |
| `src/presentacion/calibracion.js` | Matemática de la calibración del visor con el sensor real y distancia al sensor. |
| `src/presentacion/visual.js` | Ayudas 3D: marca del sensor S1, punto de inicio a 2 m, cartel con la distancia, lectura en la vista del visor, panel de calibración, panel de la mesa piloto y fundido a negro. |
| `src/app.js`, `src/juego/menu.js`, `estilos-juego.css` | Solo agregados: la ruta `#/presentacion` y la tarjeta del menú. |

## Arquitectura

```
ESP32 / Arduino ──USB──► laptop (Chrome/Edge, Web Serial, solo lectura)
                           │  src/datos/fuentes.js → EstadoMaqueta (líneas del Monitor Serie)
                           │  sensores.js: traduce otros formatos al CSV del informe
                           ├──► esta misma página (Air Link / Quest Link: el visor ve la PC)
                           └──► sala en vivo (MQTT público, solo números) ──► Quest 3 (#/presentacion/CÓDIGO)
                                                                               │
                                     sensores.js (en el visor): entrada S1 / salida S2 sin duplicados
                                                                               ▼
                                     presentacion.js: máquina de estados + mundo 3D de Hora punta
```

**Máquina de estados**

| Estado | Pasa a… cuando |
| --- | --- |
| Inicialización | Se arma el mundo (piso 1 y sótano llenos, mesa piloto con A y B ocupadas, C y D libres). |
| Calibración (solo visor) | A: calibración rápida · gatillo + A: calibración precisa. |
| Usuario a 2 metros | La cabeza está a ≥ 1,7 m del sensor. |
| Caminando hacia la entrada | La cabeza está a < 1,7 m (vuelve a «a 2 metros» si se aleja a > 1,88 m). |
| Sensor físico detectado | Llega un **S1 real** (o un paso de **ensayo**, rotulado como simulado). |
| Ingreso confirmado | 0,9 s después; la puerta virtual se abre y suma +1 a «personas dentro». |
| Recorriendo la biblioteca | 2,6 s después; aparece la ruta a la mesa piloto. |
| Mesa identificada | A menos de 3,8 m de la mesa piloto. |
| Selección de asiento | Se elige una silla libre (selección **virtual**). |
| Sentado | Se sienta; con ESP32-CAM, la confirmación **física** llega cuando la cámara ve ocupada esa zona. |

Casos que se manejan: pérdida de conexión (el estado y el cartel lo dicen; no se inventan ingresos), datos viejos de la cámara (aviso con los segundos), líneas repetidas (se compara el contador `entradas`), doble detección en menos de 1,2 s (rebote: se toma como la misma persona), reinicio del ESP32 (el contador vuelve a 0 y se sigue contando), instantáneas de la sala que corrigen líneas perdidas sin duplicar, la silla elegida que se ocupa antes de sentarse, cambio de silla, recentrado del visor (pide calibrar otra vez).

## Ejecutar y publicar

- En línea: `https://jmhuamann-bit.github.io/biblioaforo-vr/#/presentacion` (o desde el menú: tarjeta **Simulación para presentación**, tecla `6`).
- Local: cualquier servidor estático en la carpeta del proyecto (por ejemplo `npx http-server` o la extensión Live Server) y abrir `http://localhost:PUERTO/#/presentacion`. Web Serial y WebXR funcionan en `localhost` y en `https`.
- Publicar: `git push` a `main` (GitHub Pages sirve la rama `main`; no hay compilación).

## Conectar los sensores

### ESP32 del informe (Anexos A y B)
1. Laptop con **Chrome o Edge**. Cierra el Monitor Serie de Arduino (solo un programa puede usar el puerto).
2. En la sección, pestaña **Conexión** → velocidad **115 200** → **Conectar sensor por USB** → elige el puerto del ESP32 DevKit. Repite para la ESP32-CAM si la usas.
3. El monitor del puerto muestra las líneas como «oficial».

### Arduino del compañero (otro programa)
La app solo **lee** lo que el programa imprime por `Serial`; no hay que cambiarlo.
1. Mira la velocidad de su `Serial.begin(…)` (casi siempre **9600**). Elígela en **Conexión** y pulsa **Conectar sensor por USB** (o **Reabrir a esta velocidad** si ya estaba conectado). Si aparecen caracteres raros, la velocidad no coincide (la app lo avisa).
2. Se reconocen solos: el CSV del informe, «Entrada detectada», «Persona ingresó», «Salió…», «Personas: 5» / «Aforo 4/20» (sube = entrada, baja = salida), «Entradas: 3 | Salidas: 1», lecturas `0`/`1` o `LOW`/`HIGH` del sensor (E18-D80NK: `LOW`/`0` = detecta; se cuenta el flanco) y «Distancia: 35 cm» (cruce por debajo de 60 cm, con histéresis).
3. Si su programa imprime otra cosa, en el **monitor del puerto** cada línea no reconocida trae botones **= entrada**, **= salida** o **ignorar**: un clic y esa línea (con cualquier número) queda aprendida en ese navegador.
4. Lo traducido se convierte al formato del informe y se reenvía tal cual al visor, así el Quest lo entiende igual.

### Meta Quest 3
- **Sin cable:** en la laptop, **Conexión → Compartir con el visor** muestra un código de 4 dígitos y un enlace `…/#/presentacion/CÓDIGO`. Ábrelo en el navegador del Quest y pulsa **Entrar al visor 3D**. Solo viajan números del Monitor Serie (nunca imágenes) por un servidor MQTT público; la demora típica es de 0,2 a 1 s.
- **Con Air Link o Quest Link:** abre la sección en Chrome/Edge de la PC conectada al sensor y pulsa **Entrar al visor 3D**; no hace falta código.

## Calibración del visor (procedimiento)

El sensor E18-D80NK solo dice «alguien pasó» (detecta de ~3 a 80 cm). La **distancia** al sensor la mide el seguimiento 6DoF del Quest después de calibrar.

1. Despeja un pasillo de unos 3 m frente al sensor S1 y define el límite (Guardian) para que incluya el punto de partida y el sensor. No hace falta caminar fuera de esa zona: después de entrar, el recorrido se hace con saltos.
2. Ponte de pie a **2 m** del sensor, mirándolo de frente, y pulsa **A** (calibración rápida): la puerta de ENTRADA virtual queda 2 m delante de ti, con el sensor S1 virtual sobre el real.
3. Para más precisión: **Calibración precisa** → toca el sensor con la punta del control derecho y aprieta el **gatillo** → vuelve al punto de partida y pulsa **A**. La distancia mostrada es la medida real.
4. Mientras te acercas, el stick y el teletransporte quedan **bloqueados** (el mundo queda fijo a la sala real). La distancia baja en vivo (2,00 m → … → INGRESO).
5. Al pasar frente al sensor, el ESP32 lo detecta y el simulador te hace entrar. Después: **A** para avanzar por la ruta (saltos cortos con fundido), el **gatillo** sobre una silla verde (o **A**) para elegirla y **A** para sentarte. Si te sientas en una silla real, la vista se ajusta sola a la altura de alguien sentado.
6. Recalibrar: botón **Recalibrar (2 m)** del tablero (**B**) o **A** mientras estás a 2 m. Si el visor se recentra (botón Meta), la app pide calibrar de nuevo.

## Qué es real y qué es simulado

| Dato | Origen |
| --- | --- |
| Ingresos (S1) y salidas (S2) | **Reales**: solo los manda el ESP32/Arduino (USB o sala). Sin conexión no hay ingresos «reales». |
| Distancia al sensor | **Medida** por el visor calibrado (no por el sensor). |
| Las 4 sillas de la mesa piloto | **Reales** con la ESP32-CAM conectada (es la fuente de verdad). Sin cámara: **simuladas** (A y B ocupadas, C y D libres), y el rótulo lo dice. |
| Tu silla | **Selección virtual**; queda **confirmada** solo si la ESP32-CAM ve ocupada esa zona. |
| Resto de la biblioteca (330 asientos y gente de pie) | **Simulado**. |
| Modo ensayo | **Simulado** siempre (etiqueta morada «ensayo»); para practicar sin sensores. |

## Pruebas hechas

- 26 pruebas de lógica en Node: traductor (textos, contadores, 0/1, distancia, asientos, líneas aprendidas, caracteres ilegibles), antiduplicados, rebote, reinicio del ESP32, instantáneas de la sala, reenvío al visor, ensayo, matemática de la calibración (rápida, precisa, convención de three.js).
- Navegador (escritorio): recorrido completo con un USB simulado y el texto «Entrada detectada» → ingreso → ruta → mesa → silla D → sentado; confirmación con líneas de la ESP32-CAM; salida por S2 y línea repetida ignorada.
- Visor simulado: calibración rápida con la persona girada, caminata física con el stick bloqueado (la distancia baja 2,00 → 0,70 m), detección por lecturas 0/1, saltos hasta la mesa, sentarse (ojos a 1,20 m) y ajuste al ponerse de pie o sentarse de verdad.
- Sesión WebXR con el emulador de Meta Quest 3 (IWER): entrar, reiniciar dentro del visor (vuelve a la calibración) y salir.
- Sala en vivo de punta a punta por internet: una «laptop» publicó un paso por S1 en un servidor MQTT público y la página del visor registró el ingreso una sola vez.
- Las otras cinco experiencias siguen igual (la sección deshace sus ajustes al salir).

## Limitaciones

- El navegador del Quest no puede leer USB: con el visor sin cable, los datos llegan desde la laptop por la sala en vivo (requiere internet; servidores públicos sin garantía; demora de 0,2 a 1 s).
- La calibración rápida supone que estás a 2 m mirando al sensor; si no, usa la precisa. El seguimiento del Quest puede derivar unos centímetros en sesiones largas: recalibra si hace falta.
- Por seguridad, solo la aproximación (unos 2 m) se camina de verdad; el resto del recorrido es con saltos o el stick.
- Web Serial y WebXR necesitan `https` o `localhost`; no se puede leer un ESP32 por `ws://` desde la página publicada en `https`.
- Las líneas aprendidas se guardan en el navegador donde se enseñaron (la laptop); el visor recibe ya traducido.
- Falta probarlo con el hardware real (ESP32, Arduino del compañero, ESP32-CAM y un Quest 3 físico): las pruebas usaron un puerto USB simulado, un visor emulado y una sala en vivo real.
