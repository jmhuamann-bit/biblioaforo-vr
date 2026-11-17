# BiblioAforo VR

**Abrir:** https://jmhuamann-bit.github.io/biblioaforo-vr/

Una biblioteca viva en 3D, en la computadora o con un visor (Meta Quest 3). Los estudiantes virtuales llegan desde la plaza, cruzan el sensor de la puerta (que los cuenta), buscan asiento, caminan hasta él (subiendo la escalera si hace falta), se sientan (la cámara de su mesa lo confirma en 0,9 s), estudian un rato y se van por la salida (el otro sensor los descuenta). Todo lo que haces entra en ese mundo y tiene consecuencias visibles en los indicadores, el tótem, los colores de los asientos y el mapa.

## Cinco experiencias

| Experiencia | Qué haces | Cómo se juega |
| --- | --- | --- |
| **⏱️ Hora punta** (`#/hora-punta`) | Llegas a las 13:55 y la biblioteca se llena: consigue asiento antes que los demás. | Primera persona en los dos pisos. Eliges un asiento (mirándolo, en el mapa o el más cercano) y sigues la ruta. A veces un estudiante va a tu asiento (flecha roja): si llega antes, la cámara lo detecta y la app te lleva al libre más cercano. Resultado con tiempo, metros, asientos perdidos y hasta 3 estrellas. |
| **🌪️ Caos** (`#/caos`) | Tú controlas la biblioteca. | Llegadas de 10, grupos, llegada masiva, salidas, evacuación; clic sobre asientos, mesas y puertas con cuatro «pinceles» (sentar/levantar, mochila, mesa entera, cámara); fallas de cámara y cortes de red; reloj ×1 a ×60 y escenarios. Cinco retos (alta demanda, Sala 1 llena, fila por aforo completo, cámara caída y restablecida, evacuación total). |
| **🔎 Detective** (`#/detective`) | Encuentra el asiento perfecto para cada estudiante. | Cinco misiones (silencio y enchufe, grupo de 3, ventana en el piso 2, el más cercano, la mesa piloto). Inspeccionas asientos (la mira muestra qué condiciones cumplen), marcas hasta 3 candidatos, los comparas y decides. El estudiante de la misión llega de verdad y se sienta donde elegiste. |
| **🛠️ Ingeniería** (`#/ingenieria`) | El prototipo por dentro. | La maqueta con los sensores infrarrojos, el ESP32 (LCD y LED) y la ESP32-CAM. Clic en una silla para que alguien entre y se siente, en un sensor para que alguien cruce; siete experimentos y el **Monitor Serie** en vivo con las mismas líneas que el Arduino IDE. Recorrido guiado (`#/ingenieria/recorrido`). |
| **🧭 Libre** (`#/libre`) | Recorre a tu ritmo. | Diez puntos de interés explican cada pieza del sistema; puedes sentarte, pedir una ruta a cualquier asiento desde el mapa o mirar desde arriba. |

El menú (`#/`) muestra la biblioteca viva girando de fondo. Otros enlaces: `#/visor` y `#/sala/1234` (recibir en vivo con un código).

## Lo que es real y lo que es simulado

- La biblioteca tiene **332 asientos** (96 en la Sala 1 y 236 en la Sala 2) y un aforo de **381** personas. La distribución de mesas es **referencial** (24 y 59 mesas de cuatro, como en el informe); no es el plano oficial.
- Solo la **mesa piloto 1-01** puede mostrar datos reales: sus cuatro asientos son las zonas A1–A4 de la ESP32-CAM de la maqueta. Todo lo demás es una proyección simulada.
- **Personas dentro** (sensores de las puertas) y **asientos ocupados** (cámaras) son indicadores distintos y nunca se calculan uno a partir del otro: entrar suma una persona; sentarse ocupa un asiento; quien está de pie, en los estantes o en la fila cuenta como persona pero no como asiento.
- La insignia de la barra superior siempre dice el origen: **Simulación**, **Datos reales · mesa piloto** o **Esperando sensores**.

Colores de los asientos: verde libre, rojo ocupado, ámbar apartado con un objeto, gris sin señal de cámara, azul el tuyo.

## Mecánicas del mundo

