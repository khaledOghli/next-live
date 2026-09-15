import { LiveSandboxError } from '../../core/errors';
import type { LiveSandboxConfig, SandboxPermission } from '../../core/types';

const ALLOWED_PERMISSIONS = new Set<string>([
  'allow-forms',
  'allow-modals',
  'allow-popups',
  'allow-popups-to-escape-sandbox',
  'allow-pointer-lock',
  'allow-downloads',
] satisfies SandboxPermission[]);

/** Powerful features a snippet has no reason to reach from inside a preview. */
export const DEFAULT_ALLOW =
  "camera 'none'; microphone 'none'; geolocation 'none'; usb 'none'; payment 'none'; " +
  "clipboard-read 'none'; display-capture 'none'; serial 'none'; hid 'none'";

export interface FrameAttributes {
  src: string;
  sandbox: string;
  allow: string;
  referrerPolicy: 'no-referrer';
  credentialless: boolean;
  /**
   * The origin messages from the frame must come from: the string `'null'`
   * for an opaque (sandboxed) frame, or the real origin of `src`.
   */
  expectedOrigin: string;
}

/**
 * Turns a sandbox config into the exact iframe attributes to render, refusing
 * the combinations that would quietly remove the isolation.
 *
 * Throws `LiveSandboxError` with reason `invalid-config` or
 * `same-origin-refused`.
 */
export function resolveFrameAttributes(
  config: LiveSandboxConfig,
  host: { href: string; origin: string },
  supportsCredentialless: boolean,
): FrameAttributes {
  let url: URL;
  try {
    url = new URL(config.src, host.href);
  } catch {
    throw new LiveSandboxError('invalid-config', `sandbox.src '${config.src}' is not a valid URL.`);
  }

  // `javascript:`, `data:` and `blob:` frames either run in the host's origin
  // or cannot load the runtime at all; only a real page makes sense here.
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new LiveSandboxError(
      'invalid-config',
      `sandbox.src must be an http(s) URL of a page that calls mountSandbox; got '${url.protocol}'.`,
    );
  }

  const tokens = ['allow-scripts'];
  for (const permission of config.permissions ?? []) {
    if (!ALLOWED_PERMISSIONS.has(permission)) {
      throw new LiveSandboxError(
        'invalid-config',
        `'${String(permission)}' is not an allowed sandbox permission. Allowed: ${[...ALLOWED_PERMISSIONS].join(', ')}.`,
      );
    }
    if (!tokens.includes(permission)) tokens.push(permission);
  }

  if (config.allowSameOrigin) {
    // allow-scripts plus allow-same-origin on a page from the host's own
    // origin can reach up into the parent and remove its own sandbox
    // attribute. There is no configuration in which that is intended.
    if (url.origin === host.origin) {
      throw new LiveSandboxError(
        'same-origin-refused',
        `sandbox.allowSameOrigin is refused because sandbox.src (${url.origin}) has the same origin as this page. ` +
          'Serve the sandbox from a different origin (for example sandbox.example.com), or leave allowSameOrigin off.',
      );
    }
    tokens.push('allow-same-origin');
  }

  return {
    src: url.href,
    sandbox: tokens.join(' '),
    allow: config.allow ?? DEFAULT_ALLOW,
    referrerPolicy: 'no-referrer',
    credentialless: (config.credentialless ?? true) && supportsCredentialless,
    expectedOrigin: config.allowSameOrigin ? url.origin : 'null',
  };
}
