import * as vscode from 'vscode';

export class AuthManager {
    private static instance: AuthManager;
    private authSession: vscode.AuthenticationSession | undefined;

    private constructor() { }

    static getInstance(): AuthManager {
        if (!AuthManager.instance) {
            AuthManager.instance = new AuthManager();
        }
        return AuthManager.instance;
    }

    async initialize(): Promise<void> {
        try {
            // Don't auto-initialize the session, let user explicitly login
            this.authSession = undefined;
        } catch (error) {
            console.error('Error initializing auth:', error);
        }
    }

    private async checkCopilotLicense(): Promise<boolean> {
        try {
            // Check if GitHub Copilot is installed and enabled
            const extension = vscode.extensions.getExtension('GitHub.copilot');
            if (!extension) {
                vscode.window.showErrorMessage('GitHub Copilot is not installed. Please install it to use this extension.');
                return false;
            }

            // Check if the extension is active
            if (!extension.isActive) {
                await extension.activate();
            }

            // Try to get chat models - this will fail if user doesn't have Copilot access
            const chatModels = await vscode.lm.selectChatModels({ family: "gpt-4" });
            return chatModels && chatModels.length > 0;
        } catch (error) {
            console.error('Error checking Copilot license:', error);
            vscode.window.showErrorMessage('GitHub Copilot access is required to use this extension. Please ensure you have an active subscription.');
            return false;
        }
    }

    async login(): Promise<boolean> {
        try {
            // First check if user has Copilot access
            const hasCopilot = await this.checkCopilotLicense();
            if (!hasCopilot) {
                return false;
            }

            // Get a fresh session
            this.authSession = await vscode.authentication.getSession('github', ['user'], {
                createIfNone: true,
                clearSessionPreference: true // Clear any existing session preference
            });

            return !!this.authSession;
        } catch (error) {
            console.error('Login failed:', error);
            vscode.window.showErrorMessage('GitHub login failed. Please try again.');
            return false;
        }
    }

    async logout(): Promise<void> {
        try {
            if (this.authSession) {
                // Clear the session from VS Code's authentication provider
                const scopes = this.authSession.scopes;
                await vscode.authentication.getSession('github', scopes, { clearSessionPreference: true });
                this.authSession = undefined;
            }
        } catch (error) {
            console.error('Logout failed:', error);
            vscode.window.showErrorMessage('Failed to sign out. Please try again.');
        }
    }

    isAuthenticated(): boolean {
        return !!this.authSession;
    }

    async getUserInfo(): Promise<any | null> {
        if (!this.authSession) {
            return null;
        }

        try {
            const response = await fetch('https://api.github.com/user', {
                headers: {
                    'Authorization': `Bearer ${this.authSession.accessToken}`,
                    'User-Agent': 'VSCode-Prompt-Playbook'
                }
            });
            return await response.json();
        } catch (error) {
            console.error('Error fetching user info:', error);
            return null;
        }
    }
}