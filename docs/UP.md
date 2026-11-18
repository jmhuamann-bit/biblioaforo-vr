# La Biblioteca de la Universidad del Pacífico en BiblioAforo VR

BiblioAforo VR modela su biblioteca a partir de la **Biblioteca «Jorge Basadre Grohmann» de la Universidad del Pacífico** (UP, Jesús María, Lima). Este documento resume qué se investigó, de dónde salió cada dato y qué partes siguen siendo referenciales.

## Fuentes

| Fuente | Qué aporta |
| --- | --- |
| [Acerca de la Biblioteca](https://campusvirtual.up.edu.pe/biblioteca/acerca.aspx) | Funciona en un **local de dos pisos**. Horario: lunes a viernes de 7:30 a 22:00 y sábados de 8:00 a 20:00. Dirección: Av. Salaverry 2020, Jesús María. |
| [Guía de la Biblioteca · distribución de salas](http://guiadebiblioteca.up.edu.pe/distribucion_sala.aspx) | **Sala 1**: libros 000–599 (Tecnología, Filosofía, Religión, Ciencias Sociales, Economía, Derecho, Lingüística, Matemática). **Sala 2**: libros 600–999 (Contabilidad, Administración, Marketing, Literatura, Historia) y la **hemeroteca**. **Sala 3**: materiales especiales (tesis, papers, expedientes, libros anteriores al 2000), de acceso restringido: se piden en los módulos de atención. |
| [Reglamento de Biblioteca 2021](https://campusvirtual.up.edu.pe/Biblioteca/doc/Reglamento-Biblioteca-2021.pdf) | Estantería abierta y **carritos** para dejar lo consultado; libros del depósito y antiguos se piden en los **módulos de atención**; hemeroteca de acceso directo; préstamo automatizado; **salas de estudio grupales** con reserva en línea; **computadoras** para bases de datos (máximo 1 hora); laptops solo en mesas con tomacorriente; solo agua en envase cerrado; silencio y celular en silencio; **pertenencias solas por más de 20 minutos las retira seguridad**. |
| [Preguntas frecuentes (2014)](https://campusvirtual.up.edu.pe/Biblioteca_ant/Lists/SeccionTest/Attachments/34/Preguntas_Frecuentes_revisado_2014.pdf) | Las salas de estudio son de uso grupal; identificación con carné en la puerta de ingreso; una colección en el Pabellón F (sala F-109). |
| [Infraestructura de la UP](https://www.up.edu.pe/en/the-university/infrastructure/) | 49 salas de estudio para trabajo en grupo (292 personas en total, en toda la universidad) que se reservan desde el campus virtual; más de 50 000 libros. |
| Fotos de la entrada (galería del Pabellón C) | La forma exterior: ver la siguiente sección. El banner de la biblioteca ubica la Biblioteca UP en el **primer piso del Pabellón C**. |

## Qué se modeló a partir de las fotos

**Galería del Pabellón C** (`src/escenas/galeria.js`): pasillo techado de doble altura frente a la biblioteca.
- Fila de **columnas redondas de concreto caravista** con las hileras de agujeros del encofrado.
- **Marquesina** gris sobre la entrada con jardinera y arbustos; encima, patio de luz con árboles pequeños.
- Techo alto con vigas, **borde terracota** y **lámparas de campana** colgando en fila por el centro.
- Piso de **porcelanato blanco** de 60 × 60 cm.
- **Ala de enfrente**: aula con vidrio, franja esmerilada y **repisa de madera**, maceteros grises con **lengua de suegra**, pisos altos con ventanas de franjas y dos pasajes al campus.
- **Muro del fondo** con cajeros automáticos (genéricos, sin marcas), gabinete contra incendios, señal de salida, cámara y tótem de autoservicio.

**Vitrina de la biblioteca**:
- Vidrio con **franja esmerilada** y marcos de aluminio.
- Muro gráfico **«BIBLIOTECA · Jorge Basadre Grohmann»** (panel azul y pared blanca).
- Pilar entre la entrada y la salida con **HORARIO DE ATENCIÓN** y **AFORO 381 PERSONAS**, y señal de accesibilidad.
- Banner enrollable del préstamo de vacaciones, tacho de reciclaje de papel, tachos de acero y aviso verde en una columna.

**Entrada por dentro** (`src/escenas/interiorUP.js`):
- **Antenas de seguridad** blancas en las dos puertas.
- Cartel colgante **BIBLIOTECA** y panel **SERVICIOS**.
- **Exhibidor de diarios** y aviso de normas.

## Qué se modeló a partir de las fuentes oficiales

| En la simulación | Dónde |
| --- | --- |
| Sala 1 · colección 000–599 (piso 1) y Sala 2 · colección 600–999 · hemeroteca (piso 2) | carteles colgantes de cada sala |
| Hemeroteca: exhibidor de revistas de dos caras | piso 2, junto a los estantes de la izquierda |
| Sala 3 · materiales especiales, acceso restringido | piso 1, a la derecha del vestíbulo (vidrio, puerta, repisas) |
| Cuatro salas de estudio grupales con reserva | piso 1, junto al ventanal derecho |
| Computadoras para bases de datos (máximo 1 hora) | piso 1, a la izquierda (12 puestos) |
| Módulo de atención (préstamo y devolución) | el antiguo mostrador de préstamos |
| Carritos de libros consultados | junto a los estantes de los dos pisos |
| Mesas con tomacorriente | ya existían (una de cada dos columnas) |
| Pertenencias que se retiran a los 20 min | una mochila sola aparta un asiento como máximo 20 minutos simulados |
| Horario de 7:30 a 22:00 | el reloj del día ya iba de 7:30 a 22:00 |

Las salas de estudio, la Sala 3, las computadoras, la hemeroteca y los diarios son obstáculos reales para caminar, tanto para los estudiantes virtuales como para quien juega. No suman asientos: los **332 asientos** y el **aforo 381** siguen siendo los del informe, y el cartel real de la entrada también dice 381.

## Qué sigue siendo referencial

- No hay un plano público de la biblioteca: la distribución de mesas (24 en la Sala 1 y 59 en la Sala 2), la ubicación de cada sala y las medidas de la galería son **aproximadas**.
- Las 49 salas de estudio de la UP son de toda la universidad; en la simulación hay 4 dentro de la biblioteca como ejemplo.
- Las fotos muestran una escalera o rampa justo después de la entrada; la simulación mantiene la entrada al nivel del piso 1, porque los sensores y las rutas dependen de ello.
- Los cajeros, diarios y revistas son genéricos: no se reproducen marcas reales.