- **Estudiantes** con estados: afuera → fila (si el aforo está completo) → entran (sensor S1) → buscan asiento o estante → se sientan (0,9 s de confirmación) → estudian → se levantan → salen (sensor S2). Si su asiento se ocupa antes de llegar, buscan otro; si no hay, esperan de pie en el vestíbulo.
- **Estados del entorno:** normal, alta demanda (≥ 85 %), sin asientos libres, aforo completo (fila afuera), incidente (cámaras sin señal).
- **Rutas** por una grilla de 25 cm (A* para ti, campos de distancia para la multitud) que se recalculan al moverte o cuando cambia la disponibilidad.
- **Personas realistas**, generadas por código: cuerpos con proporciones naturales (altura, complexión y sexo variables), rostros con ojos, cejas, nariz y labios, 8 expresiones (neutral, sonrisa, concentrado, decidido, hablando, sorpresa, cansado y parpadeo), 9 peinados, ropa con tela, mezclilla, cuadros, rayas y pliegues, lentes, mochilas, celulares y libros. Un esqueleto de 11 huesos las anima: caminan con zancada y balanceo, giran, se sientan y se levantan, teclean, escriben, leen, conversan, se estiran y miran a quien se acerca. Tres niveles de detalle mantienen el visor fluido.
- **Sonido** sintetizado: pitido del sensor al cruzar, cambio de asiento, alertas, misión cumplida y un murmullo que crece con la ocupación (botón 🔊).

## Teclado y ratón

| Tecla | Acción |
| --- | --- |
| `W` `A` `S` `D` · `Shift` | Caminar · correr (clic en la vista para mirar con el ratón; `Esc` lo suelta) |
| `E` o clic | Usar lo que está en la mira: elegir un asiento, sentarte, marcar un candidato, aplicar el pincel |
| `F` · `Tab` · `V` | Asiento libre más cercano · mapa del piso · vista aérea |
| `1`–`5` | En el menú, elegir experiencia · en Caos, elegir pincel (`1`–`4`) |
| `C` · `P` | Detective: comparar candidatos · pista |
| `I` · `O` · `Espacio` | Caos: llegan 10 · se van 10 · pausa |
| `M` · `U` · `H` | Simulación o datos reales · conectar sensores · ayuda |

## Meta Quest 3

1. Abre el enlace en el navegador del visor y pulsa **Entrar al visor 3D** (con Quest Link, Air Link o SteamVR, en Chrome o Edge de la PC).
2. Aprieta el gatillo para cerrar la ayuda inicial.
3. **Gatillo:** apunta con el rayo a un asiento, una mesa, un sensor o un botón del tablero. Sobre el control aparece una ficha con lo que apuntas.
4. **A:** acción principal de la experiencia (el asiento más cercano, sentarte, siguiente misión…). **B:** tablero con el mapa (cada asiento se elige con el gatillo) y los botones de la experiencia. **X:** piso del mapa (en la maqueta, entra una persona). **Y:** ayuda.
5. Stick izquierdo: caminar. Stick derecho: girar (← →) y teletransporte (↑ y soltar).

Los avisos del juego (te ganaron el asiento, misión cumplida, aforo completo…) también aparecen dentro del visor. En Ingeniería hay realidad mixta: la maqueta virtual aparece sobre tu mesa real.

## Conectar los sensores de la maqueta

La app solo **lee** lo que el ESP32 y la ESP32-CAM ya imprimen por el Monitor Serie; no cambia el programa ni el circuito.

1. En la laptop, abre el enlace en **Chrome o Edge** y cierra el Monitor Serie de Arduino (solo un programa puede usar el puerto).
2. Pulsa **Datos reales** (o el indicador de dispositivos) y luego **Conectar por USB**. Elige el puerto del ESP32 DevKit y repite para el de la ESP32-CAM.
3. La mesa piloto pasa a mostrar la maqueta en vivo en todas las experiencias. Si pones una silueta en la silla A1, la ESP32-CAM la confirma en unos 0,9 s y el asiento 1-01-A cambia.
4. Para verlo en un Quest sin cable: en la laptop pulsa **Compartir en vivo** y en el visor usa **Recibir en vivo** con el código de 4 dígitos. Solo viajan números (personas y asientos) por un servidor MQTT público; nunca imágenes.

## Estructura

```
index.html · estilos.css · estilos-app.css · estilos-juego.css
docs/DISENO.md             diseño de la experiencia, mecánicas, motor de eventos y estados
src/app.js                 experiencias, rutas, ratón, sonido y diálogos
src/juego/                 menú, Hora punta, Caos, Detective, Ingeniería, Libre, jugador, HUD, mapa, vista aérea
src/biblioteca/            plano y rutas, estado (332 asientos), reloj del día, multitud (agentes), recomendador, mesa piloto
src/datos/                 lectura USB (Web Serial), intérprete del Monitor Serie, modo en vivo (MQTT)
src/escenas/               biblioteca 3D, personas (gente.js), maqueta 3D, ESP32-CAM virtual, siluetas
src/escenas/humanos/       aspecto, cuerpos y peinados, rostros y telas, esqueleto y material de las personas
src/sim/                   firmware de los Anexos A y B emulado, director de la maqueta
src/control/               teclado y ratón, visor (WebXR), paneles 3D
src/motor/                 renderizado, texturas, textos, sonido
```

Sitio estático (sin compilación). three.js 0.170 (licencia MIT) y mqtt.js se cargan desde jsDelivr.
