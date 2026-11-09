import { RELEASE } from './release.js';

/** Updates only application caches. Learning data and the course key stay in localStorage. */
export class AppLifecycle {
  constructor({ navigator = globalThis.navigator, window = globalThis.window,
    document = globalThis.document, fetch = globalThis.fetch,
    MessageChannel = globalThis.MessageChannel, onChange = () => {}, beforeReload = () => true,
    release = RELEASE } = {}) {
    Object.assign(this, { navigator, window, document, fetch, MessageChannel, onChange, beforeReload, release });
    // Native browser fetch must not receive this controller as its receiver.
    this.fetch = (...args) => fetch(...args);
    this.state = { status: 'checking', offlineReady: false, installed: this.isStandalone(), release };
    this.registration = null;
    this.waiting = null;
    this.prompt = null;
    this.reloadReady = false;
    this.applying = false;
    this.lastCheck = 0;
    this.watched = new WeakSet();
  }

  isStandalone() {
    return Boolean(this.window.matchMedia?.('(display-mode: standalone)').matches || this.navigator.standalone);
  }

  change(values) {
    Object.assign(this.state, values);
    this.onChange({ ...this.state, canUpdate: Boolean(this.waiting || this.reloadReady), applying: this.applying });
  }

  async detectInstalled() {
    let installed = this.isStandalone();
    if (!installed && this.navigator.getInstalledRelatedApps) {
      try {
        const apps = await this.navigator.getInstalledRelatedApps();
        const manifest = new URL('./manifest.webmanifest', import.meta.url).href;
        installed = apps.some(app => app.platform === 'webapp' && app.url === manifest);
      } catch { /* Detection is optional; the installation instructions remain available. */ }
    }
    this.change({ installed });
  }

  async init() {
    this.window.addEventListener('beforeinstallprompt', event => {
      event.preventDefault();
      this.prompt = event;
      this.change({ installed: false });
    });
    this.window.addEventListener('appinstalled', () => {
      this.prompt = null;
      this.change({ installed: true });
    });
    this.window.matchMedia?.('(display-mode: standalone)').addEventListener?.('change', () => this.detectInstalled());
    this.window.addEventListener('online', () => this.check());
    this.document.addEventListener('visibilitychange', () => {
      if (!this.document.hidden) {
        this.detectInstalled();
        this.check({ automatic: true });
      }
    });
    this.detectInstalled();
    if (!this.navigator.serviceWorker) {
      await this.check();
      return;
    }
    this.navigator.serviceWorker.addEventListener('controllerchange', async () => {
      clearTimeout(this.applyTimer);
      await this.cacheStatus();
      if (this.applying) {
        if (this.beforeReload()) this.window.location.reload();
        else { this.applying = false; this.change({ status: 'ready' }); }
      }
    });
    try {
      this.registration = await this.navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' });
      this.registration.addEventListener('updatefound', () => this.watch(this.registration.installing));
      this.watch(this.registration.installing);
      this.captureWaiting();
      this.cacheStatus();
      this.navigator.storage?.persist?.().catch(() => {});
      await this.check();
    } catch {
      this.change({ status: 'unavailable' });
    }
  }

  captureWaiting() {
    const worker = this.registration?.waiting;
    if (worker && (this.navigator.serviceWorker?.controller || this.registration?.active)) {
      this.waiting = worker;
      this.change({ status: 'ready' });
    }
  }

  watch(worker) {
    if (!worker || this.watched.has(worker)) return;
    this.watched.add(worker);
    const changed = () => {
      if (worker.state === 'installing') this.change({ status: 'downloading' });
      if (worker.state === 'installed') {
        this.captureWaiting();
        this.cacheStatus();
      }
      if (worker.state === 'redundant' && !this.waiting) this.change({ status: 'failed' });
      if (worker.state === 'activated') {
        if (this.waiting === worker) this.waiting = null;
        this.cacheStatus();
      }
    };
    worker.addEventListener('statechange', changed);
    changed();
  }

  async cacheStatus() {
    const worker = this.navigator.serviceWorker?.controller || this.registration?.active;
    if (!worker) return;
    await new Promise(resolve => {
      const channel = new this.MessageChannel();
      const timer = setTimeout(() => { channel.port1.close(); resolve(); }, 3000);
      channel.port1.onmessage = event => {
        clearTimeout(timer);
        channel.port1.close();
        if (worker !== (this.navigator.serviceWorker?.controller || this.registration?.active)) { resolve(); return; }
        const { ready, version } = event.data || {};
        if (version) this.reloadReady = version !== this.release.version;
        const firstDownloadComplete = ready && version === this.release.version
          && this.remoteVersion === version && this.state.status === 'downloading'
          && !this.registration?.installing && !this.waiting;
        this.change({ offlineReady: ready === true,
          ...(this.reloadReady ? { status: 'ready' } : firstDownloadComplete ? { status: 'current' } : {}) });
        resolve();
      };
      worker.postMessage({ type: 'CACHE_STATUS' }, [channel.port2]);
    });
  }

  async check({ automatic = false } = {}) {
    if (this.checking || (automatic && Date.now() - this.lastCheck < 60000)) return;
    this.checking = true;
    this.lastCheck = Date.now();
    if (!this.waiting && !this.reloadReady) this.change({ status: 'checking' });
    try {
      // Never trust an offline copy of the version descriptor.
      const response = await this.fetch(new URL('./version.json', import.meta.url), {
        cache: 'no-store', signal: AbortSignal.timeout(12000),
      });
      if (!response.ok) throw new Error('Version unavailable');
      const remote = await response.json();
      if (typeof remote.version !== 'string' || !/^[a-f0-9]{16}$/.test(remote.version)) throw new Error('Invalid version');
      this.remoteVersion = remote.version;
      if (this.registration) await this.registration.update();
      this.captureWaiting();
      if (this.waiting || this.reloadReady) this.change({ status: 'ready' });
      else if (this.registration?.installing) this.change({ status: 'downloading' });
      else if (remote.version === this.release.version) this.change({ status: 'current' });
      else if (!this.navigator.serviceWorker) {
        this.reloadReady = true;
        this.change({ status: 'ready' });
      } else this.change({ status: 'pending' });
    } catch {
      this.change({ status: this.waiting || this.reloadReady ? 'ready' : 'unavailable' });
    } finally { this.checking = false; }
  }

  async applyUpdate() {
    if (this.applying || !(this.waiting || this.reloadReady) || !this.beforeReload()) return false;
    this.applying = true;
    this.change({ status: 'applying' });
    if (this.waiting && this.waiting.state !== 'redundant' && this.waiting.state !== 'activated') {
      this.waiting.postMessage({ type: 'SKIP_WAITING' });
      // If activation fails, let the learner retry instead of leaving a disabled button forever.
      this.applyTimer = setTimeout(() => {
        this.applying = false;
        this.captureWaiting();
        this.change({ status: 'failed' });
      }, 15000);
    } else this.window.location.reload();
    return true;
  }

  async install() {
    if (!this.prompt) return false;
    const prompt = this.prompt;
    this.prompt = null;
    try {
      await prompt.prompt();
      const choice = await prompt.userChoice;
      if (choice?.outcome === 'accepted') this.change({ installed: true });
      return true;
    } catch { return false; }
  }
}
