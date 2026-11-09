/** Local course-file encryption, not server-side authentication. */
export const ACCESS_STORAGE_KEY = 'davar.access.v1';
export const COURSE_FORMAT = 'davar-course';
export const COURSE_VERSION = 1;
export const DEFAULT_ITERATIONS = 310_000;
const MIN_ITERATIONS = 250_000;
const MAX_ITERATIONS = 2_000_000;
const MAX_CIPHERTEXT_BYTES = 32 * 1024 * 1024;
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });
const METADATA_KEYS = ['format', 'version', 'cipher', 'keyLength', 'tagLength', 'kdf', 'hash', 'iterations', 'salt', 'iv'];

function plainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
    && [Object.prototype, null].includes(Object.getPrototypeOf(value));
}

export function bytesToBase64(bytes) {
  let text = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(text);
}

export function base64ToBytes(value, { length, maxLength = MAX_CIPHERTEXT_BYTES } = {}) {
  if (typeof value !== 'string' || value.length === 0 || value.length > Math.ceil(maxLength / 3) * 4
    || value.length % 4 !== 0 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
    throw new Error('Die Kursdatei enthält ungültige Binärdaten.');
  }
  const bytes = Uint8Array.from(atob(value), character => character.charCodeAt(0));
  if ((length !== undefined && bytes.length !== length) || bytes.length > maxLength || bytesToBase64(bytes) !== value) {
    throw new Error('Die Kursdatei enthält Binärdaten mit ungültiger Länge oder Kodierung.');
  }
  return bytes;
}

export function validateCourseEnvelope(value) {
  if (!plainObject(value) || Object.keys(value).length !== METADATA_KEYS.length + 1
    || !METADATA_KEYS.every(key => Object.hasOwn(value, key)) || !Object.hasOwn(value, 'ciphertext')
    || value.format !== COURSE_FORMAT || value.version !== COURSE_VERSION
    || value.cipher !== 'AES-GCM' || value.keyLength !== 256 || value.tagLength !== 128
    || value.kdf !== 'PBKDF2' || value.hash !== 'SHA-256'
    || !Number.isSafeInteger(value.iterations) || value.iterations < MIN_ITERATIONS || value.iterations > MAX_ITERATIONS) {
    throw new Error('Das Format der verschlüsselten Kursdatei wird nicht unterstützt.');
  }
  base64ToBytes(value.salt, { length: 16, maxLength: 16 });
  base64ToBytes(value.iv, { length: 12, maxLength: 12 });
  const ciphertext = base64ToBytes(value.ciphertext);
  if (ciphertext.length < 17) throw new Error('Die verschlüsselte Kursdatei ist unvollständig.');
  return value;
}

export function courseAdditionalData(envelope) {
  // Bind the full cryptographic header to the GCM authentication tag.
  return encoder.encode(JSON.stringify(Object.fromEntries(METADATA_KEYS.map(key => [key, envelope[key]]))));
}

export function validateCoursePayload(value) {
  if (!plainObject(value) || Object.keys(value).length !== 2
    || !Array.isArray(value.vocabulary) || !Array.isArray(value.sentences)
    || value.vocabulary.length > 20_000 || value.sentences.length > 100_000
    || !value.vocabulary.every(plainObject) || !value.sentences.every(plainObject)) {
    throw new Error('Die entschlüsselten Kursdaten sind unvollständig oder ungültig.');
  }
  return value;
}

