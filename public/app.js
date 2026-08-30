const tasksEl = document.querySelector('#tasks');
const buildEl = document.querySelector('#build');
const guestBarEl = document.querySelector('#guest-bar');

const RESIZE_MAX_DIM = 2048;
const JPEG_QUALITY = 0.82;
const QUEUE_RETRY_MS = 20000;

let guest = null;

function stateMessage(text) {
  const p = document.createElement('p');
  p.className = 'state';
  p.textContent = text;
  return p;
}

// Błąd HTTP jawnie zwrócony przez serwer (400/413/415/507/...) — nie ma co
// ponawiać, bo kolejny raz da ten sam wynik. Odróżniamy od TypeError, które
// fetch rzuca przy realnym braku sieci — to jedyny przypadek, który kolejkujemy.
class HttpError extends Error {}

const QUEUE_DB_NAME = 'fotofoto-queue';
const QUEUE_STORE = 'pending';

function openQueueDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(QUEUE_DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(QUEUE_STORE, { keyPath: 'id', autoIncrement: true });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function queueAdd(item) {
  const db = await openQueueDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(QUEUE_STORE, 'readwrite');
    tx.objectStore(QUEUE_STORE).add(item);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

async function queueGetAll() {
  const db = await openQueueDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction(QUEUE_STORE, 'readonly').objectStore(QUEUE_STORE).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function queueDelete(id) {
  const db = await openQueueDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(QUEUE_STORE, 'readwrite');
    tx.objectStore(QUEUE_STORE).delete(id);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

// Rzuca HttpError na jawną odpowiedź serwera, zwykły TypeError przechodzi
// dalej niezmieniony (to sygnał "brak sieci", nie "serwer odmówił").
async function trySend(taskId, jpegBlob) {
  const subRes = await fetch('/api/submissions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ task_id: taskId }),
  });
  if (!subRes.ok) {
    const body = await subRes.json().catch(() => ({}));
    throw new HttpError(body.error ?? `HTTP ${subRes.status}`);
  }
  const { submission_id } = await subRes.json();

  const form = new FormData();
  form.append('photo', jpegBlob, 'photo.jpg');
  const photoRes = await fetch(`/api/submissions/${submission_id}/photos`, {
    method: 'POST',
    body: form,
  });
  if (!photoRes.ok) {
    const body = await photoRes.json().catch(() => ({}));
    throw new HttpError(body.error ?? `HTTP ${photoRes.status}`);
  }
}

function markTaskDone(taskId) {
  const card = tasksEl.querySelector(`[data-task-id="${taskId}"]`);
  if (!card) return;
  card.querySelector('.shoot-btn').hidden = true;
  card.querySelector('.queued-row').hidden = true;
  card.querySelector('.done-row').hidden = false;
}

// Wywoływane przy starcie, po powrocie sieci ('online') i co QUEUE_RETRY_MS
// jako siatka bezpieczeństwa — telefony potrafią nie odpalić 'online'
// niezawodnie. Błąd serwera (HttpError) porzuca wpis: ponawianie i tak
// da ten sam wynik (np. zadanie usunięte w międzyczasie).
async function flushQueue() {
  let items;
  try {
    items = await queueGetAll();
  } catch {
    return;
  }
  for (const item of items) {
    try {
      await trySend(item.taskId, item.blob);
      await queueDelete(item.id);
      markTaskDone(item.taskId);
    } catch (err) {
      if (err instanceof HttpError) await queueDelete(item.id);
      // TypeError (brak sieci) — zostawiamy w kolejce, spróbujemy później
    }
  }
}

// Canvas → JPEG ~2048px / q0.82: rozwiązuje transfer, obciążenie CPU Pi
// i HEIC z iPhone'a jednym ruchem (Safari dekoduje HEIC natywnie w canvas).
async function resizeToJpeg(file) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, RESIZE_MAX_DIM / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d').drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('canvas.toBlob zwrócił null'))),
      'image/jpeg',
      JPEG_QUALITY,
    );
  });
}

async function ensureGuest() {
  const res = await fetch('/api/guest/me');
  if (res.ok) return res.json();
  return null;
}

function renderGuestForm() {
  const form = document.createElement('form');
  form.className = 'guest-form';

  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = 'Twoje imię';
  input.maxLength = 80;
  input.required = true;
  input.autocomplete = 'given-name';

  const submit = document.createElement('button');
  submit.type = 'submit';
  submit.textContent = 'Wchodzę';

  const error = stateMessage('');
  error.classList.add('error');
  error.hidden = true;

  form.append(input, submit, error);

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    error.hidden = true;
    submit.disabled = true;
    try {
      const res = await fetch('/api/guest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: input.value.trim() }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      guest = await res.json();
      await boot();
    } catch (err) {
      error.textContent = err.message;
      error.hidden = false;
      submit.disabled = false;
    }
  });

  guestBarEl.replaceChildren(form);
}

