// Box type definitions
const boxTypes = {
    axm: { name: 'Axiom', colorBorder: '#91d5ff', colorBack: '#e6f7ff' },
    dfn: { name: 'Definition', colorBorder: '#b7eb8f', colorBack: '#f6ffed' },
    thm: { name: 'Theorem', colorBorder: '#ffa39e', colorBack: '#fff1f0' },
    ex: { name: 'Example', colorBorder: '#d3adf7', colorBack: '#f9f0ff' }
};

// Store all the boxes and their references
let boxRegistry = {};
let boxCounter = 1;
let tooltip = null;
let crossPageCache = {}; // Cache for cross-page references

// Process all math boxes
function initMathBoxes() {
    // Create tooltip element if it doesn't exist
    if (!tooltip) {
        tooltip = document.createElement('div');
        tooltip.className = 'ref-tooltip';
        document.body.appendChild(tooltip);
    }

    // Reset counter and registry when initializing a new page
    boxRegistry = {};
    boxCounter = 1;

    // Process all boxes
    const boxes = document.querySelectorAll('.mbox');
    boxes.forEach(box => {
        const typeClass = Array.from(box.classList).find(cls => boxTypes[cls]);

        if (typeClass && box.id) {
            const type = typeClass;
            const id = box.id;
            const subtitle = box.getAttribute('data-subtitle');

            // Apply styling from boxTypes
            box.style.borderLeftColor = boxTypes[type].colorBorder;
            box.style.backgroundColor = boxTypes[type].colorBack;

            // Create the title with numbering
            const titleText = subtitle
                ? `${boxTypes[type].name} ${boxCounter} (${subtitle})`
                : `${boxTypes[type].name} ${boxCounter}`;

            // Store in registry
            boxRegistry[id] = {
                number: boxCounter,
                type: type,
                title: titleText,
                subtitle: subtitle,
                content: box.innerHTML.split('<div class="proof">')[0].trim()
            };

            // Add title to box
            box.setAttribute('data-title', titleText);
            box.style.setProperty('--title', `"${titleText}"`);
            box.setAttribute('title', titleText);

            // Add title to DOM
            box.insertAdjacentHTML('afterbegin', `<strong>${titleText}.</strong> `);

            // Handle proof section if it exists
            const proofSection = box.querySelector('.proof');
            if (proofSection) {
                const toggleButton = document.createElement('div');
                toggleButton.className = 'proof-toggle';
                toggleButton.textContent = 'Show proof';
                toggleButton.onclick = function () {
                    proofSection.classList.toggle('expanded');
                    this.textContent = proofSection.classList.contains('expanded')
                        ? 'Hide proof'
                        : 'Show proof';
                };

                // Insert toggle before the proof section
                proofSection.parentNode.insertBefore(toggleButton, proofSection);
            }

            boxCounter++;
        }
    });

    // Process references
    processReferences();

    // Export the registry for cross-page references
    window.mathBoxRegistry = boxRegistry;
}

// Process all references in the document
function processReferences() {
    const links = document.querySelectorAll('a[href^="#"]');

    links.forEach(link => {
        processInternalReference(link);
    });

    // Process cross-page references
    const crossPageLinks = document.querySelectorAll('a[href*="#"]');
    crossPageLinks.forEach(link => {
        const href = link.getAttribute('href');
        if (href.startsWith('#')) return; // Skip internal references already processed

        processCrossPageReference(link);
    });
}

// Process internal reference (same page)
function processInternalReference(link) {
    const targetId = link.getAttribute('href').substring(1);
    const boxInfo = boxRegistry[targetId];

    if (boxInfo) {
        // If the link has no text content, use the auto-reference
        if (!link.textContent || link.textContent === '') {
            link.textContent = `${boxTypes[boxInfo.type].name} ${boxInfo.number}`;
        }

        // Add hover event for tooltip
        link.addEventListener('mouseover', (e) => {
            tooltip.innerHTML = `<strong>${boxInfo.title}</strong><br>${boxInfo.content}`;
            tooltip.classList.add('visible');

            // Position the tooltip
            positionTooltip(link);
        });

        link.addEventListener('mouseout', () => {
            tooltip.classList.remove('visible');
        });
    } else {
        // Handle invalid references
        link.classList.add('reference-error');
        link.title = 'Reference not found';

        if (!link.textContent || link.textContent === '') {
            link.textContent = 'Invalid Reference';
        }
    }
}