export async function deriveCourseKey(password, envelope) {
  validateCourseEnvelope(envelope);
  if (typeof password !== 'string' || password.length === 0 || encoder.encode(password).length > 4096) {
    throw new Error('Bitte gib das Kurspasswort ein.');
  }
  const passwordBytes = encoder.encode(password);
  try {
    const material = await crypto.subtle.importKey('raw', passwordBytes, 'PBKDF2', false, ['deriveKey']);
    return await crypto.subtle.deriveKey({
      name: 'PBKDF2', hash: envelope.hash, salt: base64ToBytes(envelope.salt, { length: 16 }),
      iterations: envelope.iterations,
    }, material, { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  } finally {
    passwordBytes.fill(0);
  }
}

export async function decryptCourseWithKey(envelope, key) {
  validateCourseEnvelope(envelope);
  let clear;
  try {
    clear = await crypto.subtle.decrypt({
      name: 'AES-GCM', iv: base64ToBytes(envelope.iv, { length: 12 }), tagLength: 128,
      additionalData: courseAdditionalData(envelope),
    }, key, base64ToBytes(envelope.ciphertext));
  } catch {
    throw new Error('Das Passwort stimmt nicht oder die Kursdatei ist beschädigt.');
  }
  try {
    return validateCoursePayload(JSON.parse(decoder.decode(clear)));
  } catch {
    throw new Error('Die entschlüsselten Kursdaten sind unvollständig oder ungültig.');
  } finally {
    new Uint8Array(clear).fill(0);
  }
}

export async function decryptCourse(envelope, password) {
  return decryptCourseWithKey(envelope, await deriveCourseKey(password, envelope));
}

function browserStorage() {
  try { return globalThis.localStorage ?? null; } catch { return null; }
}

export function lockCourse(storage = browserStorage()) {
  try { storage?.removeItem(ACCESS_STORAGE_KEY); } catch { /* Restricted browser storage. */ }
}

export async function rememberCourseKey(envelope, key, storage = browserStorage()) {
  validateCourseEnvelope(envelope);
  try {
    if (!storage) return false;
    const raw = new Uint8Array(await crypto.subtle.exportKey('raw', key));
    try {
      storage.setItem(ACCESS_STORAGE_KEY, JSON.stringify({
        version: envelope.version, salt: envelope.salt, iterations: envelope.iterations,
        key: bytesToBase64(raw),
      }));
      return true;
    } finally { raw.fill(0); }
  } catch {
    return false;
  }
}

export async function rememberedCourseKey(envelope, storage = browserStorage()) {
  validateCourseEnvelope(envelope);
  try {
    const saved = JSON.parse(storage?.getItem(ACCESS_STORAGE_KEY) ?? 'null');
    if (saved === null) return null;
    if (!plainObject(saved) || Object.keys(saved).length !== 4 || saved.version !== envelope.version
      || saved.salt !== envelope.salt || saved.iterations !== envelope.iterations) throw new Error('Stale access');
    const raw = base64ToBytes(saved.key, { length: 32, maxLength: 32 });
    try {
      return await crypto.subtle.importKey('raw', raw, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
    } finally { raw.fill(0); }
  } catch {
    lockCourse(storage);
    return null;
  }
}

function element(document, tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

function passwordForm(root, envelope) {
  const document = root.ownerDocument;
  const page = element(document, 'main', undefined, 'boot');
  page.style.padding = '24px';
  const panel = element(document, 'section', undefined, 'panel');
  panel.style.width = '100%';
  panel.style.maxWidth = '440px';
  const heading = element(document, 'h1', 'davar');
  heading.style.marginBottom = '12px';
  const subtitle = element(document, 'p', 'Begleit-App zum Hebräischkurs von Dr. Johannes Diehl');
  subtitle.style.marginBottom = '20px';
  const intro = element(document, 'p', 'Mit dem Kurspasswort öffnest du die Lerninhalte.');
  intro.style.marginBottom = '20px';
  const form = element(document, 'form');
  const label = element(document, 'label', 'Kurspasswort');
  label.htmlFor = 'course-password';
  label.style.display = 'block';
  label.style.marginBottom = '8px';
  const password = element(document, 'input');
  password.type = 'password';
  password.id = 'course-password';
  password.name = 'course-password';
  password.autocomplete = 'current-password';
  password.required = true;
  password.maxLength = 1024;
  password.setAttribute('aria-describedby', 'course-access-message');
  Object.assign(password.style, { width: '100%', padding: '13px', fontSize: '16px', border: '1px solid var(--line)', borderRadius: '10px', background: 'var(--paper)', color: 'var(--ink)' });
  const rememberLabel = element(document, 'label');
  Object.assign(rememberLabel.style, { display: 'flex', alignItems: 'center', gap: '10px', margin: '18px 0', fontSize: '14px' });
  const remember = element(document, 'input');
  remember.type = 'checkbox';
  remember.name = 'remember-course-access';
  remember.checked = true;
  rememberLabel.append(remember, element(document, 'span', 'Auf diesem Gerät merken'));
  const message = element(document, 'p', '');
  message.id = 'course-access-message';
  message.setAttribute('role', 'status');
  message.setAttribute('aria-live', 'polite');
  Object.assign(message.style, { fontSize: '14px', marginBottom: '14px', minHeight: '20px' });
  const button = element(document, 'button', 'Lerninhalte öffnen', 'btn');
  button.type = 'submit';
  button.style.width = '100%';
  const privacy = element(document, 'p', 'Die Freigabe gilt für dieses Gerät. Wer es nutzt, kann bei gemerkter Freigabe ebenfalls auf die Lerninhalte zugreifen.');
  Object.assign(privacy.style, { fontSize: '12px', lineHeight: '1.6', marginTop: '20px' });
  form.append(label, password, rememberLabel, message, button);
  panel.append(heading, subtitle, intro, form, privacy);
  page.append(panel);
  root.replaceChildren(page);
  password.focus();
  return new Promise(resolve => {
    let busy = false;
    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (busy || !form.reportValidity()) return;
      busy = true;
      button.disabled = true;
      password.disabled = true;
      remember.disabled = true;
      form.setAttribute('aria-busy', 'true');
      button.textContent = 'Wird geöffnet …';
      message.textContent = '';
      password.removeAttribute('aria-invalid');
      let secret = password.value;
      try {
        const key = await deriveCourseKey(secret, envelope);
        secret = '';
        const course = await decryptCourseWithKey(envelope, key);
        password.value = '';
        if (remember.checked) await rememberCourseKey(envelope, key);
        else lockCourse();
        resolve(course);
      } catch (error) {
        secret = '';
        password.value = '';
        message.textContent = error.message;
        password.setAttribute('aria-invalid', 'true');
        busy = false;
        button.disabled = false;
        password.disabled = false;
        remember.disabled = false;
        form.removeAttribute('aria-busy');
        button.textContent = 'Lerninhalte öffnen';
        password.focus();
      }
    });
  });
}

export async function unlockCourse(root = document.querySelector('#app')) {
  if (!root) throw new Error('Die Ansicht zum Öffnen des Kurses fehlt.');
  if (!globalThis.crypto?.subtle) throw new Error('Bitte öffne diese App über eine sichere HTTPS-Verbindung.');
  const response = await fetch(new URL('./data/course.enc.json', import.meta.url));
  if (!response.ok) throw new Error('Die Kursdatei konnte nicht geladen werden. Bitte lade die App einmal mit Internetverbindung.');
  const envelope = validateCourseEnvelope(await response.json());
  const storedKey = await rememberedCourseKey(envelope);
  if (storedKey) {
    try { return await decryptCourseWithKey(envelope, storedKey); }
    catch { lockCourse(); }
  }
  return passwordForm(root, envelope);
}
