/** dynamic_articles_list_page.js
 *
 * Client-side script to fetch /resource/data/articles_data.json and populate
 * .container-articles-list-grid with article items.
 *
 * Config at top.
 */

/* ----------------------- Configuration ----------------------- */
const DATA_PATH = '/resource/data/articles_data.json'; // where JSON lives
const CONTAINER_SELECTOR = '.container-articles-list-grid'; // container to replace
const NEW_ARTICLE_DAYS = 30; // articles published within this many days get "New Article"
const PLACEHOLDER_COUNT = 10; // random placeholder numbers will be between 1 and this (inclusive)
const PLACEHOLDER_PATH_PREFIX = '/resource/image/placeholder/'; // full path will be PREFIX + n + '.png'
const LINK_PREFIX = '/articles/'; // final link becomes `${LINK_PREFIX}${id}/`

/* ----------------------- Main ----------------------- */
document.addEventListener('DOMContentLoaded', () => {
  loadAndRenderArticles().catch(err => console.error('Error loading articles:', err));
});

async function loadAndRenderArticles() {
  const container = document.querySelector(CONTAINER_SELECTOR);
  if (!container) {
    console.warn(`Container not found: ${CONTAINER_SELECTOR}`);
    return;
  }

  let articles = [];
  try {
    const resp = await fetch(DATA_PATH, { cache: 'no-store' });
    if (!resp.ok) throw new Error(`HTTP ${resp.status} fetching ${DATA_PATH}`);
    articles = await resp.json();
    if (!Array.isArray(articles)) throw new Error('JSON root is not an array.');
  } catch (err) {
    console.error('Failed to load/parse article list JSON:', err);
    // optionally: show a friendly message in the container
    container.innerHTML = `<p class="articles-error">Unable to load articles.</p>`;
    return;
  }

  // Filter out hidden and sort by published date (newest first)
  const visible = articles
    .filter(a => !a?.hidden)
    .slice() // copy
    .sort((a, b) => {
      const da = safeDate(a?.date?.published);
      const db = safeDate(b?.date?.published);
      return db - da; // newest first
    });

  // Replace existing contents
  container.innerHTML = '';

  // Render each article
  visible.forEach(article => {
    const item = buildArticleNode(article);
    container.appendChild(item);
  });
}

/* ----------------------- Helpers ----------------------- */

function buildArticleNode(article) {
  const id = article?.id || 'unknown';
  const title = article?.title || 'Untitled';
  const strapLine = article?.strap_line || '';
  const publishedISO = article?.date?.published || null;
  const publishedDate = safeDate(publishedISO);
  const publishedStr = publishedISO ? formatDateWithOrdinal(publishedDate) : 'Unknown date';
  const labels = Array.isArray(article?.labels) ? article.labels : [];
  const isFeatured = !!article?.featured;
  const imageSrc = (article?.featured_image && article.featured_image.trim())
    ? article.featured_image
    : randomPlaceholder();

  // link element
  const a = document.createElement('a');
  a.className = 'article-item';
  // keep consistent with user's final instruction: /article/{id}
  a.href = `${LINK_PREFIX}${encodeURIComponent(id)}/`;

  // image wrapper
  const imgWrap = document.createElement('div');
  imgWrap.className = 'item-image-body';
  const img = document.createElement('img');
  img.src = imageSrc;
  img.alt = title;
  imgWrap.appendChild(img);

  // header wrapper
  const header = document.createElement('div');
  header.className = 'item-header';
  const h3 = document.createElement('h3');
  h3.textContent = title;

  const pStrap = document.createElement('p');
  pStrap.className = 'strap-line';
  pStrap.textContent = strapLine;

  const pDateInfo = document.createElement('p');
  pDateInfo.className = 'date-and-info';

  const spanDate = document.createElement('span');
  spanDate.className = 'date';
  spanDate.textContent = `${publishedStr}`;

  const spanExtra = document.createElement('span');
  spanExtra.className = 'extra-info-labels';

  // Insert user labels
  labels.forEach(labelText => {
    if (!labelText || typeof labelText !== 'string') return;
    const labelSpan = document.createElement('span');
    labelSpan.className = `label l${slugForClass(labelText)}`;
    labelSpan.textContent = labelText;
    spanExtra.appendChild(labelSpan);
  });

  // helper: returns true if publishedDate is within `days` days of now (past OR future)
  function isWithinDays(publishedDate, days) {
    if (!(publishedDate instanceof Date) || isNaN(publishedDate)) return false;
    const MS_PER_DAY = 24 * 60 * 60 * 1000;
    const now = new Date();
    const diffMs = publishedDate.getTime() - now.getTime();
    return Math.abs(diffMs) <= days * MS_PER_DAY;
  }

  // New Article label if within NEW_ARTICLE_DAYS (past OR upcoming within the window)
  if (publishedISO) {
    // parse publishedISO to a Date; guard against invalid strings
    const publishedDate = new Date(publishedISO);
    if (!isNaN(publishedDate) && isWithinDays(publishedDate, NEW_ARTICLE_DAYS)) {
      const newSpan = document.createElement('span');
      newSpan.className = 'label label-new';
      newSpan.textContent = 'New Article';
      spanExtra.appendChild(newSpan);
    }
  }

  // Featured label
  if (isFeatured) {
    const feat = document.createElement('span');
    feat.className = 'label label-featured';
    feat.textContent = 'Featured';
    spanExtra.appendChild(feat);
  }

  // assemble
  pDateInfo.appendChild(spanDate);
  pDateInfo.appendChild(spanExtra);

  header.appendChild(h3);
  header.appendChild(pStrap);
  header.appendChild(pDateInfo);

  a.appendChild(imgWrap);
  a.appendChild(header);

  return a;
}

function safeDate(isoString) {
  if (!isoString) return new Date(0);
  const d = new Date(isoString);
  if (isNaN(d)) return new Date(0);
  return d;
}

function formatDateWithOrdinal(date) {
  // Use client's local timezone for day/month/year display.
  const day = date.getDate();
  const month = monthNames[date.getMonth()];
  const year = date.getFullYear();
  return `${day}${ordinalSuffix(day)} ${month} ${year}`;
}

const monthNames = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December'
];

function ordinalSuffix(n) {
  // 11,12,13 are 'th'
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return 'th';
  const rem10 = n % 10;
  if (rem10 === 1) return 'st';
  if (rem10 === 2) return 'nd';
  if (rem10 === 3) return 'rd';
  return 'th';
}

function isWithinDays(date, days) {
  if (!(date instanceof Date)) return false;
  const now = new Date();
  const msAgo = days * 24 * 60 * 60 * 1000;
  return (now - date) <= msAgo && (now - date) >= 0; // must be in the past within days
}

function randomPlaceholder() {
  const n = Math.floor(Math.random() * PLACEHOLDER_COUNT) + 1; // 1..PLACEHOLDER_COUNT
  return `${PLACEHOLDER_PATH_PREFIX}${n}.png`;
}

function slugForClass(text) {
  // produce "-friendly" suffix for classes like lmy-label
  return text
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[\s]+/g, '-')          // spaces -> -
    .replace(/[^a-z0-9\-_]/g, '')    // remove chars that aren't safe for class names
    .replace(/^-+|-+$/g, '');        // trim leading/trailing hyphens
}

/* ----------------------- End ----------------------- */
