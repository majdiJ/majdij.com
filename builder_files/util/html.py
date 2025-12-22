import re
import html
from typing import Any, Mapping, Optional, List
import math
import os
import markdown
from bs4 import BeautifulSoup
import re as _re
from playwright.sync_api import sync_playwright

# Function to render HTML variables in a template string
def render_html_vars(
        template: str,
        values: Optional[Mapping[str, Any]] = None,
        *,
        html_escape: bool = False,
        missing: Optional[str] = None,
        **kwargs: Any
) -> str:
    r"""
    Replace tokens of the form {html_var(name)} in `template` with provided values.

    Args:
        template: string containing tokens like {html_var(name)}.
        values: optional mapping of name -> value.
        html_escape: if True, replacements are escaped with html.escape().
        missing: if None (default) and a variable isn't provided, the token is left
                 unchanged. If set to a string (e.g. ''), that string is used instead.
        **kwargs: values provided as keyword arguments (take precedence over `values`).

    Escaping:
        If a token is preceded by a single backslash like \{html_var(foo)},
        it will be left as literal "{html_var(foo)}" (the backslash is removed).
    """
        
    # Merge provided mappings; kwargs override values mapping.
    merged = {}
    if values:
        merged.update(values)
    if kwargs:
        merged.update(kwargs)

    # 1) Convert escaped tokens \{html_var(name)} -> {html_var(name)} (remove the backslash)
    #    We use a simple pattern that matches a backslash immediately followed by the token.
    escaped_pattern = re.compile(r'\\\{html_var\(\s*([^()]+?)\s*\)\}')
    def _unescape_match(m: re.Match) -> str:
        name = m.group(1).strip()
        return f'{{html_var({name})}}'
    template = escaped_pattern.sub(_unescape_match, template)

    # 2) Replace unescaped tokens {html_var(name)} with the provided value.
    #    Use a negative lookbehind to avoid matching a brace preceded by a backslash (shouldn't occur now).
    token_pattern = re.compile(r'(?<!\\)\{html_var\(\s*([^()]+?)\s*\)\}')

    def _replace_match(m: re.Match) -> str:
        key = m.group(1).strip()
        if key in merged:
            val = merged[key]
            s = '' if val is None else str(val)
            if html_escape:
                s = html.escape(s)
            return s
        else:
            # not provided
            if missing is None:
                # leave the original token unchanged
                return m.group(0)
            else:
                # use the provided missing replacement (could be empty string)
                if html_escape:
                    return html.escape(missing)
                return missing

    return token_pattern.sub(_replace_match, template)

# Function to indent HTML content
def indent_html(html: str, indent: str = "    ") -> str:
    # Split tags and text
    tokens = re.findall(r"<[^>]+>|[^<]+", html)

    level = 0
    output = []

    for token in tokens:
        token = token.strip()
        if not token:
            continue

        # Closing tag
        if re.match(r"</", token):
            level -= 1

        output.append(f"{indent * level}{token}")

        # Opening tag (not self-closing)
        if (
            re.match(r"<[^/!][^>]*?>", token)
            and not token.endswith("/>")
            and not re.match(r"<(br|hr|img|input|meta|link)\b", token, re.I)
        ):
            level += 1

    return "\n".join(output)

DEFAULT_EXTENSIONS = [
    "extra",
    "sane_lists",
    "toc",
    "attr_list",
]

