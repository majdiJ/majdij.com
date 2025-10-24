/**
 * dynamic_article_page.js
 *
 * Populates an article page from /resource/data/article_list.json (client-side)
 * and updates <head> meta tags (title, description, canonical, Open Graph, Twitter, article times).
 *
 * Behavior:
 * - Finds article ID from URL (last non-empty segment that isn't 'articles')
 * - Fetches JSON array at DATA_PATH and finds the article (even if hidden)
 * - Updates page content (title h2, strap-line, featured image, author/date at header+footer)
 * - Updates <head> meta tags to reflect article details
 */

/* ----------------------- Configuration ----------------------- */
const DATA_PATH = '/resource/data/article_list.json';
const SITE_OWNER = 'Majdi Jaigirdar';                // used in document.title fallback and author fallback
const SITE_BASE_URL = (window && window.location && window.location.origin) ? window.location.origin : 'https://majdij.com'; // used for canonical/og:url if needed
const PLACEHOLDER_COUNT = 10;
const PLACEHOLDER_PATH_PREFIX = '/resource/image/placeholder/'; // returns e.g. '/resource/image/placeholder/3.png'
const PLACEHOLDER_EXT = '.png';
const LINK_PREFIX = '/articles/'; // canonical and built link prefix

/* ----------------------- Main ----------------------- */
document.addEventListener('DOMContentLoaded', () => {
  (async () => {
    try {
      const articleId = getArticleIdFromPath();
      if (!articleId) {
        showError('Could not determine article ID from URL.');
        return;
      }
      const articles = await fetchArticleList();
      const article = findArticleById(articles, articleId);
      if (!article) {
        showError(`Article "${articleId}" not found.`);
        return;
      }

      populateArticlePage(article, articleId);
    } catch (err) {
      console.error('Error in dynamic_article_page:', err);
      showError('An error occurred while loading the article.');
    }
  })();
});

/* ----------------------- Fetching ----------------------- */
async function fetchArticleList() {
  const resp = await fetch(DATA_PATH, { cache: 'no-store' });
  if (!resp.ok) throw new Error(`Failed to fetch ${DATA_PATH}: ${resp.status}`);
  const json = await resp.json();
  if (!Array.isArray(json)) throw new Error('Article JSON is not an array');
  return json;
}

function findArticleById(list, id) {
  return list.find(item => String(item?.id) === String(id)) || null;
}

/* ----------------------- Populate Page & Head ----------------------- */
function populateArticlePage(article, articleId) {
  const title = article.title || 'Untitled';
  const strapLine = article.strap_line || '';
  const featuredImageRaw = (article.featured_image && article.featured_image.trim()) ? article.featured_image : null;
  const featuredImageAbs = absoluteImageUrlOrPlaceholder(featuredImageRaw);
  const publishedISO = article?.date?.published || null;
  const editedISO = article?.date?.edited || null;

  // Update page title (tab)
  document.title = `${title} | ${SITE_OWNER}`;

  // Update H2 title
  const h2 = document.querySelector('main.articles-page-main article header h2');
  if (h2) h2.textContent = title;

  // Update strap-line (header)
  const strapHeader = document.querySelector('main.articles-page-main article header .strap-line');
  if (strapHeader) strapHeader.textContent = strapLine;

  // Update featured image (first image in .article-image-container)
  const imgContainer = document.querySelector('.article-image-container');
  if (imgContainer) {
    let img = imgContainer.querySelector('img');
    if (!img) {
      img = document.createElement('img');
      imgContainer.appendChild(img);
    }
    img.src = featuredImageAbs;
    img.alt = title;
  }

  // Build author/date markup
  const authorsArray = Array.isArray(article?.author) ? article.author : [];
  const authorsHtml = buildAuthorsMarkup(authorsArray);
  const authorsPlain = buildAuthorsPlain(authorsArray);
  const dateHtml = buildDateMarkup(publishedISO, editedISO);

  // Update both header and footer author-date elements
  const authorDateEls = document.querySelectorAll('.author-date');
  if (authorDateEls && authorDateEls.length > 0) {
    authorDateEls.forEach(el => {
      el.innerHTML = `By ${authorsHtml} | ${dateHtml}`;
    });
  } else {
    // fallback: create header & footer author-date if missing
    const header = document.querySelector('main.articles-page-main article header');
    if (header) {
      const p = document.createElement('p');
      p.className = 'author-date';
      p.innerHTML = `By ${authorsHtml} | ${dateHtml}`;
      header.appendChild(p);
    }
    const footer = document.querySelector('main.articles-page-main article footer');
    if (footer) {
      const p = document.createElement('p');
      p.className = 'author-date';
      p.innerHTML = `By ${authorsHtml} | ${dateHtml}`;
      footer.appendChild(p);
    }
  }

  // Build absolute canonical and OG url
  const canonicalPath = `${LINK_PREFIX}${encodeURIComponent(articleId)}/`;
  const canonicalAbs = absoluteUrl(canonicalPath);

  // Update head meta tags (title was already set)
  updateHeadMeta({
    title,
    description: strapLine || generateDescriptionFromContent(article),
    keywords: generateKeywords(article, title),
    author: authorsPlain || SITE_OWNER,
    canonical: canonicalAbs,
    og: {
      title,
      description: strapLine || generateDescriptionFromContent(article),
      image: featuredImageAbs,
      url: canonicalAbs,
      type: 'article'
    },
    twitter: {
      title,
      description: strapLine || generateDescriptionFromContent(article),
      image: featuredImageAbs
    },
    articleTimes: {
      published: publishedISO,
      modified: editedISO
    }
  });
}

