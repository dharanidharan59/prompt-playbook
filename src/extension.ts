import * as vscode from 'vscode';
import { PromptSidebarProvider } from './promptSidebar';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
	const sidebarProvider = new PromptSidebarProvider(context.extensionUri);

	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider(
			PromptSidebarProvider.viewType,
			sidebarProvider
		)
	);

	// Add keyboard shortcut to focus prompt playbook
	context.subscriptions.push(
		vscode.commands.registerCommand('prompt-playbook.focus', () => {
			vscode.commands.executeCommand('prompt-playbook.sidebarView.focus');
		})
	);

	// Add keyboard shortcut to search prompts
	context.subscriptions.push(
		vscode.commands.registerCommand('prompt-playbook.search', () => {
			if (sidebarProvider.view) {
				sidebarProvider.view.webview.postMessage({ type: 'focusSearch' });
			}
		})
	);

	// Register enhance prompt command using GitHub models
	context.subscriptions.push(
		vscode.commands.registerCommand('prompt-playbook.enhancePrompt', async (userQuery: string, token?: vscode.CancellationToken) => {
			try {
				// Select chat models from the GitHub family using selectChatModels
				const chatModels = await vscode.lm.selectChatModels({ family: "gpt-4" });
				const chatModel = chatModels[0];
				const messages = [
					vscode.LanguageModelChatMessage.Assistant("You are an AI prompt engineering expert. Your task is to enhance and improve prompts to make them more effective and precise. Do not assume more and give a vague prompt. Give a crisp and clear prompt."),
					vscode.LanguageModelChatMessage.User(userQuery)
				];

				// Send the request to get a response
				const chatRequest = await chatModel.sendRequest(messages, undefined, token);
				return chatRequest;
			} catch (error) {
				console.error('Enhancement error:', error);
				vscode.window.showErrorMessage(`Failed to enhance prompt: ${error}`);
				throw error;
			}
		})
	);
}

export function deactivate() { }
