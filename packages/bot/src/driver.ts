import { Browser, getInstalledBrowsers, install } from "@puppeteer/browsers";
import config from "config.js";
import {
  chromeVersion,
  puppeteerCacheDir,
  seleniumImplicitWait,
} from "constants.js";
import { Builder } from "selenium-webdriver";
import chrome from "selenium-webdriver/chrome.js";
import { stdout as singleLineStdOut } from "single-line-log";

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

  const driverOptions = new chrome.Options();
  driverOptions.addArguments("--disable-gpu", "--disable-software-rasterizer");
  if (config.development?.noSandbox) {
    driverOptions.addArguments("--no-sandbox");
  }
  if (!config.development?.headed) {
    driverOptions.addArguments(
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
  await getInstalledBrowsers({
    cacheDir: puppeteerCacheDir,
  }).then(([b]) => {
    driverOptions.setChromeBinaryPath(b.executablePath);
  });
  const driver = await new Builder()
    .forBrowser("chrome")
    .setChromeOptions(driverOptions)
    .build();

  driver.manage().setTimeouts({ implicit: seleniumImplicitWait });

  return driver;
};