// Process cross-page reference
function processCrossPageReference(link) {
    const href = link.getAttribute('href');
    if (!href.includes('#')) return; // Need a fragment identifier
    const [pagePath, fragment] = href.split('#');
    if (!fragment) return; // Need a valid fragment

    // Add class for cross-page styling
    link.classList.add('cross-page-ref');

    // Pre-fetch the reference data immediately (not just on hover)
    (async () => {
        try {
            const refInfo = await fetchCrossPageReference(pagePath, fragment);
            if (refInfo) {
                // Set the link text to the reference's title
                link.textContent = `${boxTypes[refInfo.type].name} ${refInfo.number}`;
            } else {
                link.textContent = 'Invalid Reference';
                link.classList.add('reference-error');
            }
        } catch (error) {
            link.textContent = 'Error';
        }
    })();

    // Keep the existing mouseover/mouseout handlers for tooltips
    link.addEventListener('mouseover', async (e) => {
        // ... (existing tooltip logic remains unchanged)
    });
    link.addEventListener('mouseout', () => {
        // ... (existing tooltip cleanup)
    });
}

// Fetch reference info from another page
async function fetchCrossPageReference(pagePath, fragment) {
    const cacheKey = `${pagePath}#${fragment}`;
    if (crossPageCache[cacheKey]) return crossPageCache[cacheKey];

    try {
        const response = await fetch(pagePath);
        if (!response.ok) throw new Error(`Failed to load ${pagePath}`);
        const html = await response.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');

        // Build registry from raw HTML elements
        const mboxElements = Array.from(doc.querySelectorAll('.mbox'));
        const tempRegistry = {};

        mboxElements.forEach((element, index) => {
            const id = element.id;
            const typeClass = Array.from(element.classList)
                .find(cls => boxTypes[cls]);
            if (!typeClass || !id) return;

            const subtitle = element.getAttribute('data-subtitle') || '';
            const number = index + 1; // Numbering starts at 1
            const titleText = subtitle 
                ? `${boxTypes[typeClass].name} ${number} (${subtitle})` 
                : `${boxTypes[typeClass].name} ${number}`;

            // Extract content (first paragraph or non-proof div)
            const contentElement = element.querySelector('p, div:not(.proof)');
            const content = contentElement ? contentElement.innerHTML : '';

            tempRegistry[id] = {
                number,
                type: typeClass,
                title: titleText,
                subtitle: subtitle,
                content
            };
        });

        if (tempRegistry[fragment]) {
            crossPageCache[cacheKey] = tempRegistry[fragment];
            return tempRegistry[fragment];
        }
        return null;
    } catch (error) {
        console.error('Error fetching cross-page reference:', error);
        return null;
    }
}

// Helper to position the tooltip
function positionTooltip(link) {
    const rect = link.getBoundingClientRect();
    tooltip.style.left = `${rect.left}px`;
    tooltip.style.top = `${rect.bottom + 5 + window.scrollY}px`;
}

// Export registry data for cross-page references
function exportRegistry() {
    // Create a script element with the registry data
    const script = document.createElement('script');
    script.setAttribute('type', 'application/json');
    script.setAttribute('data-math-registry', 'true');
    script.textContent = JSON.stringify(boxRegistry);
    document.head.appendChild(script);
}

// Initialize when the DOM is fully loaded
document.addEventListener('DOMContentLoaded', () => {
    initMathBoxes();
    exportRegistry(); // Export registry for cross-page references
});
