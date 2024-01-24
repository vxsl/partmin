import { By, WebDriver } from "selenium-webdriver";
import { Config } from "types/config.js";
import { RecursiveKeyMap } from "../../types/type-utils.js";
import {
  click,
  clickAllByXPath,
  clickByXPath,
  elementShouldBeInteractable,
  fillInputByLabel,
  waitUntilUrlChanges,
  withElement,
} from "../../util/selenium.js";
import { debugLog } from "../../util/misc.js";

type ConfigInteractions = RecursiveKeyMap<Config, Function | undefined>; // TODO don't allow undefined?

const getFilterXpath = (id: string) => `//div[@id="accordion__panel-${id}"]`;

export const ensureFilterIsOpen = async (id: string, driver: WebDriver) => {
  const xpath = getFilterXpath(id);
  debugLog(`Ensuring filter ${id} is open`);
  await withElement(
    () => driver.findElement(By.xpath(`${xpath}/..`)),
    async (el) => {
      debugLog(`Ensuring filter ${id} is interactable`);
      await elementShouldBeInteractable(driver, el);
      debugLog(`Checking whether ${id} is already expanded`);
      await el.getAttribute("aria-expanded").then(async (v) => {
        if (!v) {
          debugLog(`Expanding ${id}`);
          await click(el);
          await driver.sleep(1000);
        }
      });
    }
  );
};

