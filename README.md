# BiblioAforo VR

**Abrir:** https://jmhuamann-bit.github.io/biblioaforo-vr/

Una biblioteca viva en 3D, en la computadora o con un visor (Meta Quest 3). Está modelada como la **Biblioteca Jorge Basadre Grohmann de la Universidad del Pacífico** (primer piso del Pabellón C, con la Sala 2 en el **sótano**): se llega por una galería techada con columnas redondas. Los estudiantes virtuales llegan por esa galería, cruzan el sensor de la puerta (que los cuenta), buscan asiento, caminan hasta él (bajando al sótano por la escalera si hace falta), se sientan (la cámara de su mesa lo confirma en 0,9 s), estudian un rato y se van por la salida (el otro sensor los descuenta). Todo lo que haces entra en ese mundo y tiene consecuencias visibles en los indicadores, el tótem, los colores de los asientos y el mapa.

## Cinco experiencias

| Experiencia | Qué haces | Cómo se juega |
| --- | --- | --- |
| **⏱️ Hora punta** (`#/hora-punta`) | Llegas a las 13:55 y la biblioteca se llena: consigue asiento antes que los demás. | Primera persona en el piso 1 y el sótano. Eliges un asiento (mirándolo, en el mapa o el más cercano) y sigues la ruta. A veces un estudiante va a tu asiento (flecha roja): si llega antes, la cámara lo detecta y la app te lleva al libre más cercano. Resultado con tiempo, metros, asientos perdidos y hasta 3 estrellas. |
| **🌪️ Caos** (`#/caos`) | Tú controlas la biblioteca. | Llegadas de 10, grupos, llegada masiva, salidas, evacuación; clic sobre asientos, mesas y puertas con cuatro «pinceles» (sentar/levantar, mochila, mesa entera, cámara); fallas de cámara y cortes de red; reloj ×1 a ×60 y escenarios. Cinco retos (alta demanda, Sala 1 llena, fila por aforo completo, cámara caída y restablecida, evacuación total). |
| **🔎 Detective** (`#/detective`) | Encuentra el asiento perfecto para cada estudiante. | Cinco misiones (silencio y enchufe, grupo de 3, junto a la ventana —solo en el piso 1: el sótano no tiene—, el más cercano, la mesa piloto). Inspeccionas asientos (la mira muestra qué condiciones cumplen), marcas hasta 3 candidatos, los comparas y decides. El estudiante de la misión llega de verdad y se sienta donde elegiste. |
| **🛠️ Ingeniería** (`#/ingenieria`) | El prototipo por dentro. | La maqueta con los sensores infrarrojos, el ESP32 (LCD y LED) y la ESP32-CAM. Clic en una silla para que alguien entre y se siente, en un sensor para que alguien cruce; siete experimentos y el **Monitor Serie** en vivo con las mismas líneas que el Arduino IDE. Recorrido guiado (`#/ingenieria/recorrido`). |
| **🧭 Libre** (`#/libre`) | Recorre a tu ritmo. | Doce puntos de interés explican cada pieza del sistema (también la entrada real de la UP y sus salas); puedes sentarte, pedir una ruta a cualquier asiento desde el mapa o mirar desde arriba. |

El menú (`#/`) muestra la biblioteca viva girando de fondo. Otros enlaces: `#/visor` y `#/sala/1234` (recibir en vivo con un código).

### Sección extra: 🎤 Simulación para presentación (`#/presentacion`)

La biblioteca de Hora punta con el **piso 1 y el sótano llenos**: solo la **mesa piloto 1-01** tiene **2 de sus 4 sillas libres**. Con el Meta Quest 3 puesto caminas de verdad hacia el sensor S1; cuando el **sensor real** te detecta, en el simulador también entras. Luego vas a la mesa piloto, eliges una silla libre, te sientas y te quedas. Lee el ESP32 del informe o el Arduino de otro programa (se traduce solo o se le enseña con un clic) por USB, y el visor recibe los datos con `#/presentacion/CÓDIGO` o por Air Link. La pestaña **«Prueba del sensor»** sirve para probarlo en minutos con el ESP32 del equipo (mismo cable USB): LCD virtual, contadores, cada cruce, cómo llega cada línea a la simulación y descarga del registro CSV. Detalles, calibración y qué es real: [docs/PRESENTACION.md](docs/PRESENTACION.md).

## Lo que es real y lo que es simulado

