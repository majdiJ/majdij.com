# build_script.py
import os
import json
import logging
import html as html_module
from datetime import datetime
from typing import Dict, Any, Optional

# adjust the import path as needed - assumes this script is run from repo root
from builder_files.util.html import (
    md_file_to_html_fragment,
    render_html_vars,
    indent_html,
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Defaults - change if needed
ARTICLES_JSON = "resource/data/articles_data.json"
TEMPLATE_PATH = "builder_files/templates/article_page.html"
MD_ROOT = "resource/articles"
OUTPUT_ROOT = "articles"
BASE_URL = "https://majdij.com"  # used to build absolute URLs for social images (if desired)


def _parse_iso_date_to_human(iso_str: Optional[str]) -> Optional[str]:
    """
    Convert an ISO 8601 date (e.g. "2025-10-29T00:00:00Z") to a human-readable date,
    e.g. "29 Oct 2025". Returns None if iso_str is falsy.
    """
    if not iso_str:
        return None
    # handle trailing Z
    s = iso_str.strip()
    if s.endswith("Z"):
        s = s[:-1] + "+00:00"
    try:
        dt = datetime.fromisoformat(s)
    except Exception:
        # Fallback parse: try trimming timezone and parsing date-only
        try:
            dt = datetime.strptime(iso_str[:10], "%Y-%m-%d")
        except Exception:
            logger.exception("Failed to parse date: %s", iso_str)
            return None

    # produce "29 Oct 2025", remove leading zero from day
    formatted = dt.strftime("%d %b %Y").lstrip("0")
    return formatted


def _ensure_dir(path: str) -> None:
    os.makedirs(path, exist_ok=True)


def _make_full_url_if_rooted(path: Optional[str]) -> Optional[str]:
    if not path:
        return None
    if path.startswith("http://") or path.startswith("https://"):
        return path
    if path.startswith("/"):
        # convert to absolute based on BASE_URL
        return BASE_URL.rstrip("/") + path
    # otherwise return as given
    return path


def _format_authors_html(authors: Optional[list]) -> str:
    """
    Convert authors list (each with name and optional url) to a string of HTML links or plain names.
    Example output: '<a href="https://...">Alice</a>, Bob'
    """
    if not authors:
        return ""
    out = []
    for a in authors:
        name = a.get("name", "").strip()
        url = a.get("url", "").strip() if a.get("url") else None
        if name and url:
            # escape attributes
            name_escaped = html_module.escape(name)
            url_escaped = html_module.escape(url, quote=True)
            out.append(f'<a href="{url_escaped}">{name_escaped}</a>')
        elif name:
            out.append(html_module.escape(name))
    return ", ".join(out)


def build_article_page(
    article: Dict[str, Any],
    template_path: str = TEMPLATE_PATH,
    md_root: str = MD_ROOT,
    output_root: str = OUTPUT_ROOT,
    base_url: str = BASE_URL,
    md_start_heading_level: int = 1,
) -> str:
    """
    Build a single article HTML page from `article` dict (one element from articles_data.json).

    Returns the path to the generated output file on success.

    Raises exceptions for serious errors (missing id or missing template).
    """
    if "id" not in article:
        raise ValueError("Article object missing 'id' field")

    article_id = article["id"]
    logger.info("Building article: %s", article_id)

    # Load template
    if not os.path.isfile(template_path):
        raise FileNotFoundError(f"Template not found: {template_path}")
    with open(template_path, "r", encoding="utf-8") as f:
        template_text = f.read()

    # Locate markdown file
    md_path = os.path.join(md_root, article_id, "index.md")
    if not os.path.isfile(md_path):
        logger.warning("Markdown not found for %s at %s — building page with empty content.", article_id, md_path)
        content_html = ""
    else:
        # convert md -> html fragment
        content_html = md_file_to_html_fragment(md_path, start_heading_level=md_start_heading_level)

    # Prepare derived values
    published_iso = None
    edited_iso = None
    if isinstance(article.get("date"), dict):
        published_iso = article["date"].get("published")
        edited_iso = article["date"].get("edited")
    else:
        # Backwards compatibility if date can be a string
        published_iso = article.get("date") or article.get("published")
        edited_iso = article.get("edited")

    published_human = _parse_iso_date_to_human(published_iso) or ""
    edited_human = _parse_iso_date_to_human(edited_iso)

    article_published_date = published_human
    article_edited_date = f" | Edited on {edited_human}" if edited_human else ""

    # Authors
    authors_raw = article.get("author") or article.get("authors") or []
    article_authors_html = _format_authors_html(authors_raw)
    article_main_author_plain = ""
    if authors_raw and isinstance(authors_raw, list) and "name" in authors_raw[0]:
        article_main_author_plain = authors_raw[0].get("name", "")

    # Keywords
    keywords_list = article.get("keywords", [])
    article_keywords_list = ", ".join(keywords_list) if keywords_list else ""

    # Strap line / description
    article_strap_line = article.get("strap_line") or article.get("description") or ""

    # Featured / social image
    featured_image = article.get("featured_image") or article.get("featuredImage") or ""
    # If you want absolute URL for social tags, use base_url
    article_social_image_url = _make_full_url_if_rooted(featured_image)

    # image alt
    article_image_alt = article.get("image_alt") or article.get("featured_image_alt") or article.get("title", "")

    # Template variables mapping
    # We will escape values for meta/attributes using html.escape here, but leave
    # article_content_html (the converted markdown) unescaped because it is HTML.
    # We then call render_html_vars with html_escape=False so values are inserted as provided.
    mapping = {
        # escaped for meta/attributes
        "article_title": html_module.escape(article.get("title", "")),
        "article_id": html_module.escape(article_id),
        "article_description": html_module.escape(article_strap_line),
        "article_keywords_list": html_module.escape(article_keywords_list),
        "article_main_author": html_module.escape(article_main_author_plain),
        "article_social_image_url": html_module.escape(article_social_image_url or ""),
        "article_strap_line": html_module.escape(article_strap_line),
        "article_authors": article_authors_html,  # this is HTML already (links); do NOT escape
        "article_published_date": html_module.escape(article_published_date),
        "article_edited_date": html_module.escape(article_edited_date),
        "article_image_url": html_module.escape(featured_image or ""),
        "article_image_alt": html_module.escape(article_image_alt or ""),
        # NOTE: article_content_html must be raw HTML (not escaped)
        "article_content_html": content_html,
    }

    # Render template (missing -> empty string so leftover tokens are removed)
    rendered = render_html_vars(template_text, values=mapping, html_escape=False, missing="")

    # Optional: pretty indent
    try:
        rendered = indent_html(rendered)
    except Exception:
        # avoid failing build if indenting breaks; keep raw rendered if that happens
        logger.exception("indent_html failed — using unindented HTML")

    # Write output file
    out_dir = os.path.join(output_root, article_id)
    _ensure_dir(out_dir)
    out_file = os.path.join(out_dir, "index.html")
    with open(out_file, "w", encoding="utf-8") as f:
        f.write(rendered)

    logger.info("Wrote article page: %s", out_file)
    return out_file


def build_all_articles(
    json_path: str = ARTICLES_JSON,
    template_path: str = TEMPLATE_PATH,
    md_root: str = MD_ROOT,
    output_root: str = OUTPUT_ROOT,
) -> None:
    """
    Read the articles JSON file and build pages for any article with "auto_build": true.
    """
    if not os.path.isfile(json_path):
        raise FileNotFoundError(f"Articles JSON not found: {json_path}")

    with open(json_path, "r", encoding="utf-8") as f:
        try:
            data = json.load(f)
        except json.JSONDecodeError:
            logger.exception("Failed to parse JSON: %s", json_path)
            raise

    if not isinstance(data, list):
        raise ValueError("Articles JSON expected to be a list of article objects")

    for idx, article in enumerate(data):
        if not isinstance(article, dict):
            logger.warning("Skipping non-object entry at index %d in %s", idx, json_path)
            continue

        # build if auto_build true
        if article.get("auto_build", False):
            try:
                build_article_page(
                    article,
                    template_path=template_path,
                    md_root=md_root,
                    output_root=output_root,
                )
            except Exception:
                logger.exception("Failed to build article: %s", article.get("id"))
        else:
            logger.debug("Skipping article (auto_build=false): %s", article.get("id"))


if __name__ == "__main__":
    # simple CLI runner
    build_all_articles()
