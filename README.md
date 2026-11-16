# BiblioAforo VR

**Abrir:** https://jmhuamann-bit.github.io/biblioaforo-vr/

Un estudiante entra a la biblioteca de la Universidad del Pacífico y, sin recorrer los dos pisos, sabe dónde hay un asiento libre y cómo llegar. BiblioAforo VR muestra esa experiencia en 3D, en la computadora o con un visor (Meta Quest 3), usando los datos de la maqueta física cuando está conectada y una simulación cuando no.

## Tres modos

| Modo | Para qué sirve |
| --- | --- |
| **Estudiante** (principal) | Entrar por la puerta, ver los asientos libres de cada piso, elegir uno en el mapa, seguir la ruta (primera persona o vista aérea) y sentarse. |
| **Administración** | Personas dentro y asientos ocupados lado a lado, ocupación por piso, gráfico del día, estado de los dispositivos, escenarios de prueba y registro descargable. |
| **Cómo funciona** | La maqueta en 3D con sus sensores: haces infrarrojos, antirrebote, ESP32‑CAM con el algoritmo del Anexo B, pruebas (pareja pegada, mochila, luz) y recorrido guiado para la sustentación. |

Enlaces directos: `#/estudiante`, `#/admin`, `#/tecnico`, `#/tecnico/recorrido`, `#/visor` y `#/sala/1234` (recibir en vivo con un código).

## Lo que es real y lo que es simulado

- La biblioteca tiene **332 asientos** (96 en la Sala 1 y 236 en la Sala 2) y un aforo de **381** personas. La distribución de mesas es **referencial** (24 y 59 mesas de cuatro, como en el informe); no es el plano oficial.
- Solo la **mesa piloto 1-01** (Sala 1) puede mostrar datos reales: sus cuatro asientos son las zonas A1–A4 de la ESP32‑CAM de la maqueta. Los otros 328 asientos y el aforo de la biblioteca son una proyección simulada (83 cámaras en total).
- **Personas dentro** (sensores de las puertas) y **asientos ocupados** (cámaras) son indicadores distintos y nunca se calculan uno a partir del otro. Entrar suma una persona; sentarse ocupa un asiento.
- La insignia de la barra superior siempre dice el origen: **Simulación**, **Datos reales · mesa piloto** o **Esperando sensores**. La puerta de la maqueta se muestra aparte como «puerta piloto» y no se suma al aforo de la biblioteca.

Colores de los asientos: verde libre, rojo ocupado (con una ×), ámbar apartado con un objeto, azul tu asiento.

## Usar con teclado y ratón

| Tecla | Acción |
| --- | --- |
| `Enter` | Acción del paso: entrar, ver el mapa, ir, sentarse, liberar, salir |
| `1` `2` | Elegir piso |
| Clic | Elegir un asiento verde en el mapa o en la vista 3D |
| `F` · `Tab` | Asiento libre más cercano · mapa o piso en 3D |
| `G` · `Espacio` · `V` | Guiarme o pausar · pausa · primera persona o vista aérea |
| `W` `A` `S` `D` | Caminar tú mismo durante la ruta |
| `L` · `Esc` | Liberar el asiento · volver un paso |
| `M` · `U` · `H` | Simulación sí/no · conectar sensores · ayuda |

## Usar con el Meta Quest 3

1. Abre el enlace en el navegador del visor y pulsa **Entrar al visor 3D**. Con un visor conectado a la PC (Quest Link, Air Link o SteamVR), abre la página en Chrome o Edge de la PC.
2. Aprieta el gatillo para cerrar la ayuda inicial.
3. **A** hace la acción del paso (entrar, asiento más cercano, ir, siguiente tramo, sentarse, liberar). **B** muestra el tablero con el mapa; apunta a un asiento verde con el rayo y aprieta el gatillo. **X** cambia de piso. **Y** muestra la ayuda.
4. Stick izquierdo: caminar. Stick derecho: girar (← →) y teletransporte (↑ y soltar).

En **Cómo funciona** también hay realidad mixta (Quest 3): la maqueta virtual aparece sobre tu mesa real.

## Conectar los sensores de la maqueta

La app solo **lee** lo que el ESP32 y la ESP32‑CAM ya imprimen por el Monitor Serie; no cambia el programa ni el circuito.

1. En la laptop, abre el enlace en **Chrome o Edge** y cierra el Monitor Serie de Arduino (solo un programa puede usar el puerto).
2. Pulsa **Datos reales** (o el indicador de dispositivos) y luego **Conectar por USB**. Elige el puerto del ESP32 DevKit y repite para el de la ESP32‑CAM.
3. La mesa piloto pasa a mostrar la maqueta en vivo. Si pones una silueta en la silla A1, la ESP32‑CAM la confirma en unos 0,9 s y el asiento 1-01-A cambia para todos.
4. Para verlo en un Quest sin cable: en la laptop pulsa **Compartir en vivo** y en el visor usa **Recibir en vivo** con el código de 4 dígitos. Solo viajan números (personas y asientos) por un servidor MQTT público; nunca imágenes.

Sin sensores, **Simulación** genera todo: un día con las dos horas punta del informe (14:00–15:30 y 17:00–18:30) y seis escenarios de prueba en Administración.

## Ajustes

- `src/config.js`: medidas de la maqueta (Figura 2), parámetros del ESP32 y de la ESP32‑CAM, colores y servidores para el modo en vivo.
- `src/biblioteca/plano.js`: distribución de las dos salas, escalera y puertas. Si se consigue el plano real, basta con cambiar las posiciones aquí.

## Estructura

```
index.html · estilos.css · estilos-app.css
src/app.js                 modos, rutas y diálogos
src/biblioteca/            plano, estado (332 asientos), simulador del día, recomendador, mesa piloto
src/datos/                 lectura USB (Web Serial), intérprete del Monitor Serie, modo en vivo (MQTT)
src/escenas/               biblioteca 3D, maqueta 3D, ESP32-CAM virtual, siluetas
src/sim/                   firmware de los Anexos A y B emulado, director de la maqueta
src/ui/                    estudiante, mapa, administración, recorrido, paneles
src/control/               teclado y ratón, visor (WebXR), paneles 3D
```

Sitio estático (sin compilación). three.js 0.170 (licencia MIT) y mqtt.js se cargan desde jsDelivr.