def md_file_to_html_fragment(
    filepath: str,
    start_heading_level: int = 1,
    extensions: Optional[List[str]] = None,
    extension_configs: Optional[dict] = None,
) -> str:
    """
    Read a markdown file and convert to an HTML fragment (no <html>/<body>).
    Shift headings so that a single `#` in markdown becomes <h{start_heading_level}>.

    This version special-cases any <div ... class="... md-to-html ...">...</div> blocks:
    the inner text of those divs is converted from Markdown -> HTML before the overall
    Markdown conversion, so Markdown within those divs is rendered.
    """
    if not os.path.isfile(filepath):
        raise FileNotFoundError(f"Markdown file not found: {filepath}")

    # clamp start heading level to 1..6
    start = max(1, min(6, int(start_heading_level)))

    with open(filepath, "r", encoding="utf-8") as f:
        md_text = f.read()

    md_extensions = extensions if extensions is not None else DEFAULT_EXTENSIONS
    md_extension_configs = extension_configs or {}

    div_re = re.compile(
        r'(<div\b[^>]*\bclass=(?:"[^"]*"|\'[^\']*\')[^>]*>)(.*?)</div>',
        re.DOTALL | re.IGNORECASE,
    )

    def _convert_div(match: re.Match) -> str:
        start_tag = match.group(1)   # e.g. '<div class="table-of-contents md-to-html">'
        inner_md = match.group(2)   # the markdown-looking content inside the div

        # check if md-to-html is present in the class attribute of the start tag
        # (match.group(1) contains the full start tag)
        if re.search(r'\bclass=(?:"[^"]*"|\'[^\']*\')', start_tag, re.IGNORECASE):

            # Extract the class attribute value and test for md-to-html to be robust
            if "md-to-html" in start_tag:

                # Convert the inner markdown to HTML using the same extensions
                inner_html = markdown.markdown(inner_md, extensions=md_extensions, extension_configs=md_extension_configs)
                # Return start tag + converted inner HTML + closing tag

                return f"{start_tag}{inner_html}</div>"
            
        # Not a md-to-html div — return original match unchanged
        return match.group(0)

    # Run the preprocess substitution. This will convert each md-to-html div's inner text.
    md_text = div_re.sub(_convert_div, md_text)

    # Now convert the whole (possibly modified) markdown to HTML
    html = markdown.markdown(md_text, extensions=md_extensions, extension_configs=md_extension_configs)

    # If start == 1, no shift needed
    if start == 1:
        return html

    # Compute offset: markdown '#' corresponds to h1 by default, so offset = start - 1
    offset = start - 1

    # Parse and shift heading tags while preserving attributes
    soup = BeautifulSoup(html, "html.parser")

    # find h1..h6 and shift them
    for tag in soup.find_all(_re.compile(r"^h[1-6]$")):
        orig_level = int(tag.name[1])
        new_level = orig_level + offset
        new_level = max(1, min(6, new_level))  # clamp to 1..6
        tag.name = f"h{new_level}"

    return str(soup)

from playwright.sync_api import sync_playwright
from typing import Optional
from pathlib import Path

