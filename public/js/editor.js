let mapId = null, pendingPoint = null;

const api = async (u, o = {}) => {
  const r = await fetch(u, o);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
};

async function loadMaps() {
  const maps = await api('/api/maps/mine');
  mapList.innerHTML = maps.map(m =>
    `<li><a href="#" onclick="openMap('${m.id}','${m.title.replace(/'/g, '')}')">${m.title}</a> ${m.published ? '✅' : ''}</li>`
  ).join('');
}
async function createMap() {
  await api('/api/maps', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: title.value || 'Карта', floors: +floors.value || 1 })
  });
  loadMaps();
}
function openMap(id, t) {
  mapId = id; curTitle.textContent = t; editor.hidden = false; refresh();
}

async function refresh() {
  let d = null;
  try { d = await api('/api/public/maps/' + mapId); } catch {}
  if (d?.plan_url) { planImg.src = d.plan_url; }
  overlay.innerHTML = '';
  (d?.points || []).forEach(pt => {
    if (pt.floor !== (+floorIn.value || 1)) return;
    const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    c.setAttribute('cx', pt.x); c.setAttribute('cy', pt.y); c.setAttribute('r', 12);
    if (pt.wifi) c.classList.add('wifi');
    c.onclick = () => {
      if (confirm('Удалить ' + pt.name + '?'))
        api('/api/points/' + pt.id, { method: 'DELETE' }).then(refresh);
    };
    overlay.appendChild(c);
  });
  bList.innerHTML = (d?.buildings || [])
    .map(b => `<li>${b.name} — ${b.plan_url ? 'план есть' : 'нет плана'}</li>`).join('');
}

function uploadPlan() {
  const f = planFile.files[0]; if (!f) return;
  const fd = new FormData(); fd.append('plan', f);
  api('/api/maps/' + mapId + '/plan', { method: 'POST', body: fd }).then(refresh);
}
function autoPlan() {
  const f = autoFile.files[0]; if (!f) return;
  const fd = new FormData(); fd.append('image', f);
  api('/api/maps