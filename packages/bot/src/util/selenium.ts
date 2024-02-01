import { seleniumImplicitWait, dataDir } from "constants.js";
import {
  By,
  Condition,
  Key,
  WebDriver,
  WebElement,
  WebElementPromise,
  until,
} from "selenium-webdriver";
import { readJSON, writeJSON } from "util/io.js";
import { debugLog } from "util/log.js";
import { waitSeconds } from "util/misc.js";

export const clearBrowsingData = async (driver: WebDriver) => {
  if (!(await driver.getCurrentUrl()).startsWith("data")) {
    await driver.manage().deleteAllCookies();
    await driver.executeScript("window.localStorage.clear();");
    await driver.executeScript("window.sessionStorage.clear();");
  }
};

export const waitUntilUrlChanges = async (
  driver: WebDriver,
  compareTo?: string
) => {
  const url = compareTo ?? (await driver.getCurrentUrl());
  await driver.wait(
    new Condition("Waiting until the browser URL changes", (driver) =>
      driver.getCurrentUrl().then((_url) => _url !== url)
    ),
    10 * 1000
  );
};

export const type = async (
  element: WebElementPromise | WebElement,
  v: string | number
) => {
  const isNumber = typeof v === "number";
  const str = `${v}`;
  for (let i = 0; i < str.length; i++) {
    await new Promise((resolve) =>
      setTimeout(
        () =>
          element.sendKeys(isNumber ? Number(str[i]) : str[i]).then(resolve),
        Math.random() * 200
      )
    );
  }
};

export const manualClear = async (el: WebElementPromise | WebElement) =>
  await el.sendKeys(Key.chord(Key.CONTROL, "a", Key.DELETE));

export const clickByXPath = async (
  driver: WebDriver,
  selector: string,
  options?: {
    parent?: WebElement;
    parentXpath?: string;
  }
) => {
  const xpath = `${options?.parentXpath ?? ""}${selector}`;
  await withElement(
    () => (options?.parent ?? driver).findElement(By.xpath(xpath)),
    async (el) => {
      await elementShouldBeInteractable(driver, el, { xpath });
      await el.click();
    }
  );
};

export const clickAllByXPath = async (
  driver: WebDriver,
  _selector: string,
  options?: {
    parent?: WebElement;
    parentXpath?: string;
    afterClick?: () => Promise<void>;
  }
) => {
  const selector = `${options?.parentXpath ?? ""}${_selector}`;
  const len = await (options?.parent ?? driver)
    .findElements(By.xpath(selector))
    .then((els) => els.length);
  for (let i = 0; i < len; i++) {
    const xpath = `(${selector})[${i + 1}]`;
    await withElement(
      () => (options?.parent ?? driver).findElement(By.xpath(xpath)),
      async (el) => {
        await elementShouldBeInteractable(driver, el, { xpath });
        await el.click();
        if (options?.afterClick) {
          await options.afterClick();
        }
      }
    );
  }
};

export const fillInputByLabel = async (
  driver: WebDriver,
  label: string,
  v: string | number,
  options?: {
    parentXpath?: string;
  }
) => {
  await withElement(
    () =>
      driver.findElement(
        By.xpath(
          `${
            options?.parentXpath ?? ""
          }//label[contains(text(), "${label}")]/following-sibling::input | //label[contains(text(), "${label}")]/ancestor::label/following-sibling::input`
        )
      ),
    async (el) => {
      await type(el, v);
    }
  );
};

export const saveCookies = async (driver: WebDriver, keys?: string[]) =>
  writeJSON(
    `${dataDir}/cookies.json`,
    await driver
      .manage()
      .getCookies()
      .then((cookies) =>
        cookies.filter((c) => (keys ? keys.includes(c.name) : true))
      )
  );

export const loadCookies = async (driver: WebDriver) => {
  const cookies = await readJSON<Object[]>(`${dataDir}/cookies.json`);
  await driver.manage().deleteAllCookies();

  if (cookies?.length) {
    // @ts-ignore
    await driver.sendDevToolsCommand("Network.enable");
    for (const c of cookies) {
      // @ts-ignore
      await driver.sendDevToolsCommand("Network.setCookie", c);
    }
    // @ts-ignore
    await driver.sendDevToolsCommand("Network.disable");
  }
};

export const elementShouldBeInteractable = async (
  driver: WebDriver,
  el: WebElement,
  log:
    | {
        xpath: string;
        name?: undefined;
      }
    | {
        xpath?: undefined;
        name: string;
      }
) => {
  const str = log.xpath ?? log.name;
  debugLog(`Waiting for ${str} to be visible`);
  await driver.wait(until.elementIsVisible(el), 10 * 1000);
  debugLog(`Waiting for ${str} to be enabled`);
  await driver.wait(until.elementIsEnabled(el), 10 * 1000);
};

export const elementShouldExist = async (
  method: "xpath" | "css",
  selector: string,
  driver: WebDriver
) =>
  await (method === "xpath"
    ? driver.wait(until.elementLocated(By.xpath(selector)), 10 * 1000)
    : method === "css"
    ? driver.wait(until.elementLocated(By.css(selector)), 10 * 1000)
    : Promise.resolve());

export const withElementsByXpath = async <T>(
  driver: WebDriver,
  xpath: string,
  fn: (el: WebElement) => Promise<T | undefined>
): Promise<T[]> => {
  const results = [];
  const len = await driver
    .findElements(By.xpath(xpath))
    .then((els) => els.length);
  for (let i = 0; i < len; i++) {
    // verboseLog(`withElementsByXpath (${i + 1}/${len}): ${xpath}`);
    const r = await withElement(
      () => driver.findElement(By.xpath(`(${xpath})[${i + 1}]`)),
      fn
    );
    if (r !== undefined) {
      results.push(r);
    }
  }
  return results;
};

export const withElement = async <F extends (el: WebElement) => any>(
  getEl: () => WebElement | WebElementPromise,
  fn: F
): Promise<ReturnType<F>> => {
  let attempts = 0;
  const maxAttempts = 3;
  while (++attempts <= maxAttempts) {
    if (attempts > 1) {
      debugLog(
        `Attempting action again (${attempts - 1} of ${maxAttempts - 1})`
      );
      await waitSeconds(2);
    }
    try {
      const el = await getEl();
      const res = await fn(el);
      if (attempts > 1) {
        debugLog("Action completed successfully.");
      }
      return res;
    } catch (e) {
      debugLog(e);
    }
  }
  throw new Error(
    `Failed to execute action after ${maxAttempts} attempts at finding element`
  );
};
export const withDOMChangesBlocked = async (
  driver: WebDriver,
  fn: Function
) => {
  await driver.executeScript(`
    window.ogAppendChild = Node.prototype.appendChild;
    window.ogRemoveChild = Node.prototype.removeChild;
    window.ogInsertBefore = Node.prototype.insertBefore;
    Node.prototype.appendChild = function () {};
    Node.prototype.removeChild = function () {};
    Node.prototype.insertBefore = function () {};
  `);

  try {
    await fn();
  } finally {
    await driver.executeScript(
      `
      Node.prototype.appendChild = window.ogAppendChild;
      Node.prototype.removeChild = window.ogRemoveChild;
      Node.prototype.insertBefore = window.ogInsertBefore;
    `
    );
  }
};

export const withoutImplicitWait = async <T>(
  driver: WebDriver,
  fn: () => Promise<T>
) => {
  await driver.manage().setTimeouts({ implicit: 0 });
  try {
    return await fn();
  } finally {
    await driver.manage().setTimeouts({ implicit: seleniumImplicitWait });
  }
};