/* ----------------------- Head helpers ----------------------- */

function updateHeadMeta(opts = {}) {
  // opts: { title, description, keywords, author, canonical, og: {...}, twitter: {...}, articleTimes: {published, modified} }
  if (!opts) return;

  // Title already set via document.title; keep in sync
  if (opts.title) document.title = opts.title + ' | ' + SITE_OWNER;

  // canonical link
  if (opts.canonical) upsertLinkRel('canonical', opts.canonical);

  // common meta
  if (opts.description !== undefined) upsertMeta('description', opts.description);
  if (opts.keywords !== undefined) upsertMeta('keywords', opts.keywords);
  if (opts.author !== undefined) upsertMeta('author', opts.author);

  // Open Graph (property)
  if (opts.og) {
    upsertMetaProperty('og:title', opts.og.title || opts.title || document.title);
    upsertMetaProperty('og:description', opts.og.description || opts.description || '');
    upsertMetaProperty('og:image', opts.og.image || '');
    upsertMetaProperty('og:url', opts.og.url || window.location.href);
    upsertMetaProperty('og:type', opts.og.type || 'article');
  }

  // Twitter tags (name)
  if (opts.twitter) {
    upsertMeta('twitter:card', 'summary_large_image'); // default to large image
    upsertMeta('twitter:title', opts.twitter.title || opts.title || document.title);
    upsertMeta('twitter:description', opts.twitter.description || opts.description || '');
    upsertMeta('twitter:image', opts.twitter.image || (opts.og && opts.og.image) || '');
  }

  // Article times
  if (opts.articleTimes) {
    if (opts.articleTimes.published) upsertMetaProperty('article:published_time', opts.articleTimes.published);
    if (opts.articleTimes.modified) upsertMetaProperty('article:modified_time', opts.articleTimes.modified);
  }

  // Ensure there is at least an og:image and twitter:image (if not, use site default)
  const siteDefaultImage = absoluteUrl('/resource/image/majdi.png');
  const ogImageEl = document.querySelector('meta[property="og:image"]');
  if (!ogImageEl || !ogImageEl.getAttribute('content')) upsertMetaProperty('og:image', siteDefaultImage);
  const twImageEl = document.querySelector('meta[name="twitter:image"]');
  if (!twImageEl || !twImageEl.getAttribute('content')) upsertMeta('twitter:image', siteDefaultImage);
}

/* ----------------------- Utility functions ----------------------- */

function upsertMeta(name, value) {
  if (!name) return;
  const selector = `meta[name="${name}"]`;
  let el = document.head.querySelector(selector);
  if (el) {
    el.setAttribute('content', value ?? '');
  } else {
    el = document.createElement('meta');
    el.setAttribute('name', name);
    el.setAttribute('content', value ?? '');
    document.head.appendChild(el);
  }
}

function upsertMetaProperty(propName, value) {
  if (!propName) return;
  const selector = `meta[property="${propName}"]`;
  let el = document.head.querySelector(selector);
  if (el) {
    el.setAttribute('content', value ?? '');
  } else {
    el = document.createElement('meta');
    el.setAttribute('property', propName);
    el.setAttribute('content', value ?? '');
    document.head.appendChild(el);
  }
}

function upsertLinkRel(rel, href) {
  if (!rel) return;
  const selector = `link[rel="${rel}"]`;
  let el = document.head.querySelector(selector);
  if (el) {
    el.setAttribute('href', href ?? '');
  } else {
    el = document.createElement('link');
    el.setAttribute('rel', rel);
    el.setAttribute('href', href ?? '');
    document.head.appendChild(el);
  }
}