function renderGuestBar() {
  const p = document.createElement('p');
  p.className = 'guest-hello';
  p.textContent = `Cześć, ${guest.name} 👋`;
  guestBarEl.replaceChildren(p);
}

function taskCard(task) {
  const article = document.createElement('article');
  article.className = 'task';
  article.dataset.taskId = String(task.id);

  const title = document.createElement('h2');
  title.textContent = task.title;

  const desc = document.createElement('p');
  desc.textContent = task.description;

  const points = document.createElement('span');
  points.className = 'pts';
  points.textContent = task.points === 1 ? '1 punkt' : `${task.points} pkt`;

  const status = stateMessage('');
  status.className = 'upload-status';
  status.hidden = true;

  const label = document.createElement('label');
  label.className = 'shoot-btn';
  label.textContent = 'Zrób zdjęcie';
  label.hidden = Boolean(task.done);

  const done = document.createElement('div');
  done.className = 'done-row';
  done.hidden = !task.done;

  const doneBadge = document.createElement('span');
  doneBadge.className = 'done-badge';
  doneBadge.textContent = 'Zrobione ✓';

  const redo = document.createElement('button');
  redo.type = 'button';
  redo.className = 'redo-btn';
  redo.textContent = 'jeszcze raz';
  redo.addEventListener('click', () => {
    done.hidden = true;
    label.hidden = false;
  });

  done.append(doneBadge, redo);

  const queuedRow = document.createElement('p');
  queuedRow.className = 'queued-row';
  queuedRow.textContent = 'Brak zasięgu — w kolejce, wyślę automatycznie 📶';
  queuedRow.hidden = true;

  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.capture = 'environment';
  input.hidden = true;
  label.append(input);

  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;

    label.setAttribute('aria-disabled', 'true');
    status.hidden = false;
    status.classList.remove('error');
    status.textContent = 'Przygotowuję zdjęcie…';

    let jpeg;
    try {
      jpeg = await resizeToJpeg(file);
    } catch (err) {
      status.classList.add('error');
      status.textContent = `Nie udało się przygotować zdjęcia: ${err.message}`;
      label.removeAttribute('aria-disabled');
      return;
    }

    status.textContent = 'Wysyłam…';
    try {
      await trySend(task.id, jpeg);
      status.hidden = true;
      label.hidden = true;
      queuedRow.hidden = true;
      done.hidden = false;
    } catch (err) {
      if (err instanceof HttpError) {
        status.classList.add('error');
        status.textContent = `Nie udało się: ${err.message}`;
      } else {
        // Brak sieci (TypeError z fetch) — zdjęcie już jest w canvas/JPEG,
        // nie tracimy go: idzie do IndexedDB, wyśle się automatycznie.
        await queueAdd({ taskId: task.id, blob: jpeg, createdAt: Date.now() });
        status.hidden = true;
        label.hidden = true;
        queuedRow.hidden = false;
      }
    } finally {
      label.removeAttribute('aria-disabled');
    }
  });

  article.append(title, desc, points, label, done, queuedRow, status);
  return article;
}

// Po reloadzie strony trzeba odtworzyć wizualny stan "w kolejce" z tego,
// co faktycznie leży w IndexedDB — sam task.done z serwera o tym nie wie.
async function applyQueuedState() {
  let items;
  try {
    items = await queueGetAll();
  } catch {
    return;
  }
  for (const taskId of new Set(items.map((i) => i.taskId))) {
    const card = tasksEl.querySelector(`[data-task-id="${taskId}"]`);
    if (!card || !card.querySelector('.done-row').hidden) continue;
    card.querySelector('.shoot-btn').hidden = true;
    card.querySelector('.queued-row').hidden = false;
  }
}

async function loadTasks() {
  try {
    const res = await fetch('/api/tasks');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const tasks = await res.json();
    tasksEl.replaceChildren(
      ...(tasks.length ? tasks.map(taskCard) : [stateMessage('Brak aktywnych zadań.')]),
    );
    await applyQueuedState();
    flushQueue();
  } catch (err) {
    tasksEl.replaceChildren(stateMessage(`Nie udało się pobrać zadań: ${err.message}`));
  } finally {
    tasksEl.removeAttribute('aria-busy');
  }
}

async function loadBuild() {
  try {
    const res = await fetch('/healthz');
    const { version } = await res.json();
    buildEl.textContent = `v${version}`;
  } catch {
    buildEl.textContent = 'offline';
  }
}

async function boot() {
  if (!guest) guest = await ensureGuest();

  if (!guest) {
    renderGuestForm();
    tasksEl.hidden = true;
    return;
  }

  renderGuestBar();
  tasksEl.hidden = false;
  loadTasks();
}

window.addEventListener('online', flushQueue);
setInterval(flushQueue, QUEUE_RETRY_MS);

boot();
loadBuild();
