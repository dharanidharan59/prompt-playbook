import * as vscode from 'vscode';

export class ModelManager {
    private static readonly MAX_RETRIES = 3;
    private static readonly INITIAL_TIMEOUT = 5000;
    private static readonly MAX_TIMEOUT = 15000;

    static async getChatModel(options: {
        family: string,
        retryCount?: number,
        timeout?: number
    }): Promise<vscode.LanguageModelChat | null> {
        const retryCount = options.retryCount ?? this.MAX_RETRIES;
        let timeout = options.timeout ?? this.INITIAL_TIMEOUT;

        for (let attempt = 0; attempt < retryCount; attempt++) {
            try {
                const modelSelectPromise = vscode.lm.selectChatModels({ family: options.family });
                const timeoutPromise = new Promise((_, reject) => {
                    setTimeout(() => reject(new Error(`Model selection timed out after ${timeout}ms`)), timeout);
                });

                const models = await Promise.race([modelSelectPromise, timeoutPromise]) as vscode.LanguageModelChat[];

                if (models && models.length > 0) {
                    return models[0];
                }
            } catch (error) {
                console.warn(`Attempt ${attempt + 1} failed:`, error);
                if (attempt === retryCount - 1) {
                    throw error;
                }
                // Exponential backoff
                timeout = Math.min(timeout * 2, this.MAX_TIMEOUT);
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
        return null;
    }
}
