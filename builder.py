import os
from builder_files.util.html import render_html_vars, md_file_to_html_fragment, indent_html
from builder_files.page_constructors.article import build_all_articles
from builder_files.page_constructors.projects import build_projects_page, build_homepage
from builder_files.page_constructors.skills import build_skills_page
from builder_files.page_constructors.articles_list import build_articles_list_page

if __name__ == "__main__":
    build_all_articles()
    build_skills_page()
    build_projects_page()
    build_articles_list_page()
    build_homepage()

