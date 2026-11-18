# Laboratorio de simulaciones

Primera versión de un laboratorio distribuido de tráfico urbano para Programación de Servicios y Procesos. Compara duraciones de semáforos en un cruce mediante réplicas con llegadas aleatorias.

Parte de la estructura maestro–servidor–trabajadores del ejemplo de fotografías de `UD6-Traca final`. Esta adaptación tiene un motor propio de tráfico y funciona sin Ollama, modelos de IA ni el módulo `describir_fotos_original`.

## Los tres programas

| Archivo | Responsabilidad |
| --- | --- |
| `master.py` | Generar experimentos, enviar trabajos con una ventana acotada, guardar resultados en SQLite y exportar comparaciones. |
| `server.py` | Conservar la cola en SQLite, repartir trabajos, recuperar asignaciones interrumpidas y servir el monitor. |
| `slave.py` | Ejecutar las simulaciones en procesos independientes y devolver métricas. También contiene el motor y las funciones compartidas. |

Cada trabajador ejecuta **simulaciones completas e independientes**. Los vehículos de una misma simulación comparten el estado del cruce y se calculan juntos.

## Preparación en Windows

Necesitas Python 3.11 o posterior. Desde esta carpeta:

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

Los comandos siguientes usan directamente el ejecutable del entorno, sin tener que activarlo. Si tu instalación ofrece `py` en lugar de `python`, puedes crear el entorno con `py -3 -m venv .venv`.

## Primera ejecución en un equipo

Abre tres terminales en esta carpeta y deja los dos primeros programas ejecutándose.

Terminal 1: servidor.

```powershell
.\.venv\Scripts\python.exe server.py
```

Terminal 2: trabajador con dos procesos de cálculo.

```powershell
.\.venv\Scripts\python.exe slave.py --name equipo-1 --processes 2
```

Terminal 3: maestro.

```powershell
.\.venv\Scripts\python.exe master.py --run-id prueba-inicial
```

Abre el monitor en **http://127.0.0.1:8766**. Muestra la cola, los trabajadores, sus procesos ocupados y la comparación de semáforos. En local el token se deja vacío salvo que hayas configurado `LAB_TOKEN`.

El experimento predeterminado ejecuta 100 simulaciones: cuatro duraciones de verde norte/sur (15, 30, 45 y 60 segundos), con 25 réplicas por duración. Cada simulación representa una hora virtual. El verde este/oeste dura 30 segundos; llegan, en promedio, 18 vehículos/minuto a **cada** acceso norte/sur y 8 a **cada** acceso este/oeste.

Las simulaciones se calculan tan rápido como permita el equipo. Una hora virtual no implica esperar una hora real. La demostración pequeña puede terminar antes de que el monitor muestre todos los cambios.

Para comparar varios trabajadores en el mismo ordenador, abre otra terminal:

```powershell
.\.venv\Scripts\python.exe slave.py --name equipo-2 --processes 1
```

## Cambiar el experimento

Ejemplo con más carga y un nombre distinto:

```powershell
.\.venv\Scripts\python.exe master.py --run-id carga-alta --green-ns 15,30,45,60 --green-ew 30 --arrival-ns 22 --arrival-ew 10 --duration 14400 --repetitions 100
```

| Opción del maestro | Significado |
| --- | --- |
| `--green-ns 15,30,45` | Duraciones de verde norte/sur que se compararán. |
| `--green-ew 30` | Duración fija del verde este/oeste, en segundos. |
| `--arrival-ns`, `--arrival-ew` | Llegadas medias por minuto y por acceso (0 a 60). |
| `--duration` | Segundos virtuales por réplica (1 a 86400). |
| `--repetitions` | Réplicas por configuración (1 a 1000; máximo 5000 simulaciones por experimento). |
| `--seed` | Semilla inicial. La réplica siguiente utiliza la semilla siguiente. |
| `--amber` | Segundos de despeje entre verdes; durante ese intervalo nadie cruza. |
| `--headway` | Segundos entre pasos de vehículos de un mismo carril con verde. |
| `--window`, `--batch` | Trabajos enviados pendientes y tamaño del lote (máximo 10 por lote). |
| `--timeout` | Límite real sin recibir resultados; por defecto, 120 segundos. |
| `--run-id` | Nombre para identificar y reanudar un experimento. |
| `--db`, `--output` | Base de datos local y carpeta de exportación. |

Todas las combinaciones de semáforos usan las mismas semillas por réplica y la misma secuencia de llegadas. Esto permite comparar el efecto de las fases sobre un tráfico equivalente.

