const state = {
  articles: [],
  filtered: [],
  queue: [],
  rated: {},
  draft: {},
  selectedId: null,
  onlyUnrated: false,
};

const els = {
  status: document.querySelector('#status'),
  makeQueue: document.querySelector('#makeQueue'),
  showUnrated: document.querySelector('#showUnrated'),
  showAll: document.querySelector('#showAll'),
  search: document.querySelector('#search'),
  fileFilter: document.querySelector('#fileFilter'),
  sourceFilter: document.querySelector('#sourceFilter'),
  articleList: document.querySelector('#articleList'),
  empty: document.querySelector('#empty'),
  card: document.querySelector('#card'),
  source: document.querySelector('#source'),
  date: document.querySelector('#date'),
  file: document.querySelector('#file'),
  title: document.querySelector('#title'),
  url: document.querySelector('#url'),
  text: document.querySelector('#text'),
  skip: document.querySelector('#skip'),
  remove: document.querySelector('#remove'),
};

async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Unbekannter Fehler');
  return data;
}

function formatDate(value) {
  if (!value) return 'ohne Datum';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toISOString().slice(0, 10);
}

function shortText(text) {
  return (text || '').replace(/\s+/g, ' ').trim();
}

function updateStatus() {
  const ratedCount = Object.values(state.rated).filter(rating => rating.human_score).length;
  const queueText = state.queue.length ? ` · Stapel: ${state.queue.length}` : '';
  els.status.textContent = `${state.articles.length} Artikel geladen · ${ratedCount} aus diesen Runs bewertet${queueText}`;
}

function fillFilters(files) {
  els.fileFilter.innerHTML = [
    '<option value="">Alle Runs</option>',
    ...files.map(file => `<option value="${file}">${file}</option>`),
  ].join('');

  const sources = [...new Set(state.articles.map(article => article.quelle).filter(Boolean))].sort();
  els.sourceFilter.innerHTML = [
    '<option value="">Alle Quellen</option>',
    ...sources.map(source => `<option value="${source}">${source}</option>`),
  ].join('');
}

function applyFilters() {
  const query = els.search.value.trim().toLowerCase();
  const file = els.fileFilter.value;
  const source = els.sourceFilter.value;
  const base = state.queue.length
    ? state.articles.filter(article => state.queue.includes(article.id))
    : state.articles;

  state.filtered = base.filter(article => {
    if (state.onlyUnrated && state.rated[article.id]?.human_score) return false;
    if (file && article.source_file !== file) return false;
    if (source && article.quelle !== source) return false;
    if (!query) return true;
    const haystack = `${article.titel} ${article.quelle} ${article.rohtext}`.toLowerCase();
    return haystack.includes(query);
  });

  renderList();
}

function renderList() {
  if (!state.filtered.length) {
    els.articleList.innerHTML = '<div class="empty">Keine Artikel für diesen Filter.</div>';
    return;
  }

  els.articleList.innerHTML = state.filtered.map(article => {
    const rating = state.rated[article.id];
    const score = rating?.human_score;
    const inputQuality = rating?.input_quality;
    const active = article.id === state.selectedId ? ' active' : '';
    const badge = score
      ? `<span class="badge rated">Aufbereitung ${score}</span>`
      : '<span class="badge">offen</span>';
    const qualityBadge = inputQuality && inputQuality !== 'unknown'
      ? `<span class="badge">${qualityLabel(inputQuality)}</span>`
      : '';
    return `
      <button class="list-item${active}" type="button" data-id="${article.id}">
        <span class="list-title">${escapeHtml(article.titel || 'Ohne Titel')}</span>
        <span class="list-meta">
          ${badge}
          ${qualityBadge}
          <span>${escapeHtml(article.quelle || 'unbekannt')}</span>
          <span>${formatDate(article.datum)}</span>
        </span>
      </button>
    `;
  }).join('');
}

function renderArticle(article) {
  state.selectedId = article?.id || null;
  els.empty.classList.toggle('hidden', Boolean(article));
  els.card.classList.toggle('hidden', !article);

  if (!article) {
    renderList();
    return;
  }

  els.source.textContent = article.quelle || 'unbekannte Quelle';
  els.date.textContent = formatDate(article.datum);
  els.file.textContent = article.source_file;
  els.title.textContent = article.titel || 'Ohne Titel';
  els.url.href = article.url || '#';
  els.url.classList.toggle('hidden', !article.url);
  els.text.textContent = shortText(article.rohtext) || 'Kein Textauszug vorhanden.';

  const rating = currentRating(article.id);
  for (const button of document.querySelectorAll('[data-score]')) {
    button.classList.toggle('selected', Number(button.dataset.score) === rating.human_score);
  }
  for (const button of document.querySelectorAll('[data-quality]')) {
    button.classList.toggle('selected', button.dataset.quality === rating.input_quality);
  }
  renderList();
}

function currentIndex() {
  return state.filtered.findIndex(article => article.id === state.selectedId);
}

