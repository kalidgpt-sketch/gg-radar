// Configuración pública del frontend. Nunca pongas BRAWL_API_TOKEN aquí.
window.GG_RADAR_API_BASE = 'https://gg-radar-api-kalid577.fly.dev';

// Infraestructura publicitaria preparada, pero DESACTIVADA.
// El loader exige TODOS los readiness gates antes de contactar con AdSense.
window.GG_RADAR_ADS = Object.freeze({
  enabled: false,
  client: '',
  provider: 'adsense',
  cmp: 'google',
  readiness: Object.freeze({
    productionDomainReady: false,
    siteApproved: false,
    cmpConfigured: false,
    adsTxtPublished: false
  }),
  activeZones: ['after-changes', 'between-tools'],
  slots: Object.freeze({
    'after-changes': '',
    'between-tools': '',
    'after-account': ''
  })
});
