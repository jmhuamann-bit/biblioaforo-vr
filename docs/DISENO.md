# BiblioAforo VR · Diseño de la simulación interactiva

## 1. Idea central

La biblioteca es un **mundo vivo**: estudiantes virtuales llegan desde la plaza, cruzan la puerta (el sensor S1 los cuenta), buscan asiento, caminan hasta él, se sientan (la cámara de su mesa lo confirma en 0,9 s), estudian un rato, se van por la puerta de salida (el sensor S2 los descuenta). Todo lo que el usuario hace entra en ese mundo y tiene consecuencias visibles: si ordena que entren diez personas, las ve cruzar la puerta, repartirse por los pisos y cambiar los indicadores; si elige un asiento y un estudiante virtual llega antes, el sistema reacciona y le propone otra ruta.

Pilares: **explorar** (primera persona en el piso 1 y el sótano), **manipular** (asientos, puertas, sensores, cámaras), **decidir** (qué asiento, qué ruta, qué evento provocar), **provocar eventos** y **ver consecuencias en tiempo real** (personas, colores, tótem, mapa, sonidos, indicadores).

## 2. Las cinco experiencias

| Experiencia | Objetivo del usuario | Bucle de juego | Cómo se gana o se mide |
| --- | --- | --- | --- |
| **Hora punta** | Conseguir asiento cuando la biblioteca se está llenando | Entrar → mirar el tótem → elegir asiento (mirándolo, en el mapa o el más cercano) → caminar con la ruta → competir con otros estudiantes → si te ganan, aceptar la alternativa → sentarte | Tiempo, metros caminados, desvíos; comparación con la mejor opción posible; hasta 3 estrellas |
| **Caos** | Controlar la biblioteca y llevarla al límite | Panel de control: entradas, salidas, llegada masiva, ocupar o liberar mesas con clic, mochilas, fallas de cámara, corte en una sala, evacuación, hora y velocidad | Ver cómo reacciona el sistema: estados del entorno, colas en la puerta, alertas y registro |
| **Detective** | Resolver misiones con condiciones | Leer la misión → inspeccionar asientos (zona, enchufe, ventana, mesa) → marcar candidatos → comparar → confirmar | Condiciones cumplidas y qué tan cerca estuvo de la mejor opción; estrellas por misión |
| **Ingeniería** | Entender y manipular el prototipo | Maqueta con sensores: cruzar las puertas, sentar o quitar siluetas en A1–A4, cambiar la luz, mover y recalibrar la cámara, ver el Monitor Serie en vivo | El sistema responde como el firmware real: LCD, LED, cámara, líneas CSV |
| **Libre** | Recorrer y descubrir | Caminar por el piso 1 y el sótano, abrir puntos de interés, inspeccionar objetos, cambiar a vista aérea | Puntos descubiertos (n de 12) |

## 3. Mecánicas

- **Primera persona** con teclado y ratón (W A S D, ratón para mirar, Shift para correr), en el piso 1, la escalera y el sótano; en el visor, sticks y teletransporte.
- **Mira e interacción contextual**: lo que está al centro de la pantalla se resalta y muestra qué se puede hacer (`E` o clic): elegir un asiento, ver una mesa, leer el tótem, inspeccionar una cámara, un sensor, un estudiante.
- **Estudiantes animados** que caminan (piernas y balanceo), cruzan puertas, bajan al sótano por la escalera, se sientan y se van; hacen cola afuera si el aforo está completo.
- **Asientos y mesas con estado dinámico**: verde libre, rojo ocupado, ámbar apartado con un objeto, gris sin señal de cámara, azul el tuyo.
- **Rutas que se recalculan** al moverte o cuando cambia la disponibilidad; si alguien ocupa tu asiento, se ofrece el libre más cercano.
- **Rivales**: en hora punta, a veces un estudiante va hacia tu asiento; se marca en rojo y puedes correr para ganarle.
- **Sonido**: pitido del sensor al cruzar (entrada agudo, salida grave), campana al confirmar un asiento, alerta cuando te ganan el sitio, música de misión cumplida y un murmullo ambiental que crece con la ocupación.
- **Paneles contextuales**, minimapa, mapa completo (`Tab`), misiones con lista de condiciones y tarjeta de resultados.
- **Eventos** activados por el usuario o aleatorios (grupo que llega, mochilas, falla de cámara, corte en una sala, llegada masiva, evacuación).

