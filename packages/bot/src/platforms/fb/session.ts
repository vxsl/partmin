import { getDirs } from "constants.js";
import { existsSync, readFileSync, statSync, writeFileSync } from "fs";
import type { BrowserContext, Cookie } from "playwright";
import { debugLog, log, verboseLog } from "util/log.js";

// Facebook enforces a captcha on login, so the bot must log in as rarely as
// possible. Rather than starting from a blank browser profile on every run, the
// session is persisted to the common data directory (which is volume-mounted in
// docker) and loaded back into the browser context on startup.

export const fbSessionPath = () => `${getDirs().commonData}/fb-session.json`;

export const fbSessionExists = () => existsSync(fbSessionPath());

// c_user holds the logged-in account's ID. Its absence means the state is
// anonymous, and saving it would clobber a good session with a useless one.
const loggedInCookieName = "c_user";

const fbDomains = ["facebook.com", "fb.com", "messenger.com"];
const isFbDomain = (domain: string) => {
  const d = domain.replace(/^\./, "").toLowerCase();
  return fbDomains.some((f) => d === f || d.endsWith(`.${f}`));
};

const writeThrottleMs = 15 * 60 * 1000;
let lastWriteAt: number | undefined;

/**
 * Persist the Facebook-owned portion of the browser context's storage state.
 * Other platforms' cookies are deliberately excluded so the file stays a
 * portable, inspectable representation of the Facebook session alone.
 */
export const saveFbSession = async (
  context: BrowserContext,
  options?: { force?: boolean }
) => {
  const now = Date.now();
  if (
    !options?.force &&
    lastWriteAt !== undefined &&
    now - lastWriteAt < writeThrottleMs
  ) {
    return false;
  }

  const state = await context.storageState();
  const cookies = state.cookies.filter((c) => isFbDomain(c.domain));

  if (!cookies.some((c) => c.name === loggedInCookieName)) {
    verboseLog(
      "Not saving Facebook session state: the browser isn't logged in."
    );
    return false;
  }

  const origins = state.origins.filter((o) => {
    try {
      return isFbDomain(new URL(o.origin).hostname);
    } catch {
      return false;
    }
  });

  writeFileSync(fbSessionPath(), JSON.stringify({ cookies, origins }, null, 2));
  lastWriteAt = now;
  debugLog(`Saved Facebook session state to ${fbSessionPath()}`);
  return true;
};

// The mtime of the session file that has already been pushed into the live
// browser context, so a file that hasn't changed isn't re-applied every pass.
let appliedMtimeMs: number | undefined;

/**
 * Push a session written by something else (the fb-login helper) into the
 * already-running browser context.
 *
 * storageState is only read when a context is created, so without this the bot
 * would need a restart to notice a newly-completed login. Only the cookies are
 * applied: Facebook's auth lives in cookies (c_user/xs/datr), not localStorage.
 *
 * Returns true only when a *new* session was applied.
 */
export const applyFbSessionToContext = async (context: BrowserContext) => {
  const path = fbSessionPath();
  if (!existsSync(path)) {
    return false;
  }

  let mtimeMs: number;
  try {
    mtimeMs = statSync(path).mtimeMs;
  } catch {
    return false;
  }
  if (appliedMtimeMs === mtimeMs) {
    return false;
  }

  let cookies: Cookie[];
  try {
    const parsed = JSON.parse(readFileSync(path, "utf-8"));
    cookies = parsed?.cookies;
    if (!Array.isArray(cookies) || !cookies.length) {
      throw new Error("no cookies in session file");
    }
  } catch (e) {
    log(`Ignoring unusable Facebook session file at ${path}: ${e}`);
    appliedMtimeMs = mtimeMs;
    return false;
  }

  if (!cookies.some((c) => c.name === loggedInCookieName)) {
    verboseLog("The Facebook session file on disk isn't logged in.");
    appliedMtimeMs = mtimeMs;
    return false;
  }

  await context.addCookies(cookies);
  appliedMtimeMs = mtimeMs;
  log(`Applied the Facebook session from ${path} to the running browser.`);
  return true;
};

/**
 * The storageState path to hand to browser.newContext(), or undefined if
 * there's no usable session on disk.
 */
export const fbSessionStorageStatePath = () => {
  const path = fbSessionPath();
  if (!existsSync(path)) {
    debugLog(`No Facebook session found at ${path}.`);
    return undefined;
  }
  // Record it as applied: the context is about to be built from this exact
  // file, so there's nothing for applyFbSessionToContext to add.
  try {
    appliedMtimeMs = statSync(path).mtimeMs;
  } catch {
    // non-fatal; the worst case is applying the same cookies once more
  }
  debugLog(`Loading Facebook session from ${path}.`);
  return path;
};
