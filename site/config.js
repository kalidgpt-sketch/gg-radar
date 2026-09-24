// Configuración pública del frontend. Nunca pongas BRAWL_API_TOKEN aquí.
window.GG_RADAR_API_BASE = 'https://gg-radar-api-kalid577.fly.dev';

// Infraestructura publicitaria preparada, pero DESACTIVADA.
// No pongas un publisher ID ni slot IDs hasta que:
// 1) el sitio esté aprobado en AdSense,
// 2) la CMP esté configurada,
// 3) ads.txt esté publicado en la raíz del dominio de producción.
window.GG_RADAR_ADS = Object.freeze({
  enabled: false,
  client: '',
  provider: 'adsense',
  cmp: 'google',
  activeZones: ['after-changes', 'between-tools'],
  slots: Object.freeze({
    'after-changes': '',
    'between-tools': '',
    'after-account': ''
  })
});
