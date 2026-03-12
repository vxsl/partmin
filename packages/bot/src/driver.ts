import { devOptions } from "advanced-config.js";
import { execSync } from "child_process";
import { existsSync } from "fs";
import { chromium, type Page } from "playwright";
import { log } from "util/log.js";

const ensureChromiumInstalled = () => {
  try {
    const path = chromium.executablePath();
    if (!existsSync(path)) {
      log("Playwright Chromium not found, installing...");
      execSync("npx playwright install chromium", { stdio: "inherit" });
    }
  } catch {
    log("Installing Playwright Chromium...");
    execSync("npx playwright install chromium", { stdio: "inherit" });
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

  const page = await browser.newPage();
  if (!devOptions?.headed) {
    await page.setViewportSize({ width: 1920, height: 1080 });
  }

  log("Browser ready");
  return page;
};
