// resource/script/projects-carousel-component.js
(() => {
  'use strict';

  const JSON_PATH = '/resource/data/project_list.json';
  const CONTAINER_SELECTOR = '.container-projects-list-carousel';
  const MAX_TAGS = 5;
  const MAX_TECH = 6;
  const DEFAULT_BRAND_COLOR = '#4A90E2';

  function sanitizeClassName(name) {
    // convert to safe classname: remove/replace spaces and non-alphanum characters
    return String(name)
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

  function applyBrandColorStyle(projectId, color) {
    try {
      const safeId = String(projectId).replace(/"/g, '\\"');
      const style = document.createElement('style');
      style.textContent = `.projects-item-carousel[data-project-id="${safeId}"]::before { background: ${color}; }`;
      document.head.appendChild(style);
    } catch (e) {
      // fallback: do nothing if style injection fails
      console.error('Failed to inject brand color style for', projectId, e);
    }
  }

  function renderProjectItem(project) {
    const a = createElem('a', 'projects-item-carousel');

    // Link selection logic:
    // - prefer links.click (same tab)
    // - fallback to links.demo (open in new tab)
    // - otherwise '#'
    const hasClick = project.links && project.links.click;
    const hasDemo = project.links && project.links.demo;
    if (hasClick) {
      a.href = project.links.click;
      // open in same tab (preserve existing behavior)
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
    img.src = project.brand && project.brand.icon ? project.brand.icon : '';
    img.alt = (project.name ? `${project.name} Icon` : 'Project icon');
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

    // tags (max 4)
    const tagsContainer = createElem('div', 'list-of-tags');
    if (Array.isArray(project.tags) && project.tags.length > 0) {
      const tagsToShow = project.tags.slice(0, MAX_TAGS);
      tagsToShow.forEach((t, i) => {
        tagsContainer.appendChild(createTagSpan(t));
        if (i < tagsToShow.length - 1) tagsContainer.appendChild(createDot());
      });
    }
    itemFooter.appendChild(tagsContainer);

    // technologies (max 6)
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

    // Inject brand color override for ::before using attribute selector
    const brandColor = (project.brand && project.brand.color) ? project.brand.color : DEFAULT_BRAND_COLOR;
    applyBrandColorStyle(project.id || '', brandColor);

    return a;
  }

  function renderProjects(projects) {
    const container = document.querySelector(CONTAINER_SELECTOR);
    if (!container) {
      console.warn('Projects container not found:', CONTAINER_SELECTOR);
      return;
    }

    // clear existing content (so static example markup is removed if present)
    container.innerHTML = '';

    if (!Array.isArray(projects) || projects.length === 0) {
      // nothing to render
      return;
    }

    // keep order from JSON, but only those with featured === true
    const featured = projects.filter(p => p && (p.featured === true || p.featured === 'true'));

    featured.forEach(project => {
      try {
        const item = renderProjectItem(project);
        container.appendChild(item);
      } catch (e) {
        console.error('Error rendering project', project && project.id, e);
      }
    });
  }

  function loadJsonAndRender() {
    fetch(JSON_PATH, {cache: 'no-cache'})
      .then(resp => {
        if (!resp.ok) throw new Error(`Failed to load ${JSON_PATH}: ${resp.status} ${resp.statusText}`);
        return resp.json();
      })
      .then(json => {
        renderProjects(json);
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
