import { By, until, WebDriver, WebElementPromise } from "selenium-webdriver";
import { readJSON, writeJSON } from "./io.js";

export const type = async (element: WebElementPromise, string: string) => {
  for (let i = 0; i < string.length; i++) {
    await new Promise((resolve) =>
      setTimeout(
        () => element.sendKeys(string[i]).then(resolve),
        Math.random() * 200
      )
    );
  }
};
export const click = async (element: WebElementPromise) =>
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
    // .map((c) => ({
    //   ...c,
    //   domain: "https://www.facebook.com",
    // }))
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
