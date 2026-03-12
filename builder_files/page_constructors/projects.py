import os
import json
import re
import logging
import html as html_module
from datetime import datetime
from typing import Optional, List, Dict, Any

from builder_files.util.html import render_html_vars

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

PROJECTS_JSON = "resource/data/project_list.json"
HOMEPAGE_TEMPLATE = "builder_files/templates/homepage.html"
PROJECTS_PAGE_TEMPLATE = "builder_files/templates/projects_page.html"
HOMEPAGE_OUTPUT = "index.html"
PROJECTS_OUTPUT = "projects/index.html"

MAX_TAGS = 5
MAX_TECH = 6
DEFAULT_BRAND_COLOR = "#4A90E2"


def _slugify_tech(name: str) -> str:
    """Convert tech name to a CSS class, e.g. 'React.js' -> 'react-js-tag'."""
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    return f"{slug}-tag"


def _parse_project_date(project: Dict[str, Any]) -> Optional[datetime]:
    """Parse the best available date from a project dict for sort purposes."""
    date_obj = project.get("date", {})
    if not isinstance(date_obj, dict):
        return None
    for key in ("published", "started"):
        val = date_obj.get(key, "")
        if not val or val == "N/A":
            continue
        s = val.strip()
        if s.endswith("Z"):
            s = s[:-1] + "+00:00"
        try:
            return datetime.fromisoformat(s).replace(tzinfo=None)
        except Exception:
            try:
                return datetime.strptime(val[:10], "%Y-%m-%d")
            except Exception:
                pass
    return None


def _get_link(project: Dict[str, Any]) -> tuple[str, bool]:
    """Return (href, open_in_new_tab) for a project card."""
    links = project.get("links", {})
    if not isinstance(links, dict):
        return "#", False
    click = links.get("click", "").strip()
    if click:
        return click, False
    demo = links.get("demo", "").strip()
    if demo:
        return demo, True
    return "#", False


def _build_tags_html(tags: List[str], max_count: int = MAX_TAGS) -> str:
    parts = []
    for i, tag in enumerate(tags[:max_count]):
        if i > 0:
            parts.append('                <div class="dot"></div>')
        parts.append(f'                <span class="tag">{html_module.escape(tag)}</span>')
    return "\n".join(parts)


def _build_technologies_html(technologies: List[str], max_count: int = MAX_TECH) -> str:
    parts = []
    for tech in technologies[:max_count]:
        cls = _slugify_tech(tech)
        parts.append(f'                <span class="tag {cls}">{html_module.escape(tech)}</span>')
    return "\n".join(parts)


def _build_project_card_html(project: Dict[str, Any], card_type: str) -> str:
    """Build HTML for a single project card. card_type is 'carousel' or 'grid'."""
    pid = html_module.escape(project.get("id", ""))
    name = html_module.escape(project.get("name", ""))
    href, new_tab = _get_link(project)
    href_escaped = html_module.escape(href)

    brand = project.get("brand", {})
    icon = html_module.escape((brand.get("icon", "") or "") if isinstance(brand, dict) else "")

    desc = project.get("description", {})
    short_desc = html_module.escape((desc.get("short_description", "") or "") if isinstance(desc, dict) else "")
    long_desc = html_module.escape((desc.get("long", "") or "") if isinstance(desc, dict) else "")

    tags = project.get("tags", [])
    technologies = project.get("technologies", [])
    tags_html = _build_tags_html(tags, MAX_TAGS)
    tech_html = _build_technologies_html(technologies, MAX_TECH)

    target_attr = ' target="_blank" rel="noopener noreferrer"' if new_tab else ""

    return (
        f'<a class="projects-item-{card_type}" data-project-id="{pid}"'
        f' href="{href_escaped}"{target_attr} aria-label="{name}">\n'
        f'    <div class="item-header">\n'
        f'        <img class="project-icon" src="{icon}" alt="{name} Icon" />\n'
        f'        <div class="item-header-text">\n'
        f'            <h3>{name}</h3>\n'
        f'            <p class="short-description">{short_desc}</p>\n'
        f'        </div>\n'
        f'    </div>\n'
        f'    <div class="item-body">\n'
        f'        <p class="long-description">{long_desc}</p>\n'
        f'    </div>\n'
        f'    <div class="item-footer">\n'
        f'        <div class="list-of-tags">\n'
        f'{tags_html}\n'
        f'        </div>\n'
        f'        <div class="list-of-technologies">\n'
        f'{tech_html}\n'
        f'        </div>\n'
        f'    </div>\n'
        f'</a>'
    )


def _build_brand_styles_html(projects: List[Dict[str, Any]], card_types: List[str]) -> str:
    """Build a <style> block injecting brand colors via ::before pseudo-elements."""
    if not projects:
        return ""
    rules = []
    for project in projects:
        pid = project.get("id", "")
        if not pid:
            continue
        brand = project.get("brand", {})
        color = (brand.get("color", "") or DEFAULT_BRAND_COLOR) if isinstance(brand, dict) else DEFAULT_BRAND_COLOR
        selectors = ", ".join(
            f'.projects-item-{ct}[data-project-id="{pid}"]::before'
            for ct in card_types
        )
        rules.append(f"    {selectors} {{ background: {color}; }}")
    if not rules:
        return ""
    return "<style>\n" + "\n".join(rules) + "\n</style>"


def build_projects_page(
    json_path: str = PROJECTS_JSON,
    template_path: str = PROJECTS_PAGE_TEMPLATE,
    output_path: str = PROJECTS_OUTPUT,
) -> str:
    """Build the static projects page (grid of all non-hidden projects, sorted newest first)."""
    logger.info("Building projects page")

    with open(json_path, "r", encoding="utf-8") as f:
        projects = json.load(f)

    with open(template_path, "r", encoding="utf-8") as f:
        template = f.read()

    visible = [p for p in projects if not p.get("hidden", False)]
    visible.sort(key=lambda p: _parse_project_date(p) or datetime.min, reverse=True)

    cards_html = "\n\n".join(_build_project_card_html(p, "grid") for p in visible)
    brand_styles = _build_brand_styles_html(visible, ["carousel", "grid"])

    rendered = render_html_vars(
        template,
        values={
            "projects_grid_html": cards_html,
            "projects_brand_styles": brand_styles,
        },
        html_escape=False,
        missing="",
    )

    os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        f.write(rendered)

    logger.info("Wrote projects page: %s", output_path)
    return output_path


def build_homepage(
    json_path: str = PROJECTS_JSON,
    template_path: str = HOMEPAGE_TEMPLATE,
    output_path: str = HOMEPAGE_OUTPUT,
) -> str:
    """Build the static homepage (featured projects carousel, preserving JSON order)."""
    logger.info("Building homepage")

    with open(json_path, "r", encoding="utf-8") as f:
        projects = json.load(f)

    with open(template_path, "r", encoding="utf-8") as f:
        template = f.read()

    # Featured carousel: filter featured + not hidden, preserve original JSON order
    featured = [p for p in projects if p.get("featured", False) and not p.get("hidden", False)]

    cards_html = "\n\n".join(_build_project_card_html(p, "carousel") for p in featured)
    brand_styles = _build_brand_styles_html(featured, ["carousel", "grid"])

    rendered = render_html_vars(
        template,
        values={
            "projects_carousel_html": cards_html,
            "projects_brand_styles": brand_styles,
        },
        html_escape=False,
        missing="",
    )

    with open(output_path, "w", encoding="utf-8") as f:
        f.write(rendered)

    logger.info("Wrote homepage: %s", output_path)
    return output_path
