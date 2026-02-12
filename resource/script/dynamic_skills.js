// Dynamic Skills Page - Loads and displays skills from JSON data

document.addEventListener('DOMContentLoaded', async () => {
    const sidebarNav = document.querySelector('.skills-sidebar nav ul');
    const contentContainer = document.querySelector('.skills-content');

    if (!sidebarNav || !contentContainer) {
        console.error('Skills page elements not found');
        return;
    }

    try {
        // Fetch skills data
        const response = await fetch('/resource/dynamic_blocks_skills.json');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const skillsData = await response.json();

        // Generate sidebar navigation and content sections
        Object.entries(skillsData).forEach(([category, skills]) => {
            const categoryId = slugify(category);

            // Create sidebar link
            const listItem = document.createElement('li');
            const link = document.createElement('a');
            link.href = `#${categoryId}`;
            link.textContent = category;
            link.dataset.category = categoryId;
            listItem.appendChild(link);
            sidebarNav.appendChild(listItem);

            // Create content section
            const section = createCategorySection(categoryId, category, skills);
            contentContainer.appendChild(section);
        });

        // Set up smooth scrolling and active state tracking
        setupScrollBehavior();
        setupIntersectionObserver();

    } catch (error) {
        console.error('Error loading skills data:', error);
        contentContainer.innerHTML = '<p style="color: var(--secondary-text-color); text-align: center; padding: 40px;">Error loading skills data. Please try refreshing the page.</p>';
    }
});

/**
 * Creates a category section with skills grid
 */
function createCategorySection(id, categoryName, skills) {
    const section = document.createElement('section');
    section.className = 'skill-category-section';
    section.id = id;

    const heading = document.createElement('h2');
    heading.textContent = categoryName;
    section.appendChild(heading);

    const grid = document.createElement('div');
    grid.className = 'skills-grid';

    skills.forEach(skill => {
        const card = createSkillCard(skill);
        grid.appendChild(card);
    });

    section.appendChild(grid);
    return section;
}

/**
 * Creates an individual skill card
 */
function createSkillCard(skill) {
    // Check if skill has a link
    const hasLink = skill.link && skill.link.trim() !== '';
    
    // Create card as anchor if it has a link, otherwise a div
    const card = document.createElement(hasLink ? 'a' : 'div');
    card.className = 'skill-card';
    
    if (hasLink) {
        card.href = skill.link;
        card.classList.add('skill-card-linked');
    }

    // Icon
    if (skill.icon && skill.icon.trim() !== '') {
        const icon = document.createElement('img');
        icon.className = 'skill-card-icon';
        icon.src = skill.icon;
        icon.alt = `${skill.name} icon`;
        
        // Handle image load errors
        icon.onerror = () => {
            icon.style.display = 'none';
            const placeholder = createPlaceholderIcon(skill.name);
            card.insertBefore(placeholder, card.firstChild);
        };
        
        card.appendChild(icon);
    } else {
        // No icon provided, use placeholder
        const placeholder = createPlaceholderIcon(skill.name);
        card.appendChild(placeholder);
    }

    // Name
    const name = document.createElement('h3');
    name.textContent = skill.name;
    card.appendChild(name);

    // Description
    const description = document.createElement('p');
    description.textContent = skill.description;
    card.appendChild(description);

    return card;
}

/**
 * Creates a placeholder icon with initials
 */
function createPlaceholderIcon(name) {
    const placeholder = document.createElement('div');
    placeholder.className = 'skill-card-icon placeholder';
    
    // Extract initials (first letter of first two words)
    const words = name.split(' ');
    let initials = words[0][0];
    if (words.length > 1) {
        initials += words[1][0];
    }
    
    placeholder.textContent = initials.toUpperCase();
    return placeholder;
}

/**
 * Converts category name to URL-friendly slug
 */
function slugify(text) {
    return text
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

/**
 * Sets up smooth scrolling for sidebar links
 */
function setupScrollBehavior() {
    const sidebarLinks = document.querySelectorAll('.skills-sidebar nav a');
    
    sidebarLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const targetId = link.getAttribute('href').substring(1);
            const targetSection = document.getElementById(targetId);
            
            if (targetSection) {
                const yOffset = -20; // Offset for sticky positioning
                const y = targetSection.getBoundingClientRect().top + window.pageYOffset + yOffset;
                
                window.scrollTo({
                    top: y,
                    behavior: 'smooth'
                });
            }
        });
    });
}

/**
 * Sets up intersection observer to highlight active category in sidebar
 */
function setupIntersectionObserver() {
    const sections = document.querySelectorAll('.skill-category-section');
    const navLinks = document.querySelectorAll('.skills-sidebar nav a');

    const observerOptions = {
        root: null,
        rootMargin: '-20% 0px -70% 0px',
        threshold: 0
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const categoryId = entry.target.id;
                
                // Remove active class from all links
                navLinks.forEach(link => link.classList.remove('active'));
                
                // Add active class to current link
                const activeLink = document.querySelector(`.skills-sidebar nav a[data-category="${categoryId}"]`);
                if (activeLink) {
                    activeLink.classList.add('active');
                }
            }
        });
    }, observerOptions);

    sections.forEach(section => observer.observe(section));
}
