# Contraltura

Dos equipos de 20 cuadrados intentan formar una pila bajo las mismas condiciones.
El usuario asigna tres de seis atributos a cada equipo. El resto conserva el valor inicial indicado en la tabla.

## Ejecutar

Con Node.js instalado, ejecuta `node build.mjs` y abre `public/index.html` en un navegador.
El archivo generado es autónomo. El navegador ejecuta tanto la simulación como el entrenamiento.

## Entrenamiento

Cada equipo comparte una política parametrizada. La búsqueda de políticas propone
22 combinaciones de sus tres atributos asignados y conserva la que obtiene la
mayor recompensa media en dos escenarios reproducibles. La recompensa combina
altura máxima apoyada, altura estable media y tiempo hasta la meta. La animación
evalúa ambos equipos con una tercera condición inicial común. El intento inicial usa
los seis valores base en ambos equipos. Los cuadrados tienen el mismo tamaño y masa,
con rotación bloqueada, y avanzan por turnos. Las colisiones y la gravedad se resuelven
con Matter.js 0.20.0 (MIT, ver `src/MATTER-LICENSE`).

## Vercel

Importa el repositorio de GitHub en Vercel. La configuración del repositorio define
el comando de compilación y el directorio público. La aplicación no requiere variables
de entorno ni servidor propio.
