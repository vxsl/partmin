import { By, Key, WebDriver, WebElementPromise } from "selenium-webdriver";
import { waitSeconds as seconds } from "../../util/misc.js";
import { click, elementShouldExist, type } from "../../util/selenium.js";

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

export const setMarketplaceLocation = async (
  driver: WebDriver,
  fsa: string,
  radius: number
) => {
  // open the modal:
  await elementShouldExist(
    "xpath",
    `//span[(text()="Montreal, Quebec")]`,
    // `[aria-label="Enter a city"]`,
    driver
  );
  await seconds(Math.random() * 1 + 1);
  await fbClick(
    driver,
    // driver.findElement(By.xpath(`//span[(text()="Within 1 kilometer")]`))
    driver.findElement(By.xpath(`//span[(text()="Montreal, Quebec")]`))
    // driver.findElement(By.css(`[aria-label="Enter a city"]`))
  );

  // make sure the modal is open:
  await elementShouldExist(
    "xpath",
    `//span[contains(text(), "Search by city, neighborhood or ZIP code.")]`,
    driver
  );

  await seconds(Math.random() * 1 + 1);

  const locInput = driver.findElement(
    By.xpath(`//input[@aria-label="Enter a city"]`)
  );
  await fbClick(driver, locInput);

  await seconds(Math.random() * 1 + 1);

  await locInput.sendKeys(Key.CONTROL + "a");
  await locInput.sendKeys(Key.DELETE);

  await seconds(Math.random() * 1 + 0.5);

  await fbType(driver, locInput, fsa);
  seconds(1);

  driver.findElement(By.xpath(`//span[contains(text(), "Change location")]`));

  await elementShouldExist(
    "xpath",
    `//span[contains(text(), "Canada ${fsa}")]`,
    driver
  );

  await locInput.sendKeys(Key.DOWN);
  await locInput.sendKeys(Key.ENTER);

  await seconds(Math.random() * 1 + 0.5);

  await fbClick(driver, driver.findElement(By.xpath(`//span[text()="Apply"]`)));

  const url = await driver.getCurrentUrl();
  await driver.get(`${url}&radius=${radius}`);

  await elementShouldExist(
    "xpath",
    `//span[(text()="Within ${
      radius !== 1 ? `${radius} kilometers` : `${radius} kilometer`
    }")]`,
    driver
  );
};
