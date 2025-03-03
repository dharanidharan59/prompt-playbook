import * as vscode from 'vscode';
import { ModelManager } from './modelManager';

// Cached context to avoid excessive reanalysis
let cachedContext: EditorContext | null = null;
let cachedPrompts: ContextPrompt[] = [];
let lastAnalysisTimestamp = 0;
let lastSelectionText: string = '';
let lastActiveDocument: string = '';

export interface EditorContext {
    languageId: string;
    selectedText: string;
    cursorLineText: string;
    lineNumber: number;
    documentText?: string;
    fileName?: string;
    fileExtension?: string;
    currentFunction?: string;
    currentClass?: string;
    imports?: string[];
    syntaxType?: string;
    selectionRange?: {
        startLine: number;
        endLine: number;
    };
}

export interface ContextPrompt {
    title: string;
    text: string;
    confidence: number; // 0-100 indicating relevance
    tags?: string[];
    source?: string; // Indicates what triggered this prompt (e.g., 'selection', 'function', 'file')
}

interface CodePattern {
    pattern: RegExp;
    type: string;
    language?: string[];
    confidence: number;
}

// Code patterns to detect contexts
const CODE_PATTERNS: CodePattern[] = [
    // Function declarations
    {
        pattern: /\b(function|async function)\s+([A-Za-z0-9_]+)\s*\([^)]*\)\s*\{/,
        type: 'function_declaration',
        language: ['javascript', 'typescript'],
        confidence: 90
    },
    {
        pattern: /\b(def)\s+([A-Za-z0-9_]+)\s*\([^)]*\):/,
        type: 'function_declaration',
        language: ['python'],
        confidence: 90
    },
    // Class declarations
    {
        pattern: /\b(class)\s+([A-Za-z0-9_]+)(\s+extends\s+[A-Za-z0-9_\.]+)?\s*\{/,
        type: 'class_declaration',
        language: ['javascript', 'typescript'],
        confidence: 85
    },
    {
        pattern: /\b(class)\s+([A-Za-z0-9_]+)(\([^)]*\))?:/,
        type: 'class_declaration',
        language: ['python'],
        confidence: 85
    },
    // Loops
    {
        pattern: /\b(for|while)\s*\([^)]*\)\s*\{/,
        type: 'loop',
        language: ['javascript', 'typescript', 'java', 'csharp', 'cpp'],
        confidence: 75
    },
    {
        pattern: /\b(for|while)\s+[^:]+:/,
        type: 'loop',
        language: ['python'],
        confidence: 75
    },
    // Conditionals
    {
        pattern: /\b(if|else if|switch)\s*\([^)]*\)\s*\{/,
        type: 'conditional',
        language: ['javascript', 'typescript', 'java', 'csharp', 'cpp'],
        confidence: 70
    },
    {
        pattern: /\b(if|elif|else)\s+[^:]+:/,
        type: 'conditional',
        language: ['python'],
        confidence: 70
    },
    // API endpoints
    {
        pattern: /@(Get|Post|Put|Delete|Patch)Mapping|app\.(get|post|put|delete|patch)/,
        type: 'api_endpoint',
        confidence: 95
    },
    // React components
    {
        pattern: /\bfunction\s+([A-Z][A-Za-z0-9_]*)\s*\([^)]*\)\s*\{[\s\S]*return\s+<[^>]+>/,
        type: 'react_component',
        language: ['javascript', 'typescript', 'jsx', 'tsx'],
        confidence: 90
    },
    // Database queries
    {
        pattern: /(SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER)\s+/i,
        type: 'sql_query',
        confidence: 85
    },
    // Error handling
    {
        pattern: /\b(try|catch|finally|throw|throws)\b/,
        type: 'error_handling',
        confidence: 80
    }
];

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

        // Check if document or selection has changed
        const documentId = `${document.uri.toString()}-${document.version}`;
        const selectionChanged = selectedText !== lastSelectionText;
        const documentChanged = documentId !== lastActiveDocument;

        // Update tracking variables
        lastSelectionText = selectedText;
        lastActiveDocument = documentId;

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

        // Extract current function/class context
        const currentFunction = this.extractCurrentFunction(document, cursorPosition);
        const currentClass = this.extractCurrentClass(document, cursorPosition);

        // Extract imports
        const imports = this.extractImports(documentText, document.languageId);

        // Determine syntax context
        const syntaxType = this.determineSyntaxType(documentText, cursorLineText, document.languageId);

        // Track selection range for better context
        const selectionRange = selection.isEmpty ? undefined : {
            startLine: selection.start.line,
            endLine: selection.end.line
        };

        // If selection or document changed, invalidate cache
        if (selectionChanged || documentChanged) {
            this.invalidateCache();
        }

        return {
            languageId: document.languageId,
            selectedText,
            cursorLineText,
            lineNumber: cursorPosition.line,
            fileName,
            fileExtension,
            documentText: documentText.length < 10000 ? documentText : undefined,
            currentFunction,
            currentClass,
            imports,
            syntaxType,
            selectionRange
        };
    }

    /**
     * Invalidate the context cache
     */
    private static invalidateCache(): void {
        cachedContext = null;
        cachedPrompts = [];
        lastAnalysisTimestamp = 0;
    }

    /**
     * Extract the current function where cursor is positioned
     */
    private static extractCurrentFunction(document: vscode.TextDocument, position: vscode.Position): string | undefined {
        // Simple extraction for demo purposes - in a real-world implementation,
        // this would use language servers or AST parsing for accurate results
        const text = document.getText();
        const langId = document.languageId;
        const cursorOffset = document.offsetAt(position);

        let functionMatch: RegExpExecArray | null = null;

        if (['javascript', 'typescript', 'javascriptreact', 'typescriptreact'].includes(langId)) {
            const functionRegex = /\b(function|async function|const|let|var)?\s*([A-Za-z0-9_]+)\s*=?\s*(\(|\s*async\s*\(|\s*=>)|\b(class)\s+([A-Za-z0-9_]+)|([A-Za-z0-9_]+)\s*\([^)]*\)\s*\{/g;
            let match;

            while ((match = functionRegex.exec(text)) !== null) {
                const startPos = match.index;
                // Find the end of this function by matching braces
                let braceCount = 0;
                let endPos = startPos;
                let foundStartBrace = false;

                for (let i = startPos; i < text.length; i++) {
                    if (text[i] === '{') {
                        foundStartBrace = true;
                        braceCount++;
                    } else if (text[i] === '}') {
                        braceCount--;
                        if (braceCount === 0 && foundStartBrace) {
                            endPos = i + 1;
                            break;
                        }
                    }
                }

                // If cursor is within this function
                if (startPos <= cursorOffset && cursorOffset <= endPos) {
                    functionMatch = match;
                    // Stop when we find the innermost function containing cursor
                }
            }

            if (functionMatch) {
                // Get the function name
                const funcName = functionMatch[2] || functionMatch[5] || functionMatch[6] || 'anonymous';
                return funcName;
            }
        } else if (langId === 'python') {
            const functionRegex = /\b(def|class)\s+([A-Za-z0-9_]+)\s*\(?/g;
            let match;
            let lastMatchBeforeCursor: RegExpExecArray | null = null;

            while ((match = functionRegex.exec(text)) !== null) {
                const startPos = match.index;
                if (startPos <= cursorOffset) {
                    lastMatchBeforeCursor = match;
                } else {
                    break; // We've gone past the cursor
                }
            }

            if (lastMatchBeforeCursor) {
                return lastMatchBeforeCursor[2];
            }
        }

        return undefined;
    }

    /**
     * Extract the current class where cursor is positioned
     */
    private static extractCurrentClass(document: vscode.TextDocument, position: vscode.Position): string | undefined {
        // Simple extraction - would be more robust with language servers
        const text = document.getText();
        const langId = document.languageId;
        const cursorOffset = document.offsetAt(position);

        if (['javascript', 'typescript', 'javascriptreact', 'typescriptreact'].includes(langId)) {
            const classRegex = /\b(class)\s+([A-Za-z0-9_]+)/g;
            let match;
            let lastMatchBeforeCursor: RegExpExecArray | null = null;

            while ((match = classRegex.exec(text)) !== null) {
                const startPos = match.index;
                // Find end of class by matching braces
                let braceCount = 0;
                let endPos = startPos;
                let foundStartBrace = false;

                for (let i = startPos; i < text.length; i++) {
                    if (text[i] === '{') {
                        foundStartBrace = true;
                        braceCount++;
                    } else if (text[i] === '}') {
                        braceCount--;
                        if (braceCount === 0 && foundStartBrace) {
                            endPos = i + 1;
                            break;
                        }
                    }
                }

                if (startPos <= cursorOffset && cursorOffset <= endPos) {
                    lastMatchBeforeCursor = match;
                }
            }

            if (lastMatchBeforeCursor) {
                return lastMatchBeforeCursor[2];
            }
        } else if (langId === 'python') {
            const classRegex = /\b(class)\s+([A-Za-z0-9_]+)\s*(\([^)]*\))?:/g;
            let match;
            let lastMatchBeforeCursor: RegExpExecArray | null = null;

            while ((match = classRegex.exec(text)) !== null) {
                const startPos = match.index;
                if (startPos <= cursorOffset) {
                    lastMatchBeforeCursor = match;
                } else {
                    break; // We've gone past the cursor
                }
            }

            if (lastMatchBeforeCursor) {
                return lastMatchBeforeCursor[2];
            }
        }

        return undefined;
    }

    /**
     * Extract import statements from code
     */
    private static extractImports(text: string, languageId: string): string[] | undefined {
        const imports: string[] = [];

        if (['javascript', 'typescript', 'javascriptreact', 'typescriptreact'].includes(languageId)) {
            // Match ES6 imports
            const importRegex = /import\s+(?:{[^}]*}|[^{;]*)?\s*from\s+['"]([^'"]+)['"]/g;
            let match;

            while ((match = importRegex.exec(text)) !== null) {
                if (match[1]) {
                    imports.push(match[1]);
                }
            }

            // Match require statements
            const requireRegex = /(?:const|let|var)\s+(?:{[^}]*}|[^{;]*)?\s*=\s*require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
            while ((match = requireRegex.exec(text)) !== null) {
                if (match[1]) {
                    imports.push(match[1]);
                }
            }
        } else if (languageId === 'python') {
            // Match Python imports
            const importRegex = /(?:from\s+([^\s]+)\s+import|import\s+([^\s]+))/g;
            let match;

            while ((match = importRegex.exec(text)) !== null) {
                if (match[1]) {
                    imports.push(match[1]);
                }
                if (match[2]) {
                    imports.push(match[2]);
                }
            }
        }

        return imports.length > 0 ? imports : undefined;
    }

    /**
     * Determine what kind of syntax is at the cursor position
     */
    private static determineSyntaxType(fullText: string, lineText: string, languageId: string): string | undefined {
        for (const pattern of CODE_PATTERNS) {
            // Skip if language doesn't match
            if (pattern.language && !pattern.language.includes(languageId)) {
                continue;
            }

            if (pattern.pattern.test(lineText)) {
                return pattern.type;
            }
        }

        return undefined;
    }

    /**
     * Generate context-aware prompts based on editor context using AI
     */
    static async generateContextPrompts(context: EditorContext | null): Promise<ContextPrompt[]> {
        // If no context, return empty array
        if (!context) {
            cachedContext = null;
            cachedPrompts = [];
            return [];
        }

        // Check if we can use cache (within 5 seconds and no selection change)
        const now = Date.now();
        if (cachedContext &&
            this.areContextsSimilar(context, cachedContext) &&
            now - lastAnalysisTimestamp < 5000) {
            return cachedPrompts;
        }

        try {
            // Generate AI-powered context prompts
            const prompts = await this.generateAIPrompts(context);

            // Only update cache if we got valid results
            if (prompts && prompts.length > 0) {
                cachedContext = context;
                cachedPrompts = prompts;
                lastAnalysisTimestamp = now;
            }

            return prompts;
        } catch (error) {
            console.error('Error generating AI context prompts:', error);

            // Fallback to empty array on error
            return [];
        }
    }

    /**
     * Generate prompts using GitHub Models based on the current context
     */
    private static async generateAIPrompts(context: EditorContext): Promise<ContextPrompt[]> {
        try {
            const chatModel = await ModelManager.getChatModel({ 
                family: "gpt-4",
                retryCount: 3,
                timeout: 5000
            });

            if (!chatModel) {
                console.error('No GitHub models available after retries');
                return [];
            }

            // Construct a concise context object with only the necessary information
            const contextData = {
                language: context.languageId,
                selectedText: context.selectedText ?
                    (context.selectedText.length > 1000 ?
                        context.selectedText.substring(0, 1000) + "..." :
                        context.selectedText) :
                    "",
                currentLine: context.cursorLineText,
                filename: context.fileName,
                extension: context.fileExtension,
                function: context.currentFunction,
                class: context.currentClass,
                syntaxType: context.syntaxType,
                imports: context.imports,
                selectionRange: context.selectionRange,
                documentContext: context.documentText?.substring(0, 500) // First 500 chars for context
            };

            // Create the system message to instruct the model
            const systemMessage = vscode.LanguageModelChatMessage.Assistant(
                `You are an expert software developer and coding assistant. Generate detailed, practical prompts that developers would find genuinely useful.
                Focus on prompts that help with:
                1. Code improvement and best practices
                2. Performance optimization and scalability
                3. Security and error handling
                4. Testing and debugging strategies
                5. Documentation and maintainability
                6. Design patterns and architecture
                7. Refactoring suggestions
                8. Developer workflow optimization

                For each prompt:
                - Be specific and actionable
                - Consider the full development context
                - Include language-specific best practices
                - Reference relevant design patterns or principles
                - Consider both immediate and long-term code quality
                
                Format as parseable JSON:
                [
                  {
                    "title": "Brief descriptive title",
                    "text": "Detailed, specific prompt with clear objectives",
                    "confidence": 0-100,
                    "tags": ["relevant", "technical", "tags"],
                    "source": "source_type",
                    "category": "improvement|security|performance|etc"
                  }
                ]`
            );

            // Create the user message with the context
            const userMessage = vscode.LanguageModelChatMessage.User(
                `Generate practical developer prompts for this context:
                ${JSON.stringify(contextData, null, 2)}
                
                ${context.selectedText ? 
                    `Selected code:\n\`\`\`${context.languageId}\n${contextData.selectedText}\n\`\`\`` : 
                    `Current context:\n\`\`\`${context.languageId}\n${context.cursorLineText}\n\`\`\``}

                Consider:
                - Language: ${context.languageId}
                - Current scope: ${context.currentFunction || context.currentClass || 'global'}
                - Syntax type: ${context.syntaxType || 'general'}
                - File context: ${context.fileName || 'unknown'}
                
                Return only valid JSON with detailed, practical prompts.`
            );

            // Send the request with a timeout
            const messages = [systemMessage, userMessage];

            // Create a cancellation token source with a timeout
            const tokenSource = new vscode.CancellationTokenSource();
            setTimeout(() => tokenSource.cancel(), 15000); // 15-second timeout

            const response = await chatModel.sendRequest(messages, {}, tokenSource.token);

            // Parse the response to get prompts
            let responseText = '';
            for await (const chunk of response.text) {
                responseText += chunk;
            }

            // Extract JSON from response text (in case there's any extra text)
            const jsonMatch = responseText.match(/\[\s*\{[\s\S]*\}\s*\]/);
            if (!jsonMatch) {
                console.error('Could not extract JSON from response:', responseText);
                return [];
            }

            const jsonContent = jsonMatch[0];

            try {
                const promptsFromAI = JSON.parse(jsonContent) as ContextPrompt[];

                // Validate and ensure each prompt has the required properties
                const validPrompts = promptsFromAI.filter(p =>
                    typeof p.title === 'string' &&
                    typeof p.text === 'string' &&
                    typeof p.confidence === 'number'
                ).map(p => ({
                    ...p,
                    // Ensure confidence is within 0-100 range
                    confidence: Math.min(100, Math.max(0, p.confidence)),
                    // Add default source if missing
                    source: p.source || 'ai'
                }));

                return validPrompts;
            } catch (parseError) {
                console.error('Error parsing AI response:', parseError);
                console.error('Response text:', responseText);
                return [];
            }
        } catch (error) {
            console.error('Error generating prompts with AI:', error);
            if (error instanceof Error) {
                vscode.window.showErrorMessage(`Failed to generate prompts: ${error.message}`);
            }
            return [];
        }
    }

    /**
     * Check if two editor contexts are similar enough to use cached results
     */
    private static areContextsSimilar(context1: EditorContext, context2: EditorContext): boolean {
        // If selection status changed, contexts are not similar
        const hasSelection1 = context1.selectedText && context1.selectedText.trim() !== '';
        const hasSelection2 = context2.selectedText && context2.selectedText.trim() !== '';

        if (hasSelection1 !== hasSelection2) {
            return false;
        }

        // If both have selections, they must match exactly
        if (hasSelection1 && hasSelection2 && context1.selectedText !== context2.selectedText) {
            return false;
        }

        // If no selections, check if other context elements match
        return context1.languageId === context2.languageId &&
            context1.fileName === context2.fileName &&
            context1.currentFunction === context2.currentFunction &&
            context1.currentClass === context2.currentClass &&
            context1.cursorLineText === context2.cursorLineText;
    }

    /**
     * Clear all context-aware prompts 
     * Used when switching files or editors
     */
    static clearPrompts(): void {
        this.invalidateCache();
    }

    static async getCurrentContext(): Promise<string> {
        let context = '';

        // Get active editor content
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            const document = editor.document;
            context += `Current file (${document.languageId}): ${document.getText()}\n`;
        }

        // Get workspace context
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (workspaceFolders) {
            context += `Workspace: ${workspaceFolders[0].name}\n`;
        }

        return context || 'No context available';
    }

    static async analyzeContext(context: string): Promise<string[]> {
        // Basic analysis for now - extract file type and key terms
        const fileTypeMatch = context.match(/Current file \((.*?)\):/);
        const fileType = fileTypeMatch ? fileTypeMatch[1] : '';

        const suggestions = [
            `Write a function in ${fileType}`,
            `Debug this ${fileType} code`,
            `Optimize this ${fileType} code`,
            `Explain this ${fileType} code`,
            `Add documentation to this ${fileType} code`
        ];

        return suggestions;
    }
}