function selectNext() {
  const index = currentIndex();
  const next = state.filtered[index + 1] || state.filtered[index] || state.filtered[0];
  renderArticle(next || null);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function qualityLabel(value) {
  return {
    good: 'kein Problem',
    thin: 'relevant, aber dünn',
    broken: 'kaputt',
    unknown: 'nicht geprüft',
  }[value] || 'nicht geprüft';
}

function currentRating(id = state.selectedId) {
  return state.draft[id] || state.rated[id] || {
    human_score: null,
    original_score: null,
    input_quality: 'unknown',
  };
}

function setDraft(id, patch) {
  state.draft[id] = { ...currentRating(id), ...patch };
}

function makeReviewQueue() {
  const unrated = state.articles.filter(article => !state.rated[article.id]?.human_score);
  const latestFiles = [...new Set(unrated.map(article => article.source_file))].slice(0, 3);
  const pool = unrated.filter(article => latestFiles.includes(article.source_file));
  const buckets = [
    article => /funding|series|raises|valuation|acquires|partnership/i.test(`${article.titel} ${article.rohtext}`),
    article => /release|sdk|framework|mcp|agent|eval|api|plugin|tool|cli/i.test(`${article.titel} ${article.rohtext}`),
    article => /pricing|cost|license|open weights|model|claude|gemini|openai|anthropic|deepmind/i.test(`${article.titel} ${article.rohtext}`),
    article => shortText(article.rohtext).length < 240,
  ];

  const picked = [];
  const add = article => {
    if (article && !picked.includes(article.id)) picked.push(article.id);
  };

  for (const bucket of buckets) {
    for (const article of pool.filter(bucket).slice(0, 3)) add(article);
  }

  const bySource = new Map();
  for (const article of pool) {
    if (!bySource.has(article.quelle)) bySource.set(article.quelle, article);
  }
  for (const article of bySource.values()) add(article);
  for (const article of pool) add(article);

  state.queue = picked.slice(0, 12);
  state.onlyUnrated = false;
  applyFilters();
  renderArticle(state.filtered[0] || null);
  updateStatus();
}

async function rateSelected(score) {
  if (!state.selectedId) return;
  const rating = { ...currentRating(), human_score: score };
  await api('/api/rate', {
    method: 'POST',
    body: JSON.stringify({ id: state.selectedId, ...rating }),
  });
  state.rated[state.selectedId] = rating;
  delete state.draft[state.selectedId];
  updateStatus();
  applyFilters();
  selectNext();
}

function setInputQuality(inputQuality) {
  if (!state.selectedId) return;
  setDraft(state.selectedId, { input_quality: inputQuality });
  renderArticle(state.articles.find(article => article.id === state.selectedId));
}

async function removeSelectedRating() {
  if (!state.selectedId) return;
  await api('/api/unrate', {
    method: 'POST',
    body: JSON.stringify({ id: state.selectedId }),
  });
  delete state.rated[state.selectedId];
  delete state.draft[state.selectedId];
  updateStatus();
  applyFilters();
  renderArticle(state.filtered[currentIndex()] || state.filtered[0] || null);
}

async function init() {
  const data = await api('/api/data');
  state.articles = data.articles;
  state.filtered = data.articles;
  state.rated = data.rated;
  fillFilters(data.files);
  updateStatus();
  applyFilters();
  renderArticle(state.filtered[0] || null);
}

els.articleList.addEventListener('click', event => {
  const item = event.target.closest('[data-id]');
  if (!item) return;
  renderArticle(state.articles.find(article => article.id === item.dataset.id));
});

for (const button of document.querySelectorAll('[data-score]')) {
  button.addEventListener('click', () => rateSelected(Number(button.dataset.score)));
}

for (const button of document.querySelectorAll('[data-quality]')) {
  button.addEventListener('click', () => setInputQuality(button.dataset.quality));
}

els.skip.addEventListener('click', selectNext);
els.remove.addEventListener('click', removeSelectedRating);
els.makeQueue.addEventListener('click', makeReviewQueue);
els.showUnrated.addEventListener('click', () => {
  state.onlyUnrated = true;
  state.queue = [];
  applyFilters();
  renderArticle(state.filtered[0] || null);
  updateStatus();
});
els.showAll.addEventListener('click', () => {
  state.onlyUnrated = false;
  state.queue = [];
  applyFilters();
  renderArticle(state.filtered[0] || null);
  updateStatus();
});
els.search.addEventListener('input', applyFilters);
els.fileFilter.addEventListener('change', applyFilters);
els.sourceFilter.addEventListener('change', applyFilters);

document.addEventListener('keydown', event => {
  if (event.target.matches('input, select, textarea')) return;
  if (/^[1-5]$/.test(event.key)) rateSelected(Number(event.key));
  if (event.key === 'ArrowRight' || event.key.toLowerCase() === 's') selectNext();
});

init().catch(err => {
  els.status.textContent = err.message;
  console.error(err);
});
