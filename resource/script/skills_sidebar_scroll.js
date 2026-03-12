// Skills Sidebar Scroll Tracker
// Handles active link highlighting and smooth scroll for the statically-generated skills page.
// Content is rendered server-side; this script only adds interactive behaviour.

(function () {
    'use strict';

    function setupScrollBehavior() {
        const sidebarLinks = document.querySelectorAll('.skills-sidebar nav a');

        sidebarLinks.forEach(function (link) {
            link.addEventListener('click', function (e) {
                e.preventDefault();
                const targetId = link.getAttribute('href').substring(1);
                const targetSection = document.getElementById(targetId);

                if (targetSection) {
                    const yOffset = -20;
                    const y = targetSection.getBoundingClientRect().top + window.pageYOffset + yOffset;
                    window.scrollTo({ top: y, behavior: 'smooth' });
                }
            });
        });
    }

    function setupIntersectionObserver() {
        const sections = document.querySelectorAll('.skill-category-section');
        const navLinks = document.querySelectorAll('.skills-sidebar nav a');

        if (!sections.length || !navLinks.length) return;

        const observer = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                if (entry.isIntersecting) {
                    const categoryId = entry.target.id;
                    navLinks.forEach(function (link) { link.classList.remove('active'); });
                    const activeLink = document.querySelector(
                        '.skills-sidebar nav a[data-category="' + categoryId + '"]'
                    );
                    if (activeLink) {
                        activeLink.classList.add('active');
                    }
                }
            });
        }, {
            root: null,
            rootMargin: '-20% 0px -70% 0px',
            threshold: 0
        });

        sections.forEach(function (section) { observer.observe(section); });
    }

    document.addEventListener('DOMContentLoaded', function () {
        setupScrollBehavior();
        setupIntersectionObserver();
    });
}());
