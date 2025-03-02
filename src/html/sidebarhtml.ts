import * as vscode from 'vscode';

export function getSidebarHtml(
    webview: vscode.Webview,
    extensionUri: vscode.Uri,
    nonce: string,
    renderPromptList: string,
    renderContextPrompts: string
): string {
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'style.css'));

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
    <link rel="stylesheet" type="text/css" href="${styleUri}">
    <style nonce="${nonce}">
        body {
            padding: 0;
            height: 100%;
            overflow: hidden; /* Prevent body scrolling */
        }
        
        /* Main container to handle scrolling for the entire sidebar */
        .sidebar-container {
            height: 100vh;
            overflow-y: auto; /* Single scrollbar for the entire content */
            overflow-x: hidden;
        }
    </style>
</head>
<body>
    <div class="sidebar-container">
        <div class="sections-wrapper">
            <!-- Context-Aware Prompts Section -->
            <div class="main-section-container">
                <div class="section-header main-section-header" role="button" tabindex="0" aria-expanded="true">
                    <span class="section-collapse-icon">▼</span>
                    <h1 class="header-title">Context-Aware Prompts</h1>
                    <button id="refresh-context" class="collapse-all-button" title="Refresh context">↻</button>
                </div>
                <div class="section-content main-section-content">
                    <div id="context-aware-prompts" class="prompt-list-container">
                        ${renderContextPrompts}
                    </div>
                </div>
            </div>
            
            <!-- Original Prompt Library Section -->
            <div class="main-section-container">
                <div class="section-header main-section-header" role="button" tabindex="0" aria-expanded="true">
                    <span class="section-collapse-icon">▼</span>
                    <h1 class="header-title">Prompt Playbook</h1>
                    <button id="collapse-all" class="collapse-all-button"></button>
                </div>
                <div class="section-content main-section-content">
                    <div class="search-wrapper">
                        <div class="typeahead-container">
                            <input type="text" id="search" placeholder="Search prompts... (Ctrl+F)" />
                            <button class="clear-search" aria-label="Clear search">
                                <svg width="16" height="16" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
                                    <path fill="currentColor" d="M8 8.707l3.646 3.647.708-.707L8.707 8l3.647-3.646-.707-.708L8 7.293 4.354 3.646l-.707.708L7.293 8l-3.646 3.646.707.708L8 8.707z"/>
                                </svg>
                            </button>
                            <div id="typeahead-dropdown" class="typeahead-dropdown"></div>
                        </div>
                    </div>
                    <div id="prompt-list" class="prompt-list-container">
                        ${renderPromptList}
                        <div id="no-results" style="display: none; text-align: center; padding: 20px;">
                            No matching prompts found
                        </div>
                    </div>
                </div>
            </div>

            <!-- Add Prompt Enhancer Section -->
            <div class="main-section-container">
                <div class="section-header main-section-header" role="button" tabindex="0" aria-expanded="true">
                    <span class="section-collapse-icon">▼</span>
                    <h1 class="header-title">Prompt Enhancer</h1>
                </div>
                <div class="section-content main-section-content">
                    <div class="generate-prompt-container">
                        <textarea id="promptInput" placeholder="Enter your prompt here to enhance it..." rows="4"></textarea>
                        <div class="button-container">
                            <button id="enhanceButton" class="action-button">
                                Enhance Prompt
                            </button>
                            <button id="clearButton" class="action-button secondary">
                                Clear
                            </button>
                        </div>
                        <div class="enhanced-prompt" style="display: none;">
                            <h4>Enhanced Prompt:</h4>
                            <div id="enhancedContent"></div>
                            <div class="button-container">
                                <button id="copyEnhanced" class="action-button">
                                    Copy Enhanced Prompt
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <script nonce="${nonce}">
        const vscode = acquireVsCodeApi();
        let allExpanded = true;
        let mainSectionExpanded = true;

        // Handle main section collapse/expand for both sections
        document.querySelectorAll('.main-section-header').forEach(header => {
            header.addEventListener('click', (e) => {
                // Only handle clicks on the header or collapse icon
                const isCollapseIcon = e.target.classList.contains('section-collapse-icon');
                const isHeader = e.target.classList.contains('main-section-header') || e.target.classList.contains('header-title');
                
                if (!isCollapseIcon && !isHeader) return;
                if (e.target.closest('.collapse-all-button')) return;
    
                // Find the associated content section for this header
                const content = header.nextElementSibling;
                const icon = header.querySelector('.section-collapse-icon');
                const isExpanded = header.getAttribute('aria-expanded') === 'true';
                
                if (!content || !icon) return;
                
                if (isExpanded) {
                    content.classList.add('collapsed');
                    icon.textContent = '▶';
                    icon.classList.add('collapsed');
                    header.setAttribute('aria-expanded', 'false');
                } else {
                    content.classList.remove('collapsed');
                    icon.textContent = '▼';
                    icon.classList.remove('collapsed');
                    header.setAttribute('aria-expanded', 'true');
                }
            });
        });

        // Handle category collapse/expand
        document.querySelectorAll('.category-header').forEach(header => {
            header.addEventListener('click', (e) => {
                e.stopPropagation();
                const content = header.nextElementSibling;
                if (!content) return;
                
                const isCollapsed = header.classList.contains('collapsed');
                const collapseIcon = header.querySelector('.category-collapse-icon');
                
                header.classList.toggle('collapsed');
                content.classList.toggle('collapsed');
                header.setAttribute('aria-expanded', String(!isCollapsed));
                
                if (collapseIcon) {
                    collapseIcon.textContent = isCollapsed ? '▼' : '▶';
                }
            });
        });

        // Handle collapse all button
        const collapseAllButton = document.getElementById('collapse-all');
        collapseAllButton?.addEventListener('click', (e) => {
            e.stopPropagation();
            allExpanded = !allExpanded;
            collapseAllButton.classList.toggle('collapsed');
            
            // Only toggle categories, not the main section
            document.querySelectorAll('.category-section').forEach(section => {
                const header = section.querySelector('.category-header');
                const content = section.querySelector('.category-content');
                if (!header || !content) return;
                
                if (!allExpanded) {
                    header.classList.add('collapsed');
                    content.classList.add('collapsed');
                    header.setAttribute('aria-expanded', 'false');
                } else {
                    header.classList.remove('collapsed');
                    content.classList.remove('collapsed');
                    header.setAttribute('aria-expanded', 'true');
                }
            });
        });

        // Refresh context prompts button
        document.getElementById('refresh-context')?.addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent triggering section collapse
            vscode.postMessage({ type: 'refreshContext' });
        });

        // Handle context-aware prompts updates
        window.addEventListener('message', event => {
            const message = event.data;
            if (message.type === 'updateContextPrompts') {
                const contextPromptsContainer = document.getElementById('context-aware-prompts');
                if (contextPromptsContainer) {
                    contextPromptsContainer.innerHTML = message.html;
                    // Re-attach event listeners for new prompt items
                    attachCopyButtonListeners(contextPromptsContainer);
                }
            }
        });

        // Helper function to attach event listeners to copy buttons
        function attachCopyButtonListeners(container) {
            container.querySelectorAll('.copy-button').forEach(button => {
                button.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const promptText = button.closest('.prompt-item')?.querySelector('.prompt-text')?.textContent;
                    if (promptText) {
                        vscode.postMessage({ type: 'copy', value: promptText });
                        button.classList.add('copied');
                        setTimeout(() => button.classList.remove('copied'), 1000);
                    }
                });
            });
        }

        // Search functionality
        const searchInput = document.getElementById('search');
        const promptList = document.getElementById('prompt-list');
        const clearSearch = document.querySelector('.clear-search');
        const noResults = document.getElementById('no-results');

        function filterPrompts(searchText) {
            const normalizedSearch = searchText.toLowerCase().trim();
            let hasVisiblePrompts = false;

            document.querySelectorAll('.category-section').forEach(section => {
                let sectionHasVisiblePrompts = false;
                const promptItems = section.querySelectorAll('.prompt-item');
                
                promptItems.forEach(item => {
                    const titleElem = item.querySelector('.prompt-title');
                    const textElem = item.querySelector('.prompt-text');
                    const title = titleElem?.textContent?.toLowerCase() || '';
                    const text = textElem?.textContent?.toLowerCase() || '';
                    
                    const matches = normalizedSearch === '' || 
                                  title.includes(normalizedSearch) || 
                                  text.includes(normalizedSearch);
                    
                    item.style.display = matches ? '' : 'none';
                    if (matches) {
                        sectionHasVisiblePrompts = true;
                        hasVisiblePrompts = true;
                    }
                });
                
                // Only hide section if we're actually searching
                if (normalizedSearch !== '') {
                    section.style.display = sectionHasVisiblePrompts ? '' : 'none';
                } else {
                    section.style.display = '';
                }
            });

            if (noResults) {
                noResults.style.display = !hasVisiblePrompts && normalizedSearch !== '' ? 'block' : 'none';
            }

            if (clearSearch) {
                clearSearch.classList.toggle('visible', normalizedSearch !== '');
            }
        }

        // Search input handler
        searchInput?.addEventListener('input', (e) => {
            const searchText = e.target.value;
            filterPrompts(searchText);
        });

        // Clear search handler
        clearSearch?.addEventListener('click', () => {
            if (searchInput) {
                searchInput.value = '';
                filterPrompts('');
            }
        });

        // Message handler for search focus
        window.addEventListener('message', event => {
            const message = event.data;
            if (message.type === 'focusSearch') {
                searchInput?.focus();
            }
        });

        // Handle insert and copy functionality
        document.addEventListener('click', (e) => {
            const target = e.target;
            const copyButton = target.closest('.copy-button');
            if (copyButton) {
                const promptText = copyButton.closest('.prompt-item')?.querySelector('.prompt-text')?.textContent;
                if (promptText) {
                    vscode.postMessage({ type: 'copy', value: promptText });
                    copyButton.classList.add('copied');
                    setTimeout(() => copyButton.classList.remove('copied'), 1000);
                }
            }
        });

        // Add Prompt Enhancer functionality
        const promptInput = document.getElementById('promptInput');
        const enhanceButton = document.getElementById('enhanceButton');
        const clearButton = document.getElementById('clearButton');
        const enhancedPrompt = document.querySelector('.enhanced-prompt');
        const enhancedContent = document.getElementById('enhancedContent');
        const copyEnhanced = document.getElementById('copyEnhanced');

        enhanceButton?.addEventListener('click', async () => {
            const prompt = promptInput?.value?.trim();
            if (!prompt) {
                return;
            }

            enhanceButton.disabled = true;
            enhanceButton.innerHTML = 'Enhancing... <span class="enhance-indicator">⏳</span>';
            enhancedPrompt.style.display = 'none';
            enhancedContent.textContent = '';

            try {
                vscode.postMessage({ 
                    type: 'enhancePrompt',
                    value: prompt
                });
            } catch (error) {
                console.error('Enhancement failed:', error);
            }
        });

        // Add clear button handler
        clearButton?.addEventListener('click', () => {
            if (promptInput) {
                promptInput.value = '';
            }
            if (enhancedPrompt && enhancedContent) {
                enhancedPrompt.style.display = 'none';
                enhancedContent.textContent = '';
            }
        });

        copyEnhanced?.addEventListener('click', () => {
            const enhancedText = enhancedContent?.textContent;
            if (enhancedText) {
                vscode.postMessage({ 
                    type: 'copy',
                    value: enhancedText
                });
                copyEnhanced.classList.add('copied');
                setTimeout(() => copyEnhanced.classList.remove('copied'), 1000);
            }
        });

        // Handle enhancement messages
        window.addEventListener('message', event => {
            const message = event.data;

            switch (message.type) {
                case 'enhanceToken':
                    if (enhancedContent && message.value) {
                        if (!enhancedPrompt.style.display || enhancedPrompt.style.display === 'none') {
                            enhancedPrompt.style.display = 'block';
                        }
                        enhancedContent.textContent += message.value;
                    }
                    break;

                case 'enhanceComplete':
                    if (enhanceButton) {
                        enhanceButton.disabled = false;
                        enhanceButton.textContent = 'Enhance Prompt';
                    }
                    break;

                case 'enhanceError':
                    if (enhanceButton) {
                        enhanceButton.disabled = false;
                        enhanceButton.textContent = 'Enhance Prompt';
                    }
                    break;
            }
        });
    </script>
</body>
</html>`;
}
