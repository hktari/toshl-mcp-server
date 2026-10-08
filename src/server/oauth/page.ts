import { ServerResponse } from 'node:http';
import { randomToken } from './crypto.js';

/**
 * HTML for the sign-in page. It is self-contained: no scripts, no external assets, one
 * inline stylesheet allowed by a per-response nonce.
 */

/**
 * Escapes text for HTML element content and attribute values
 * @param value Text
 * @returns Escaped text
 */
function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

const STYLE = `
body { font: 16px/1.5 system-ui, sans-serif; background: #f4f4f5; color: #18181b; margin: 0; }
main { max-width: 26rem; margin: 10vh auto; padding: 2rem; background: #fff; border-radius: 12px;
       box-shadow: 0 1px 3px rgba(0,0,0,.12); }
h1 { font-size: 1.25rem; margin: 0 0 1rem; }
p { margin: 0 0 1rem; }
.warn { background: #fef3c7; border-radius: 8px; padding: .75rem; }
.error { background: #fee2e2; border-radius: 8px; padding: .75rem; }
label { display: block; font-weight: 600; margin-bottom: .25rem; }
input[type=password] { box-sizing: border-box; width: 100%; padding: .6rem; font-size: 1rem;
       border: 1px solid #a1a1aa; border-radius: 8px; margin-bottom: 1rem; }
/* Approve comes first in the markup so Enter submits it; this puts Cancel on the left. */
.actions { display: flex; flex-direction: row-reverse; gap: .5rem; }
button { flex: 1; padding: .6rem; font-size: 1rem; border-radius: 8px; border: 1px solid #a1a1aa;
       background: #fff; cursor: pointer; }
button.primary { background: #18181b; color: #fff; border-color: #18181b; }
@media (prefers-color-scheme: dark) {
  body { background: #18181b; color: #f4f4f5; }
  main { background: #27272a; }
  .warn { background: #422006; } .error { background: #450a0a; }
  input[type=password], button { background: #18181b; color: #f4f4f5; border-color: #52525b; }
  button.primary { background: #f4f4f5; color: #18181b; }
}`;

/**
 * Writes an HTML page with the security headers every OAuth page gets
 * @param res HTTP response
 * @param status HTTP status
 * @param title Page title
 * @param body Inner HTML, already escaped
 * @param formAction Origins the page's form may submit to and be redirected to, besides itself
 * @param nonce Style nonce used in the body
 */
function sendPage(
    res: ServerResponse,
    status: number,
    title: string,
    body: string,
    formAction: string[],
    nonce: string
) {
    // form-action also governs the redirect that follows the POST, so the client's
    // callback origin has to be listed or browsers block the hand-back.
    const csp = [
        "default-src 'none'",
        `style-src 'nonce-${nonce}'`,
        `form-action 'self'${formAction.map((origin) => ` ${origin}`).join('')}`,
        "frame-ancestors 'none'",
        "base-uri 'none'",
    ].join('; ');

    res.writeHead(status, {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Security-Policy': csp,
        'Cache-Control': 'no-store',
        'X-Frame-Options': 'DENY',
        'X-Content-Type-Options': 'nosniff',
        // Not no-referrer: under that policy browsers send `Origin: null` on the form POST,
        // which the server's same-origin check would refuse. same-origin still sends
        // nothing to other sites.
        'Referrer-Policy': 'same-origin',
    });
    res.end(`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${escapeHtml(title)}</title>
<style nonce="${nonce}">${STYLE}</style>
</head>
<body><main>${body}</main></body>
</html>`);
}

export interface SignInPageOptions {
    clientName: string;
    /** Where the browser is sent afterwards; its host is shown, as the MCP spec requires. */
    redirectUri: string;
    /** Loopback clients get an extra warning that the code goes to a program on this device. */
    loopback: boolean;
    /** Signed, expiring copy of the validated authorization request. */
    formToken: string;
    error?: string;
    /** Disables the form while sign-in is locked out. */
    retryAfterSeconds?: number;
}

/**
 * Writes the passphrase page
 * @param res HTTP response
 * @param status HTTP status
 * @param options Page content
 */
export function sendSignInPage(res: ServerResponse, status: number, options: SignInPageOptions) {
    const nonce = randomToken(16);
    const redirect = new URL(options.redirectUri);
    const locked = (options.retryAfterSeconds ?? 0) > 0;

    const parts = [
        '<h1>Connect to Toshl</h1>',
        `<p><strong>${escapeHtml(options.clientName)}</strong> is asking for full read and write access to ` +
            'your Toshl Finance data: accounts, entries, categories, tags and budgets.</p>',
        `<p>After you approve, you return to <strong>${escapeHtml(redirect.host)}</strong>.</p>`,
    ];
    if (options.loopback) {
        parts.push(
            '<p class="warn">This hands access to a program running on the device you are using now. ' +
                'Only continue if you started this sign-in yourself, from Claude Code.</p>'
        );
    }
    if (locked) {
        parts.push(
            `<p class="error">Too many wrong passphrases. Sign-in is paused for ` +
                `${Math.ceil((options.retryAfterSeconds as number) / 60)} more minute(s).</p>`
        );
    } else if (options.error) {
        parts.push(`<p class="error">${escapeHtml(options.error)}</p>`);
    }

    parts.push(`<form method="post" action="/oauth/authorize">
<input type="hidden" name="request" value="${escapeHtml(options.formToken)}">
<label for="passphrase">Server passphrase</label>
<input type="password" id="passphrase" name="passphrase" autocomplete="current-password" required${locked ? ' disabled' : ' autofocus'}>
<div class="actions">
<button type="submit" name="action" value="approve" class="primary"${locked ? ' disabled' : ''}>Approve</button>
<button type="submit" name="action" value="deny" formnovalidate>Cancel</button>
</div>
</form>`);

    sendPage(res, status, 'Connect to Toshl', parts.join('\n'), [redirect.origin], nonce);
}

/**
 * Writes an error page for requests that must not be redirected back to the client,
 * such as an unknown client or an unregistered redirect URI
 * @param res HTTP response
 * @param status HTTP status
 * @param message What went wrong, in plain words
 */
export function sendErrorPage(res: ServerResponse, status: number, message: string) {
    const nonce = randomToken(16);
    sendPage(
        res,
        status,
        'Sign-in error',
        `<h1>Sign-in error</h1>\n<p class="error">${escapeHtml(message)}</p>\n<p>Start the connection again from Claude.</p>`,
        [],
        nonce
    );
}
