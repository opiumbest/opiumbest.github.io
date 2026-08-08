// work with firefox
if (navigator.userAgent.includes("Firefox")) {
	Object.defineProperty(globalThis, "crossOriginIsolated", {
		value: true,
		writable: false,
	});
}

const devMode = ["localhost", "127.0.0.1", "ngrok-free"].includes(location.hostname.split(".").at(-2) || location.hostname);

function getAsset(path) {
    return devMode ? `${location.protocol}//${location.hostname}:${location.port}/stuff/${path}` : "https://cdn.jsdelivr.net/gh/TongSherbet/storage/" + path;
}

importScripts(getAsset("jet/jet.sw.js"));

// apparently this makes it faster idek
self.addEventListener('install', () => {
  void self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

// cleanup when scramjet fucks up
self.addEventListener("error", function (event) {
    if (isIdbNotFound(event.error ?? event)) {
        try { event.preventDefault(); } catch {}
        cleanup();
    }
});

self.addEventListener("unhandledrejection", function (event) {
    if (isIdbNotFound(event.reason ?? event)) {
        try { event.preventDefault(); } catch {}
        cleanup();
    }
});

function isIdbNotFound(e) {
  const s = (e?.message ?? String(e)) || "";
  if (!/NotFound/i.test(s)) return false;
  if (/cache/i.test(s)) return false;   // cache plugin's NotFoundError
  return /IDB|IndexedDB|IDBDatabase|IDBObjectStore|'transaction' on|'open' on|deleteDatabase|object store/i.test(s);
}

async function cleanup() {
	try {
        const forceDelDb = (name) => new Promise((res) => {
            const open = indexedDB.open(name);
            open.onsuccess = () => { open.result.close(); deleteTs(); };
            open.onerror = deleteTs;
            const deleteTs = () => {
                const req = indexedDB.deleteDatabase(name);
                req.onsuccess = req.onerror = req.onblocked = res;
            }
        });

        await forceDelDb('__scramjet_controller');

        const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
		const names = await caches.keys();
		await Promise.all(names.map(name => caches.delete(name)));

		await self.registration.unregister();

		for (const client of clients) client.navigate(client.url);

		console.log("[sw] attempted to fix self");
	} catch (err) {
		console.error("failed to fix:", err);
	}
}

// intercept all HTTP requests for da stuff
self.addEventListener("fetch", (event) => {
    event.respondWith((async () => {
        // proxy thru scramjet
        try {
            if ($scramjetController.shouldRoute(event)) {
                return await $scramjetController.route(event);
            }
        } catch (e) {
            if (isIdbNotFound(e)) {
                cleanup();
            }
        }

        // normal request
        return fetch(event.request);
    })());
});
