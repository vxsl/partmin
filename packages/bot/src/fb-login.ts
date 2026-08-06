import { defineAdvancedConfig } from "advanced-config.js";
import { getDirs } from "constants.js";
import { existsSync, mkdirSync, writeFileSync } from "fs";
import { chromium } from "playwright";
import { ensureChromiumInstalled } from "util/chromium.js";

/**
 * Interactive Facebook login helper.
 *
 * Facebook enforces a captcha on login, and the bot can't solve it. This script
 * opens a real, headed browser and waits for a human to complete the login,
 * then writes the resulting session to disk for the bot to reuse.
 *
 * On a headless server it's run inside the `fb-login` docker compose service,
 * which exposes the browser over noVNC — see the README. It deliberately uses
 * its own browser profile rather than sharing one with the bot: Chromium locks
 * a profile directory, so a shared profile would mean stopping the bot to log
 * in (and would risk corrupting it).
 */

const successCookie = "c_user";
const timeoutMs = 20 * 60 * 1000;
const pollIntervalMs = 2000;

const stamp = () => new Date().toLocaleTimeString("it-IT");
const say = (msg: string) => console.log(`${stamp()}: ${msg}`);

const fbDomains = ["facebook.com", "fb.com", "messenger.com"];
const isFbDomain = (domain: string) => {
  const d = domain.replace(/^\./, "").toLowerCase();
  return fbDomains.some((f) => d === f || d.endsWith(`.${f}`));
};

const main = async () => {
  // Resolve the data directory exactly as the bot does, so the session lands
  // where the bot will look for it (this honours --development.testing):
  await defineAdvancedConfig();

  // This runs in its own container, which has no browser until we install one:
  ensureChromiumInstalled();

  const dirs = getDirs();
  const profileDir = `${dirs.commonData}/fb-login-profile`;
  const sessionPath = `${dirs.commonData}/fb-session.json`;
  if (!existsSync(profileDir)) {
    mkdirSync(profileDir, { recursive: true });
  }

  const args = ["--disable-gpu", "--disable-notifications"];
  if (process.env.FB_LOGIN_NO_SANDBOX === "true") {
    args.push("--no-sandbox");
  }

  say(`Launching a browser with profile ${profileDir}`);
  const context = await chromium.launchPersistentContext(profileDir, {
    headless: false,
    viewport: { width: 1600, height: 900 },
    args,
  });

  try {
    const page = context.pages()[0] ?? (await context.newPage());
    await page.goto("https://www.facebook.com/login");

    // Fill the credentials if they're configured, so the human only has to deal
    // with whatever challenge Facebook raises:
    const USER = process.env.FB_USER;
    const PASS = process.env.FB_PASS;
    if (USER && PASS) {
      const email = page.locator('[name="email"]');
      if (await email.count()) {
        say("Pre-filling the configured credentials.");
        await email.fill(USER);
        await page.locator('[name="pass"]').fill(PASS);
        await page
          .locator('[name="login"], [aria-label="Log In"]')
          .first()
          .click()
          .catch(() => {});
      }
    } else {
      say("No FB_USER/FB_PASS configured — log in manually in the browser.");
    }

    console.log(
      "\n" +
        [
          "Waiting for a logged-in Facebook session.",
          "Complete the login in the browser (including any captcha or 2FA).",
          "If you're running this on a server, connect to the browser first:",
          "",
          "  ssh -L 6080:localhost:6080 <your-server>",
          "  open http://localhost:6080/vnc.html?autoconnect=1&resize=scale",
          "",
          `Giving up in ${Math.round(timeoutMs / 60000)} minutes.`,
        ].join("\n") +
        "\n"
    );

    const deadline = Date.now() + timeoutMs;
    let loggedIn = false;
    while (Date.now() < deadline) {
      const cookies = await context.cookies("https://www.facebook.com");
      if (cookies.some((c) => c.name === successCookie && !!c.value)) {
        loggedIn = true;
        break;
      }
      await new Promise((r) => setTimeout(r, pollIntervalMs));
    }

    if (!loggedIn) {
      say("Timed out without a logged-in session. Nothing was written.");
      return 1;
    }

    say("Logged in. Saving the session...");
    const state = await context.storageState();
    const cookies = state.cookies.filter((c) => isFbDomain(c.domain));
    const origins = state.origins.filter((o) => {
      try {
        return isFbDomain(new URL(o.origin).hostname);
      } catch {
        return false;
      }
    });
    writeFileSync(sessionPath, JSON.stringify({ cookies, origins }, null, 2));

    say(`Wrote ${cookies.length} cookies to ${sessionPath}`);
    say("partmin will pick this up on its next Marketplace pass.");
    return 0;
  } finally {
    await context.close().catch(() => {});
  }
};

main()
  .then((code) => process.exit(code))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
