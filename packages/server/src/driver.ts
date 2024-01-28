import { Browser, getInstalledBrowsers, install } from "@puppeteer/browsers";
import config from "config.js";
import { chromeVersion, puppeteerCacheDir } from "constants.js";
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
  if (!config.development?.headed) {
    driverOptions.addArguments("--headless");
    driverOptions.addArguments("--disable-gpu");
  }
  driverOptions.addArguments("--no-sandbox");
  await getInstalledBrowsers({
    cacheDir: puppeteerCacheDir,
  }).then(([b]) => {
    driverOptions.setChromeBinaryPath(b.executablePath);
  });
  const driver = await new Builder()
    .forBrowser("chrome")
    .setChromeOptions(driverOptions)
    .build();

  driver.manage().setTimeouts({ implicit: 10000 });

  return driver;
};