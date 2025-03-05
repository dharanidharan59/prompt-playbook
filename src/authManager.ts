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
            console.log('Starting logout process...');

            // Get current session
            const session = await vscode.authentication.getSession('github', ['user'], {
                createIfNone: false
            });

            if (session) {
                // Clear session preference
                await vscode.authentication.getSession('github', ['user'], {
                    createIfNone: false,
                    clearSessionPreference: true
                });
                console.log('Cleared session preferences');
            }

            // Clear our local session reference
            this.authSession = undefined;

            console.log('Logout completed successfully');
        } catch (error) {
            console.error('Logout failed:', error);
            throw error; // Let the caller handle the error
        }
    }

    isAuthenticated(): boolean {
        return Boolean(this.authSession?.accessToken) &&
            Boolean(this.authSession?.scopes?.includes('user'));
    }

    async getUserInfo(): Promise<any | null> {
        try {
            if (!this.authSession?.accessToken) {
                return null;
            }

            const response = await fetch('https://api.github.com/user', {
                headers: {
                    'Authorization': `Bearer ${this.authSession.accessToken}`,
                    'User-Agent': 'VSCode-Prompt-Playbook',
                    'Accept': 'application/vnd.github.v3+json'
                }
            });

            if (!response.ok) {
                if (response.status === 401) {
                    // Token is invalid, clear the session
                    this.authSession = undefined;
                    return null;
                }
                throw new Error(`GitHub API error: ${response.status}`);
            }

            const data = await response.json();
            return data;

        } catch (error) {
            console.error('Error fetching user info:', error);
            // Only clear session on auth errors
            if (error instanceof Error && error.message.includes('401')) {
                this.authSession = undefined;
            }
            return null;
        }
    }
}