import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { getSidebarHtml } from './html/sidebarhtml';
import { ContextAnalyzer, ContextPrompt } from './contextAnalyzer';
import { AuthManager } from './authManager';

interface Prompt {
  title: string;
  text: string;
  category: string;
}

interface CategoryIcon {
  icon: string;
  color: string;
}

const categoryIcons: { [key: string]: CategoryIcon } = {
  'Application Modernization': { icon: '🔄', color: '#4CAF50' },
  'Performance': { icon: '⚡', color: '#FF9800' },
  'Security': { icon: '🔒', color: '#f44336' },
  'API Design': { icon: '🔌', color: '#2196F3' },
  'Architecture': { icon: '🏗️', color: '#9C27B0' },
  'Refactoring': { icon: '♻️', color: '#795548' },
  'Testing': { icon: '🧪', color: '#607D8B' },
  'Debugging': { icon: '🐛', color: '#E91E63' },
  'Code Review': { icon: '👀', color: '#009688' },
  'Code Generation': { icon: '⚙️', color: '#3F51B5' },
  'Code Understanding': { icon: '🧠', color: '#673AB7' },
  'DevOps': { icon: '🚀', color: '#FF5722' },
};

export class PromptSidebarProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'prompt-playbook.sidebarView';
  private _view?: vscode.WebviewView;
  private _prompts: Prompt[] = [];
  private _contextPrompts: ContextPrompt[] = [];
  private _contextUpdateTimeout?: NodeJS.Timeout;
  private authManager: AuthManager;

  // Add getter for view property
  public get view(): vscode.WebviewView | undefined {
    return this._view;
  }

  constructor(private readonly _extensionUri: vscode.Uri) {
    this._prompts = this.loadPrompts();
    this.authManager = AuthManager.getInstance();

    // Listen for editor changes to update context
    vscode.window.onDidChangeActiveTextEditor(() => this.scheduleContextUpdate());
    vscode.window.onDidChangeTextEditorSelection(() => this.scheduleContextUpdate());
  }

  private scheduleContextUpdate() {
    // Debounce the context update to avoid excessive processing
    if (this._contextUpdateTimeout) {
      clearTimeout(this._contextUpdateTimeout);
    }

    this._contextUpdateTimeout = setTimeout(() => {
      this.updateContextPrompts();
    }, 1000);
  }

  private loadPrompts(): Prompt[] {
    const promptsPath = path.join(this._extensionUri.fsPath, 'prompts.json');
    try {
      const promptsData = fs.readFileSync(promptsPath, 'utf8');
      return JSON.parse(promptsData);
    } catch (error) {
      console.error('Failed to load prompts:', error);
      return [];
    }
  }

  public async resolveWebviewView(
    webviewView: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ) {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri]
    };

    // Initialize auth
    await this.authManager.initialize();

    // Get user info if authenticated
    const userInfo = this.authManager.isAuthenticated() ? await this.authManager.getUserInfo() : null;

    webviewView.webview.html = this._getHtmlForWebview(
      webviewView.webview,
      this.authManager.isAuthenticated(),
      userInfo
    );

    webviewView.webview.onDidReceiveMessage(async (data: any) => {
      switch (data.type) {
        case 'login':
          const success = await this.authManager.login();
          if (success) {
            const userInfo = await this.authManager.getUserInfo();
            await this.updateWebview(true, userInfo);
          }
          break;
        case 'logout':
          console.log('Logout message received');
          try {
            // Clear session before updating the UI
            await this.authManager.logout();
            vscode.window.showInformationMessage('Signed out successfully');

            // Important: Update UI after logout
            await this.updateWebview(false);
          } catch (error) {
            console.error('Logout error:', error);
            vscode.window.showErrorMessage('Failed to sign out. Please try again.');
          }
          break;
        case 'copy':
          try {
            if (data.value) {
              await vscode.env.clipboard.writeText(data.value);
              vscode.window.showInformationMessage('Text copied to clipboard');
            }
          } catch (error) {
            console.error('Copy failed:', error);
            vscode.window.showErrorMessage('Failed to copy text');
          }
          break;
        case 'enhancePrompt':
          await this.enhanceWithAI(data.value);
          break;
        case 'refreshContext':
          await this.updateContextPrompts();
          break;
      }
    });

    // Only update context prompts if authenticated
    if (this.authManager.isAuthenticated()) {
      this.updateContextPrompts();
    }
  }

  private _getHtmlForWebview(
    webview: vscode.Webview,
    isAuthenticated: boolean = false,
    userInfo: any = null
  ): string {
    const nonce = getNonce();
    const renderedPromptList = this.renderPromptList();
    const renderedContextPrompts = this.renderContextPrompts();
    return getSidebarHtml(
      webview,
      this._extensionUri,
      nonce,
      renderedPromptList,
      renderedContextPrompts,
      isAuthenticated,
      userInfo
    );
  }

  private async updateWebview(isAuthenticated: boolean, userInfo: any = null): Promise<void> {
    if (this._view) {
      this._view.webview.html = this._getHtmlForWebview(
        this._view.webview,
        isAuthenticated,
        userInfo
      );

      // Force a refresh of the context prompts if the user is authenticated
      if (isAuthenticated) {
        setTimeout(() => this.updateContextPrompts(), 500);
      }
    }
  }

  private renderPromptList(): string {
    const categories = Array.from(new Set(this._prompts.map(p => p.category)));
    return categories.map(category => {
      const prompts = this._prompts.filter(p => p.category === category);
      const categoryIcon = categoryIcons[category] || { icon: '📁', color: '#757575' };
      return `
            <div class="category-section">
                <div class="category-header" role="button" tabindex="0" aria-expanded="true">
                    <span class="category-icon" style="color: ${categoryIcon.color}">${categoryIcon.icon}</span>
                    <span class="category-title">${this.escapeHtml(category)}</span>
                    <span class="prompt-count">${prompts.length}</span>
                    <span class="category-collapse-icon">▼</span>
                </div>
                <div class="category-content">
                    <div class="prompt-list">
                        ${prompts.map(prompt => this.renderPromptItem(prompt)).join('')}
                    </div>
                </div>
            </div>`;
    }).join('');
  }

  private renderContextPrompts(): string {
    if (!this._contextPrompts.length) {
      return '<div class="no-context">No context-aware prompts available. Open a file to see relevant prompts.</div>';
    }

    // Display only the top 10 prompts
    const topPrompts = this._contextPrompts.slice(0, 10);

    return topPrompts.map(prompt => `
      <div class="prompt-item">
          <div class="prompt-header">
              <div class="prompt-title">${this.escapeHtml(prompt.title)}</div>
              <button class="copy-button" title="Copy to clipboard">
                  <svg width="12" height="12" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
                      <path fill="currentColor" d="M4 4h8v8H4z"/>
                      <path fill="currentColor" d="M12 2H2v12h2v2h12V6h-2V2zm1 13H5V5h8v10zm1-11v1h1v9H7v-1H3V3h10z"/>
                  </svg>
              </button>
          </div>
          <div class="prompt-text">${this.escapeHtml(prompt.text)}</div>
          <div class="prompt-details">
              ${prompt.source ? `<span class="prompt-source" title="Source of this suggestion">Source: ${this.escapeHtml(prompt.source)}</span>` : ''}
              ${prompt.confidence !== undefined ? `
                  <span class="prompt-confidence" title="Confidence score (0-100)">
                      <span class="confidence-bar" style="width: ${prompt.confidence}%"></span>
                      <span class="confidence-text">${prompt.confidence}%</span>
                  </span>
              ` : ''}
              ${prompt.tags && prompt.tags.length ?
        `<div class="prompt-tags">
                    ${prompt.tags.map(tag => `<span class="prompt-tag">${this.escapeHtml(tag)}</span>`).join('')}
                </div>` : ''}
          </div>
      </div>`
    ).join('');
  }

  private renderPromptItem(prompt: Prompt): string {
    return `
            <div class="prompt-item">
                <div class="prompt-header">
                    <div class="prompt-title">${this.escapeHtml(prompt.title)}</div>
                    <button class="copy-button" title="Copy to clipboard">
                        <svg width="12" height="12" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
                            <path fill="currentColor" d="M4 4h8v8H4z"/>
                            <path fill="currentColor" d="M12 2H2v12h2v2h12V6h-2V2zm1 13H5V5h8v10zm1-11v1h1v9H7v-1H3V3h10z"/>
                        </svg>
                    </button>
                </div>
                <div class="prompt-text">${this.escapeHtml(prompt.text)}</div>
            </div>`;
  }

  private escapeHtml(unsafe: string): string {
    return unsafe
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  private async updateContextPrompts(): Promise<void> {
    try {
      if (!this._view) {
        return;
      }

      // Show loading state
      this._view.webview.postMessage({
        type: 'updateContextPrompts',
        html: '<div class="no-context">Loading context-aware suggestions...</div>'
      });

      const context = ContextAnalyzer.getEditorContext();

      // The method is now async
      this._contextPrompts = await ContextAnalyzer.generateContextPrompts(context);

      const renderedContextPrompts = this.renderContextPrompts();

      this._view.webview.postMessage({
        type: 'updateContextPrompts',
        html: renderedContextPrompts
      });
    } catch (error) {
      console.error('Error updating context prompts:', error);

      // Show error message in the UI
      if (this._view) {
        this._view.webview.postMessage({
          type: 'updateContextPrompts',
          html: '<div class="no-context">Error loading context-aware suggestions. Please try again.</div>'
        });
      }
    }
  }

  private async enhanceWithAI(userPrompt: string): Promise<void> {
    try {
      if (!this._view) {
        return;
      }

      this._view.webview.postMessage({
        type: 'enhanceStart',
        message: 'Initializing enhancement...'
      });

      const promptTemplate = `
                Please enhance this prompt:

                ORIGINAL:
                ${userPrompt}

                Make it more effective by:
                1. Adding specific context and requirements
                2. Including necessary constraints
                3. Defining expected response format
                4. Making it precise and unambiguous

                Enhanced version:`;

      const response = await vscode.commands.executeCommand('prompt-playbook.enhancePrompt', promptTemplate);
      if (!response) {
        return;
      }

      const chatResponse = response as { text: AsyncIterableIterator<string> };
      for await (const token of chatResponse.text) {
        this._view.webview.postMessage({
          type: 'enhanceToken',
          value: token
        });
      }

      this._view.webview.postMessage({ type: 'enhanceComplete' });
      vscode.window.showInformationMessage('Prompt enhanced successfully!');
    } catch (error) {
      console.error('Enhancement error:', error);
      this._view?.webview.postMessage({
        type: 'enhanceError',
        message: error instanceof Error ? error.message : 'Unknown error occurred'
      });
    }
  }
}

function getNonce(): string {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}