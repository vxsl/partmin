import { seleniumImplicitWait } from "constants.js";
import {
  By,
  Condition,
  Key,
  WebDriver,
  WebElement,
  WebElementPromise,
  until,
} from "selenium-webdriver";
import { debugLog, verboseLog } from "util/log.js";
import { tryNTimes } from "util/misc.js";

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
    const char = str[i];
    if (char === undefined) {
      continue; // I don't know why TypeScript doesn't know that char is defined here
    }
    await new Promise((resolve) =>
      setTimeout(
        () => element.sendKeys(isNumber ? Number(char) : char).then(resolve),
        Math.random() * 200
      )
    );
  }
};

export const manualClear = async (el: WebElementPromise | WebElement) =>
  await el.sendKeys(Key.chord(Key.CONTROL, "a", Key.DELETE));

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

export const withElement = <F extends (el: WebElement) => any>(
  getEl: () => WebElement | WebElementPromise,
  fn: F
): Promise<ReturnType<F>> => tryNTimes(3, async () => fn(await getEl()));

type WithElementsByXpathOptions = {
  noConcurrency?: boolean;
  parent?: WebElement;
  parentXpath?: string;
};

export const withElementsByXpath = async <T>(
  driver: WebDriver,
  _selector: string,
  fn: (el: WebElement, i: number) => Promise<T>,
  options?: WithElementsByXpathOptions
): Promise<T[]> => {
  const promises: Promise<T>[] = [];
  const results: T[] = [];

  const selector = `${options?.parentXpath ?? ""}${_selector}`;

  const len = await driver
    .findElements(By.xpath(selector))
    .then((els) => els.length);
  verboseLog(`withElementsByXpath: ${len} elements found`);
  for (let i = 0; i < len; i++) {
    const xpath = `(${selector})[${i + 1}]`;
    const getEl = () => driver.findElement(By.xpath(xpath));

    if (options?.noConcurrency) {
      const r = await withElement(getEl, (el) => fn(el, i));
      if (r !== undefined) {
        results.push(r);
      }
    } else {
      promises.push(
        new Promise<T>((resolve) => {
          withElement(getEl, (el) => resolve(fn(el, i)));
        })
      );
    }
  }
  return options?.noConcurrency ? results : Promise.all(promises);
};

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
  xpath: string,
  options?: WithElementsByXpathOptions & {
    afterClick?: () => Promise<void>;
  }
) => {
  await withElementsByXpath(
    driver,
    xpath,
    async (el, i) => {
      await elementShouldBeInteractable(driver, el, {
        name: `${i}th ${xpath}`,
      });
      await el.click();
      await (options?.afterClick?.() ?? Promise.resolve());
    },
    options
  );
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
  verboseLog("Disabling implicit wait");
  await driver.manage().setTimeouts({ implicit: 0 });
  verboseLog("Executing function without implicit wait");
  let res;
  try {
    res = await fn();
    verboseLog("Function executed without implicit wait");
  } finally {
    verboseLog("Re-enabling implicit wait");
    await driver.manage().setTimeouts({ implicit: seleniumImplicitWait });
    verboseLog("Implicit wait re-enabled");
  }
  verboseLog("Returning result");
  return res;
};
