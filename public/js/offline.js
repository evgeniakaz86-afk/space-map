async function enableOffline() {
  const id = (document.getElementById('mapId')?.value ||
    new URLSearchParams(location.search).get('map') || '').trim();
  if (!id) return alert('Введите ID карты');
  try {
    const r = await fetch('/api/maps/' + id + '/offline-bundle');
    const bundle = await r.json();
    const cache = await caches.open('spacemap-v1');
    await cache.put('/offline/' + id + '.json', new Response(JSON.stringify(bundle)));
    if (bundle.plan_url) await cache.add(bundle.plan_url);
    for (const p of bundle.panoramas || []) await cache.add(p.url);
    alert('Карта сохранена офлайн');
  } catch (e) {
    alert('Не удалось сохранить офлайн');
  }
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('js/sw.js').catch(() => {});
  });
}