import { By, WebDriver, WebElementPromise } from "selenium-webdriver";
import { waitSeconds as seconds } from "util/misc.js";
import { click, type } from "util/selenium.js";

export const MP_ITEM_XPATH = `.//a[contains(@href,'/marketplace/item/')]`;

export const isBlocked = async (driver: WebDriver) =>
  await driver
    // .findElements(By.xpath(`//span[(text()="You're Temporarily Blocked")]`))
    .findElements(
      By.xpath(
        `//div[contains(text(), "It looks like you were misusing this feature by going too fast. You’ve been temporarily blocked from using it.")]`
      )
    )
    .then((els) => els.length > 0);

export const dismissBlock = async (driver: WebDriver) => {
  if (await isBlocked(driver)) {
    await seconds(Math.random() * 1 + 1);
    await click(
      driver.findElement(By.css('div[aria-label="OK"][role="button"]'))
    );
    await seconds(Math.random() * 2 + 3);
  }
};

export const fbClick = async (
  driver: WebDriver,
  element: WebElementPromise
) => {
  await dismissBlock(driver);
  await click(element);
};

export const fbType = async (
  driver: WebDriver,
  element: WebElementPromise,
  text: string
) => {
  await dismissBlock(driver);
  await type(element, text);
};
