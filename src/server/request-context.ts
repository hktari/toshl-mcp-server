import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Who an MCP request is running for, in multi-user (Sign in with Toshl) mode.
 *
 * The HTTP transport runs each `/mcp` request inside `runAsUser`; the Toshl API client reads
 * the user from here to pick that user's Toshl token and cache namespace. Tool and resource
 * handlers never see it, so they need no change.
 */
export interface RequestUser {
    /** Toshl user id, the `sub` of our access token. */
    userId: string;
    /** Returns a valid Toshl access token for this user, refreshing it when needed. */
    getAccessToken: () => Promise<string>;
}

const storage = new AsyncLocalStorage<RequestUser>();

/** Set once at start-up when the server serves many users; then a request without a user is refused. */
let multiUser = false;

export function enableMultiUserMode(): void {
    multiUser = true;
}

export function isMultiUserMode(): boolean {
    return multiUser;
}

/**
 * Runs `fn` with `user` as the current request's user
 * @param user The signed-in user
 * @param fn Work to run
 */
export function runAsUser<T>(user: RequestUser, fn: () => T): T {
    return storage.run(user, fn);
}

/** @returns The current request's user, or undefined outside a user context */
export function currentUser(): RequestUser | undefined {
    return storage.getStore();
}
