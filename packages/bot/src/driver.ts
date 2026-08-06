import { devOptions } from "advanced-config.js";
import { fbSessionStorageStatePath } from "platforms/fb/session.js";
import { chromium, type Browser, type Page } from "playwright";
import { ensureChromiumInstalled } from "util/chromium.js";
import { log } from "util/log.js";

/**
 * Restore the persisted Facebook session so the bot doesn't have to log in
 * (and face a captcha) on every start. A malformed session file shouldn't be
 * fatal — fall back to a blank context and let the platform ask for a new
 * login.
 */
const buildContext = async (browser: Browser) => {
  const storageState = fbSessionStorageStatePath();
  if (!storageState) {
    return await browser.newContext();
  }
  try {
    const context = await browser.newContext({ storageState });
    log("Restored the persisted Facebook session.");
    return context;
  } catch (e) {
    log(`Couldn't restore the persisted Facebook session: ${e}`);
    return await browser.newContext();
  }
};

export const buildDriver = async (): Promise<Page> => {
  ensureChromiumInstalled();

  const args: string[] = [
    "--disable-gpu",
    "--disable-software-rasterizer",
    "--disable-notifications",
  ];
  if (devOptions?.noSandbox) {
    args.push("--no-sandbox");
  }

  log(`launching Chrome with args: ${args.join(" ")}`);

  const browser = await chromium.launch({
    headless: !devOptions?.headed,
    args,
  });

  const context = await buildContext(browser);

  const page = await context.newPage();
  if (!devOptions?.headed) {
    await page.setViewportSize({ width: 1920, height: 1080 });
  }

  log("Browser ready");
  return page;
};
