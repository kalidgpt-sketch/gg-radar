# GG Radar

GG Radar es una web de herramientas para jugadores de Brawl Stars. Su foco es responder qué cambió desde la última vez que jugaste, cómo afecta a tu cuenta y qué mejoras pueden tener más sentido según tu progreso.

## Producción

Frontend:
- GitHub Pages
- `site/index.html`
- `site/styles.css`
- `site/data.js`
- `site/app.js`
- `site/config.js`

Backend:
- Fly.io
- `backend/server.mjs`
- La clave oficial de Brawl Stars se guarda exclusivamente como `BRAWL_API_TOKEN` en el hosting.
- El frontend nunca debe contener el token.

## Funciones actuales

- Cambios desde una fecha elegida.
- Filtros de buffs, nerfs y ajustes.
- Último parche.
- Calculadora de mejoras.
- Analizador de cuenta en modo DEMO.
- Estadísticas de cuenta, progreso, recursos estimados y prioridades de mejora.
- Backend preparado para Player Tags reales.
- `robots.txt` y `sitemap.xml`.
- Páginas de privacidad, cookies y sobre GG Radar.

## Player Tags reales

Flujo previsto:

```
GitHub Pages
  -> backend GG Radar en Fly.io
  -> API oficial de Brawl Stars
```

Pendiente de producción:
1. Añadir método de pago a Fly.io.
2. Asignar IP de salida estática.
3. Crear una API key en Brawl Stars Developer permitiendo esa IP.
4. Guardar la key como secreto `BRAWL_API_TOKEN` en Fly.
5. Probar Player Tags reales.

## Publicidad

Los huecos de publicidad actuales son marcadores visuales. Google AdSense no está activo.

Antes de activarlo:
- producto principal funcionando;
- contenido suficiente;
- páginas legales publicadas;
- cuenta AdSense aprobada;
- CMP certificada por Google cuando corresponda para tráfico del EEE/Reino Unido/Suiza;
- `ads.txt` real con el publisher ID proporcionado por AdSense.

Ver `site/ADSENSE.md`.

## Despliegue

Cada push a `main` ejecuta GitHub Actions. El workflow comprueba el backend, valida el JavaScript de producción, comprueba enlaces internos y despliega en GitHub Pages.

Proyecto de fans no oficial y no respaldado por Supercell. Brawl Stars y Supercell son marcas de sus respectivos propietarios.
