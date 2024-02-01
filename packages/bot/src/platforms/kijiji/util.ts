import filterInteractions, {
  FilterDef,
  FilterInteractionsMap,
  doFilter,
} from "platforms/kijiji/filter-interactions.js";
import { By, WebDriver, until } from "selenium-webdriver";
import { debugLog } from "util/log.js";
import { isPlainObject, waitSeconds } from "util/misc.js";
import {
  elementShouldBeInteractable,
  withElement,
  withoutImplicitWait,
} from "util/selenium.js";

export const kijijiGet = async (url: string, driver: WebDriver) => {
  await driver.get(url);
  const xpath = "//button[contains(@class, 'cookieBannerCloseButton')]";

  await withoutImplicitWait(driver, async () => {
    try {
      await driver
        .wait(until.elementLocated(By.xpath(xpath)), 1000)
        .then((el) => el.click())
        .then(() => debugLog("Dismissed kijiji cookie banner"));
    } catch {}
  });
};

export const getFilterXpath = (id: string) =>
  `//div[@id="accordion__panel-${id}"]`;

export const ensureFilterIsOpen = async (id: string, driver: WebDriver) => {
  const xpath = `${getFilterXpath(id)}/..`;
  debugLog(`Ensuring filter ${id} is open`);
  await withElement(
    () => driver.findElement(By.xpath(xpath)),
    async (el) => {
      debugLog(`Ensuring filter ${id} is interactable`);
      await elementShouldBeInteractable(driver, el, { xpath });
      debugLog(`Checking whether ${id} is already expanded`);
      const expanded = await el.getAttribute("aria-expanded");
      if (!expanded) {
        debugLog(`Expanding ${id}`);
        await el.click();
        await waitSeconds(1);
      }
    }
  );
};

export const setFilters = async (driver: WebDriver) => {
  const interactWithFilters = async (obj: {
    [k: string]: FilterDef<any> | Object;
  }) => {
    for (const [k, v] of Object.entries(obj)) {
      if (v instanceof FilterDef) {
        debugLog(`Applying Kijiji filter ${k}`);
        await waitSeconds(1);
        await doFilter(driver, v);
      } else if (isPlainObject(v)) {
        await interactWithFilters(v as FilterInteractionsMap);
      }
    }
  };

  await interactWithFilters(filterInteractions);
};
