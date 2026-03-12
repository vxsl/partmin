import { requirePage } from "index.js";
import filterInteractions, {
  FilterDef,
  FilterInteractionsMap,
  doFilter,
} from "platforms/kijiji/filter-interactions.js";
import { debugLog } from "util/log.js";
import { isPlainObject, waitSeconds } from "util/misc.js";
import {
  click,
  elementShouldBeInteractable,
  withElement,
  withoutImplicitWait,
} from "util/selenium.js";

export const kijijiGet = async (url: string) => {
  const page = requirePage();
  await page.goto(url);
  const xpath = "//button[contains(@class, 'cookieBannerCloseButton')]";

  await withoutImplicitWait(async () => {
    try {
      await page
        .waitForSelector(`xpath=${xpath}`, { timeout: 1000 })
        .then(() => click(page.locator(`xpath=${xpath}`)))
        .then(() => {
          debugLog("Dismissed kijiji cookie banner");
        });
    } catch {}
  });
};

export const getFilterXpath = (id: string) =>
  `//div[@id="accordion__panel-${id}"]`;

export const ensureFilterIsOpen = async (id: string) => {
  const page = requirePage();
  const xpath = `${getFilterXpath(id)}/..`;
  debugLog(`Ensuring filter ${id} is open`);
  await withElement(
    () => page.locator(`xpath=${xpath}`),
    async (el) => {
      debugLog(`Ensuring filter ${id} is interactable`);
      await elementShouldBeInteractable(el, { xpath });
      debugLog(`Checking whether ${id} is already expanded`);
      const expanded = await el.getAttribute("aria-expanded");
      if (!expanded) {
        debugLog(`Expanding ${id}`);
        await click(el);
        await waitSeconds(1);
      }
    }
  );
};

export const setFilters = async () => {
  const interactWithFilters = async (obj: {
    [k: string]: FilterDef<any> | Object;
  }) => {
    for (const [k, v] of Object.entries(obj)) {
      if (v instanceof FilterDef) {
        debugLog(`Applying Kijiji filter ${k}`);
        await waitSeconds(1);
        await doFilter(v);
      } else if (isPlainObject(v)) {
        await interactWithFilters(v as FilterInteractionsMap);
      }
    }
  };

  await interactWithFilters(filterInteractions);
};