## 4. Motor de eventos

```
Reloj del día (14:00–15:30 y 17:00–18:30 son hora punta)
  └─ Director: decide llegadas y salidas según la hora, la velocidad y los eventos
       ├─ Estudiante virtual (máquina de estados, ver 5)
       │     cruza la puerta ──► Sensor S1/S2 ──► Personas dentro (aforo 381)
       │     se sienta ──────► Cámara de la mesa (0,9 s) ──► Asiento ocupado (332)
       └─ Eventos: grupo, mochilas, falla de cámara, corte de sala, llegada masiva, evacuación
Jugador (primera persona) ──► elige, camina, se sienta; recibe alertas y rutas nuevas
Mesa piloto ◄── datos reales de la maqueta (USB o código de sala) cuando están conectados
Todo publica en el bus: puerta, asiento, agente, entorno, alerta, misión
  └─ 3D (personas, colores, tótem), mapa, minimapa, indicadores, sonido, registro
```

Eventos del bus: `puerta` (entrada o salida, con el sensor), `asiento` (antes → ahora, origen), `agente` (llega, se sienta, se va, espera, hace cola), `entorno` (cambio de estado), `alerta` (asiento tomado, aforo completo, cámara caída), `mision` (condición cumplida, misión terminada).

## 5. Estados

**Estudiante virtual:** `afuera` → `cola` (si el aforo está completo) → `entrando` (cruza S1) → `buscando` (camina a su asiento o a un estante) → `sentandose` (0,9 s de confirmación) → `sentado` (estudia de 40 a 140 min de reloj) → `levantandose` → `saliendo` (cruza S2) → retirado. Si su asiento se ocupa antes de llegar, busca otro; si no hay, espera de pie en el vestíbulo y reintenta.

**Entorno de la biblioteca:**

| Estado | Condición | Qué cambia |
| --- | --- | --- |
| Normal | menos del 85 % de asientos ocupados | — |
| Alta demanda | 85 % o más | aviso en el tótem y en el panel |
| Sin asientos libres | 0 libres, pero hay aforo | los que entran esperan de pie (el caso que motivó la cámara) |
| Aforo completo | 381 personas dentro | la entrada se bloquea y se forma cola afuera |
| Incidente | alguna cámara sin señal | esos asientos pasan a gris «sin dato» |

**Datos:** cada asiento indica su origen. Solo la mesa piloto 1-01 puede ser real; todo lo demás se rotula como simulado.

## 6. Etapas de implementación (hechas)

1. ✅ Motor de estudiantes animados (`src/biblioteca/agentes.js`), rutas rápidas por campos de distancia, sensores de puerta, cámaras con confirmación de 0,9 s, fila por aforo y estados del entorno.
2. ✅ Hora punta (`src/juego/horaPunta.js`): primera persona, mira e interacción, rivales con carrera pareja, rutas recalculadas, asiento perdido → ruta al libre más cercano, sentarse, resultados y salida por S2.
3. ✅ Caos (`src/juego/caos.js`): panel de control, clic sobre asientos, mesas y puertas con pinceles, eventos, colas, cinco retos.
4. ✅ Detective (`src/juego/detective.js`), Ingeniería (`src/juego/ingenieria.js`, Monitor Serie y experimentos) y Libre (`src/juego/libre.js`, diez puntos de interés).
5. ✅ Menú (`src/juego/menu.js`), sonido (`src/motor/sonido.js`), minimapa, mapa (Tab), vista aérea y visor (`src/control/vr.js`: gatillo sobre el mundo, tablero por experiencia y avisos dentro del visor).