Si omites `--run-id`, se genera un identificador a partir de los parámetros. Repetir exactamente el comando recupera el mismo experimento. Para medir una ejecución nueva, cambia `--run-id`; para una medición comparable, conserva los demás parámetros y las semillas.

## Varios ordenadores de la red local

1. Copia esta carpeta a los equipos trabajadores y prepara su entorno Python.
2. Elige un token compartido y configura `LAB_TOKEN` en **cada terminal** que vaya a ejecutar un programa:

   ```powershell
   $env:LAB_TOKEN = 'pon-aqui-un-token-propio'
   ```

3. En el ordenador servidor:

   ```powershell
   .\.venv\Scripts\python.exe server.py --host 0.0.0.0
   ```

4. En cada trabajador, sustituye la IP de ejemplo por la del servidor y utiliza un nombre propio:

   ```powershell
   .\.venv\Scripts\python.exe slave.py --server ws://192.168.1.50:8765 --name portatil-1 --processes 2
   ```

5. Ejecuta el maestro apuntando al servidor:

   ```powershell
   .\.venv\Scripts\python.exe master.py --server ws://192.168.1.50:8765 --run-id experimento-red
   ```

El monitor estará en `http://IP-DEL-SERVIDOR:8766`; introduce el mismo token. El cortafuegos del servidor debe permitir esos puertos para la red elegida. Esta versión usa WebSocket y HTTP sin cifrar y está orientada a una red local de confianza; un despliegue público necesitaría TLS.

## Resultados y recuperación

Se crean automáticamente estas rutas dentro del proyecto, independientemente de la carpeta desde la que lances Python:

```text
datos/
  cola.sqlite3                 Cola y resultados persistidos por el servidor
  resultados.sqlite3           Experimentos y resultados guardados por el maestro
resultados/<run-id>/
  simulaciones.csv             Una fila por simulación, incluidos los errores
  comparacion.csv              Métricas agrupadas por duración de semáforos
  resumen.json                 Clasificación y número de éxitos y fallos
```

El maestro confirma cada resultado después de guardarlo. Los acuses están asociados al experimento y el servidor conserva el resultado para poder recuperarlo incluso si se pierde la base del maestro.

Si se desconecta un trabajador, sus tareas vuelven a la cola. Los latidos renuevan la asignación mientras calcula; una asignación caducada se invalida para que su respuesta tardía no sustituya la de otro trabajador. Tras tres intentos fallidos, el servidor comunica el fallo definitivo y el maestro lo registra y termina con código de salida 1. Puedes cambiar el límite con `server.py --max-attempts`.

Para reanudar el maestro, repite el mismo comando con la misma base de datos. Los trabajos ya guardados se reutilizan. Si detienes el servidor, su siguiente arranque recupera la cola persistida. Para repetir también los fallos definitivos, crea otro experimento con un `--run-id` diferente.

## Qué representa el modelo

- Un cruce con cuatro accesos, un carril por acceso y circulación recta.
- Norte y sur comparten verde; este y oeste comparten el siguiente verde.
- En cada segundo puede llegar un vehículo a cada acceso con probabilidad `vehículos_por_minuto / 60`.
- Los vehículos esperan en colas FIFO y cruzan según `--headway`.
- Se miden llegadas, salidas, vehículos pendientes, espera, tamaño de las colas y tiempo de cálculo.
- La clasificación usa la espera media acumulada por vehículo llegado, ponderada por las llegadas de cada réplica. Incluye la espera ya acumulada de quienes siguen en cola al terminar; su espera futura todavía no se conoce. El percentil 95 de cada réplica sigue ese mismo criterio.
- El tiempo de pared de `resumen.json` corresponde a esa invocación del maestro, incluidos red y escritura. Una ejecución reanudada no sirve como medición completa de rendimiento.

Es un modelo educativo simplificado: las calles tienen colas sin límite, no hay giros, peatones, distancia de circulación ni semáforos adaptativos. El panel actual muestra ejecución y estadísticas; la animación 2D de vehículos queda como siguiente ampliación.

## Siguientes pasos

1. Añadir una vista 2D del cruce con el estado de una réplica seleccionada.
2. Comparar políticas de semáforos fijas y adaptativas.
3. Medir el mismo experimento con uno y varios equipos, usando nombres nuevos para no reutilizar resultados.
4. Incorporar varios cruces dentro de cada simulación y rutas entre ellos.
