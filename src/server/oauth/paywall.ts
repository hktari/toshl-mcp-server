import { mkdir, open, readFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import axios from 'axios';
import logger from '../../utils/logger.js';

/**
 * A one-time payment before a user's first connection, through a Stripe Payment Link.
 *
 * The link is opened with the user's Toshl e-mail prefilled and their Toshl user id as
 * `client_reference_id`, so a completed, paid Checkout Session for the link can be matched
 * to the account either way. Paid users are remembered in `<stateDir>/paid-users.json`, so
 * Stripe is asked once per user, not on every connection.
 *
 * Stripe API: GET /v1/checkout/sessions, filtered by `payment_link` and `status=complete`
 * (and by `customer_details[email]` for the quick lookup). A restricted key with read access to
 * Checkout Sessions is enough.
 */

export interface PaywallConfig {
    /** Stripe secret or restricted key. Never logged. */
    stripeKey: string;
    /** The Payment Link users pay at, e.g. https://buy.stripe.com/... */
    paymentLinkUrl: string;
    /** Its id (plink_...), to find the sessions it created. */
    paymentLinkId: string;
    /** Toshl user ids that connect without paying (the owner, testers). */
    freeUserIds: string[];
    /** Override for tests against a fake Stripe. */
    stripeApiBase?: string;
}

/** How many pages of sessions (100 each) the client_reference_id fallback scans. */
const MAX_SCAN_PAGES = 10;

interface CheckoutSession {
    id: string;
    payment_status?: string;
    client_reference_id?: string | null;
    customer_details?: { email?: string | null } | null;
}

const STORE_FILE = 'paid-users.json';

export class Paywall {
    private writeChain: Promise<void> = Promise.resolve();

    private constructor(
        private readonly config: PaywallConfig,
        private readonly file: string,
        private readonly paid: Set<string>
    ) {}

    static async open(config: PaywallConfig, stateDir: string): Promise<Paywall> {
        await mkdir(stateDir, { recursive: true, mode: 0o700 });
        const file = join(stateDir, STORE_FILE);
        let users: string[] = [];
        try {
            const parsed = JSON.parse(await readFile(file, 'utf8')) as { version?: number; users?: unknown };
            if (parsed.version !== 1 || !Array.isArray(parsed.users) || !parsed.users.every((u) => typeof u === 'string')) {
                throw new Error(`Paid-users store ${file} has an unknown format`);
            }
            users = parsed.users as string[];
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
                throw error instanceof Error && error.message.includes('unknown format')
                    ? error
                    : new Error(`Paid-users store ${file} is unreadable`);
            }
        }
        logger.info('Paywall on', { paidUsers: users.length, freeUsers: config.freeUserIds.length });
        return new Paywall(config, file, new Set(users));
    }

    /**
     * Where to send this user to pay
     * @param userId Toshl user id, sent as client_reference_id
     * @param email Toshl e-mail, prefilled (the user can still change it)
     */
    checkoutUrl(userId: string, email: string | undefined): string {
        const url = new URL(this.config.paymentLinkUrl);
        url.searchParams.set('client_reference_id', clientReference(userId));
        if (email) {
            url.searchParams.set('prefilled_email', email);
        }
        return url.toString();
    }

    /**
     * Whether the user may connect: free, already known to have paid, or Stripe shows a paid
     * session for the link. A Stripe failure counts as not paid (fails closed) and is logged.
     */
    async hasPaid(userId: string, email: string | undefined): Promise<boolean> {
        if (this.config.freeUserIds.includes(userId) || this.paid.has(userId)) {
            return true;
        }
        try {
            const found = await this.findPaidSession(userId, email);
            if (!found) {
                return false;
            }
            this.paid.add(userId);
            await this.persist();
            logger.info('Payment found for a user', { paidUsers: this.paid.size });
            return true;
        } catch (error) {
            logger.error('Stripe lookup failed', { message: error instanceof Error ? error.message : String(error) });
            return false;
        }
    }

    private async findPaidSession(userId: string, email: string | undefined): Promise<boolean> {
        const reference = clientReference(userId);
        const matches = (s: CheckoutSession) =>
            s.payment_status === 'paid' &&
            (s.client_reference_id === reference ||
                (email !== undefined && s.customer_details?.email?.toLowerCase() === email.toLowerCase()));

        if (email) {
            const byEmail = await this.listSessions({ 'customer_details[email]': email });
            if (byEmail.data.some(matches)) {
                return true;
            }
        }
        // The buyer may have typed another e-mail at checkout; the reference still matches.
        let startingAfter: string | undefined;
        for (let page = 0; page < MAX_SCAN_PAGES; page++) {
            const result = await this.listSessions(startingAfter ? { starting_after: startingAfter } : {});
            if (result.data.some(matches)) {
                return true;
            }
            if (!result.has_more || result.data.length === 0) {
                return false;
            }
            startingAfter = result.data[result.data.length - 1].id;
        }
        return false;
    }

    private async listSessions(extra: Record<string, string>): Promise<{ data: CheckoutSession[]; has_more: boolean }> {
        try {
            const response = await axios.get(`${this.config.stripeApiBase ?? 'https://api.stripe.com'}/v1/checkout/sessions`, {
                params: { payment_link: this.config.paymentLinkId, status: 'complete', limit: 100, ...extra },
                headers: { Authorization: `Bearer ${this.config.stripeKey}` },
                timeout: 10000,
            });
            return response.data as { data: CheckoutSession[]; has_more: boolean };
        } catch (error) {
            // Status only: the request carries the key.
            throw new Error(`Stripe request failed (${axios.isAxiosError(error) ? (error.response?.status ?? 'no response') : 'error'})`);
        }
    }

    private persist(): Promise<void> {
        const snapshot = JSON.stringify({ version: 1, users: [...this.paid] });
        const write = async () => {
            const temp = `${this.file}.tmp`;
            const handle = await open(temp, 'w', 0o600);
            try {
                await handle.writeFile(snapshot);
                await handle.sync();
            } finally {
                await handle.close();
            }
            await rename(temp, this.file);
        };
        this.writeChain = this.writeChain.then(write, write);
        return this.writeChain;
    }
}

/** Stripe allows letters, digits, dashes and underscores in client_reference_id (max 200). */
function clientReference(userId: string): string {
    return `toshl_${userId.replace(/[^A-Za-z0-9_-]/g, '_')}`.slice(0, 200);
}
