const tasksEl = document.querySelector('#tasks');
const buildEl = document.querySelector('#build');
const guestBarEl = document.querySelector('#guest-bar');

const RESIZE_MAX_DIM = 2048;
const JPEG_QUALITY = 0.82;

let guest = null;

function stateMessage(text) {
  const p = document.createElement('p');
  p.className = 'state';
  p.textContent = text;
  return p;
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

    try {
      const jpeg = await resizeToJpeg(file);

      status.textContent = 'Wysyłam…';
      const subRes = await fetch('/api/submissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task_id: task.id }),
      });
      if (!subRes.ok) {
        const body = await subRes.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${subRes.status}`);
      }
      const { submission_id } = await subRes.json();

      const form = new FormData();
      form.append('photo', jpeg, 'photo.jpg');
      const photoRes = await fetch(`/api/submissions/${submission_id}/photos`, {
        method: 'POST',
        body: form,
      });
      if (!photoRes.ok) {
        const body = await photoRes.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${photoRes.status}`);
      }

      status.textContent = 'Wysłano! Dzięki 🎉';
    } catch (err) {
      status.classList.add('error');
      status.textContent = `Nie udało się: ${err.message}`;
    } finally {
      label.removeAttribute('aria-disabled');
    }
  });

  article.append(title, desc, points, label, status);
  return article;
}

async function loadTasks() {
  try {
    const res = await fetch('/api/tasks');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const tasks = await res.json();
    tasksEl.replaceChildren(
      ...(tasks.length ? tasks.map(taskCard) : [stateMessage('Brak aktywnych zadań.')]),
    );
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

boot();
loadBuild();
