/**
 * Provider Strategies - Minimal version
 * Only supports OpenAI and Claude strategies
 */

import { OpenAIStrategy } from './openai/openai-strategy.js';

export class ProviderStrategyFactory {
    static strategies = {
        'openai': new OpenAIStrategy(),
        'claude': new OpenAIStrategy() // Claude requests will be converted to OpenAI format
    };

    static getStrategy(provider) {
        const strategy = this.strategies[provider];
        if (!strategy) {
            console.warn(`[Strategy] No strategy for provider "${provider}", using OpenAI strategy as fallback`);
            return this.strategies['openai'];
        }
        return strategy;
    }
}
