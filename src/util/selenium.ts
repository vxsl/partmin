import { WebDriver, WebElementPromise } from "selenium-webdriver";
import { readJSON, writeJSON } from "./io.js";

export const type = async (string: string, element: WebElementPromise) => {
  for (let i = 0; i < string.length; i++) {
    await new Promise((resolve) => setTimeout(resolve, Math.random() * 200));
    element.sendKeys(string[i]);
  }
};
export const click = async (element: WebElementPromise) => {
  return new Promise((resolve) => {
    setTimeout(() => {
      return element.click().then(resolve);
    }, Math.random() * 200);
  });
};

export const saveCookies = async (driver: WebDriver) =>
  writeJSON(
    "./tmp/cookies.json",
    await driver.manage().getCookies()
    // .map((c) => ({
    //   ...c,
    //   domain: "https://www.facebook.com",
    // }))
  );

export const loadCookies = async (driver: WebDriver) => {
  const cookies: Object[] = await readJSON("./tmp/cookies.json");
  await driver.manage().deleteAllCookies();

  // @ts-ignore
  await driver.sendDevToolsCommand("Network.enable");
  for (const c of cookies) {
    // @ts-ignore
    await driver.sendDevToolsCommand("Network.setCookie", c);
  }
  // @ts-ignore
  await driver.sendDevToolsCommand("Network.disable");
};
