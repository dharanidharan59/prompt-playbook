import * as vscode from 'vscode';

export function getSidebarHtml(
    webview: vscode.Webview,
    extensionUri: vscode.Uri,
    nonce: string,
    renderPromptList: string,
    renderContextPrompts: string,
    isAuthenticated: boolean,
    userInfo?: any
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

        /* Login styles */
        .login-container {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            min-height: calc(100vh - 120px);
            margin: 60px 40px;
            padding: 40px 30px;
            text-align: center;
            background: var(--vscode-editor-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 8px;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        }

        .github-button {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            border-radius: 4px;
            padding: 8px 16px;
            font-size: 13px;
            font-weight: 500;
            cursor: pointer;
            transition: background-color 0.2s;
            margin-top: 8px;
        }

        .github-button:hover {
            background-color: var(--vscode-button-hoverBackground);
        }

        .github-button svg {
            margin-right: 8px;
        }

        .user-info {
            display: flex;
            align-items: center;
            padding: 8px 16px;
            border-bottom: 1px solid var(--vscode-panel-border);
            background: var(--vscode-sideBarSectionHeader-background);
            cursor: pointer;
            transition: background-color 0.2s ease;
        }

        .user-info:hover {
            background-color: var(--vscode-list-hoverBackground);
        }

        .user-avatar {
            width: 24px;
            height: 24px;
            border-radius: 50%;
            margin-right: 8px;
        }

        .user-name {
            flex: 1;
            font-size: 12px;
        }
        
        .user-info:after {
            content: "⋮";
            font-size: 14px;
            color: var(--vscode-foreground);
            opacity: 0.7;
        }

        .logout-icon {
            font-size: 16px;
            margin-left: 8px;
            color: var(--vscode-foreground);
            opacity: 0.7;
        }

        .welcome-header {
            margin-bottom: 40px;
            width: 100%;
            max-width: 400px;
        }

        .welcome-header h2 {
            font-size: 24px;
            margin-bottom: 16px;
            color: var(--vscode-foreground);
            font-weight: 500;
            letter-spacing: 0.3px;
        }

        .welcome-subtext {
            color: var(--vscode-descriptionForeground);
            font-size: 14px;
            line-height: 1.5;
            margin: 0 0 32px 0;
        }

        .feature-list {
            display: flex;
            flex-direction: column;
            gap: 12px;
            width: 100%;
            max-width: 320px;
            margin: 0 auto;
        }

        .feature-item {
            padding: 10px 16px;
            border-radius: 4px;
            background-color: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
            font-size: 13px;
            transition: all 0.2s ease;
            opacity: 0.9;
            text-align: left;
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .feature-item:hover {
            opacity: 1;
            transform: translateY(-1px);
        }

        .auth-text {
            margin: 32px 0 24px;
            color: var(--vscode-descriptionForeground);
            font-size: 13px;
        }
    </style>
</head>
<body>
    ${!isAuthenticated ? `
        <div class="login-container">
            <div class="welcome-header">
                <h2>Welcome to Prompt Playbook</h2>
                <p class="welcome-subtext">Enhance your development workflow with AI-powered prompt engineering</p>
                <div class="feature-list">
                    <div class="feature-item">✨ Smart context-aware suggestions</div>
                    <div class="feature-item">📚 Curated prompt templates</div>
                    <div class="feature-item">🔄 Real-time prompt enhancement</div>
                </div>
            </div>
            <p class="auth-text">Sign in with GitHub to get started</p>
            <button class="github-button" id="github-login">
                <svg height="16" viewBox="0 0 16 16" width="16">
                    <path fill="currentColor" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
                </svg>
                Sign in with GitHub
            </button>
        </div>
    ` : `
        ${userInfo ? `
            <div class="user-info" id="logout-container">
                <img src="${userInfo.avatar_url}" alt="" class="user-avatar">
                <span class="user-name">${userInfo.login}</span>
                <button id="logout" class="logout-button" title="Sign out">
                    <svg class="logout-icon" width="16" height="16" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
                        <path fill="currentColor" d="M11.992 8.994V6.996H7.995v-2h3.997V2.999l3.998 2.998-3.998 2.997zm-1.998 2.997H5.996V2.998L2 1h7.995v2.998h1V1c0-.55-.45-1-1.002-1H1.993C1.443 0 1 .45 1 1v11.372c0 .39.22.73.55.91L5.996 16v-2.016h3.998c.553 0 1-.448 1-1V7.995h-1v3.996z"/>
                    </svg>
                </button>
            </div>
        ` : ''}
        <div class="sidebar-container">
            <div class="sections-wrapper">
                <!-- Context-Aware Prompts Section -->
                <div class="main-section-container">
                    <div class="section-header main-section-header" role="button" tabindex="0" aria-expanded="true">
                        <span class="section-collapse-icon">▼</span>
                        <h1 class="header-title">Context-Aware Prompts</h1>
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
                    </div>
                    <div class="section-content main-section-content">
                        <div class="search-wrapper">
                            <div class="search-controls">
                                <div class="typeahead-container">
                                    <input type="text" id="search" placeholder="Search prompts... (Ctrl+F)" />
                                    <button class="clear-search" aria-label="Clear search">
                                        <svg width="16" height="16" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
                                            <path fill="currentColor" d="M8 8.707l3.646 3.647.708-.707L8.707 8l3.647-3.646-.707-.708L8 7.293 4.354 3.646l-.707.708L7.293 8l-3.646 3.646.707.708L8 8.707z"/>
                                        </svg>
                                    </button>
                                    <button id="collapse-all" class="collapse-all-button"></button>
                                </div>
                                <div id="typeahead-dropdown" class="typeahead-dropdown"></div>
                            </div>
                        </div>
                        <div id="prompt-list" class="prompt-list-container">
                            ${renderPromptList}
                            <div id="no-results" style="display: none; text-align: center; padding: 20px;">
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
    `}

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

        // Auth event listeners
        document.getElementById('github-login')?.addEventListener('click', () => {
            vscode.postMessage({ type: 'login' });
        });

        // Update logout event listener to use the button
        const logoutButton = document.getElementById('logout');
        if (logoutButton) {
            logoutButton.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                vscode.postMessage({ type: 'logout' });
            });
        }
        
        // Add a backup handler on the container itself
        const logoutContainer = document.getElementById('logout-container');
        if (logoutContainer) {
            logoutContainer.addEventListener('click', () => {
                const confirmLogout = confirm('Are you sure you want to sign out?');
                if (confirmLogout) {
                    vscode.postMessage({ type: 'logout' });
                }
            });
        }
    </script>
</body>
</html>`;
}
