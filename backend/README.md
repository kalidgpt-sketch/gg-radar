# API segura de Brawl Stars para GG Radar

GG Radar no llama a la API de Supercell desde el navegador. El flujo es:

```
GitHub Pages -> backend GG Radar -> api.brawlstars.com
```

La clave `BRAWL_API_TOKEN` vive únicamente como secreto del backend.

## Despliegue recomendado para el MVP: Fly.io

El motivo es que la API oficial de Brawl Stars exige autorizar la IP que hace las peticiones. Fly.io permite asignar una IP de salida estática al backend.

1. Instala `flyctl` e inicia sesión.
2. Entra en la carpeta `backend/`.
3. Crea la app sin desplegar:
   `fly launch --no-deploy`
4. Conserva el `fly.toml` de esta carpeta y usa una región disponible, por ejemplo `cdg`.
5. Despliega:
   `fly deploy`
6. Asigna IP de salida estática:
   `fly ips allocate-egress --app <tu-app> -r cdg`
7. Consulta las IPs:
   `fly ips list --app <tu-app>`
8. En https://developer.brawlstars.com crea una API key y añade como IP permitida la IPv4 de salida asignada por Fly.io.
9. Guarda el token como secreto:
   `fly secrets set BRAWL_API_TOKEN='<token>' --app <tu-app>`
10. Comprueba:
   `https://<tu-app>.fly.dev/health`
11. Edita `site/config.js`:
   `window.GG_RADAR_API_BASE = 'https://<tu-app>.fly.dev';`

Nunca copies el token en `site/config.js`, HTML, JavaScript del frontend o GitHub Pages.

## Protecciones incluidas

- CORS restringido a `https://kalidgpt-sketch.github.io`.
- Token solo por variable de entorno.
- Validación estricta del Player Tag.
- Límite básico de peticiones por IP.
- Caché de 2 minutos para reducir llamadas a Supercell.
- Timeout de 6,5 segundos.
- El navegador recibe solo los campos de jugador que GG Radar necesita.
- El token no se escribe en logs ni respuestas.
