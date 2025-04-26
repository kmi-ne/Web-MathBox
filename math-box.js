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

    // Add tooltip behavior
    link.addEventListener('mouseover', async (e) => {
        // Show loading tooltip
        tooltip.innerHTML = `<div class="loading-tooltip">Loading reference from ${pagePath}...</div>`;
        tooltip.classList.add('visible');
        positionTooltip(link);

        // Try to get reference info
        try {
            const refInfo = await fetchCrossPageReference(pagePath, fragment);

            if (refInfo) {
                // Update tooltip with reference info
                tooltip.innerHTML = `<strong>${refInfo.title}</strong><br>${refInfo.content}`;
                positionTooltip(link);

                // If link has no text content, set it to the reference title
                if (!link.textContent || link.textContent === '') {
                    link.textContent = `${boxTypes[refInfo.type].name} ${refInfo.number}`;
                }
            } else {
                // Reference not found
                tooltip.innerHTML = `<div class="loading-tooltip">Reference not found on ${pagePath}</div>`;

                // Mark as error if it has no custom text
                if (!link.textContent || link.textContent === '') {
                    link.classList.add('reference-error');
                    link.textContent = 'Invalid Reference';
                }
            }
        } catch (error) {
            tooltip.innerHTML = `<div class="loading-tooltip">Error loading reference: ${error.message}</div>`;
        }
    });

    link.addEventListener('mouseout', () => {
        tooltip.classList.remove('visible');
    });
}

// Fetch reference info from another page
async function fetchCrossPageReference(pagePath, fragment) {
    // Check cache first
    const cacheKey = `${pagePath}#${fragment}`;
    if (crossPageCache[cacheKey]) {
        return crossPageCache[cacheKey];
    }

    try {
        // This uses the fetch API to get the HTML of the target page
        const response = await fetch(pagePath);
        if (!response.ok) throw new Error(`Failed to load ${pagePath}`);

        const html = await response.text();

        // Create a temporary DOM to parse the HTML
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');

        // Look for the registry data
        const registryScript = doc.querySelector('script[data-math-registry]');
        let registry = null;

        if (registryScript) {
            // The registry is directly available as JSON
            try {
                registry = JSON.parse(registryScript.textContent);
            } catch (e) {
                console.error('Failed to parse registry JSON:', e);
            }
        } else {
            // Extract the registry from the target document
            // In a real implementation, you might want to expose the registry via a data attribute
            // or a global variable in a more robust way
            const targetElement = doc.getElementById(fragment);

            if (targetElement && targetElement.classList.contains('mbox')) {
                // Manual extraction of reference info
                const typeClass = Array.from(targetElement.classList).find(cls => boxTypes[cls]);
                if (typeClass) {
                    // This is a simplified extraction - in production you'd want more robust parsing
                    const strongElement = targetElement.querySelector('strong');
                    const titleMatch = strongElement ? strongElement.textContent.match(/^(.*)\s(\d+)(?:\s\((.*)\))?\./) : null;

                    if (titleMatch) {
                        const type = typeClass;
                        const number = parseInt(titleMatch[2]);
                        const subtitle = titleMatch[3] || null;
                        const titleText = subtitle ? `${boxTypes[type].name} ${number} (${subtitle})` : `${boxTypes[type].name} ${number}`;

                        // Get content (first paragraph or div)
                        const contentElement = targetElement.querySelector('p, div:not(.proof)');
                        const content = contentElement ? contentElement.innerHTML : '';

                        registry = {
                            [fragment]: {
                                number,
                                type,
                                title: titleText,
                                subtitle,
                                content
                            }
                        };
                    }
                }
            }
        }

        if (registry && registry[fragment]) {
            // Cache the result
            crossPageCache[cacheKey] = registry[fragment];
            return registry[fragment];
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