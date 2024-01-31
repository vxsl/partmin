import config, { Config } from "config.js";
import { ensureFilterIsOpen, getFilterXpath } from "platforms/kijiji/util.js";
import { WebDriver } from "selenium-webdriver";
import { RecursiveKeyMap } from "types/type-utils.js";
import { debugLog } from "util/log.js";
import {
  clickAllByXPath,
  clickByXPath,
  fillInputByLabel,
  waitUntilUrlChanges,
} from "util/selenium.js";

export type FilterInteraction = (d: WebDriver) => void;
export type FilterInteractionsMap = RecursiveKeyMap<
  Config["search"]["params"],
  FilterInteraction | undefined
>;

const filterInteractions: FilterInteractionsMap = {
  exclude: {
    basements: async (d) => {
      const filterID = "unittype";
      const filterXpath = getFilterXpath(filterID);
      await ensureFilterIsOpen(filterID, d);
      const v = config.search.params.exclude.basements;
      if (!v) {
        return;
      }
      await clickAllByXPath(d, `//label[not(text()='Basement')]`, {
        parentXpath: `${filterXpath}/..`,
        afterClick: async () => {
          debugLog("Waiting for URL change");
          await waitUntilUrlChanges(d);
          debugLog("sleeping");
          await d.sleep(1000);
          debugLog("ensuring filter is open");
          await ensureFilterIsOpen(filterID, d);
        },
      });
    },
  },
  price: async (d) => {
    const filterID = "price";
    const filterXpath = getFilterXpath(filterID);
    await ensureFilterIsOpen(filterID, d);
    const minV = config.search.params.price.min;
    const maxV = config.search.params.price.max;
    if (minV === undefined && maxV === undefined) {
      return;
    }

    await fillInputByLabel(d, "from", minV, {
      parentXpath: filterXpath,
    });
    await fillInputByLabel(d, "to", maxV, {
      parentXpath: filterXpath,
    });
    await clickByXPath(d, `//button[contains(text(), 'Apply')]`, {
      parentXpath: `${filterXpath}/..`,
    });
    await waitUntilUrlChanges(d);
  },

  minBedrooms: async (d) => {
    const filterID = "numberbedrooms";
    const filterXpath = getFilterXpath(filterID);
    await ensureFilterIsOpen(filterID, d);
    const v = config.search.params.minBedrooms;
    if (v === undefined || v === 0) {
      return;
    }
    for (const p of [
      `//label[number(translate(substring-before(., '+'), ' ', '')) >= ${v}]`,
      `//label[number(translate(., ' ', '')) >= ${v}]`,
    ]) {
      await clickAllByXPath(d, p, {
        parentXpath: `${filterXpath}/..`,
        afterClick: async () => {
          debugLog("Waiting for URL change");
          await waitUntilUrlChanges(d);
          debugLog("sleeping");
          await d.sleep(1000);
          debugLog("ensuring filter is open");
          await ensureFilterIsOpen(filterID, d);
        },
      });
    }
  },
  // outdoorSpace: async (d) => {
  //   const filterID = "personaloutdoorspace";
  //   const filterXpath = getFilterXpath(filterID);
  //   await ensureFilterIsOpen(filterID, d);
  //   const v = config.search.params.outdoorSpace;
  //   if (!v) {
  //     // return;
  //   }
  //   await clickAllByXPath(d, `//label[not(text()='0')]`, {
  //     parentXpath: `${filterXpath}/..`,
  //     afterClick: async () => {
  //       debugLog("Waiting for URL change");
  //       await waitUntilUrlChanges(d);
  //       debugLog("sleeping");
  //       await d.sleep(1000);
  //       debugLog("ensuring filter is open");
  //       await ensureFilterIsOpen(filterID, d);
  //     },
  //   });
  // },

  // minArea: async (d) => {
  //   const filterID = "areainfeet";
  //   const filterXpath = getFilterXpath(filterID);
  //   await ensureFilterIsOpen(filterID, d);
  //   const v = config.search.params.minArea;
  //   if (v === undefined) {
  //     return;
  //   }
  //   await fillInputByLabel(d, "Min", v, { parentXpath: filterXpath });
  //   await clickByXPath(d, `//button[contains(text(), 'Apply')]`, {
  //     parentXpath: `${filterXpath}/..`,
  //   });
  //   await waitUntilUrlChanges(d);
  // },

  // parkingIncluded: async (d) => {
  //   const filterID = "numberparkingspots";
  //   const filterXpath = getFilterXpath(filterID);
  //   await ensureFilterIsOpen(filterID, d);
  //   const v = config.search.params.parkingIncluded;
  //   if (v === undefined) {
  //     return;
  //   }
  //   await clickAllByXPath(d, `//label[not(text()='0')]`, {
  //     parentXpath: `${filterXpath}/..`,
  //     afterClick: async () => {
  //       debugLog("Waiting for URL change");
  //       await waitUntilUrlChanges(d);
  //       debugLog("sleeping");
  //       await d.sleep(1000);
  //       debugLog("ensuring filter is open");
  //       await ensureFilterIsOpen(filterID, d);
  //     },
  //   });
  // },
};

export default filterInteractions;
