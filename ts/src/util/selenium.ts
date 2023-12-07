import {
  By,
  Key,
  WebDriver,
  WebElement,
  WebElementPromise,
  until,
} from "selenium-webdriver";
import { readJSON, writeJSON } from "./io.js";

export const type = async (
  element: WebElementPromise | WebElement,
  string: string
) => {
  for (let i = 0; i < string.length; i++) {
    await new Promise((resolve) =>
      setTimeout(
        () => element.sendKeys(string[i]).then(resolve),
        Math.random() * 200
      )
    );
  }
};

// for when .clear() doesn't work
export const clearAlternate = async (el: WebElementPromise | WebElement) =>
  await el.sendKeys(Key.chord(Key.CONTROL, "a", Key.DELETE));

export const clickByXPath = async (driver: WebDriver, selector: string) => {
  const el = await driver.findElement(By.xpath(selector));
  await elementShouldBeInteractable(driver, el);
  await click(el);
};

const click = async (element: WebElementPromise | WebElement) =>
  await new Promise((resolve) => {
    setTimeout(() => {
      return element.click().then(resolve);
    }, Math.random() * 200);
  });

export const saveCookies = async (driver: WebDriver, keys?: string[]) =>
  writeJSON(
    "tmp/cookies.json",
    await driver
      .manage()
      .getCookies()
      .then((cookies) =>
        cookies.filter((c) => (keys ? keys.includes(c.name) : true))
      )
  );

export const loadCookies = async (driver: WebDriver) => {
  const cookies = await readJSON<Object[]>("tmp/cookies.json");
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
  el: WebElement
) => {
  await driver.wait(until.elementIsVisible(el), 10 * 1000);
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
