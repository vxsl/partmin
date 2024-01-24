import {
  By,
  Condition,
  Key,
  WebDriver,
  WebElement,
  WebElementPromise,
  until,
} from "selenium-webdriver";
import { readJSON, writeJSON } from "./io.js";
import { debugLog } from "./misc.js";
import { tmpDir } from "../constants.js";

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

// for when .clear() doesn't work
export const clearAlternate = async (el: WebElementPromise | WebElement) =>
  await el.sendKeys(Key.chord(Key.CONTROL, "a", Key.DELETE));

export const clickByXPath = async (
  driver: WebDriver,
  selector: string,
  options?: {
    parent?: WebElement;
    parentXpath?: string;
  }
) => {
  await withElement(
    () =>
      (options?.parent ?? driver).findElement(
        By.xpath(`${options?.parentXpath ?? ""}${selector}`)
      ),
    async (el) => {
      await elementShouldBeInteractable(driver, el);
      await click(el);
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
    await withElement(
      () =>
        (options?.parent ?? driver).findElement(
          By.xpath(`(${selector})[${i + 1}]`)
        ),
      async (el) => {
        await elementShouldBeInteractable(driver, el);
        await click(el);
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

export const click = async (element: WebElementPromise | WebElement) =>
  await new Promise((resolve) => {
    setTimeout(() => {
      return element.click().then(resolve);
    }, Math.random() * 200);
  });

export const saveCookies = async (driver: WebDriver, keys?: string[]) =>
  writeJSON(
    `${tmpDir}/cookies.json`,
    await driver
      .manage()
      .getCookies()
      .then((cookies) =>
        cookies.filter((c) => (keys ? keys.includes(c.name) : true))
      )
  );

export const loadCookies = async (driver: WebDriver) => {
  const cookies = await readJSON<Object[]>(`${tmpDir}/cookies.json`);
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

const getWebElementIdentifier = async (el: WebElement): Promise<string> => {
  const idAttribute = await el.getAttribute("id");
  return idAttribute ? `#${idAttribute}` : "element without id";
};

export const elementShouldBeInteractable = async (
  driver: WebDriver,
  el: WebElement
) => {
  const elementName = await getWebElementIdentifier(el);
  debugLog(`Waiting for ${elementName} to be visible`);
  await driver.wait(until.elementIsVisible(el), 10 * 1000);
  debugLog(`Waiting for ${elementName} to be enabled`);
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

export const withElement = async (
  getEl: () => WebElement | WebElementPromise,
  fn: (el: WebElement) => {}
) => {
  let attempts = 0;
  const maxAttempts = 3;
  while (++attempts <= maxAttempts) {
    if (attempts > 1) {
      debugLog(
        `Attempting action again (${attempts - 1} of ${maxAttempts - 1})`
      );
    }
    try {
      const el = await getEl();
      await fn(el);
      break;
    } catch (e) {
      debugLog(e);
    }
  }
};
