# Spubber

Lector de EPUB para leer rápido: el libro aparece palabra a palabra (RSVP) y la letra de fijación de cada palabra queda siempre en el mismo punto de la pantalla, así que el ojo no se mueve.

Un solo código (React + TypeScript) para la web, Windows (Tauri), Android e iOS (Capacitor). Todo se procesa en el dispositivo: sin servidor y sin cuentas.

## Funciones

- Biblioteca: importar con un botón o arrastrando archivos, portada, autor, % leído y tiempo restante, borrar libros.
- Lector RSVP de 100 a 1000 ppm, con pausas naturales (comas, puntos, párrafos, palabras largas y números).
- Cuatro formas de leer:
  - **Mantener**: lee mientras pulsas, o mientras mantienes apretada la barra espaciadora.
  - **Toque**: un toque inicia la lectura y otro la pausa.
  - **Scroll**: avanzas palabra a palabra deslizando el dedo, con inercia, o con la rueda del ratón.
  - **Gestos**: mantienes pulsado para leer; cuanto más a la derecha, más rápido (hasta ×2), y cuanto más a la izquierda, más lento (hasta ×0,5). Deslizando arriba o abajo saltas de frase.
- Opcional: vibración ligera en cada palabra (Android/iOS) y sonido suave de papel, con un paso de página entre párrafos.
- La ayuda en pantalla desaparece tras las tres primeras sesiones de cada modo.
- Al pausar se muestra el párrafo con la palabra actual resaltada. Si tocas una palabra, la lectura sigue desde ahí.
- Índice de capítulos, marcadores con nota, barra de progreso con marcas de capítulo y posición guardada automáticamente.
- Temas claro, oscuro, sepia o el del sistema. Tipografía serif, sans o mono, tamaño de la palabra, color de la letra guía y guías de enfoque.
- Interfaz en español e inglés.
- Atajos de escritorio: `Espacio` lee o pausa, `←/→` avanza o retrocede una palabra (con `Shift`, una frase), `↑/↓` cambia la velocidad, `B` guarda un marcador, `T` abre el índice y `Esc` vuelve a la biblioteca.

## Web app instalable (iPhone, Android, escritorio)

**https://neojakx.github.io/spubber/**

- **iPhone:** abre el enlace en Safari y pulsa **Compartir → Añadir a pantalla de inicio**.
- **Android y Chrome de escritorio:** pulsa **Instalar** en el aviso que aparece en la biblioteca.

Una vez instalada se abre a pantalla completa y funciona sin conexión. Cuando hay una versión nueva aparece el aviso «Actualizar». En Android puedes compartir un `.epub` desde WhatsApp o Archivos y elegir Spubber para importarlo.

Se publica sola en cada push a `main` (workflow *Web app (GitHub Pages)*). Para generarla en local: `npm run build:pages` (sale en `dist-pages/`).

## Desarrollo

```bash
npm install
npm run dev            # http://localhost:5173
npm test               # tests unitarios (motor EPUB + motor RSVP)
npm run build && npx playwright test   # tests de extremo a extremo (escritorio + móvil)
```

| Objetivo | Comando | Requisitos |
|---|---|---|
| Web (archivo único) | `npm run build:web` | – |
| Web app instalable (PWA) | `npm run build:pages` | – |
| Windows | `npm run desktop:build` | Rust + WebView2 (en Windows) |
| Android | `npm run build && npx cap sync android && cd android && ./gradlew assembleDebug` | JDK 21 + Android SDK |
| iOS | `npm run build && npx cap sync ios && npx cap open ios` | macOS + Xcode |

GitHub Actions compila las apps:

- **CI** (en cada push): tipos, tests unitarios, build, tests de extremo a extremo y la versión web en un solo archivo.
- **Build apps** (en cada tag `v*` o a mano desde la pestaña Actions): instalador de Windows (.exe/.msi), APK de Android (de depuración, instalable), compilación de prueba de iOS para el simulador y un *release* en borrador con los binarios.

## Cómo funciona la conversión

`src/core/epub/parse.ts` convierte el .epub (un ZIP) en texto estructurado:

1. Descomprime el archivo con fflate.
2. Lee `META-INF/container.xml` para localizar el `.opf`.
3. Del `.opf` saca los metadatos, el *manifest* y el *spine* (el orden de lectura).
4. Toma el índice de `nav.xhtml` (EPUB3) o de `toc.ncx` (EPUB2).
5. Recorre cada capítulo XHTML. Si no es XML válido, lo reintenta con el parser HTML. Extrae bloques (párrafos, títulos, citas, listas) y descarta scripts, estilos, llamadas a notas y páginas que solo contienen el índice.
6. Detecta el DRM (cifrado Adobe o LCP) y avisa. La ofuscación de fuentes no cuenta como DRM.

`src/core/rsvp/tokenize.ts` convierte los bloques en un flujo plano de palabras con tres datos por palabra: su peso de pausa, el bloque al que pertenece y la suma acumulada de pausas (para calcular el tiempo restante al instante). `orp.ts` calcula la letra de fijación y `player.ts` es el temporizador. Este calcula el momento de cada palabra a partir del anterior para que los retrasos del temporizador no se acumulen: a 1000 ppm muestra 99 de las 100 palabras esperadas en 6 s, y la que falta es el arranque suave.

Los libros se guardan en IndexedDB (Dexie): metadatos, bloques y el archivo original (para poder volver a procesarlo en futuras versiones), además de los marcadores.

## Estructura

```
src/core/epub     parser EPUB (sin dependencias de UI)
src/core/rsvp     tokenizador, ORP y reproductor
src/db            base de datos, importación y marcadores
src/screens       Biblioteca, Lector, Ajustes y paneles
src/i18n          textos ES / EN
src/platform      integración nativa (botón atrás de Android, barras del sistema)
src-tauri         app de escritorio
android, ios      proyectos nativos de Capacitor
fixtures          EPUB de prueba (EPUB2 con rarezas, DRM, inválidos)
scripts           generadores de fixtures e iconos
e2e               tests de Playwright (incluye un libro de 300 000 palabras)
```