export const getFilterInteractions = (
  driver: WebDriver,
  config: Config
): ConfigInteractions => {
  return {
    search: {
      // minArea: async () => {
      //   const filterID = "areainfeet";
      //   const filterXpath = getFilterXpath(filterID);
      //   await ensureFilterIsOpen(filterID, driver);
      //   const v = config.search.minArea;
      //   if (v === undefined) {
      //     return;
      //   }
      //   await fillInputByLabel(driver, "Min", v, { parentXpath: filterXpath });
      //   await clickByXPath(driver, `//button[contains(text(), 'Apply')]`, {
      //     parentXpath: `${filterXpath}/..`,
      //   });
      //   await waitUntilUrlChanges(driver);
      // },

      // parkingIncluded: async () => {
      //   const filterID = "numberparkingspots";
      //   const filterXpath = getFilterXpath(filterID);
      //   await ensureFilterIsOpen(filterID, driver);
      //   const v = config.search.parkingIncluded;
      //   if (v === undefined) {
      //     return;
      //   }
      //   await clickAllByXPath(driver, `//label[not(text()='0')]`, {
      //     parentXpath: `${filterXpath}/..`,
      //     afterClick: async () => {
      //       debugLog("Waiting for URL change");
      //       await waitUntilUrlChanges(driver);
      //       debugLog("sleeping");
      //       await driver.sleep(1000);
      //       debugLog("ensuring filter is open");
      //       await ensureFilterIsOpen(filterID, driver);
      //     },
      //   });
      // },

      // outdoorSpace: async () => {
      //   const filterID = "personaloutdoorspace";
      //   const filterXpath = getFilterXpath(filterID);
      //   await ensureFilterIsOpen(filterID, driver);
      //   const v = config.search.outdoorSpace;
      //   if (!v) {
      //     // return;
      //   }
      //   await clickAllByXPath(driver, `//label[not(text()='0')]`, {
      //     parentXpath: `${filterXpath}/..`,
      //     afterClick: async () => {
      //       debugLog("Waiting for URL change");
      //       await waitUntilUrlChanges(driver);
      //       debugLog("sleeping");
      //       await driver.sleep(1000);
      //       debugLog("ensuring filter is open");
      //       await ensureFilterIsOpen(filterID, driver);
      //     },
      //   });
      // },

      basementNotAccepted: async () => {
        const filterID = "unittype";
        const filterXpath = getFilterXpath(filterID);
        await ensureFilterIsOpen(filterID, driver);
        const v = config.search.basementNotAccepted;
        if (!v) {
          return;
        }
        await clickAllByXPath(driver, `//label[not(text()='Basement')]`, {
          parentXpath: `${filterXpath}/..`,
          afterClick: async () => {
            debugLog("Waiting for URL change");
            await waitUntilUrlChanges(driver);
            debugLog("sleeping");
            await driver.sleep(1000);
            debugLog("ensuring filter is open");
            await ensureFilterIsOpen(filterID, driver);
          },
        });
      },

      // TODO verify whether this rules out options that don't have the value set
      // petFriendly: async () => {
      //   const filterID = "petsallowed";
      //   const filterXpath = getFilterXpath(filterID);
      //   await ensureFilterIsOpen(filterID, driver);
      //   const v = config.search.petFriendly;
      //   if (v === undefined) {
      //     return;
      //   }
      //   if (!v) {
      //     await clickByXPath(driver, `//label[contains(text(), 'No')]`, {
      //       parentXpath: `${filterXpath}/..`,
      //     });
      //     return;
      //   }
      //   await clickAllByXPath(driver, `//label[not(text()='No')]`, {
      //     parentXpath: `${filterXpath}/..`,
      //     afterClick: async () => {
      //       debugLog("Waiting for URL change");
      //       await waitUntilUrlChanges(driver);
      //       debugLog("sleeping");
      //       await driver.sleep(1000);
      //       debugLog("ensuring filter is open");
      //       await ensureFilterIsOpen(filterID, driver);
      //     },
      //   });
      // },

      // bedrooms: {
      //   min: async () => {
      //     const filterID = "numberbedrooms";
      //     const filterXpath = getFilterXpath(filterID);
      //     await ensureFilterIsOpen(filterID, driver);
      //     const v = config.search.bedrooms.min;
      //     if (v === undefined) {
      //       return;
      //     }
      //     if (v === 0) {
      //       await clickByXPath(driver, `//label[contains(text(), 'Studio')]`, {
      //         parentXpath: `${filterXpath}/..`,
      //       });
      //       return;
      //     }
      //     for (const p of [
      //       `//label[number(translate(substring-before(., '+'), ' ', '')) >= ${v}]`,
      //       `//label[number(translate(., ' ', '')) >= ${v}]`,
      //     ]) {
      //       await clickAllByXPath(driver, p, {
      //         parentXpath: `${filterXpath}/..`,
      //         afterClick: async () => {
      //           debugLog("Waiting for URL change");
      //           await waitUntilUrlChanges(driver);
      //           debugLog("sleeping");
      //           await driver.sleep(1000);
      //           debugLog("ensuring filter is open");
      //           await ensureFilterIsOpen(filterID, driver);
      //         },
      //       });
      //     }
      //   },
      // },

      price: async () => {
        const filterID = "price";
        const filterXpath = getFilterXpath(filterID);
        await ensureFilterIsOpen(filterID, driver);
        const minV = config.search.price.min;
        const maxV = config.search.price.max;
        if (minV === undefined && maxV === undefined) {
          return;
        }

        await fillInputByLabel(driver, "from", minV, {
          parentXpath: filterXpath,
        });
        await fillInputByLabel(driver, "to", maxV, {
          parentXpath: filterXpath,
        });
        await clickByXPath(driver, `//button[contains(text(), 'Apply')]`, {
          parentXpath: `${filterXpath}/..`,
        });
        await waitUntilUrlChanges(driver);
      },
    },
  };
};

export const setKijijiFilters = async (driver: WebDriver, config: Config) => {
  const interactWithFilters = async (obj: {
    [k: string]: Function | Object;
  }) => {
    for (const [k, v] of Object.entries(obj)) {
      if (typeof v === "function") {
        debugLog(`\n`);
        debugLog(`Applying Kijiji filter ${k}`);
        await driver.sleep(1000);
        await v();
      } else if (typeof v === "object" && !!v) {
        await interactWithFilters(v as ConfigInteractions);
      }
    }
  };

  await interactWithFilters(getFilterInteractions(driver, config));
};
