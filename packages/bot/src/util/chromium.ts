import { execSync } from "child_process";
import { existsSync } from "fs";
import { chromium } from "playwright";

/**
 * The browser isn't baked into the docker image, so whatever launches it has to
 * make sure it's there first. Shared by the bot and the fb-login helper — the
 * helper runs in its own container, which would otherwise have no browser at
 * all.
 *
 * Deliberately free of any project imports so it can be used from standalone
 * scripts without dragging in the Discord client.
 */
export const ensureChromiumInstalled = () => {
  try {
    const path = chromium.executablePath();
    if (!existsSync(path)) {
      console.log("Playwright Chromium not found, installing...");
      execSync("npx playwright install chromium", { stdio: "inherit" });
    }
  } catch {
    console.log("Installing Playwright Chromium...");
    execSync("npx playwright install chromium", { stdio: "inherit" });
  }
};