def html_to_pdf(
    html: Optional[str] = None,
    html_file: Optional[str] = None,
    output_path: str = None,
    header_selector: str = ".pdf-header",
    footer_selector: str = ".pdf-footer",
    margin_top: str = "15mm",
    margin_bottom: str = "15mm",
    margin_left: str = "12mm",
    margin_right: str = "12mm",
    paper_format: str = "A4",   # or "Letter"
    landscape: bool = False,
    wait_until: str = "networkidle",
    print_background: bool = True,
) -> None:
    """
    Render HTML to a PDF file (output_path). If the HTML contains elements
    matching header_selector and/or footer_selector, their innerHTML will be used
    as the PDF header/footer. Both header and footer templates always include
    page numbers "Page X of Y".

    Args:
        html: HTML content as string (optional if html_file is provided)
        html_file: Path to HTML file (optional if html is provided)
        output_path: Path where PDF will be saved

    Requirements:
      pip install playwright
      playwright install chromium

    Notes:
      - Playwright's header/footer templates accept simple HTML (no external CSS).
      - pageNumber and totalPages placeholders are provided as <span class="pageNumber"></span>
        and <span class="totalPages"></span>.
      - PDF printing (page.pdf()) is supported on Chromium.
      - Using html_file is preferred over html string for proper resource loading (images, fonts).
    """
    if html is None and html_file is None:
        raise ValueError("Either 'html' or 'html_file' must be provided")
    if output_path is None:
        raise ValueError("'output_path' must be provided")

    def build_template(content_html: Optional[str], default_text: str, is_header: bool) -> str:
        # Keep the template compact and safe for Chromium printToPDF.
        # We ensure the pageNumber / totalPages are present in the footer.
        if content_html:
            # Put content on left and page numbering on right for footers.
            if is_header:
                return (
                    "<div style='font-family: -apple-system, BlinkMacSystemFont, "
                    "Segoe UI, Roboto, Helvetica, Arial, sans-serif; "
                    "font-size:11px; width:100%; padding:0 50px;'>"
                    f"<div style='width:100%;'>{content_html}</div>"
                    "</div>"
                )
            else:
                # Footer: left = content_html, right = page numbers
                return (
                    "<div style='font-family: -apple-system, BlinkMacSystemFont, "
                    "Segoe UI, Roboto, Helvetica, Arial, sans-serif; font-size:11px; "
                    "width:100%; padding:0 50px;'>"
                    "<div style='display:flex; width:100%; justify-content:space-between; "
                    "align-items:center;'>"
                    f"<div style='text-align:left; min-width:0; overflow:hidden;'>{content_html}</div>"
                    "<div style='text-align:right; white-space:nowrap;'>"
                    "Page <span class='pageNumber'></span> of <span class='totalPages'></span>"
                    "</div>"
                    "</div></div>"
                )
        else:
            # minimal default
            if is_header:
                return (
                    "<div style='font-family: -apple-system, BlinkMacSystemFont, "
                    "Segoe UI, Roboto, Helvetica, Arial, sans-serif; font-size:11px; "
                    "width:100%; padding:0 10px; text-align:center;'>"
                    f"{default_text}"
                    "</div>"
                )
            else:
                return (
                    "<div style='font-family: -apple-system, BlinkMacSystemFont, "
                    "Segoe UI, Roboto, Helvetica, Arial, sans-serif; font-size:11px; "
                    "width:100%; padding:0 10px;'>"
                    "<div style='display:flex; width:100%; justify-content:space-between; "
                    "align-items:center;'>"
                    f"<div>{default_text}</div>"
                    "<div>Page <span class='pageNumber'></span> of <span class='totalPages'></span></div>"
                    "</div></div>"
                )

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()
        page = context.new_page()
        
        # If html_file is provided, use goto with file:// URL for proper resource loading
        if html_file:
            file_path = Path(html_file).resolve()
            file_url = file_path.as_uri()
            page.goto(file_url, wait_until=wait_until)
        else:
            # Fall back to set_content if only HTML string is provided
            page.set_content(html, wait_until=wait_until)

        # Try to extract the header/footer HTML from the rendered page
        header_html = None
        footer_html = None

        try:
            header_html = page.evaluate(
                """(sel) => {
                    const el = document.querySelector(sel);
                    return el ? el.innerHTML : null;
                }""",
                header_selector,
            )
        except Exception:
            header_html = None

        try:
            footer_html = page.evaluate(
                """(sel) => {
                    const el = document.querySelector(sel);
                    return el ? el.innerHTML : null;
                }""",
                footer_selector,
            )
        except Exception:
            footer_html = None

        header_template = build_template(header_html, "", is_header=True)
        footer_template = build_template(footer_html, "", is_header=False)

        # print to pdf (Chromium). display_header_footer must be True to use templates.
        page.pdf(
            path=output_path,
            format=paper_format,
            landscape=landscape,
            display_header_footer=True,
            header_template=header_template,
            footer_template=footer_template,
            margin={
                "top": margin_top,
                "bottom": margin_bottom,
                "left": margin_left,
                "right": margin_right,
            },
            print_background=print_background,
        )

        context.close()
        browser.close()


