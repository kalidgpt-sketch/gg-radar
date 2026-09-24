# Backend seguro de GG Radar — Brawl Stars API

Flujo de producción:

```
GitHub Pages
  -> https://gg-radar-api-kalid577.fly.dev
  -> https://api.brawlstars.com/v1
```

El navegador **nunca** recibe ni conoce `BRAWL_API_TOKEN`.

## Estado actual

El backend está preparado para Player Tags reales. Lo único que falta para activar la API oficial es:

1. Añadir método de pago a la organización de Fly.io.
2. Asignar una IP de salida estática en `cdg`.
3. Crear una API key en Brawl Stars Developer autorizando esa IPv4.
4. Guardar el token como secreto de Fly.
5. Volver a desplegar la última versión del backend.
6. Ejecutar las pruebas de producción indicadas al final de este documento.

## Player Tags

La entrada se:

- recorta;
- convierte a mayúsculas;
- acepta con o sin `#`;
- acepta `%23` al principio;
- convierte la letra `O` a cero para evitar un error manual frecuente;
- valida contra el alfabeto usado por los tags de Supercell: `0289PYLQGRJCUV`.

El frontend envía el tag sin necesidad de incluir `#`. El backend lo vuelve a construir y lo codifica para la petición oficial.

## Seguridad

### Token

`BRAWL_API_TOKEN` solo se lee desde una variable de entorno del servidor.

Nunca debe aparecer en:

- `site/config.js`;
- HTML o JavaScript del navegador;
- commits de GitHub;
- capturas;
- logs;
- mensajes de error;
- este README.

Los archivos `.env` están ignorados por Git. `backend/.env.example` contiene únicamente nombres de variables, nunca valores reales.

En Fly.io:

```bash
fly secrets set BRAWL_API_TOKEN='<TOKEN>' --app gg-radar-api-kalid577
```

No pegues el token en el chat.

### CORS

Por defecto solo se permite como origen de navegador:

```
https://kalidgpt-sketch.github.io
```

Puede configurarse una lista separada por comas mediante `ALLOWED_ORIGINS`.

CORS no sustituye al rate limiting: las peticiones directas sin navegador siguen limitadas por IP.

### IP del cliente

En Fly.io se prioriza `Fly-Client-IP`. `X-Forwarded-For` no se confía por defecto para evitar spoofing fuera de un proxy controlado.

## Rate limiting

Valores por defecto:

- 45 consultas por IP;
- ventana de 60 segundos.

Las respuestas incluyen:

- `RateLimit-Limit`;
- `RateLimit-Remaining`;
- `RateLimit-Reset`;
- `Retry-After` cuando se supera el límite.

Variables:

```
RATE_WINDOW_MS=60000
RATE_MAX=45
```

## Caché

GG Radar mantiene caché en memoria por máquina de Fly.

### Respuestas correctas

- frescas durante 120 segundos;
- pueden mantenerse como stale durante 300 segundos adicionales;
- si Supercell falla temporalmente y existe una copia stale, GG Radar puede servirla en lugar de dejar al usuario sin resultado.

### Jugadores inexistentes

Los 404 se guardan 30 segundos para evitar repetir consultas inválidas.

### Peticiones simultáneas

Si varias personas consultan el mismo tag mientras una petición a Supercell sigue en curso, el backend agrupa esas consultas y realiza una sola llamada upstream.

La respuesta puede incluir:

- `X-Cache: MISS`;
- `X-Cache: HIT`;
- `X-Cache: COALESCED`;
- `X-Cache: STALE`.

Variables:

```
CACHE_TTL_MS=120000
NEGATIVE_CACHE_TTL_MS=30000
STALE_TTL_MS=300000
CACHE_MAX_ENTRIES=1000
```

## Timeout y errores

Timeout upstream por defecto:

```
UPSTREAM_TIMEOUT_MS=6500
```

Formato de error público:

```json
{
  "error": {
    "code": "PLAYER_NOT_FOUND",
    "message": "No se encontró ese Player Tag."
  },
  "requestId": "..."
}
```

Códigos principales:

- `MISSING_PLAYER_TAG`
- `INVALID_PLAYER_TAG`
- `PLAYER_NOT_FOUND`
- `RATE_LIMITED`
- `UPSTREAM_RATE_LIMITED`
- `UPSTREAM_TIMEOUT`
- `UPSTREAM_UNAVAILABLE`
- `UPSTREAM_NETWORK`
- `UPSTREAM_AUTH_FAILED`
- `API_NOT_CONFIGURED`
- `ORIGIN_NOT_ALLOWED`

El `requestId` permite relacionar un error visible con los logs sin mostrar el token.

## Datos devueltos al navegador

No se reenvía ciegamente la respuesta completa de Supercell. `safePlayer()` crea una versión reducida con los datos que GG Radar necesita:

- tag y nombre;
- icono;
- trofeos y máximo;
- experiencia;
- victorias;
- club básico;
- brawlers;
- power/rank/trofeos;
- gadgets;
- star powers;
- gears.

Campos desconocidos o futuros de la API oficial no se exponen automáticamente.

## Health checks

Servidor vivo:

```bash
curl https://gg-radar-api-kalid577.fly.dev/health
```

Antes de conectar el token:

```json
{"ok":true,"apiConfigured":false}
```

Después de conectar el token:

```json
{"ok":true,"apiConfigured":true}
```

Readiness:

```bash
curl https://gg-radar-api-kalid577.fly.dev/ready
```

Devuelve 200 cuando el token está configurado y 503 mientras falte.

## Verificación local / CI

No hay dependencias externas de Node.

```bash
cd backend
npm run verify
```

Ejecuta validación sintáctica y tests automáticos.

GitHub Actions también:

- ejecuta todos los tests del backend;
- construye el Dockerfile de producción.

## Activación real en Fly.io

Con la cuenta de Fly fuera del trial:

```bash
fly ips allocate-egress --app gg-radar-api-kalid577 -r cdg
fly ips list --app gg-radar-api-kalid577
```

Añade la IPv4 de salida a la nueva key de Brawl Stars Developer.

Después:

```bash
fly secrets set BRAWL_API_TOKEN='<TOKEN>' --app gg-radar-api-kalid577
fly deploy --app gg-radar-api-kalid577
```

El secreto se gestiona en Fly y no se guarda en el repositorio.

## Prueba final con un Player Tag

```bash
curl -i "https://gg-radar-api-kalid577.fly.dev/api/player?tag=TU_TAG"
```

Una respuesta correcta debe ser HTTP 200, JSON de jugador y un header `X-Cache`.

Haz una segunda consulta al mismo tag. Normalmente debe pasar de `MISS` a `HIT`.

## API oficial

La URL usada por el backend es:

```
https://api.brawlstars.com/v1/players/%23PLAYER_TAG
```

La autorización se envía únicamente desde el servidor:

```
Authorization: Bearer <BRAWL_API_TOKEN>
```
