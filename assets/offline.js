'use strict';

// Local file previews still work; offline installation needs HTTPS or localhost.
if ('serviceWorker' in navigator && ['http:', 'https:'].includes(location.protocol)) {
  window.addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' });
      const showUpdate = () => { document.getElementById('updateNotice').hidden = false; };
      if (registration.waiting) showUpdate();
      registration.addEventListener('updatefound', () => {
        const installing = registration.installing;
        if (!installing) return;
        installing.addEventListener('statechange', () => {
          if (installing.state === 'installed' && navigator.serviceWorker.controller) showUpdate();
        });
      });
      await navigator.serviceWorker.ready;
      document.getElementById('offlineStatus').textContent = 'オフライン利用可 · A–Z';
    } catch {
      // Storage restrictions must never prevent the practice app from working.
      document.getElementById('offlineStatus').textContent = '国際モールス · A–Z';
    }
  });
}
