import * as vscode from 'vscode';

export interface EditorContext {
    languageId: string;
    selectedText: string;
    cursorLineText: string;
    lineNumber: number;
    documentText?: string;
    fileName?: string;
    fileExtension?: string;
}

export interface ContextPrompt {
    title: string;
    text: string;
    confidence: number; // 0-100 indicating relevance
}

export class ContextAnalyzer {
    /**
     * Extract context from the current editor
     */
    static getEditorContext(): EditorContext | null {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            return null;
        }

        const document = editor.document;
        const selection = editor.selection;
        const selectedText = document.getText(selection);
        const cursorPosition = selection.active;
        const cursorLineText = document.lineAt(cursorPosition.line).text;

        // Extract filename and extension
        let fileName = undefined;
        let fileExtension = undefined;

        if (document.fileName) {
            const path = document.fileName.split(/[/\\]/);
            fileName = path[path.length - 1];
            const extParts = fileName.split('.');
            if (extParts.length > 1) {
                fileExtension = extParts[extParts.length - 1];
            }
        }

        // For very large files, we might not want to include the entire text
        const documentText = document.getText();

        return {
            languageId: document.languageId,
            selectedText,
            cursorLineText,
            lineNumber: cursorPosition.line,
            fileName,
            fileExtension,
            documentText: documentText.length < 10000 ? documentText : undefined
        };
    }

    /**
     * Generate context-aware prompts based on editor context
     */
    static generateContextPrompts(context: EditorContext | null): ContextPrompt[] {
        if (!context) {
            return [];
        }

        const prompts: ContextPrompt[] = [];

        // Add language-specific prompts
        this.addLanguageSpecificPrompts(prompts, context);

        // Add selection-based prompts
        if (context.selectedText) {
            this.addSelectionBasedPrompts(prompts, context);
        }

        // Add line-based prompts if no text is selected
        if (!context.selectedText && context.cursorLineText) {
            this.addLineBasedPrompts(prompts, context);
        }

        // Add file-based prompts
        this.addFileBasedPrompts(prompts, context);

        // Sort by confidence
        return prompts.sort((a, b) => b.confidence - a.confidence);
    }

    private static addLanguageSpecificPrompts(prompts: ContextPrompt[], context: EditorContext) {
        const lang = context.languageId;

        switch (lang) {
            case 'typescript':
            case 'javascript':
                prompts.push({
                    title: 'Explain This Code',
                    text: `Explain what the following ${lang} code does:\n\n\`\`\`${lang}\n${context.selectedText || context.cursorLineText}\n\`\`\``,
                    confidence: context.selectedText ? 90 : 70
                });
                prompts.push({
                    title: 'Improve Error Handling',
                    text: `Add proper error handling to this ${lang} code:\n\n\`\`\`${lang}\n${context.selectedText || context.cursorLineText}\n\`\`\``,
                    confidence: 75
                });
                break;

            case 'python':
                prompts.push({
                    title: 'Write Type Hints',
                    text: `Add Python type hints to the following code:\n\n\`\`\`python\n${context.selectedText || context.cursorLineText}\n\`\`\``,
                    confidence: 85
                });
                prompts.push({
                    title: 'Convert to List Comprehension',
                    text: `Convert this Python code to use list comprehension for improved readability:\n\n\`\`\`python\n${context.selectedText || context.cursorLineText}\n\`\`\``,
                    confidence: 70
                });
                break;

            case 'html':
                prompts.push({
                    title: 'Improve Accessibility',
                    text: `Add accessibility attributes to improve this HTML:\n\n\`\`\`html\n${context.selectedText || context.cursorLineText}\n\`\`\``,
                    confidence: 85
                });
                break;

            case 'css':
                prompts.push({
                    title: 'Optimize CSS',
                    text: `Optimize and improve this CSS code for better performance:\n\n\`\`\`css\n${context.selectedText || context.cursorLineText}\n\`\`\``,
                    confidence: 80
                });
                break;

            default:
                prompts.push({
                    title: 'Explain Code',
                    text: `Explain what this code does and suggest improvements:\n\n\`\`\`\n${context.selectedText || context.cursorLineText}\n\`\`\``,
                    confidence: 60
                });
        }
    }

    private static addSelectionBasedPrompts(prompts: ContextPrompt[], context: EditorContext) {
        prompts.push({
            title: 'Refactor Code',
            text: `Refactor this code to improve readability and maintainability:\n\n\`\`\`${context.languageId}\n${context.selectedText}\n\`\`\``,
            confidence: 95
        });

        prompts.push({
            title: 'Unit Test',
            text: `Write unit tests for this code:\n\n\`\`\`${context.languageId}\n${context.selectedText}\n\`\`\``,
            confidence: 85
        });

        if (context.selectedText.length > 100) {
            prompts.push({
                title: 'Add Comments',
                text: `Add comprehensive comments to explain this code:\n\n\`\`\`${context.languageId}\n${context.selectedText}\n\`\`\``,
                confidence: 80
            });
        }
    }

    private static addLineBasedPrompts(prompts: ContextPrompt[], context: EditorContext) {
        // Function detection (crude but simple)
        if (/function|def |class |method|async/.test(context.cursorLineText)) {
            prompts.push({
                title: 'Document Function',
                text: `Write documentation for this function:\n\n\`\`\`${context.languageId}\n${context.cursorLineText}\n\`\`\``,
                confidence: 90
            });
        }

        // Variable detection
        if (/const |let |var |= |: /.test(context.cursorLineText)) {
            prompts.push({
                title: 'Better Variable Name',
                text: `Suggest a better name for the variable in this line:\n\n\`\`\`${context.languageId}\n${context.cursorLineText}\n\`\`\``,
                confidence: 75
            });
        }
    }

    private static addFileBasedPrompts(prompts: ContextPrompt[], context: EditorContext) {
        if (context.fileName) {
            prompts.push({
                title: 'File Documentation',
                text: `Write a comprehensive documentation header for ${context.fileName}`,
                confidence: 70
            });
        }

        // Test file detection
        if (context.fileName && /test|spec/.test(context.fileName.toLowerCase())) {
            prompts.push({
                title: 'Add Test Cases',
                text: `Suggest additional test cases for this test file`,
                confidence: 85
            });
        }
    }
}