function absoluteUrl(pathOrUrl) {
  if (!pathOrUrl) return SITE_BASE_URL;
  // If already absolute (http/https)
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  // If starts with '//', make explicit protocol
  if (/^\/\//.test(pathOrUrl)) return window.location.protocol + pathOrUrl;
  // If starts with '/', join origin + path
  if (pathOrUrl.startsWith('/')) {
    return removeTrailingSlash(SITE_BASE_URL) + pathOrUrl;
  }
  // else treat as relative to origin
  return removeTrailingSlash(SITE_BASE_URL) + '/' + pathOrUrl;
}

function absoluteImageUrlOrPlaceholder(imgPath) {
  if (imgPath && typeof imgPath === 'string' && imgPath.trim()) {
    return absoluteUrl(imgPath.trim());
  }
  // fallback to a random placeholder
  const n = Math.floor(Math.random() * PLACEHOLDER_COUNT) + 1;
  return absoluteUrl(`${PLACEHOLDER_PATH_PREFIX}${n}${PLACEHOLDER_EXT}`);
}

function removeTrailingSlash(u) {
  return u.replace(/\/+$/, '');
}

/* ----------------------- Content helpers ----------------------- */

function buildAuthorsMarkup(authors) {
  if (!Array.isArray(authors) || authors.length === 0) {
    return `<a href="/">` + escapeHtml(SITE_OWNER) + `</a>`;
  }
  const parts = authors.map(a => {
    const name = a?.name ? String(a.name) : 'Unknown';
    const url = a?.url ? String(a.url) : '#';
    return `<a href="${escapeHtmlAttr(url)}">${escapeHtml(name)}</a>`;
  });
  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  const last = parts.pop();
  return `${parts.join(', ')} and ${last}`;
}

function buildAuthorsPlain(authors) {
  if (!Array.isArray(authors) || authors.length === 0) return SITE_OWNER;
  return authors.map(a => (a?.name ? String(a.name) : 'Unknown')).join(', ');
}

function buildDateMarkup(publishedISO, editedISO) {
  const published = safeDate(publishedISO);
  const publishedStr = publishedISO ? formatDateWithWeekday(published) : 'Unknown';
  let html = `Published on ${publishedStr}`;
  if (editedISO) {
    const edited = safeDate(editedISO);
    if (!isNaN(edited) && String(editedISO) !== String(publishedISO)) {
      const editedStr = formatDateWithWeekday(edited);
      html += ` | Edited on ${editedStr}`;
    }
  }
  return html;
}

function safeDate(isoString) {
  if (!isoString) return new Date(NaN);
  const d = new Date(isoString);
  return d;
}

const weekdayNames = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const monthNames = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December'
];

function formatDateWithWeekday(date) {
  if (!date || isNaN(date)) return 'Unknown';
  const weekday = weekdayNames[date.getDay()];
  const day = date.getDate();
  const month = monthNames[date.getMonth()];
  const year = date.getFullYear();
  return `${weekday}, ${day}${ordinalSuffix(day)} ${month} ${year}`;
}

function ordinalSuffix(n) {
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return 'th';
  const rem10 = n % 10;
  if (rem10 === 1) return 'st';
  if (rem10 === 2) return 'nd';
  if (rem10 === 3) return 'rd';
  return 'th';
}

/* ----------------------- Small helpers ----------------------- */

function generateDescriptionFromContent(article) {
  // Fallback description if strap_line is empty: try take first non-empty stringy content field
  if (article?.strap_line && String(article.strap_line).trim()) return String(article.strap_line).trim();
  if (article?.title && String(article.title).trim()) return String(article.title).trim();
  // last fallback
  return `Article by ${buildAuthorsPlain(article?.author)} on ${SITE_OWNER}'s site.`;
}

function generateKeywords(article, title) {
  // Combine: title words, labels, site owner, and some defaults
  const kw = new Set();
  if (title) title.split(/\s+/).filter(Boolean).slice(0, 10).forEach(w => kw.add(cleanKeyword(w)));
  if (Array.isArray(article?.labels)) article.labels.forEach(l => l && kw.add(cleanKeyword(l)));
  kw.add(cleanKeyword(SITE_OWNER));
  ['article','blog','portfolio'].forEach(d => kw.add(d));
  return Array.from(kw).slice(0, 50).join(', ');
}

function cleanKeyword(s) {
  return String(s || '').replace(/[^\w\s-]/g, '').trim();
}

function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeHtmlAttr(str) {
  return escapeHtml(String(str || '')).replace(/\n/g, '');
}

/* ----------------------- URL helpers ----------------------- */

function getArticleIdFromPath() {
  const path = window.location.pathname || '';
  const parts = path.split('/').filter(Boolean); // removes empty segments
  if (parts.length === 0) return null;
  for (let i = parts.length - 1; i >= 0; i--) {
    const seg = parts[i];
    if (seg && seg.toLowerCase() !== 'articles') {
      return decodeURIComponent(seg);
    }
  }
  return null;
}

/* ----------------------- Error UI ----------------------- */
function showError(message) {
  const main = document.querySelector('main.articles-page-main');
  if (main) {
    main.innerHTML = `<div class="article-error"><p>${escapeHtml(message)}</p></div>`;
  } else {
    console.error(message);
  }
}
