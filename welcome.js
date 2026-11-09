/** The introduction preference is independent of the learning record. */
export const WELCOME_STORAGE_KEY = 'davar.welcome.hidden.v1';

function browserStorage() {
  try { return globalThis.localStorage ?? null; } catch { return null; }
}

export function showWelcome({ dialog, navigate = () => {}, force = false, storage = browserStorage() }) {
  let hidden = false;
  try { hidden = storage?.getItem(WELCOME_STORAGE_KEY) === 'true'; } catch { /* Still show the introduction. */ }
  if ((!force && hidden) || dialog.open) return false;

  const previousLabel = dialog.getAttribute('aria-labelledby');
  const previousDescription = dialog.getAttribute('aria-describedby');
  dialog.classList.add('welcome-dialog');
  dialog.setAttribute('aria-labelledby', 'welcome-title');
  dialog.setAttribute('aria-describedby', 'welcome-intro');
  dialog.innerHTML = `
    <div class="eyebrow">Dein Hebräisch-Begleiter</div>
    <h2 id="welcome-title" tabindex="-1">Willkommen bei Davar</h2>
    <p id="welcome-intro">So übst du passend zu deinem Kurs:</p>
    <ul class="welcome-features">
      <li><strong>Deine Lektion wählen</strong><span>Stelle ein, bis zu welcher Lektion du gekommen bist. Davar übt den Wortschatz bis dahin.</span></li>
      <li><strong>Vokabeln festigen</strong><span>Übe Hebräisch ↔ Deutsch. Wörter erscheinen wieder, wenn eine Wiederholung ansteht.</span></li>
      <li><strong>Sätze zusammensetzen</strong><span>Im Tab „Sätze“ übersetzt du mit Wortkacheln – mit abwechslungsreichen eigenen und biblischen Sätzen.</span></li>
      <li><strong>Fortschritt im Blick</strong><span>Einfache Statistiken zeigen deinen Stand. Antworten werden auf diesem Gerät gespeichert; nach dem Laden kannst du offline üben.</span></li>
    </ul>
    <label class="welcome-dismiss"><input type="checkbox" id="welcome-hide" ${hidden ? 'checked' : ''}> Nicht mehr anzeigen</label>
    <div class="dialog-actions welcome-actions">
      <button type="button" class="btn secondary" data-welcome="settings">Lektion einstellen</button>
      <button type="button" class="btn" data-welcome="start">Loslegen</button>
    </div>`;

  const restoreAttributes = () => {
    dialog.classList.remove('welcome-dialog');
    if (previousLabel === null) dialog.removeAttribute('aria-labelledby');
    else dialog.setAttribute('aria-labelledby', previousLabel);
    if (previousDescription === null) dialog.removeAttribute('aria-describedby');
    else dialog.setAttribute('aria-describedby', previousDescription);
  };
  dialog.addEventListener('close', restoreAttributes, { once: true });
  const finish = destination => {
    try {
      if (dialog.querySelector('#welcome-hide').checked) storage?.setItem(WELCOME_STORAGE_KEY, 'true');
      else storage?.removeItem(WELCOME_STORAGE_KEY);
    } catch { /* An unavailable preference store must not block learning. */ }
    dialog.close();
    if (destination) navigate(destination);
  };
  dialog.querySelector('[data-welcome="settings"]').onclick = () => finish('einstellungen');
  dialog.querySelector('[data-welcome="start"]').onclick = () => finish();
  dialog.showModal();
  dialog.querySelector('#welcome-title').focus();
  return true;
}
