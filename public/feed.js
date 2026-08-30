const gridEl = document.querySelector('#feed-grid');
const loadMoreBtn = document.querySelector('#load-more');
const stateEl = document.querySelector('#feed-state');

let nextCursor = null;
let loading = false;

function photoCard(item) {
  const figure = document.createElement('figure');
  figure.className = 'photo-card';

  const link = document.createElement('a');
  link.href = `/media/original/${item.photo_id}.jpg`;
  link.target = '_blank';
  link.rel = 'noopener';

  const img = document.createElement('img');
  img.loading = 'lazy';
  img.src = `/media/thumb/${item.photo_id}.webp`;
  img.alt = item.task_title;

  const caption = document.createElement('figcaption');
  caption.textContent = `${item.task_title} — ${item.guest_name}`;

  link.append(img);
  figure.append(link, caption);
  return figure;
}

async function loadMore() {
  if (loading) return;
  loading = true;
  loadMoreBtn.disabled = true;
  stateEl.hidden = true;

  try {
    const url = new URL('/api/feed', location.origin);
    if (nextCursor) url.searchParams.set('cursor', nextCursor);

    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const { items, next_cursor } = await res.json();

    if (!items.length && !gridEl.children.length) {
      stateEl.textContent = 'Jeszcze brak zdjęć — bądź pierwszy/a!';
      stateEl.hidden = false;
    } else {
      gridEl.append(...items.map(photoCard));
    }

    nextCursor = next_cursor;
    loadMoreBtn.hidden = !nextCursor;
  } catch (err) {
    stateEl.textContent = `Nie udało się załadować: ${err.message}`;
    stateEl.hidden = false;
  } finally {
    loading = false;
    loadMoreBtn.disabled = false;
  }
}

loadMoreBtn.addEventListener('click', loadMore);
loadMore();
