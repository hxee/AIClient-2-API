/**
 * OpenAI Responses API - Stub implementation
 * These functions are imported by ClaudeConverter but not used in minimal version
 */

export function generateResponseCreated(responseId, model) {
    return {
        type: 'response.created',
        response: { id: responseId, model }
    };
}

export function generateResponseInProgress(responseId) {
    return {
        type: 'response.in_progress',
        response: { id: responseId }
    };
}

export function generateOutputItemAdded(responseId) {
    return {
        type: 'output_item.added',
        response: { id: responseId }
    };
}

export function generateContentPartAdded(responseId) {
    return {
        type: 'content_part.added',
        response: { id: responseId }
    };
}

export function generateOutputTextDelta(responseId, delta) {
    return {
        type: 'output_text.delta',
        response: { id: responseId },
        delta
    };
}

export function generateOutputTextDone(responseId) {
    return {
        type: 'output_text.done',
        response: { id: responseId }
    };
}

export function generateContentPartDone(responseId) {
    return {
        type: 'content_part.done',
        response: { id: responseId }
    };
}

export function generateOutputItemDone(responseId) {
    return {
        type: 'output_item.done',
        response: { id: responseId }
    };
}

export function generateResponseCompleted(responseId) {
    return {
        type: 'response.completed',
        response: { id: responseId }
    };
}