- La biblioteca tiene **332 asientos** (96 en la Sala 1, en el piso 1, y 236 en la Sala 2, en el sótano) y un aforo de **381** personas: el mismo número del cartel real «AFORO 381 PERSONAS» de la entrada. La distribución de mesas es **referencial** (24 y 59 mesas de cuatro, como en el informe); no es el plano oficial.
- Lo que se tomó de la UP real (fotos y fuentes oficiales, ver [docs/UP.md](docs/UP.md)): la galería del Pabellón C (columnas de concreto caravista, lámparas de campana, piso de porcelanato, marquesina con jardinera, cajeros al fondo), la vitrina con franja esmerilada, el muro «BIBLIOTECA · Jorge Basadre Grohmann», los carteles de horario (L–V 7:30–22:00, sáb. 8:00–20:00) y de aforo, las antenas de seguridad y los diarios de la entrada; adentro, la **Sala 1** (colección 000–599), la **Sala 2** en el sótano (600–999 y hemeroteca, sin ventanas: luz artificial y extracción de aire), la **Sala 3** de materiales especiales (acceso restringido), las **salas de estudio grupales** (con reserva, sin cámara: no cuentan entre los 332), las **computadoras** (máx. 1 h), los **carritos** de libros consultados, el módulo de atención y la regla de las **pertenencias que se retiran a los 20 min**.
- Solo la **mesa piloto 1-01** puede mostrar datos reales: sus cuatro asientos son las zonas A1–A4 de la ESP32-CAM de la maqueta. Todo lo demás es una proyección simulada.
- **Personas dentro** (sensores de las puertas) y **asientos ocupados** (cámaras) son indicadores distintos y nunca se calculan uno a partir del otro: entrar suma una persona; sentarse ocupa un asiento; quien está de pie, en los estantes o en la fila cuenta como persona pero no como asiento.
- La insignia de la barra superior siempre dice el origen: **Simulación**, **Datos reales · mesa piloto** o **Esperando sensores**.

Colores de los asientos: verde libre, rojo ocupado, ámbar apartado con un objeto, gris sin señal de cámara, azul el tuyo.

## Mecánicas del mundo

- **Estudiantes** con estados: llegan por la galería (desde dos pasajes al campus o el extremo abierto) → fila a lo largo de la galería (si el aforo está completo) → entran (sensor S1) → buscan asiento o estante → se sientan (0,9 s de confirmación) → estudian → se levantan → salen (sensor S2). Si su asiento se ocupa antes de llegar, buscan otro; si no hay, esperan de pie en el vestíbulo. Una mochila sola aparta un asiento como máximo 20 minutos (como en el reglamento de la UP).
- **Estados del entorno:** normal, alta demanda (≥ 85 %), sin asientos libres, aforo completo (fila afuera), incidente (cámaras sin señal).
- **Casa de muñecas** (menú y Caos): el piso 1 se levanta con su vitrina y debajo se ve el sótano con su gente; la vista aérea (`V`) quita el piso 1 para mirar el sótano desde arriba.
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
4. **A:** acción principal de la experiencia (el asiento más cercano, sentarte, siguiente misión…). **B:** tablero con el mapa (cada asiento se elige con el gatillo) y los botones de la experiencia; aparece frente a ti, donde estés mirando. **X:** nivel del mapa: piso 1 o sótano (en la maqueta, entra una persona). **Y:** ayuda.
5. Stick izquierdo: caminar; **hundirlo: volver al inicio** (también está en el tablero). Stick derecho: girar (← →) y teletransporte (↑ y soltar).

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
docs/PRESENTACION.md       sección extra: sensores reales, calibración del visor, qué es real
docs/UP.md                 investigación de la Biblioteca de la UP: fuentes, fotos y qué se modeló
src/app.js                 experiencias, rutas, ratón, sonido y diálogos
src/juego/                 menú, Hora punta, Caos, Detective, Ingeniería, Libre, jugador, HUD, mapa, vista aérea
src/presentacion/          Simulación para presentación: sensores reales, calibración, ayudas 3D
src/biblioteca/            plano y rutas, estado (332 asientos), reloj del día, multitud (agentes), recomendador, mesa piloto
src/datos/                 lectura USB (Web Serial), intérprete del Monitor Serie, modo en vivo (MQTT)
src/escenas/               biblioteca 3D, galería del Pabellón C (galeria.js), salas de la UP (interiorUP.js), personas, maqueta 3D, ESP32-CAM virtual
src/escenas/humanos/       aspecto, cuerpos y peinados, rostros y telas, esqueleto y material de las personas
src/sim/                   firmware de los Anexos A y B emulado, director de la maqueta
src/control/               teclado y ratón, visor (WebXR), paneles 3D
src/motor/                 renderizado, texturas, textos, sonido
```

Sitio estático (sin compilación). three.js 0.170 (licencia MIT) y mqtt.js se cargan desde jsDelivr.
