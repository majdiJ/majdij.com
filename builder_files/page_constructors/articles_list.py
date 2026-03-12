import os
import json
import re
import logging
import html as html_module
from datetime import datetime
from typing import Optional, Dict, Any, List

from builder_files.util.html import render_html_vars

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

ARTICLES_JSON = "resource/data/articles_data.json"
ARTICLES_LIST_TEMPLATE = "builder_files/templates/articles_list_page.html"
ARTICLES_LIST_OUTPUT = "articles/index.html"

NEW_ARTICLE_DAYS = 30
PLACEHOLDER_COUNT = 10


def _ordinal(n: int) -> str:
    """Return the ordinal string for an integer, e.g. 1 -> '1st', 3 -> '3rd'."""
    if 11 <= (n % 100) <= 13:
        suffix = "th"
    else:
        suffix = {1: "st", 2: "nd", 3: "rd"}.get(n % 10, "th")
    return f"{n}{suffix}"


def _parse_iso_date(iso_str: Optional[str]) -> Optional[datetime]:
    """Parse an ISO 8601 date string to a naive datetime, or return None."""
    if not iso_str:
        return None
    s = iso_str.strip()
    if s.endswith("Z"):
        s = s[:-1] + "+00:00"
    try:
        return datetime.fromisoformat(s).replace(tzinfo=None)
    except Exception:
        try:
            return datetime.strptime(iso_str[:10], "%Y-%m-%d")
        except Exception:
            return None


def _format_date(iso_str: Optional[str]) -> str:
    """Format an ISO date as '3rd March 2026', or 'Unknown date'."""
    dt = _parse_iso_date(iso_str)
    if dt is None:
        return "Unknown date"
    return f"{_ordinal(dt.day)} {dt.strftime('%B %Y')}"


def _is_new_article(iso_str: Optional[str], threshold_days: int = NEW_ARTICLE_DAYS) -> bool:
    """Return True if the article's publish date is within threshold_days of today."""
    dt = _parse_iso_date(iso_str)
    if dt is None:
        return False
    diff = abs((datetime.utcnow() - dt).days)
    return diff <= threshold_days


def _deterministic_placeholder(article_id: str, count: int = PLACEHOLDER_COUNT) -> str:
    """Return a stable placeholder image path derived from the article ID."""
    n = (hash(article_id) % count) + 1
    if n <= 0:
        n += count
    return f"/resource/image/placeholder/{n}.png"


def _slugify_label(label: str) -> str:
    """Convert a label string to a CSS class fragment, e.g. 'A-Level' -> 'a-level'."""
    return re.sub(r"[^a-z0-9]+", "-", label.lower()).strip("-")


def _build_article_item_html(article: Dict[str, Any]) -> str:
    """Build HTML for a single article list item."""
    article_id = article.get("id", "")
    title = html_module.escape(article.get("title", ""))
    strap_line = html_module.escape(article.get("strap_line", ""))

    featured_image = article.get("featured_image", "")
    image_src = html_module.escape(featured_image if featured_image else _deterministic_placeholder(article_id))

    date_obj = article.get("date", {})
    published_iso = date_obj.get("published", "") if isinstance(date_obj, dict) else ""
    date_str = _format_date(published_iso)

    # Build labels HTML
    label_parts: List[str] = []
    for label in article.get("labels", []):
        slug = _slugify_label(label)
        label_parts.append(f'<span class="label l{slug}">{html_module.escape(label)}</span>')

    if _is_new_article(published_iso):
        label_parts.append('<span class="label label-new">New Article</span>')

    if article.get("featured", False):
        label_parts.append('<span class="label label-featured">Featured</span>')

    labels_html = "\n                    ".join(label_parts)

    return (
        f'<a class="article-item" href="/articles/{html_module.escape(article_id)}/">\n'
        f'    <div class="item-image-body">\n'
        f'        <img src="{image_src}" alt="{title}" loading="lazy" />\n'
        f'    </div>\n'
        f'    <div class="item-header">\n'
        f'        <h3>{title}</h3>\n'
        f'        <p class="strap-line">{strap_line}</p>\n'
        f'        <p class="date-and-info">\n'
        f'            <span class="date">{html_module.escape(date_str)}</span>\n'
        f'            <span class="extra-info-labels">\n'
        f'                    {labels_html}\n'
        f'            </span>\n'
        f'        </p>\n'
        f'    </div>\n'
        f'</a>'
    )


def build_articles_list_page(
    json_path: str = ARTICLES_JSON,
    template_path: str = ARTICLES_LIST_TEMPLATE,
    output_path: str = ARTICLES_LIST_OUTPUT,
) -> str:
    """Build the static articles list page (sorted newest first, hidden articles excluded)."""
    logger.info("Building articles list page")

    with open(json_path, "r", encoding="utf-8") as f:
        articles = json.load(f)

    with open(template_path, "r", encoding="utf-8") as f:
        template = f.read()

    visible = [a for a in articles if not a.get("hidden", False)]
    visible.sort(
        key=lambda a: _parse_iso_date(
            a.get("date", {}).get("published", "") if isinstance(a.get("date"), dict) else ""
        ) or datetime.min,
        reverse=True,
    )

    items_html = "\n\n".join(_build_article_item_html(a) for a in visible)

    rendered = render_html_vars(
        template,
        values={"articles_list_html": items_html},
        html_escape=False,
        missing="",
    )

    os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        f.write(rendered)

    logger.info("Wrote articles list page: %s", output_path)
    return output_path
