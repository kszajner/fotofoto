const tasksEl = document.querySelector('#tasks');
const newFormEl = document.querySelector('#new-task');

function stateMessage(text) {
  const p = document.createElement('p');
  p.className = 'state';
  p.textContent = text;
  return p;
}

function labeled(labelText, input) {
  const label = document.createElement('label');
  label.className = 'field';
  const span = document.createElement('span');
  span.textContent = labelText;
  label.append(span, input);
  return label;
}

function buildFields(task = {}) {
  const title = document.createElement('input');
  title.type = 'text';
  title.required = true;
  title.maxLength = 200;
  title.value = task.title ?? '';

  const description = document.createElement('textarea');
  description.rows = 2;
  description.maxLength = 500;
  description.value = task.description ?? '';

  const points = document.createElement('input');
  points.type = 'number';
  points.min = '0';
  points.step = '1';
  points.value = task.points ?? 1;

  const sortOrder = document.createElement('input');
  sortOrder.type = 'number';
  sortOrder.step = '1';
  sortOrder.value = task.sort_order ?? 0;

  const active = document.createElement('input');
  active.type = 'checkbox';
  active.checked = task.active === undefined ? true : Boolean(task.active);

  return { title, description, points, sortOrder, active };
}

function readFields(f) {
  return {
    title: f.title.value.trim(),
    description: f.description.value.trim(),
    points: Number(f.points.value),
    sort_order: Number(f.sortOrder.value),
    active: f.active.checked,
  };
}

function taskRow(task) {
  const article = document.createElement('article');
  article.className = 'task';
  if (!task.active) article.classList.add('inactive');

  const f = buildFields(task);

  const status = stateMessage('');
  status.className = 'save-status';
  status.hidden = true;

  const saveBtn = document.createElement('button');
  saveBtn.type = 'button';
  saveBtn.textContent = 'Zapisz';

  saveBtn.addEventListener('click', async () => {
    status.hidden = true;
    saveBtn.disabled = true;
    try {
      const res = await fetch(`/api/admin/tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(readFields(f)),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const updated = await res.json();
      article.classList.toggle('inactive', !updated.active);
      status.classList.remove('error');
      status.textContent = 'Zapisano.';
      status.hidden = false;
    } catch (err) {
      status.classList.add('error');
      status.textContent = `Błąd: ${err.message}`;
      status.hidden = false;
    } finally {
      saveBtn.disabled = false;
    }
  });

  const activeLabel = document.createElement('label');
  activeLabel.className = 'field checkbox';
  const activeSpan = document.createElement('span');
  activeSpan.textContent = 'aktywne';
  activeLabel.append(f.active, activeSpan);

  const row = document.createElement('div');
  row.className = 'task-form-row';
  row.append(
    labeled('Tytuł', f.title),
    labeled('Opis', f.description),
    labeled('Punkty', f.points),
    labeled('Kolejność', f.sortOrder),
    activeLabel,
    saveBtn,
  );

  article.append(row, status);
  return article;
}

async function loadTasks() {
  try {
    const res = await fetch('/api/admin/tasks');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const tasks = await res.json();
    tasksEl.replaceChildren(
      ...(tasks.length ? tasks.map(taskRow) : [stateMessage('Brak zadań.')]),
    );
  } catch (err) {
    tasksEl.replaceChildren(stateMessage(`Nie udało się pobrać zadań: ${err.message}`));
  }
}

function renderNewTaskForm() {
  const f = buildFields({ points: 1, sort_order: 0, active: true });

  const error = stateMessage('');
  error.classList.add('error');
  error.hidden = true;

  const submit = document.createElement('button');
  submit.type = 'submit';
  submit.textContent = 'Dodaj zadanie';

  const activeLabel = document.createElement('label');
  activeLabel.className = 'field checkbox';
  const activeSpan = document.createElement('span');
  activeSpan.textContent = 'aktywne';
  activeLabel.append(f.active, activeSpan);

  const row = document.createElement('div');
  row.className = 'task-form-row';
  row.append(
    labeled('Tytuł', f.title),
    labeled('Opis', f.description),
    labeled('Punkty', f.points),
    labeled('Kolejność', f.sortOrder),
    activeLabel,
    submit,
  );

  newFormEl.replaceChildren(row, error);

  newFormEl.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    error.hidden = true;
    submit.disabled = true;
    try {
      const res = await fetch('/api/admin/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(readFields(f)),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      f.title.value = '';
      f.description.value = '';
      await loadTasks();
    } catch (err) {
      error.textContent = err.message;
      error.hidden = false;
    } finally {
      submit.disabled = false;
    }
  });
}

const photosEl = document.querySelector('#photos');

function photoCard(photo) {
  const figure = document.createElement('figure');
  figure.className = 'photo-card';
  if (photo.status === 'hidden') figure.classList.add('inactive');

  const img = document.createElement('img');
  img.loading = 'lazy';
  img.src = `/media/thumb/${photo.photo_id}.webp`;
  img.alt = photo.task_title;

  const caption = document.createElement('figcaption');
  caption.textContent = `${photo.task_title} — ${photo.guest_name}`;

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.textContent = photo.status === 'hidden' ? 'Pokaż' : 'Ukryj';

  toggle.addEventListener('click', async () => {
    toggle.disabled = true;
    const hidden = photo.status !== 'hidden';
    try {
      const res = await fetch(`/api/admin/photos/${photo.photo_id}/hide`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hidden }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      photo.status = hidden ? 'hidden' : 'ok';
      figure.classList.toggle('inactive', hidden);
      toggle.textContent = hidden ? 'Pokaż' : 'Ukryj';
    } catch (err) {
      toggle.textContent = `Błąd: ${err.message}`;
    } finally {
      toggle.disabled = false;
    }
  });

  figure.append(img, caption, toggle);
  return figure;
}

async function loadPhotos() {
  try {
    const res = await fetch('/api/admin/photos');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const photos = await res.json();
    photosEl.replaceChildren(
      ...(photos.length ? photos.map(photoCard) : [stateMessage('Jeszcze brak zdjęć.')]),
    );
  } catch (err) {
    photosEl.replaceChildren(stateMessage(`Nie udało się pobrać zdjęć: ${err.message}`));
  }
}

renderNewTaskForm();
loadTasks();
loadPhotos();
