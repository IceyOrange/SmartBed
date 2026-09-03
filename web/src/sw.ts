// PWA：注册 Service Worker，让「加到主屏」后离线也能打开应用外壳。
// 只在生产环境（非 dev）注册；dev 里 SW 会缓存带时间戳的热更新资源，干扰调试。

export function registerServiceWorker(): void {
  if (!("serviceWorker" in navigator)) return;
  const isDev =
    location.hostname === "localhost" ||
    location.hostname === "127.0.0.1" ||
    // Vite 生产预览等本机端口
    import.meta.env.DEV;
  if (isDev) return;

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // 注册失败不阻塞主流程：离线缓存本就是渐进增强。
    });
  });
}