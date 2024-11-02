import {
  By,
  error,
  Key,
  WebDriver,
  WebElementPromise,
} from "selenium-webdriver";
import { log } from "util/log.js";
import { waitSeconds as seconds, waitSeconds } from "util/misc.js";
import {
  click,
  clickByXPath,
  elementShouldExist,
  type,
} from "util/selenium.js";

export const MP_ITEM_XPATH = `.//a[contains(@href,'/marketplace/item/')]`;

export const visitFacebook = async (driver: WebDriver) => {
  await driver.get("https://facebook.com");
};

export const login = async (driver: WebDriver) => {
  const USER = process.env.FB_USER;
  const PASS = process.env.FB_PASS;
  if (!USER || !PASS) throw new Error("Missing FB_USER or FB_PASS env var");

  await fbType(driver, driver.findElement(By.name("email")), USER);
  await fbType(driver, driver.findElement(By.name("pass")), PASS);
  await fbClick(driver, driver.findElement(By.name("login")));
  await elementShouldExist("css", '[aria-label="Search Facebook"]', driver);
};

export const marketplaceReady = async (driver: WebDriver) =>
  await driver
    .findElements(By.xpath(MP_ITEM_XPATH))
    .then((els) => els.length > 0);

// export const isBlocked = async (driver: WebDriver) =>
//   await driver
//     // .findElements(By.xpath(`//span[(text()="You're Temporarily Blocked")]`))
//     .findElements(
//       By.xpath(
//         `//div[contains(text(), "It looks like you were misusing this feature by going too fast. You’ve been temporarily blocked from using it.")]`
//       )
//     )
//     .then((els) => els.length > 0);

export const dismissBlock = async (driver: WebDriver) => {
  // if (await isBlocked(driver)) {
  // await seconds(Math.random() * 1 + 1);
  // await click(
  //   driver.findElement(By.css('div[aria-label="OK"][role="button"]'))
  // );
  // await
  await clickByXPath(
    driver,
    `//div[@role="dialog"]//*[@aria-label="Close" or @aria-label="OK"]`
  );
  // await seconds(Math.random() * 2 + 3);
  // }
};

export const fbClick = async (
  driver: WebDriver,
  element: WebElementPromise
) => {
  // await dismissBlock(driver);

  try {
    await click(element);
  } catch (e) {
    if (e instanceof error.ElementClickInterceptedError) {
      await dismissBlock(driver);
      await click(element);
    }
  }
};

export const fbType = async (
  driver: WebDriver,
  element: WebElementPromise,
  text: string
) => {
  try {
    await type(element, text);
  } catch (e) {
    if (e instanceof error.ElementClickInterceptedError) {
      await dismissBlock(driver);
      await type(element, text);
    }
  }
};

export const isOnHomepage = async (driver: WebDriver) =>
  await driver
    .findElements(By.css('[aria-label="Search Facebook"]'))
    .then((els) => els.length > 0);

