# Plan técnico de anuncios — GG Radar

Estado: **preparado, no activado**.

La regla operativa es simple: ningún script de AdSense se carga mientras `window.GG_RADAR_ADS.enabled` siga en `false`.

## 1. Arquitectura de monetización

### Lanzamiento: 2 unidades manuales

| Zona | ID técnico | Ubicación | Estado inicial |
|---|---|---|---|
| A | `after-changes` | Después de la herramienta “¿Qué cambió desde que jugaste?” y antes del último parche | Activar primero |
| B | `between-tools` | Después del último parche y antes de la calculadora | Activar primero |
| C | `after-account` | Después del analizador de cuenta | Fase 2; desactivada al lanzamiento |

No se colocan anuncios:
- dentro del formulario del Player Tag;
- pegados al botón “Analizar cuenta”;
- dentro de resultados o tarjetas que parezcan controles;
- junto a navegación;
- como interstitial obligatorio antes de ver un resultado.

El objetivo es reducir clics accidentales y no confundir publicidad con controles o contenido.

### Estrategia inicial

Usar **unidades Display responsive manuales** y mantener Auto Ads desactivado durante el lanzamiento. Esto da control sobre UX y permite medir cada zona por separado.

La zona C solo se activa si:
- la sesión media tiene suficiente profundidad;
- no perjudica el uso del analizador;
- las zonas A/B ya tienen datos suficientes.

## 2. Implementación ya preparada

### `site/config.js`

```js
window.GG_RADAR_ADS = {
  enabled: false,
  client: '',
  provider: 'adsense',
  cmp: 'google',
  activeZones: ['after-changes', 'between-tools'],
  slots: {
    'after-changes': '',
    'between-tools': '',
    'after-account': ''
  }
};
```

Mientras `enabled: false`:
- no se solicita JavaScript a Google Ads;
- no se inicializan unidades;
- las zonas están ocultas;
- no aparece el enlace de gestión de consentimiento.

### `site/ads.js`

El loader:
1. sale inmediatamente si Ads está desactivado;
2. exige un `ca-pub-...` válido;
3. solo monta zonas declaradas en `activeZones`;
4. exige un slot ID para cada zona;
5. carga el script oficial de AdSense solo después de pasar esos controles;
6. crea unidades responsive;
7. activa el acceso a “Configuración de privacidad y cookies”.

Esto es un feature flag de seguridad: preparar archivos no publica anuncios.

## 3. Consentimiento para Europa

### Solución elegida

Usar **Google CMP / Privacidad y mensajes** para el MVP, en vez de mantener una CMP propia.

Territorios:
- Espacio Económico Europeo;
- Reino Unido;
- Suiza.

Configuración prevista:
- mensaje de reglamentos europeos;
- tres opciones visibles: **Consentir / No consentir / Gestionar opciones**;
- proveedores publicitarios revisados en AdSense;
- enlace de revocación “Configuración de privacidad y cookies”;
- mantener la política de privacidad y cookies enlazada en el footer.

No crear un banner casero independiente: la CMP debe producir las señales TCF que AdSense espera.

### Consent Mode

No activarlo por necesidad de GG Radar mientras solo usemos AdSense. Revisarlo cuando integremos Google Analytics, Google Ads u otro producto de Google que necesite interpretar las señales de consentimiento.

## 4. ads.txt y dominio

### Bloqueo actual

La web vive actualmente en:

```
https://kalidgpt-sketch.github.io/gg-radar/
```

Google busca `ads.txt` en la **raíz del dominio**, no en la carpeta del proyecto.

Por tanto, no publicar:

```
https://kalidgpt-sketch.github.io/gg-radar/ads.txt
```

como solución definitiva.

### Decisión técnica

**Antes de activar AdSense, GG Radar debe tener dominio propio** (o una arquitectura donde controlemos realmente la raíz del dominio).

Ejemplo futuro:

```
https://ggradar.example/
https://ggradar.example/ads.txt
```

GitHub Pages admite un dominio personalizado, por lo que podemos seguir alojando el frontend allí.

### Archivo preparado

