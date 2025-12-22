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

def html_to_pdf(html: str, output_path: str,
                format: str = "A4", margin: dict = None,
                print_background: bool = True, base_path: str = None):
    """
    Convert HTML string to PDF using Playwright.
    
    Args:
        html: HTML content to convert
        output_path: Path where PDF will be saved
        format: Page format (default: A4)
        margin: Page margins dict
        print_background: Whether to print background graphics
        base_path: Base directory path for resolving relative URLs (images, CSS, etc.)
    """
    margin = margin or {"top": "20px", "bottom": "20px", "left": "20px", "right": "20px"}
    
    # If base_path is provided, save HTML to temp file and use file:// URL
    # This ensures relative paths work correctly
    if base_path:
        import tempfile
        from pathlib import Path
        
        # Create a temporary HTML file in the base directory
        base_dir = Path(base_path).resolve()
        with tempfile.NamedTemporaryFile(mode='w', suffix='.html', delete=False, 
                                        dir=base_dir, encoding='utf-8') as tmp:
            tmp.write(html)
            tmp_path = tmp.name
        
        try:
            with sync_playwright() as p:
                browser = p.chromium.launch(headless=True)
                page = browser.new_page()
                
                # Set a timeout to avoid hanging indefinitely
                page.set_default_timeout(30000)  # 30 seconds
                
                # Load from file:// URL so relative paths work
                file_url = Path(tmp_path).as_uri()
                page.goto(file_url, wait_until="domcontentloaded", timeout=30000)
                
                # Wait a bit for any images to load
                page.wait_for_timeout(1000)
                
                # Create PDF
                page.pdf(path=output_path,
                        format=format,
                        margin=margin,
                        print_background=print_background)
                browser.close()
        finally:
            # Clean up temp file
            Path(tmp_path).unlink(missing_ok=True)
    else:
        # Fallback: use set_content without base URL
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            page = browser.new_page()
            
            # Set a timeout to avoid hanging indefinitely
            page.set_default_timeout(30000)  # 30 seconds
            
            # Load the HTML string
            page.set_content(html, wait_until="domcontentloaded", timeout=30000)
            
            # Wait a bit for any quick-loading resources
            page.wait_for_timeout(1000)
            
            # Create PDF
            page.pdf(path=output_path,
                    format=format,
                    margin=margin,
                    print_background=print_background)
            browser.close()