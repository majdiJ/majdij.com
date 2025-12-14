import os
from builder_files.util.html import render_html_vars, md_file_to_html_fragment, indent_html
from builder_files.page_constructors.article import build_all_articles

if __name__ == "__main__":
    build_all_articles()

