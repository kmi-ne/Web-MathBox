// Box type definitions
const boxTypes = {
    axm: { name: 'Axiom', colorBorder: '#91d5ff', colorBack: '#e6f7ff'},
    dfn: { name: 'Definition', colorBorder: '#b7eb8f', colorBack: '#f6ffed'},
    thm: { name: 'Theorem', colorBorder: '#ffa39e', colorBack: '#fff1f0'},
    ex: { name: 'Example', colorBorder: '#d3adf7', colorBack: '#f9f0ff'}
};

// Store all the boxes and their references
let boxRegistry = {};
let boxCounter = 1;
let tooltip = null;
let remoteTooltip = null;
let boxIndexJSON = null;

// Process all math boxes
function initMathBoxes() {
    // Create tooltip elements
    tooltip = document.createElement('div');
    tooltip.className = 'ref-tooltip';
    document.body.appendChild(tooltip);
    
    remoteTooltip = document.createElement('div');
    remoteTooltip.className = 'remote-tooltip';
    document.body.appendChild(remoteTooltip);

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
                toggleButton.onclick = function() {
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

    // Generate page index for cross-page references
    generateBoxIndex();
    
    // Process references
    processReferences();
}

// Generate JSON index of boxes on this page
function generateBoxIndex() {
    boxIndexJSON = {
        page: window.location.pathname,
        boxes: {}
    };
    
    for (const id in boxRegistry) {
        boxIndexJSON.boxes[id] = {
            id: id,
            type: boxRegistry[id].type,
            number: boxRegistry[id].number,
            title: boxRegistry[id].title,
            content: boxRegistry[id].content
        };
    }
    
    // Expose the index for AJAX fetching from other pages
    window.getBoxIndex = function() {
        return boxIndexJSON;
    };
}

// Process all references in the document
function processReferences() {
    const links = document.querySelectorAll('a[href^="#"], a[href*="#"]');
    
    links.forEach(link => {
        const href = link.getAttribute('href');
        
        // Handle local references (same page)
        if (href.startsWith('#')) {
            const targetId = href.substring(1);
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
                    const rect = link.getBoundingClientRect();
                    tooltip.style.left = `${rect.left}px`;
                    tooltip.style.top = `${rect.bottom + 5 + window.scrollY}px`;
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
        // Handle cross-page references
        else if (href.includes('#')) {
            const [pagePath, targetId] = href.split('#');
            
            // If this is an empty link, add loading state
            if (!link.textContent || link.textContent === '') {
                link.textContent = 'Loading...';
                link.classList.add('loading-ref');
            }
            
            // Add remote tooltip behavior
            link.addEventListener('mouseover', (e) => {
                fetchRemoteBoxInfo(pagePath, targetId, link);
            });
            
            link.addEventListener('mouseout', () => {
                remoteTooltip.classList.remove('visible');
            });
        }
    });
}

// Fetch information about a box from another page
function fetchRemoteBoxInfo(pagePath, targetId, link) {
    // Create a unique cache key for this reference
    const cacheKey = `${pagePath}#${targetId}`;
    
    // Check if we have a cached version
    const cachedData = sessionStorage.getItem(cacheKey);
    if (cachedData) {
        const boxData = JSON.parse(cachedData);
        updateCrossPageReference(boxData, link);
        return;
    }
    
    // Fetch the page and extract box info
    fetch(pagePath)
        .then(response => {
            if (!response.ok) {
                throw new Error('Page not found');
            }
            return response.text();
        })
        .then(html => {
            // Create a temporary DOM to parse the HTML
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            
            // Try to get the box index directly if the page uses this script
            let boxInfo = null;
            
            // Look for the specific box
            const targetBox = doc.getElementById(targetId);
            if (targetBox && targetBox.classList.contains('mbox')) {
                // Get box type
                const typeClass = Array.from(targetBox.classList).find(cls => boxTypes[cls]);
                
                if (typeClass) {
                    // Extract box number from the title text content
                    const titleMatch = targetBox.textContent.match(new RegExp(`${boxTypes[typeClass].name}\\s+(\\d+)`));
                    const number = titleMatch ? parseInt(titleMatch[1]) : 0;
                    const subtitle = targetBox.getAttribute('data-subtitle');
                    
                    const titleText = subtitle 
                        ? `${boxTypes[typeClass].name} ${number} (${subtitle})`
                        : `${boxTypes[typeClass].name} ${number}`;
                    
                    // Extract content (excluding proof)
                    let content = targetBox.innerHTML;
                    if (content.includes('<div class="proof">')) {
                        content = content.split('<div class="proof">')[0];
                    }
                    
                    boxInfo = {
                        id: targetId,
                        type: typeClass,
                        number: number,
                        title: titleText,
                        content: content,
                        pagePath: pagePath
                    };
                }
            }
            
            if (boxInfo) {
                // Cache the data for future reference
                sessionStorage.setItem(cacheKey, JSON.stringify(boxInfo));
                updateCrossPageReference(boxInfo, link);
            } else {
                handleMissingCrossPageReference(link);
            }
        })
        .catch(error => {
            console.error('Error fetching remote box info:', error);
            handleMissingCrossPageReference(link);
        });
}

// Update cross-page reference with fetched data
function updateCrossPageReference(boxInfo, link) {
    // Remove loading state if present
    link.classList.remove('loading-ref');
    
    // If the link has no custom text, replace with automatic reference
    if (link.classList.contains('loading-ref')) {
        link.textContent = `${boxTypes[boxInfo.type].name} ${boxInfo.number}`;
    }
    
    // Add tooltip behavior
    link.addEventListener('mouseover', (e) => {
        // Create tooltip content
        remoteTooltip.innerHTML = `
            <div class="title">${boxInfo.title}</div>
            <div class="content">${boxInfo.content}</div>
            <div class="page-info">From: ${boxInfo.pagePath}</div>
        `;
        remoteTooltip.classList.add('visible');
        
        // Position the tooltip
        const rect = link.getBoundingClientRect();
        remoteTooltip.style.left = `${rect.left}px`;
        remoteTooltip.style.top = `${rect.bottom + 5 + window.scrollY}px`;
    });
}

// Handle missing cross-page references
function handleMissingCrossPageReference(link) {
    link.classList.remove('loading-ref');
    link.classList.add('reference-error');
    link.title = 'Reference not found';
    
    if (link.textContent === 'Loading...') {
        link.textContent = 'Invalid Reference';
    }
}

// Initialize when the DOM is fully loaded
document.addEventListener('DOMContentLoaded', initMathBoxes);

// Export registry function for external access
window.getBoxRegistry = function() {
    return boxRegistry;
};
