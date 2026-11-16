import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { ApiError } from './types.js';
import logger from './logger.js';

/** Methods that can change the user's ledger, so a failure must never be reported as harmless. */
const isWriteMethod = (method: string | undefined): boolean =>
    ['post', 'put', 'patch', 'delete'].includes((method || '').toLowerCase());

/** Whether Toshl listed the offending input fields (see docs/api/errors.md). */
const namesFields = (details: any): boolean =>
    Array.isArray(details?.fields) && details.fields.length > 0;

/**
 * Maps Toshl API errors to MCP errors
 * @param error The error from the Toshl API
 * @returns An MCP error
 */
export function mapApiErrorToMcpError(error: ApiError): McpError {
    logger.debug('Mapping API error to MCP error', { error });

    // Toshl's error id is the stable part of the body; the description is localized
    const detail = error.id ? `${error.message} (id: ${error.id})` : error.message;

    // Map HTTP status codes to MCP error codes
    switch (error.status) {
        case 400: {
            // Toshl answers a write that references something it cannot find with a bare
            // "Data error." and no field list, which says nothing about what to change. The
            // usual cause is a name where an id belongs, so the message says where ids come from.
            const hint = isWriteMethod(error.method) && !namesFields(error.details)
                ? ' Toshl named no field. Check that account, category and tag values are ids from'
                    + ' account_list, category_list and tag_list rather than names.'
                : '';

            return new McpError(
                ErrorCode.InvalidParams,
                `Invalid request: ${detail}${hint}`
            );
        }
        case 401:
            return new McpError(
                ErrorCode.InvalidRequest,
                'Authentication failed. Please check your API token.'
            );
        case 403:
            return new McpError(
                ErrorCode.InvalidRequest,
                `Access denied: ${detail}`
            );
        case 404:
            return new McpError(
                ErrorCode.MethodNotFound,
                `Resource not found: ${detail}`
            );
        case 409:
            return new McpError(
                ErrorCode.InvalidRequest,
                `Conflict: ${detail}`,
                { status: 409 }
            );
        case 429:
            return new McpError(
                ErrorCode.InvalidRequest,
                error.retryAfterSeconds !== undefined
                    ? `Rate limit exceeded. Toshl asked for ${error.retryAfterSeconds} seconds before the next request.`
                    : 'Rate limit exceeded. Please try again later.'
            );
        case 500:
        case 502:
        case 503:
        case 504:
            return new McpError(
                ErrorCode.InternalError,
                `Toshl API server error: ${detail}`
            );
        default:
            return new McpError(
                ErrorCode.InternalError,
                `Unexpected error: ${detail}`
            );
    }
}

/**
 * Reads the human-readable text from a Toshl error body.
 *
 * Toshl puts it in `description`, and input errors add a `fields` list of
 * `{ field, error }` pairs (see docs/api/errors.md). `message` is kept as a fallback.
 *
 * @param data Error response body
 * @returns The message, or undefined when the body carries none
 */
const readToshlErrorMessage = (data: any): string | undefined => {
    const base = typeof data?.description === 'string'
        ? data.description
        : typeof data?.message === 'string' ? data.message : undefined;

    const fieldErrors = Array.isArray(data?.fields)
        ? data.fields
            .filter((f: any) => typeof f?.field === 'string' && typeof f?.error === 'string')
            .map((f: any) => `${f.field}: ${f.error}`)
        : [];

    if (fieldErrors.length === 0) {
        return base;
    }

    return [base, fieldErrors.join('; ')].filter(Boolean).join(' ');
};

/**
 * Reads the seconds in a Retry-After header. Toshl sends a count of seconds; an HTTP-date
 * is also legal there, and is ignored rather than reported as a nonsense number.
 * @param headers Response headers
 * @returns Seconds to wait, or undefined when the header is absent or a date
 */
const readRetryAfterSeconds = (headers: any): number | undefined => {
    const raw = headers?.['retry-after'] ?? headers?.['Retry-After'];
    if (raw === undefined || raw === null) {
        return undefined;
    }
    const seconds = Number(raw);
    return Number.isFinite(seconds) && seconds >= 0 ? seconds : undefined;
};

/**
 * Handles errors from the Toshl API
 * @param error The error to handle
 * @param context How the request was sent: how many attempts it got
 * @throws McpError
 */
export function handleApiError(error: any, context: { attempts?: number } = {}): never {
    logger.error('API error occurred', { error });

    const method: string | undefined = error.config?.method;

    // If it's an axios error with a response
    if (error.response) {
        const apiError: ApiError = {
            status: error.response.status,
            message: readToshlErrorMessage(error.response.data) || error.message,
            id: typeof error.response.data?.id === 'string' ? error.response.data.id : undefined,
            details: error.response.data,
            method,
            retryAfterSeconds: readRetryAfterSeconds(error.response.headers)
        };

        throw mapApiErrorToMcpError(apiError);
    }

    // If it's a network error. Toshl sent no answer, so a read changed nothing and can be sent
    // again, while a write may have been applied before the client gave up — repeating one
    // would duplicate it, so the caller is told to check instead.
    if (error.request) {
        const attempts = context.attempts && context.attempts > 1
            ? ` (${context.attempts} attempts)`
            : '';
        const consequence = isWriteMethod(method)
            ? ` Toshl sent no answer, so the ${(method as string).toUpperCase()} may still have been applied —`
                + ' check before sending it again.'
            : ' Toshl sent no answer, so nothing changed; the request can be retried.';

        throw new McpError(
            ErrorCode.ConnectionClosed,
            `Network error: ${error.message}${attempts}.${consequence}`
        );
    }

    // For any other type of error
    throw new McpError(
        ErrorCode.InternalError,
        `Unexpected error: ${error.message}`
    );
}