export const setMarketplaceLocation = async (
  driver: WebDriver,
  fsa: string,
  radius: number
) => {
  // open the modal:
  await elementShouldExist(
    "xpath",
    `//span[(text()="Vancouver, British Columbia")]`,
    // `[aria-label="Enter a city"]`,
    driver
  );
  await seconds(Math.random() * 1 + 1);
  await fbClick(
    driver,
    // driver.findElement(By.xpath(`//span[(text()="Within 1 kilometer")]`))
    driver.findElement(
      By.xpath(`//span[(text()="Vancouver, British Columbia")]`)
    )
    // driver.findElement(By.css(`[aria-label="Enter a city"]`))
  );

  // make sure the modal is open:
  await elementShouldExist(
    "xpath",
    // `//span[contains(text(), "Search by") and (contains(text(), "city") or contains(text(), "town")) and contains(text(), "neighborhood") and contains(text(), "ZIP code")]`,
    `//span[contains(text(), "Search by") \
    and (contains(text(), "city") or contains(text(), "town")) \
    and (contains(text(), "ZIP code") or contains(text(), "postal code")) \
    ]`,
    driver
  );

  await seconds(Math.random() * 1 + 1);

  const locInput = driver.findElement(
    By.xpath(`//input[@aria-label="Location"]`)
  );
  await fbClick(driver, locInput);

  await seconds(Math.random() * 1 + 1);

  await locInput.sendKeys(Key.CONTROL + "a");
  await locInput.sendKeys(Key.DELETE);

  await seconds(Math.random() * 1 + 0.5);

  await fbType(driver, locInput, fsa);
  await seconds(1);

  // driver.findElement(By.xpath(`//span[contains(text(), "Change location")]`));

  await elementShouldExist(
    "xpath",
    `//span[contains(text(), "Canada ${fsa}")]`,
    driver
  );

  await locInput.sendKeys(Key.DOWN);
  await locInput.sendKeys(Key.ENTER);

  await seconds(Math.random() * 1 + 0.5);

  await clickByXPath(driver, `//label[@aria-label="Radius"]`);

  // get all the radii from  the text contents of the elements in a role=listbox:
  const radiiEls = await driver.findElements(
    By.xpath(`//div[@role="listbox"]//div[@role="option"]`)
  );
  const radii = await Promise.all(
    radiiEls.map((r) => r.getText().then((t) => parseInt(t.trim())))
  );
  // select the radius that's closest to the desired radius:
  const closestRadius = radii.reduce((a, b) =>
    Math.abs(b - radius) < Math.abs(a - radius) ? b : a
  );
  log(
    `Setting the radius to ${closestRadius} km instead of ${radius} km because it's the closest available option in the manual location modal`
  );
  // await clickByXPath(
  //   driver,
  //   `//div[@role="listbox"]//div[@role="option" and text()="${closestRadius} kilometer"]`
  // );

  // const url = await driver.getCurrentUrl();
  // await driver.get(`${url}&radius=${radius}`);

  await clickByXPath(
    driver,
    `//div[@role="listbox"]//div[@role="option" and contains(., '${closestRadius} kilomet')]`
  );

  await fbClick(driver, driver.findElement(By.xpath(`//span[text()="Apply"]`)));
  await waitSeconds(2);

  return closestRadius;
};

// export const setMarketplaceLocation = async (
//   driver: WebDriver,
//   fsa: string,
//   radius: number
// ) => {
//   // open the modal:
//   await elementShouldExist(
//     "xpath",
//     `//span[(text()="Montreal, Quebec")]`,
//     // `[aria-label="Enter a city"]`,
//     driver
//   );
//   await seconds(Math.random() * 1 + 1);
//   await fbClick(
//     driver,
//     // driver.findElement(By.xpath(`//span[(text()="Within 1 kilometer")]`))
//     driver.findElement(By.xpath(`//span[(text()="Montreal, Quebec")]`))
//     // driver.findElement(By.css(`[aria-label="Enter a city"]`))
//   );

//   // make sure the modal is open:
//   await elementShouldExist(
//     "xpath",
//     `//span[contains(text(), "Search by city, neighborhood or ZIP code.")]`,
//     driver
//   );

//   await seconds(Math.random() * 1 + 1);

//   const locInput = driver.findElement(
//     By.xpath(`//input[@aria-label="Enter a city"]`)
//   );
//   await fbClick(driver, locInput);

//   await seconds(Math.random() * 1 + 1);

//   await locInput.sendKeys(Key.CONTROL + "a");
//   await locInput.sendKeys(Key.DELETE);

//   await seconds(Math.random() * 1 + 0.5);

//   await fbType(driver, locInput, fsa);
//   seconds(1);

//   driver.findElement(By.xpath(`//span[contains(text(), "Change location")]`));

//   await elementShouldExist(
//     "xpath",
//     `//span[contains(text(), "Canada ${fsa}")]`,
//     driver
//   );

//   await locInput.sendKeys(Key.DOWN);
//   await locInput.sendKeys(Key.ENTER);

//   await seconds(Math.random() * 1 + 0.5);

//   await fbClick(driver, driver.findElement(By.xpath(`//span[text()="Apply"]`)));

//   const url = await driver.getCurrentUrl();
//   await driver.get(`${url}&radius=${radius}`);

//   await elementShouldExist(
//     "xpath",
//     `//span[(text()="Within ${
//       radius > 1 ? `${radius} kilometers` : `${radius} kilometer`
//     }")]`,
//     driver
//   );
// };