`site/ads.txt.example` es solo una plantilla y **no se despliega**.

Cuando AdSense entregue el publisher ID, crear el verdadero `ads.txt` con exactamente la línea que muestre la cuenta de AdSense, normalmente con la estructura:

```
google.com, pub-XXXXXXXXXXXXXXX, DIRECT, f08c47fec0942fa0
```

Nunca inventar el publisher ID.

## 5. Orden exacto de activación

### Gate 0 — producto

No pasar a monetización hasta que:
- Player Tags reales funcionen;
- la web tenga contenido/herramientas útiles y estables;
- privacidad, cookies y sobre GG Radar estén actualizados;
- el frontend sea usable en móvil;
- no existan errores graves de consola.

### Gate 1 — dominio

1. Elegir/comprar dominio.
2. Configurarlo en GitHub Pages.
3. Activar HTTPS.
4. Actualizar canonical, sitemap, robots, CORS del backend y URLs internas.
5. Confirmar que la raíz del dominio está bajo nuestro control.

### Gate 2 — alta en AdSense

1. Crear/usar la cuenta AdSense.
2. Añadir el dominio de producción a **Sitios**.
3. Verificar la propiedad usando el método que Google ofrezca.
4. Solicitar revisión.
5. **Mantener `GG_RADAR_ADS.enabled = false`.**

### Gate 3 — CMP antes de anuncios

En AdSense:
1. Ir a **Privacidad y mensajes**.
2. Abrir **Reglamentos europeos**.
3. Usar la CMP de Google.
4. Configurar el mensaje para EEE, Reino Unido y Suiza.
5. Preferir la configuración de tres botones.
6. Revisar proveedores de tecnología publicitaria.
7. Publicar el mensaje.
8. Confirmar que existe revocación de consentimiento.
9. Si está disponible, valorar “Maximize message coverage” como red de seguridad para solicitudes sin TC string.

Todavía mantener Ads desactivado.

### Gate 4 — ads.txt

Solo con un publisher ID real:
1. Copiar la línea que muestra AdSense.
2. Crear `site/ads.txt`.
3. Añadirlo al workflow de GitHub Pages.
4. Publicar.
5. Verificar manualmente:
   `https://DOMINIO/ads.txt`
6. Esperar a que AdSense lo detecte.

### Gate 5 — unidades manuales

1. Crear una unidad Display responsive para Zona A.
2. Crear otra unidad separada para Zona B.
3. Copiar sus slot IDs.
4. Rellenar en `config.js`:
   - `client`;
   - `slots['after-changes']`;
   - `slots['between-tools']`.
5. Mantener `after-account` vacío.
6. Comprobar que CMP + ads.txt + sitio aprobado están correctos.

### Gate 6 — encendido

Último cambio:

```js
enabled: true
```

Después verificar:
- EEE: aparece CMP cuando corresponde;
- aceptar: anuncios pueden cargarse;
- rechazar: se respeta la elección;
- “Gestionar opciones” funciona;
- revocación vuelve a abrir la CMP;
- ninguna unidad invade botones o navegación;
- móvil no tiene overflow;
- no hay layout shifts grandes;
- `ads.txt` responde 200;
- consola sin errores.

## 6. Observabilidad después del lanzamiento

Durante las primeras semanas mirar por zona:
- pageviews;
- impressions;
- viewability;
- RPM;
- CTR anómalo;
- cambios en uso del analizador;
- rebote / abandono antes de la herramienta;
- Core Web Vitals.

No optimizar por CTR de forma aislada: un CTR extraño puede indicar emplazamiento confuso o clic accidental.

## 7. Rollback

Si aparece un problema de políticas, UX o consentimiento:

```js
window.GG_RADAR_ADS.enabled = false;
```

Un despliegue con ese cambio apaga toda la carga de AdSense sin eliminar los huecos ni la configuración.

## 8. Archivos que NO existen todavía en producción

- `ads.txt` real: no existe hasta tener publisher ID y dominio final.
- publisher ID: vacío.
- slot IDs: vacíos.
- AdSense runtime: no se carga.
- CMP activa: se configurará desde AdSense cuando llegue el momento.
