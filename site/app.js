(() => {
  const D = window.GGRadarData;
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  let currentFilter = 'all';
  let activeChanges = [];

  const esc = (v='') => String(v).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const fmt = n => new Intl.NumberFormat('es-ES').format(n);
  const toDate = s => new Date(`${s}T12:00:00`);
  const daysBetween = (a,b) => Math.max(0, Math.floor((toDate(b)-toDate(a))/86400000));

  const menuBtn = $('#menuBtn');
  const nav = $('.nav');
  menuBtn?.addEventListener('click', () => {
    const open = nav.classList.toggle('open');
    menuBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
  });
  $$('.nav a').forEach(a => a.addEventListener('click', () => nav.classList.remove('open')));

  function flattenSince(dateStr){
    return D.patches.filter(p => p.date > dateStr).flatMap(p => p.changes.map(c => ({...c, patchDate:p.date, patchLabel:p.label, source:p.source})));
  }

  function renderChanges(){
    const q = ($('#brawlerSearch')?.value || '').trim().toLocaleLowerCase('es');
    const list = activeChanges.filter(c => (currentFilter === 'all' || c.type === currentFilter) && (!q || c.name.toLocaleLowerCase('es').includes(q)));
    const el = $('#changesList');
    if(!list.length){ el.innerHTML = '<div class="empty-state">No hay cambios que coincidan con este filtro.</div>'; return; }
    el.innerHTML = list.map(c => `
      <article class="change-card">
        <div class="change-head"><h3>${esc(c.name)}</h3><small>${esc(c.patchLabel)}</small><a class="source-link" target="_blank" rel="noopener" href="${esc(c.source)}">Fuente oficial ↗</a></div>
        <div class="change-details">${c.details.map(x=>`<div class="change-detail">${esc(x)}</div>`).join('')}</div>
        <span class="pill ${esc(c.type)}">${c.type === 'buff' ? 'Buff' : c.type === 'nerf' ? 'Nerf' : 'Ajuste'}</span>
      </article>`).join('');
  }

  function scan(dateStr){
    if(!dateStr) return;
    activeChanges = flattenSince(dateStr);
    const buffs = activeChanges.filter(c=>c.type==='buff').length;
    const nerfs = activeChanges.filter(c=>c.type==='nerf').length;
    const adjust = activeChanges.filter(c=>c.type==='adjust').length;
    const patches = new Set(activeChanges.map(c=>c.patchDate)).size;
    $('#buffCount').textContent = buffs; $('#nerfCount').textContent = nerfs; $('#adjustCount').textContent = adjust; $('#patchCount').textContent = patches;
    $('#resultTitle').textContent = activeChanges.length ? `${activeChanges.length} cambios registrados` : 'Sin cambios registrados';
    $('#resultSubtitle').textContent = `Desde el ${toDate(dateStr).toLocaleDateString('es-ES',{day:'numeric',month:'long',year:'numeric'})} · ${daysBetween(dateStr,D.reviewedAt)} días hasta la revisión actual`;
    $('#changesResult').classList.remove('hidden');
    currentFilter='all'; $$('.filter').forEach(x=>x.classList.toggle('active',x.dataset.filter==='all'));
    renderChanges();
  }

  $('#scanChanges')?.addEventListener('click',()=>scan($('#lastPlayed').value));
  $('#setMonth')?.addEventListener('click',()=>{ $('#lastPlayed').value='2026-06-24'; scan('2026-06-24'); });
  $('#brawlerSearch')?.addEventListener('input',renderChanges);
  $$('.filter').forEach(btn=>btn.addEventListener('click',()=>{ currentFilter=btn.dataset.filter; $$('.filter').forEach(x=>x.classList.toggle('active',x===btn)); renderChanges(); }));

  const latest = D.patches[0];
  const latestCards = [...latest.changes].sort((a,b)=>({nerf:0,buff:1,adjust:2}[a.type]-({nerf:0,buff:1,adjust:2}[b.type]))).slice(0,9);
  $('#latestPatch').innerHTML = latestCards.map(c=>`<article class="patch-card ${esc(c.type)}"><div class="top"><h3>${esc(c.name)}</h3><span class="pill ${esc(c.type)}">${c.type==='buff'?'Buff':c.type==='nerf'?'Nerf':'Ajuste'}</span></div><ul>${c.details.slice(0,3).map(d=>`<li>${esc(d)}</li>`).join('')}</ul></article>`).join('');

  const from=$('#levelFrom'), to=$('#levelTo');
  for(let i=1;i<=11;i++){ from.add(new Option(`Nivel ${i}`,i)); to.add(new Option(`Nivel ${i}`,i)); }
  from.value='1';to.value='11';
  function calc(){
    const a=+from.value,b=+to.value;
    if(b<=a){ $('#coinsResult').textContent='0'; $('#ppResult').textContent='0'; $('#calcNote').textContent='El nivel objetivo debe ser superior al actual.'; $('#levelTrackLabel').textContent=`Nivel ${a} → ${b}`; $('#levelTrackFill').style.width='0%'; return; }
    let coins=0,pp=0; for(let lvl=a+1;lvl<=b;lvl++){ coins+=D.upgradeCosts[lvl].coins; pp+=D.upgradeCosts[lvl].pp; }
    $('#coinsResult').textContent=fmt(coins); $('#ppResult').textContent=fmt(pp); $('#levelTrackLabel').textContent=`Nivel ${a} → ${b}`; $('#levelTrackFill').style.width=`${((b-a)/10)*100}%`;
    $('#calcNote').textContent='Coste de subir únicamente niveles de fuerza; no incluye gadgets, habilidades estelares, refuerzos, hipercargas o buffies.';
  }
  $('#calcUpgrade')?.addEventListener('click',calc); from.addEventListener('change',()=>{if(+to.value<=+from.value)to.value=String(Math.min(11,+from.value+1));calc()});to.addEventListener('change',calc);calc();

  function upgradeNeed(power,target=11){
    let coins=0,pp=0;
    const from=Math.max(1,Math.min(11,Number(power)||1));
    for(let lvl=from+1;lvl<=target;lvl++){
      const step=D.upgradeCosts[lvl];
      if(step){ coins+=step.coins; pp+=step.pp; }
    }
    return {coins,pp};
  }

  function latestChangeFor(name){
    return D.patches[0]?.changes?.find(c=>c.name.toLowerCase()===String(name||'').toLowerCase()) || null;
  }

  function priorityFor(b){
    const power=Number(b.power)||1;
    const trophies=Number(b.trophies)||0;
    const need=upgradeNeed(power,11);
    const change=latestChangeFor(b.name);
    let score=0;
    const reasons=[];

    if(power===10){ score+=34; reasons.push('Está a un solo nivel del máximo'); }
    else if(power===9){ score+=25; reasons.push('Ya está cerca del tramo final'); }
    else if(power===8){ score+=19; reasons.push('Una mejora abre el nivel 9'); }
    else if(power===7){ score+=15; reasons.push('Tiene una base de progreso sólida'); }
    else { score+=Math.max(4,power); reasons.push('Tiene margen claro de progresión'); }

    if(trophies>=850){ score+=28; reasons.push(`${fmt(trophies)} trofeos: parece uno de tus brawlers más usados`); }
    else if(trophies>=700){ score+=21; reasons.push(`${fmt(trophies)} trofeos: uso alto en tu cuenta`); }
    else if(trophies>=500){ score+=13; reasons.push(`${fmt(trophies)} trofeos: uso relevante`); }
    else { score+=Math.round(trophies/80); }

    if(need.coins<=2800){ score+=20; reasons.push('El salto a nivel 11 tiene un coste relativamente corto'); }
    else if(need.coins<=4675){ score+=14; }
    else if(need.coins<=5925){ score+=9; }
    else { score+=4; }

    if(change?.type==='buff'){ score+=24; reasons.unshift('Recibió un buff en el último parche'); }
    else if(change?.type==='nerf'){ score-=10; reasons.push('Recibió un nerf reciente; conviene revisar cómo se siente antes de gastar'); }
    else if(change?.type==='adjust'){ score+=4; reasons.push('Recibió un ajuste en el último parche'); }

    const high=Number(b.highestTrophies)||0;
    if(high && high-trophies>=100){ reasons.push(`Está ${fmt(high-trophies)} trofeos por debajo de su máximo personal`); }

    return {b,score,need,change,reasons:reasons.slice(0,3)};
  }

  function renderProfile(p){
    const brawlers=Array.isArray(p.brawlers)?p.brawlers:[];
    const latestNames=new Set((D.patches[0]?.changes||[]).map(c=>c.name.toLowerCase()));
    const affected=brawlers.filter(b=>latestNames.has(String(b.name).toLowerCase())).slice(0,6);
    const avgPower=brawlers.length?(brawlers.reduce((s,b)=>s+(Number(b.power)||0),0)/brawlers.length).toFixed(1):'—';
    const avgTrophies=brawlers.length?Math.round(brawlers.reduce((s,b)=>s+(Number(b.trophies)||0),0)/brawlers.length):0;
    const maxed=brawlers.filter(b=>Number(b.power)===11).length;
    const nearMax=brawlers.filter(b=>Number(b.power)>=9&&Number(b.power)<11).length;
    const developing=brawlers.filter(b=>Number(b.power)<9).length;
    const progress=brawlers.length?Math.round((brawlers.reduce((s,b)=>s+(Number(b.power)||1),0)/(brawlers.length*11))*100):0;

    const totalNeed=brawlers.reduce((acc,b)=>{
      const n=upgradeNeed(b.power,11);
      acc.coins+=n.coins; acc.pp+=n.pp;
      return acc;
    },{coins:0,pp:0});

    const priorities=brawlers
      .filter(b=>Number(b.power)<11)
      .map(priorityFor)
      .sort((a,b)=>b.score-a.score || Number(b.b.trophies)-Number(a.b.trophies))
      .slice(0,5);

    const exp=p.expLevel!=null?`<div class="profile-stat"><strong>${fmt(p.expLevel)}</strong><small>Nivel de experiencia</small></div>`:'';
    const wins=p['3vs3Victories']!=null?`<div class="profile-stat"><strong>${fmt(p['3vs3Victories'])}</strong><small>Victorias 3v3</small></div>`:'';

    $('#accountResult').innerHTML = `
      <div class="profile-head">
        <div><h3>${esc(p.name||'Jugador')}</h3><span class="profile-tag">${esc(p.tag||'')}</span></div>
        <span class="trophy">🏆 ${fmt(p.trophies||0)}</span>
      </div>

      <div class="profile-stats">
        <div class="profile-stat"><strong>${fmt(p.highestTrophies||p.trophies||0)}</strong><small>Máximo de trofeos</small></div>
        <div class="profile-stat"><strong>${esc(avgPower)}</strong><small>Nivel medio</small></div>
        <div class="profile-stat"><strong>${maxed}</strong><small>Brawlers nivel 11</small></div>
        <div class="profile-stat"><strong>${brawlers.length}</strong><small>Brawlers detectados</small></div>
        <div class="profile-stat"><strong>${fmt(avgTrophies)}</strong><small>Trofeos / brawler</small></div>
        ${exp}${wins}
      </div>

      <div class="progress-panel">
        <div class="progress-top"><div><small>PROGRESO DE POTENCIA</small><strong>${progress}% hacia nivel 11</strong></div><span>${maxed}/${brawlers.length||0} al máximo</span></div>
        <div class="account-progress"><span style="width:${progress}%"></span></div>
        <div class="progress-meta">
          <div><b>${maxed}</b><small>Nivel 11</small></div>
          <div><b>${nearMax}</b><small>Niveles 9–10</small></div>
          <div><b>${developing}</b><small>Niveles 1–8</small></div>
        </div>
      </div>

      <h4 class="account-section-title">Recursos para llevar tu cuenta detectada a nivel 11</h4>
      <div class="resource-summary">
        <div class="resource-mini"><strong>🪙 ${fmt(totalNeed.coins)}</strong><small>Monedas de mejora de nivel</small></div>
        <div class="resource-mini"><strong>◆ ${fmt(totalNeed.pp)}</strong><small>Puntos de fuerza</small></div>
      </div>
      <p class="account-note">Estimación basada solo en niveles de fuerza. No incluye gadgets, habilidades estelares, gears, hipercargas o buffies. La API no nos dice cuántas monedas o puntos de fuerza tienes, por lo que mostramos lo que necesitarías, no si puedes pagarlo ahora.</p>

      <h4 class="account-section-title">Prioridades de mejora</h4>
      <div class="priority-list">
        ${priorities.length?priorities.map((x,i)=>`
          <div class="priority-card">
            <span class="priority-rank">#${i+1}</span>
            <div>
              <h5>${esc(x.b.name)} · Nivel ${Number(x.b.power)||1} · 🏆 ${fmt(x.b.trophies||0)}</h5>
              <p>${x.reasons.map(esc).join(' · ')}</p>
              ${x.change?`<span class="patch-impact ${esc(x.change.type)}">${x.change.type==='buff'?'↑ Buff reciente':x.change.type==='nerf'?'↓ Nerf reciente':'↻ Ajuste reciente'}</span>`:''}
            </div>
            <div class="priority-cost"><b>→ Nv. 11</b>🪙 ${fmt(x.need.coins)}<br>◆ ${fmt(x.need.pp)}</div>
          </div>`).join(''):'<p class="source-link">Todos los brawlers detectados ya están al nivel 11.</p>'}
      </div>
      <p class="account-note">La prioridad es una heurística de GG Radar, no una tier list: combina tu nivel actual, trofeos, coste restante y cambios recientes. No intenta adivinar el meta competitivo.</p>

      <div class="affected"><h4>Afectados por el último parche</h4>
        ${affected.length ? affected.map(b=>{const ch=latestChangeFor(b.name);return `<div class="affected-row"><b>${esc(b.name)} · Nv. ${b.power}</b><span class="patch-impact ${esc(ch.type)}">${ch.type==='buff'?'↑ Buff':ch.type==='nerf'?'↓ Nerf':'↻ Ajuste'}</span></div>`}).join('') : '<p class="source-link">No encontramos coincidencias entre tus brawlers y nuestra selección de cambios principales del último parche.</p>'}
      </div>
    `;
  }

  async function analyze(){
    const raw=$('#playerTag').value.trim(); const tag=raw.replace(/^#/,'').toUpperCase();
    if(!tag){return}
    const btn=$('#analyzeAccount'); const old=btn.textContent; btn.disabled=true;btn.textContent='Consultando…';
    try{
      if(tag==='DEMO'){ renderProfile(D.demoProfile); return; }
      const apiBase=(window.GG_RADAR_API_BASE||'').replace(/\/$/,'');
      if(!apiBase) throw new Error('El backend seguro todavía no está configurado.');
      const r=await fetch(`${apiBase}/api/player?tag=${encodeURIComponent(tag)}`,{headers:{'accept':'application/json'}});
      const body=await r.json().catch(()=>({}));
      if(!r.ok) throw new Error(body.message || 'No se pudo consultar la cuenta.');
      renderProfile(body);
    }catch(err){
      $('#accountResult').innerHTML=`<div class="account-empty"><span>!</span><h3>API no conectada</h3><p>${esc(err.message || 'Configura BRAWL_API_TOKEN en el hosting para consultar tags reales.')} Puedes probar con <b>DEMO</b>.</p></div>`;
    }finally{btn.disabled=false;btn.textContent=old}
  }
  $('#analyzeAccount')?.addEventListener('click',analyze);
  $('#playerTag')?.addEventListener('keydown',e=>{if(e.key==='Enter')analyze()});

  scan($('#lastPlayed').value);
})();
