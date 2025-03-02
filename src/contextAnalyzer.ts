import * as vscode from 'vscode';

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
                if (match[1]) imports.push(match[1]);
            }

            // Match require statements
            const requireRegex = /(?:const|let|var)\s+(?:{[^}]*}|[^{;]*)?\s*=\s*require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
            while ((match = requireRegex.exec(text)) !== null) {
                if (match[1]) imports.push(match[1]);
            }
        } else if (languageId === 'python') {
            // Match Python imports
            const importRegex = /(?:from\s+([^\s]+)\s+import|import\s+([^\s]+))/g;
            let match;

            while ((match = importRegex.exec(text)) !== null) {
                if (match[1]) imports.push(match[1]);
                if (match[2]) imports.push(match[2]);
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
     * Generate context-aware prompts based on editor context
     */
    static generateContextPrompts(context: EditorContext | null): ContextPrompt[] {
        // If no context, return empty array
        if (!context) {
            cachedContext = null;
            cachedPrompts = [];
            return [];
        }

        // Check if we can use cache (within 1 second and no selection change)
        const now = Date.now();
        if (cachedContext && 
            this.areContextsSimilar(context, cachedContext) &&
            now - lastAnalysisTimestamp < 1000) {
            return cachedPrompts;
        }

        // Always clear previous prompts when context changes significantly
        const prompts: ContextPrompt[] = [];

        // If there's selected text, prioritize selection-based prompts
        if (context.selectedText && context.selectedText.trim() !== '') {
            this.addSelectionBasedPrompts(prompts, context);
            
            // Add language-specific prompts for selection
            this.addLanguageSpecificPrompts(prompts, context);
        } 
        // Otherwise analyze the cursor position, file, and other context
        else {
            // Add syntax-based prompts for current line
            if (context.syntaxType) {
                this.addSyntaxBasedPrompts(prompts, context);
            }

            // Add line-based prompts for cursor position
            this.addLineBasedPrompts(prompts, context);
            
            // Add file-based prompts
            this.addFileBasedPrompts(prompts, context);
            
            // Add function/class-based prompts for current scope
            this.addFunctionClassPrompts(prompts, context);
            
            // Add language-specific prompts as fallback
            this.addLanguageSpecificPrompts(prompts, context);
        }

        // Sort by confidence score
        const sortedPrompts = prompts
            .sort((a, b) => b.confidence - a.confidence)
            // Ensure we have a reasonable number of prompts but not too many
            .slice(0, 15);

        // Update cache
        cachedContext = context;
        cachedPrompts = sortedPrompts;
        lastAnalysisTimestamp = now;

        return sortedPrompts;
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

    private static addSelectionBasedPrompts(prompts: ContextPrompt[], context: EditorContext) {
        const selection = context.selectedText;
        if (!selection || selection.trim() === '') return;

        const lang = context.languageId;
        const lineCount = selection.split('\n').length;

        // Add selection-specific prompts with higher confidence
        prompts.push({
            title: 'Explain Selected Code',
            text: `Explain what the following ${lang} code does in detail:\n\n\`\`\`${lang}\n${selection}\n\`\`\``,
            confidence: 98,
            source: 'selection'
        });

        prompts.push({
            title: 'Refactor Selected Code',
            text: `Refactor this ${lang} code to improve readability and maintainability:\n\n\`\`\`${lang}\n${selection}\n\`\`\``,
            confidence: 95,
            source: 'selection'
        });

        prompts.push({
            title: 'Optimize Selected Code',
            text: `Optimize this code for better performance while maintaining readability:\n\n\`\`\`${lang}\n${selection}\n\`\`\``,
            confidence: 92,
            source: 'selection'
        });

        // For multi-line selections, add test generation prompt
        if (lineCount > 1) {
            prompts.push({
                title: 'Generate Tests for Selection',
                text: `Write comprehensive unit tests for this ${lang} code:\n\n\`\`\`${lang}\n${selection}\n\`\`\``,
                confidence: 90,
                source: 'selection'
            });
        }

        // For larger blocks of code, suggest documentation
        if (selection.length > 100 || lineCount > 5) {
            prompts.push({
                title: 'Document Selected Code',
                text: `Add comprehensive documentation to this ${lang} code:\n\n\`\`\`${lang}\n${selection}\n\`\`\``,
                confidence: 88,
                source: 'selection'
            });
        }

        // Add a security review prompt for non-trivial selections
        if (selection.length > 50) {
            prompts.push({
                title: 'Security Review',
                text: `Review this code for security vulnerabilities and suggest improvements:\n\n\`\`\`${lang}\n${selection}\n\`\`\``,
                confidence: 85,
                source: 'selection'
            });
        }
    }

    private static addLanguageSpecificPrompts(prompts: ContextPrompt[], context: EditorContext) {
        const lang = context.languageId;
        const codeSnippet = context.selectedText || context.cursorLineText;

        // Add common prompts for all languages
        prompts.push({
            title: 'Explain This Code',
            text: `Explain what the following ${lang} code does in detail:\n\n\`\`\`${lang}\n${codeSnippet}\n\`\`\``,
            confidence: context.selectedText ? 95 : 80
        });
        
        prompts.push({
            title: 'Optimize This Code',
            text: `Optimize the following ${lang} code for better performance and readability:\n\n\`\`\`${lang}\n${codeSnippet}\n\`\`\``,
            confidence: 92
        });
        
        prompts.push({
            title: 'Find Bugs',
            text: `Review this ${lang} code for potential bugs, edge cases, or errors:\n\n\`\`\`${lang}\n${codeSnippet}\n\`\`\``,
            confidence: 89
        });

        // Language-specific prompts
        switch (lang) {
            case 'typescript':
            case 'javascript':
                prompts.push({
                    title: 'Add Types',
                    text: `Add TypeScript type definitions to this code:\n\n\`\`\`${lang}\n${codeSnippet}\n\`\`\``,
                    confidence: 88
                });
                
                prompts.push({
                    title: 'Improve Error Handling',
                    text: `Add proper error handling to this ${lang} code:\n\n\`\`\`${lang}\n${codeSnippet}\n\`\`\``,
                    confidence: 85
                });
                
                prompts.push({
                    title: 'Convert to Modern Syntax',
                    text: `Convert this code to use modern ${lang === 'typescript' ? 'TypeScript' : 'JavaScript'} features:\n\n\`\`\`${lang}\n${codeSnippet}\n\`\`\``,
                    confidence: 84
                });
                
                prompts.push({
                    title: 'Add Documentation',
                    text: `Add comprehensive JSDoc comments to this code:\n\n\`\`\`${lang}\n${codeSnippet}\n\`\`\``,
                    confidence: 82
                });
                
                prompts.push({
                    title: 'Test Cases',
                    text: `Generate unit tests for this ${lang} code using Jest:\n\n\`\`\`${lang}\n${codeSnippet}\n\`\`\``,
                    confidence: 80
                });
                
                prompts.push({
                    title: 'Functional Version',
                    text: `Rewrite this code using functional programming principles:\n\n\`\`\`${lang}\n${codeSnippet}\n\`\`\``,
                    confidence: 75
                });
                
                prompts.push({
                    title: 'Security Review',
                    text: `Review this code for security vulnerabilities and suggest improvements:\n\n\`\`\`${lang}\n${codeSnippet}\n\`\`\``,
                    confidence: 78
                });
                break;

            case 'python':
                prompts.push({
                    title: 'Add Type Hints',
                    text: `Add Python type hints to this code:\n\n\`\`\`python\n${codeSnippet}\n\`\`\``,
                    confidence: 90
                });
                
                prompts.push({
                    title: 'Convert to List Comprehension',
                    text: `Rewrite this code using list comprehensions where appropriate:\n\n\`\`\`python\n${codeSnippet}\n\`\`\``,
                    confidence: 86
                });
                
                prompts.push({
                    title: 'Add Docstrings',
                    text: `Add PEP-compliant docstrings to this Python code:\n\n\`\`\`python\n${codeSnippet}\n\`\`\``,
                    confidence: 85
                });
                
                prompts.push({
                    title: 'Test with Pytest',
                    text: `Create pytest test cases for this code:\n\n\`\`\`python\n${codeSnippet}\n\`\`\``,
                    confidence: 83
                });
                
                prompts.push({
                    title: 'Make More Pythonic',
                    text: `Rewrite this code to be more Pythonic following best practices:\n\n\`\`\`python\n${codeSnippet}\n\`\`\``,
                    confidence: 84
                });
                
                prompts.push({
                    title: 'Convert to OOP',
                    text: `Convert this code to use object-oriented programming principles:\n\n\`\`\`python\n${codeSnippet}\n\`\`\``,
                    confidence: 80
                });
                
                prompts.push({
                    title: 'Add Exception Handling',
                    text: `Add proper exception handling to this Python code:\n\n\`\`\`python\n${codeSnippet}\n\`\`\``,
                    confidence: 82
                });
                break;

            case 'html':
                prompts.push({
                    title: 'Improve Accessibility',
                    text: `Add accessibility attributes to improve this HTML:\n\n\`\`\`html\n${codeSnippet}\n\`\`\``,
                    confidence: 90
                });
                
                prompts.push({
                    title: 'Add Semantic Tags',
                    text: `Convert this HTML to use semantic HTML5 tags:\n\n\`\`\`html\n${codeSnippet}\n\`\`\``,
                    confidence: 88
                });
                
                prompts.push({
                    title: 'Add Microdata',
                    text: `Add schema.org microdata to this HTML for better SEO:\n\n\`\`\`html\n${codeSnippet}\n\`\`\``,
                    confidence: 83
                });
                
                prompts.push({
                    title: 'Add Form Validation',
                    text: `Add client-side form validation to this HTML form:\n\n\`\`\`html\n${codeSnippet}\n\`\`\``,
                    confidence: 85
                });
                
                prompts.push({
                    title: 'Convert to Responsive',
                    text: `Make this HTML responsive with appropriate meta tags and CSS classes:\n\n\`\`\`html\n${codeSnippet}\n\`\`\``,
                    confidence: 84
                });
                
                prompts.push({
                    title: 'Optimize for Performance',
                    text: `Optimize this HTML for better performance (defer scripts, preload, etc.):\n\n\`\`\`html\n${codeSnippet}\n\`\`\``,
                    confidence: 82
                });
                
                prompts.push({
                    title: 'Add Aria Roles',
                    text: `Add appropriate ARIA roles and attributes to this HTML:\n\n\`\`\`html\n${codeSnippet}\n\`\`\``,
                    confidence: 86
                });
                break;

            case 'css':
                prompts.push({
                    title: 'Optimize CSS',
                    text: `Optimize this CSS for performance and maintainability:\n\n\`\`\`css\n${codeSnippet}\n\`\`\``,
                    confidence: 88
                });
                
                prompts.push({
                    title: 'Convert to Flexbox',
                    text: `Convert this CSS to use Flexbox layout:\n\n\`\`\`css\n${codeSnippet}\n\`\`\``,
                    confidence: 85
                });
                
                prompts.push({
                    title: 'Convert to Grid',
                    text: `Convert this CSS to use CSS Grid layout:\n\n\`\`\`css\n${codeSnippet}\n\`\`\``,
                    confidence: 84
                });
                
                prompts.push({
                    title: 'Add Media Queries',
                    text: `Add media queries to make this CSS responsive:\n\n\`\`\`css\n${codeSnippet}\n\`\`\``,
                    confidence: 86
                });
                
                prompts.push({
                    title: 'Use CSS Variables',
                    text: `Refactor this CSS to use CSS custom properties (variables):\n\n\`\`\`css\n${codeSnippet}\n\`\`\``,
                    confidence: 82
                });
                
                prompts.push({
                    title: 'Add Dark Mode',
                    text: `Add dark mode support to this CSS using prefers-color-scheme:\n\n\`\`\`css\n${codeSnippet}\n\`\`\``,
                    confidence: 80
                });
                
                prompts.push({
                    title: 'Optimize Animations',
                    text: `Optimize CSS animations for performance and smoothness:\n\n\`\`\`css\n${codeSnippet}\n\`\`\``,
                    confidence: 78
                });
                break;

            default:
                // For other languages, add generic prompts
                prompts.push({
                    title: 'Documentation',
                    text: `Add comprehensive documentation to this ${lang} code:\n\n\`\`\`${lang}\n${codeSnippet}\n\`\`\``,
                    confidence: 85
                });
                
                prompts.push({
                    title: 'Best Practices',
                    text: `Rewrite this ${lang} code following best practices:\n\n\`\`\`${lang}\n${codeSnippet}\n\`\`\``,
                    confidence: 84
                });
                
                prompts.push({
                    title: 'Simplify Code',
                    text: `Simplify this ${lang} code to make it more readable and maintainable:\n\n\`\`\`${lang}\n${codeSnippet}\n\`\`\``,
                    confidence: 83
                });
                
                prompts.push({
                    title: 'Error Handling',
                    text: `Improve error handling in this code:\n\n\`\`\`${lang}\n${codeSnippet}\n\`\`\``,
                    confidence: 82
                });
                
                prompts.push({
                    title: 'Code Review',
                    text: `Perform a detailed code review and suggest improvements:\n\n\`\`\`${lang}\n${codeSnippet}\n\`\`\``,
                    confidence: 86
                });
                
                prompts.push({
                    title: 'Test Cases',
                    text: `Generate test cases for this code:\n\n\`\`\`${lang}\n${codeSnippet}\n\`\`\``,
                    confidence: 80
                });
                
                prompts.push({
                    title: 'Performance Analysis',
                    text: `Analyze the performance of this code and suggest optimizations:\n\n\`\`\`${lang}\n${codeSnippet}\n\`\`\``,
                    confidence: 81
                });
        }
    }

    private static addSyntaxBasedPrompts(prompts: ContextPrompt[], context: EditorContext) {
        // Add prompts based on detected syntax type
        switch (context.syntaxType) {
            case 'function_declaration':
                prompts.push({
                    title: 'Document Function',
                    text: `Write documentation for this function:\n\n\`\`\`${context.languageId}\n${context.cursorLineText}\n\`\`\``,
                    confidence: 90
                });
                break;
            case 'class_declaration':
                prompts.push({
                    title: 'Document Class',
                    text: `Write documentation for this class:\n\n\`\`\`${context.languageId}\n${context.cursorLineText}\n\`\`\``,
                    confidence: 85
                });
                break;
            case 'loop':
                prompts.push({
                    title: 'Optimize Loop',
                    text: `Optimize this loop for better performance:\n\n\`\`\`${context.languageId}\n${context.cursorLineText}\n\`\`\``,
                    confidence: 75
                });
                break;
            case 'conditional':
                prompts.push({
                    title: 'Simplify Conditional',
                    text: `Simplify this conditional statement:\n\n\`\`\`${context.languageId}\n${context.cursorLineText}\n\`\`\``,
                    confidence: 70
                });
                break;
            case 'api_endpoint':
                prompts.push({
                    title: 'Document API Endpoint',
                    text: `Write documentation for this API endpoint:\n\n\`\`\`${context.languageId}\n${context.cursorLineText}\n\`\`\``,
                    confidence: 95
                });
                break;
            case 'react_component':
                prompts.push({
                    title: 'Document React Component',
                    text: `Write documentation for this React component:\n\n\`\`\`${context.languageId}\n${context.cursorLineText}\n\`\`\``,
                    confidence: 90
                });
                break;
            case 'sql_query':
                prompts.push({
                    title: 'Optimize SQL Query',
                    text: `Optimize this SQL query for better performance:\n\n\`\`\`${context.languageId}\n${context.cursorLineText}\n\`\`\``,
                    confidence: 85
                });
                break;
            case 'error_handling':
                prompts.push({
                    title: 'Improve Error Handling',
                    text: `Improve error handling in this code:\n\n\`\`\`${context.languageId}\n${context.cursorLineText}\n\`\`\``,
                    confidence: 80
                });
                break;
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

    private static addFunctionClassPrompts(prompts: ContextPrompt[], context: EditorContext) {
        if (context.currentFunction) {
            prompts.push({
                title: 'Document Function',
                text: `Write detailed documentation for the function \`${context.currentFunction}\``,
                confidence: 75,
                tags: ['documentation', 'function']
            });
        }

        if (context.currentClass) {
            prompts.push({
                title: 'Improve Class Design',
                text: `Suggest improvements to the design of the class \`${context.currentClass}\``,
                confidence: 70,
                tags: ['design', 'class']
            });
        }
    }

    /**
     * Clear all context-aware prompts 
     * Used when switching files or editors
     */
    static clearPrompts(): void {
        this.invalidateCache();
    }
}
