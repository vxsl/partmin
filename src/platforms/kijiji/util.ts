import filterInteractions, {
  FilterInteraction,
  FilterInteractionsMap,
} from "platforms/kijiji/filter-interactions.js";
import { By, WebDriver, until } from "selenium-webdriver";
import { debugLog } from "util/misc.js";
import {
  click,
  clickByXPath,
  elementShouldBeInteractable,
  withElement,
} from "util/selenium.js";

export const kijijiGet = async (url: string, driver: WebDriver) => {
  await driver.get(url);
  const xpath = "//button[contains(@class, 'cookieBannerCloseButton')]";
  await driver
    .wait(until.elementLocated(By.xpath(xpath)), 1000)
    .then((el) => el && clickByXPath(driver, xpath))
    .catch((e) => {
      debugLog(e);
    });
};

export const getFilterXpath = (id: string) =>
  `//div[@id="accordion__panel-${id}"]`;

export const ensureFilterIsOpen = async (id: string, driver: WebDriver) => {
  const xpath = getFilterXpath(id);
  debugLog(`Ensuring filter ${id} is open`);
  await withElement(
    () => driver.findElement(By.xpath(`${xpath}/..`)),
    async (el) => {
      debugLog(`Ensuring filter ${id} is interactable`);
      await elementShouldBeInteractable(driver, el);
      debugLog(`Checking whether ${id} is already expanded`);
      await el.getAttribute("aria-expanded").then(async (v) => {
        if (!v) {
          debugLog(`Expanding ${id}`);
          await click(el);
          await driver.sleep(1000);
        }
      });
    }
  );
};

export const setFilters = async (driver: WebDriver) => {
  const interactWithFilters = async (obj: {
    [k: string]: FilterInteraction | Object;
  }) => {
    for (const [k, v] of Object.entries(obj)) {
      if (typeof v === "function") {
        debugLog(`\n`);
        debugLog(`Applying Kijiji filter ${k}`);
        await driver.sleep(1000);
        await v(driver);
      } else if (typeof v === "object" && !!v) {
        await interactWithFilters(v as FilterInteractionsMap);
      }
    }
  };

  await interactWithFilters(filterInteractions);
};
