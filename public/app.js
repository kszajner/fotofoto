const tasksEl = document.querySelector('#tasks');
const buildEl = document.querySelector('#build');

function stateMessage(text) {
  const p = document.createElement('p');
  p.className = 'state';
  p.textContent = text;
  return p;
}

// Budujemy przez textContent, nie innerHTML. Treść zadań jest wpisywana
// z panelu admina, więc od początku traktujemy ją jak dane, nie jak HTML.
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

  article.append(title, desc, points);
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

loadTasks();
loadBuild();
