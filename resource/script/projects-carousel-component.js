// resource/script/projects-carousel-component.js
(() => {
  'use strict';

  const JSON_PATH = '/resource/data/project_list.json';
  const CAROUSEL_CONTAINER_SELECTOR = '.container-projects-list-carousel';
  const GRID_CONTAINER_SELECTOR = '.container-projects-list-grid';
  const MAX_TAGS = 5;
  const MAX_TECH = 6;
  const DEFAULT_BRAND_COLOR = '#4A90E2';

  function sanitizeClassName(name) {
    return String(name || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9\-]/g, '-')
      .replace(/\-+/g, '-')
      .replace(/^\-+|\-+$/g, '');
  }

  function createElem(tag, className) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    return el;
  }

  function createTagSpan(text, extraClass) {
    const s = createElem('span', 'tag');
    if (extraClass) s.classList.add(extraClass);
    s.textContent = text;
    return s;
  }

  function createDot() {
    return createElem('div', 'dot');
  }

  // Inject style that targets both carousel and grid items' ::before pseudo-element
  function applyBrandColorStyle(projectId, color) {
    try {
      const safeId = String(projectId).replace(/"/g, '\\"');
      const style = document.createElement('style');
      style.textContent = `
.projects-item-carousel[data-project-id="${safeId}"]::before,
.projects-item-grid[data-project-id="${safeId}"]::before {
  background: ${color};
}
      `.trim();
      document.head.appendChild(style);
    } catch (e) {
      console.error('Failed to inject brand color style for', projectId, e);
    }
  }

  // returns timestamp (ms) for published or started; if neither valid return Number.NEGATIVE_INFINITY
  function getProjectTimestamp(project) {
    const tryParse = (v) => {
      if (!v || typeof v !== 'string') return NaN;
      const t = Date.parse(v);
      return Number.isFinite(t) ? t : NaN;
    };

    const published = tryParse(project.date && project.date.published);
    if (!Number.isNaN(published)) return published;

    const started = tryParse(project.date && project.date.started);
    if (!Number.isNaN(started)) return started;

    // neither valid -> placed last when sorting descending
    return Number.NEGATIVE_INFINITY;
  }

  // Build DOM anchor element for a project. `mode` is 'carousel' or 'grid' to set anchor class.
  function renderProjectItem(project, mode = 'carousel') {
    const anchorClass = mode === 'grid' ? 'projects-item-grid' : 'projects-item-carousel';
    const a = createElem('a', anchorClass);

    // Link selection logic:
    // - prefer links.click (same tab)
    // - fallback to links.demo (open in new tab)
    // - otherwise '#'
    const hasClick = project.links && project.links.click;
    const hasDemo = project.links && project.links.demo;
    if (hasClick) {
      a.href = project.links.click;
    } else if (!hasClick && hasDemo) {
      a.href = project.links.demo;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
    } else {
      a.href = '#';
    }

    a.setAttribute('data-project-id', project.id || '');
    a.setAttribute('aria-label', project.name || 'Project');

    // ITEM HEADER
    const itemHeader = createElem('div', 'item-header');

    const img = createElem('img', 'project-icon');
    img.src = (project.brand && project.brand.icon) ? project.brand.icon : '';
    img.alt = project.name ? `${project.name} Icon` : 'Project icon';
    itemHeader.appendChild(img);

    const itemHeaderText = createElem('div', 'item-header-text');
    const h3 = createElem('h3');
    h3.textContent = project.name || '';
    const shortP = createElem('p', 'short-description');
    shortP.textContent = (project.description && project.description.short_description) ? project.description.short_description : '';
    itemHeaderText.appendChild(h3);
    itemHeaderText.appendChild(shortP);

    itemHeader.appendChild(itemHeaderText);
    a.appendChild(itemHeader);

    // ITEM BODY
    const itemBody = createElem('div', 'item-body');
    const longP = createElem('p', 'long-description');
    longP.textContent = (project.description && project.description.long) ? project.description.long : '';
    itemBody.appendChild(longP);
    a.appendChild(itemBody);

    // ITEM FOOTER
    const itemFooter = createElem('div', 'item-footer');

    // tags (max MAX_TAGS)
    const tagsContainer = createElem('div', 'list-of-tags');
    if (Array.isArray(project.tags) && project.tags.length > 0) {
      const tagsToShow = project.tags.slice(0, MAX_TAGS);
      tagsToShow.forEach((t, i) => {
        tagsContainer.appendChild(createTagSpan(t));
        if (i < tagsToShow.length - 1) tagsContainer.appendChild(createDot());
      });
    }
    itemFooter.appendChild(tagsContainer);

    // technologies (max MAX_TECH)
    const techContainer = createElem('div', 'list-of-technologies');
    if (Array.isArray(project.technologies) && project.technologies.length > 0) {
      const techToShow = project.technologies.slice(0, MAX_TECH);
      techToShow.forEach((tech) => {
        const techClass = sanitizeClassName(tech) + '-tag';
        techContainer.appendChild(createTagSpan(tech, techClass));
      });
    }
    itemFooter.appendChild(techContainer);

    a.appendChild(itemFooter);

    // Apply brand color
    const brandColor = (project.brand && project.brand.color) ? project.brand.color : DEFAULT_BRAND_COLOR;
    applyBrandColorStyle(project.id || '', brandColor);

    return a;
  }

  // Render into a specific container element. mode: 'carousel'|'grid'
  function renderToContainer(containerEl, projects, mode) {
    if (!containerEl) return;

    containerEl.innerHTML = '';

    if (!Array.isArray(projects) || projects.length === 0) return;

    let itemsToRender;

    if (mode === 'carousel') {
      // carousel: only featured === true and not hidden
      itemsToRender = projects.filter(p => p && (p.featured === true || p.featured === 'true') && !(p.hidden === true || p.hidden === 'true'));
      // keep original JSON order
    } else {
      // grid: include all not hidden items, ordered by published/started desc
      itemsToRender = projects.filter(p => p && !(p.hidden === true || p.hidden === 'true'));
      // attach timestamp and original index for stable sort
      itemsToRender = itemsToRender.map((p, idx) => ({ p, ts: getProjectTimestamp(p), idx }));
      // sort desc by ts, if equal preserve original order (lower idx first)
      itemsToRender.sort((a, b) => {
        if (a.ts === b.ts) return a.idx - b.idx;
        return b.ts - a.ts;
      });
      itemsToRender = itemsToRender.map(x => x.p);
    }

    itemsToRender.forEach(project => {
      try {
        const item = renderProjectItem(project, mode === 'grid' ? 'grid' : 'carousel');
        containerEl.appendChild(item);
      } catch (e) {
        console.error('Error rendering project', project && project.id, e);
      }
    });
  }

  function loadJsonAndRender() {
    fetch(JSON_PATH, { cache: 'no-cache' })
      .then(resp => {
        if (!resp.ok) throw new Error(`Failed to load ${JSON_PATH}: ${resp.status} ${resp.statusText}`);
        return resp.json();
      })
      .then(json => {
        // Find containers on page and render to each accordingly.
        const carouselContainer = document.querySelector(CAROUSEL_CONTAINER_SELECTOR);
        const gridContainer = document.querySelector(GRID_CONTAINER_SELECTOR);

        if (!carouselContainer && !gridContainer) {
          console.warn('No projects container found (carousel or grid). Nothing rendered.');
          return;
        }

        if (carouselContainer) renderToContainer(carouselContainer, json, 'carousel');
        if (gridContainer) renderToContainer(gridContainer, json, 'grid');
      })
      .catch(err => {
        console.error('Could not load project list JSON:', err);
      });
  }

  // Initialize on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadJsonAndRender);
  } else {
    loadJsonAndRender();
  }
})();
