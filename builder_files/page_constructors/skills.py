import os
import json
import re
import logging
import html as html_module
from typing import Dict, Any, List

from builder_files.util.html import render_html_vars

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

SKILLS_JSON = "resource/dynamic_blocks_skills.json"
SKILLS_TEMPLATE = "builder_files/templates/skills_page.html"
SKILLS_OUTPUT = "skills/index.html"


def _slugify(text: str) -> str:
    """Convert category name to a URL-friendly ID, e.g. 'Version Control & Collaboration' -> 'version-control-collaboration'."""
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")


def _get_initials(name: str) -> str:
    """Extract up to two initials from a skill name for placeholder icons."""
    words = name.split()
    if not words:
        return "?"
    initials = words[0][0]
    if len(words) > 1:
        initials += words[1][0]
    return initials.upper()


def _build_skill_card_html(skill: Dict[str, Any]) -> str:
    """Build HTML for a single skill card (anchor if it has a link, div otherwise)."""
    name = skill.get("name", "")
    description = skill.get("description", "")
    icon = skill.get("icon", "")
    link = skill.get("link", "")
    has_light_bg = skill.get("light-background", False)
    has_link = bool(link and link.strip())

    tag = "a" if has_link else "div"
    classes = "skill-card"
    if has_link:
        classes += " skill-card-linked"

    link_attr = f' href="{html_module.escape(link.strip())}"' if has_link else ""

    # Icon HTML — use placeholder div with initials when no icon path provided
    if icon and icon.strip():
        icon_img = (
            f'<img class="skill-card-icon"'
            f' src="{html_module.escape(icon.strip())}"'
            f' alt="{html_module.escape(name)} icon" />'
        )
        if has_light_bg:
            icon_html = f'<div class="skill-card-icon-light-bg">{icon_img}</div>'
        else:
            icon_html = icon_img
    else:
        initials = _get_initials(name)
        icon_html = f'<div class="skill-card-icon placeholder">{html_module.escape(initials)}</div>'

    return (
        f'<{tag} class="{classes}"{link_attr}>\n'
        f'    {icon_html}\n'
        f'    <h3>{html_module.escape(name)}</h3>\n'
        f'    <p>{html_module.escape(description)}</p>\n'
        f'</{tag}>'
    )


def _build_category_section_html(category_id: str, category_name: str, skills: List[Dict[str, Any]]) -> str:
    """Build a full <section> element for one skill category."""
    cards = "\n\n        ".join(_build_skill_card_html(s) for s in skills)
    return (
        f'<section class="skill-category-section" id="{html_module.escape(category_id)}">\n'
        f'    <h2>{html_module.escape(category_name)}</h2>\n'
        f'    <div class="skills-grid">\n'
        f'        {cards}\n'
        f'    </div>\n'
        f'</section>'
    )


def build_skills_page(
    json_path: str = SKILLS_JSON,
    template_path: str = SKILLS_TEMPLATE,
    output_path: str = SKILLS_OUTPUT,
) -> str:
    """Build the static skills page from the skills JSON data."""
    logger.info("Building skills page")

    with open(json_path, "r", encoding="utf-8") as f:
        skills_data = json.load(f)

    with open(template_path, "r", encoding="utf-8") as f:
        template = f.read()

    sidebar_items: List[str] = []
    content_sections: List[str] = []

    for category_name, skills in skills_data.items():
        category_id = _slugify(category_name)
        sidebar_items.append(
            f'<li><a href="#{category_id}" data-category="{category_id}">'
            f'{html_module.escape(category_name)}</a></li>'
        )
        content_sections.append(
            _build_category_section_html(category_id, category_name, skills)
        )

    sidebar_html = "\n                    ".join(sidebar_items)
    content_html = "\n\n            ".join(content_sections)

    rendered = render_html_vars(
        template,
        values={
            "skills_sidebar_html": sidebar_html,
            "skills_content_html": content_html,
        },
        html_escape=False,
        missing="",
    )

    os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        f.write(rendered)

    logger.info("Wrote skills page: %s", output_path)
    return output_path
