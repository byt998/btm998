// PWA update flow:
// - detect waiting service worker
// - show "new version" banner
// - activate on demand (SKIP_WAITING)
// - reload app on controllerchange

(() => {
  if (!('serviceWorker' in navigator)) {
    return;
  }

  const RELOAD_FLAG_KEY = 'pwa:reload-on-controllerchange';
  const PROMPTED_VERSION_KEY = 'pwa:prompted-update-version';

  const swUrl = new URL('sw.js', window.location.href);
  let registrationRef = null;
  let waitingWorker = null;
  let isRefreshing = false;

  const banner = createUpdateBanner();

  navigator.serviceWorker
    .register(swUrl, { scope: './' })
    .then((registration) => {
      registrationRef = registration;
      monitorRegistration(registration);
      maybeShowUpdate(registration);
      // One explicit check on startup is enough; avoid aggressive update loops.
      triggerUpdateCheck();
    })
    .catch((error) => {
      console.warn('Service Worker registration failed:', error);
    });

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (isRefreshing) return;
    const shouldReload = sessionStorage.getItem(RELOAD_FLAG_KEY) === '1';
    if (!shouldReload) {
      return;
    }
    isRefreshing = true;
    sessionStorage.removeItem(RELOAD_FLAG_KEY);
    window.location.reload();
  });

  function monitorRegistration(registration) {
    registration.addEventListener('updatefound', () => {
      const installing = registration.installing;
      if (!installing) return;

      installing.addEventListener('statechange', () => {
        if (installing.state === 'installed' && navigator.serviceWorker.controller) {
          maybeShowUpdate(registration);
        }
      });
    });
  }

  async function maybeShowUpdate(registration) {
    const waiting = registration?.waiting;
    if (!waiting || waiting.state === 'redundant') {
      return;
    }

    const waitingVersion = await getWorkerVersion(waiting);
    const activeVersion = await getWorkerVersion(navigator.serviceWorker.controller);

    // If both workers report same version, do not show a fake update banner.
    if (waitingVersion && activeVersion && waitingVersion === activeVersion) {
      return;
    }

    const promptId = waitingVersion || `${waiting.scriptURL}|${waiting.state}`;
    if (sessionStorage.getItem(PROMPTED_VERSION_KEY) === promptId) {
      return;
    }
    sessionStorage.setItem(PROMPTED_VERSION_KEY, promptId);

    waitingWorker = waiting;
    banner.show(waitingVersion);
  }

  function triggerUpdateCheck() {
    registrationRef?.update().catch(() => {});
  }

  function getWorkerVersion(worker) {
    if (!worker) {
      return Promise.resolve('');
    }

    return new Promise((resolve) => {
      let done = false;
      const timeout = setTimeout(() => {
        if (done) return;
        done = true;
        resolve('');
      }, 1200);

      try {
        const channel = new MessageChannel();
        channel.port1.onmessage = (event) => {
          if (done) return;
          done = true;
          clearTimeout(timeout);
          const version = event.data?.version;
          resolve(typeof version === 'string' ? version : '');
        };
        worker.postMessage({ type: 'GET_VERSION' }, [channel.port2]);
      } catch (_) {
        if (done) return;
        done = true;
        clearTimeout(timeout);
        resolve('');
      }
    });
  }

  function createUpdateBanner() {
    const root = document.createElement('div');
    root.hidden = true;
    root.style.position = 'fixed';
    root.style.left = '12px';
    root.style.right = '12px';
    root.style.bottom = 'calc(12px + env(safe-area-inset-bottom, 0px))';
    root.style.zIndex = '4000';
    root.style.border = '1px solid rgba(56, 189, 248, 0.35)';
    root.style.borderRadius = '12px';
    root.style.background = 'rgba(15, 23, 42, 0.96)';
    root.style.boxShadow = '0 12px 28px rgba(0, 0, 0, 0.35)';
    root.style.padding = '12px';
    root.style.display = 'grid';
    root.style.gridTemplateColumns = '1fr auto';
    root.style.gap = '10px';
    root.style.alignItems = 'center';

    const text = document.createElement('div');
    text.textContent = 'Nowa wersja aplikacji jest dostepna';
    text.style.color = '#e2e8f0';
    text.style.fontSize = '14px';
    text.style.fontWeight = '600';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = 'Odswiez';
    btn.style.minHeight = '40px';
    btn.style.padding = '8px 14px';
    btn.style.borderRadius = '10px';
    btn.style.border = '1px solid rgba(56, 189, 248, 0.45)';
    btn.style.background = 'linear-gradient(135deg, #38bdf8, #0ea5e9)';
    btn.style.color = '#0f172a';
    btn.style.fontWeight = '700';
    btn.style.cursor = 'pointer';

    btn.addEventListener('click', () => {
      if (!waitingWorker) {
        triggerUpdateCheck();
        return;
      }
      btn.disabled = true;
      btn.textContent = 'Aktualizacja...';
      sessionStorage.setItem(RELOAD_FLAG_KEY, '1');
      waitingWorker.postMessage({ type: 'SKIP_WAITING' });
    });

    root.appendChild(text);
    root.appendChild(btn);
    document.body.appendChild(root);

    return {
      show(version = '') {
        text.textContent = version
          ? `Nowa wersja aplikacji jest dostepna (${version})`
          : 'Nowa wersja aplikacji jest dostepna';
        root.hidden = false;
      },
    };
  }
})();
