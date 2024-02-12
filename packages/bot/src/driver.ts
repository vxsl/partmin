import { Browser, getInstalledBrowsers, install } from "@puppeteer/browsers";
import { configDevelopment } from "config.js";
import {
  chromeVersion,
  puppeteerCacheDir,
  seleniumImplicitWait,
} from "constants.js";
import { Builder } from "selenium-webdriver";
import chrome from "selenium-webdriver/chrome.js";
import { stdout as singleLineStdOut } from "single-line-log";
import { log } from "util/log.js";

const installChrome = () =>
  install({
    browser: Browser.CHROME,
    buildId: chromeVersion,
    cacheDir: puppeteerCacheDir,
    downloadProgressCallback: (downloaded, total) => {
      singleLineStdOut(
        `downloading Chrome (${downloaded}/${total})${
          downloaded === total ? "\ncomplete.\n" : ""
        }`
      );
    },
  });

export const buildDriver = async () => {
  await installChrome();
  log("Browser installed");

  const args: string[] = [];
  args.push("--disable-gpu", "--disable-software-rasterizer");
  if (configDevelopment?.noSandbox) {
    args.push("--no-sandbox");
  }
  if (!configDevelopment?.headed) {
    args.push(
      "--headless",
      "--start-maximized",
      "--window-size=1920,1080",
      "--autoplay-policy=no-user-gesture-required",
      "--no-first-run",
      "--use-fake-ui-for-media-stream",
      "--use-fake-device-for-media-stream",
      "--disable-sync",
      "--remote-debugging-port=9222"
    );
  }

  log(`launching Chrome with args: ${args.join(" ")}`);

  const browsers = await getInstalledBrowsers({
    cacheDir: puppeteerCacheDir,
  });
  const [b] = browsers;
  if (!b) {
    throw new Error("No Chrome browser found");
  }

  const driver = await new Builder()
    .forBrowser("chrome")
    .setChromeOptions(
      new chrome.Options()
        .addArguments(...args)
        .setChromeBinaryPath(b.executablePath)
    )
    .build();

  await driver.manage().setTimeouts({ implicit: seleniumImplicitWait });

  return driver;
};
