/* Notificações do DNM&LTDA Lava Rápido (importado pelo service worker do PWA). */
self.addEventListener("push", (event) => {
  let dados = {};
  try {
    dados = event.data ? event.data.json() : {};
  } catch (_) {
    dados = { title: "DNM&LTDA Lava Rápido", body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    self.registration.showNotification(dados.title || "DNM&LTDA Lava Rápido", {
      body: dados.body || "",
      icon: "/icone-192.png",
      badge: "/icone-192.png",
      tag: dados.tag || undefined,
      data: { url: dados.url || "/" },
      vibrate: [200, 100, 200],
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || "/", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((janelas) => {
      for (const j of janelas) {
        if ("focus" in j) {
          j.navigate(url);
          return j.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
