(() => {
  const cfg = window.GG_RADAR_ADS || {};
  if (cfg.enabled !== true) return;

  const client = String(cfg.client || '').trim();
  if (!/^ca-pub-\d+$/.test(client)) {
    console.warn('GG Radar Ads: falta un AdSense client válido.');
    return;
  }

  const activeZones = new Set(Array.isArray(cfg.activeZones) ? cfg.activeZones : []);
  const slots = cfg.slots || {};
  const zones = [...document.querySelectorAll('[data-ad-zone]')]
    .filter((zone) => activeZones.has(zone.dataset.adZone))
    .filter((zone) => String(slots[zone.dataset.adZone] || '').trim());

  if (!zones.length) {
    console.warn('GG Radar Ads: no hay zonas activas con slot ID.');
    return;
  }

  document.documentElement.classList.add('ads-enabled');

  const privacyButton = document.querySelector('#privacyChoices');
  if (privacyButton) {
    privacyButton.hidden = false;
    privacyButton.addEventListener('click', () => {
      window.googlefc = window.googlefc || {};
      window.googlefc.callbackQueue = window.googlefc.callbackQueue || [];
      window.googlefc.callbackQueue.push(window.googlefc.showRevocationMessage);
    });
  }

  const mountAds = () => {
    for (const zone of zones) {
      const container = zone.querySelector('[data-ad-container]');
      if (!container) continue;

      zone.hidden = false;
      container.replaceChildren();

      const ad = document.createElement('ins');
      ad.className = 'adsbygoogle';
      ad.setAttribute('data-ad-client', client);
      ad.setAttribute('data-ad-slot', String(slots[zone.dataset.adZone]));
      ad.setAttribute('data-ad-format', 'auto');
      ad.setAttribute('data-full-width-responsive', 'true');
      container.appendChild(ad);

      (window.adsbygoogle = window.adsbygoogle || []).push({});
    }
  };

  const script = document.createElement('script');
  script.async = true;
  script.crossOrigin = 'anonymous';
  script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(client)}`;
  script.addEventListener('load', mountAds, { once: true });
  script.addEventListener('error', () => console.warn('GG Radar Ads: no se pudo cargar AdSense.'), { once: true });
  document.head.appendChild(script);
})();
