import { requirePage } from "index.js";
import type { Locator } from "playwright";
import { debugLog, verboseLog } from "util/log.js";
import { tryNTimes, waitSeconds } from "util/misc.js";

export const clearBrowsingData = async () => {
  const page = requirePage();
  await page.context().clearCookies();
  await page.evaluate(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });
};

export const waitUntilUrlChanges = async (compareTo?: string) => {
  const page = requirePage();
  const url = compareTo ?? page.url();
  await page.waitForURL((u) => u.toString() !== url, { timeout: 10 * 1000 });
};

export const type = async (
  element: Locator,
  v: string | number | undefined
) => {
  if (v === undefined) return;
  const str = `${v}`;
  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    if (char === undefined) continue;
    await new Promise((resolve) =>
      setTimeout(
        () => element.pressSequentially(char).then(resolve),
        Math.random() * 200
      )
    );
  }
};

export const manualClear = async (el: Locator) => {
  await el.press("Control+a");
  await el.press("Delete");
};

export const elementShouldBeInteractable = async (
  el: Locator,
  log:
    | { xpath: string; name?: undefined }
    | { xpath?: undefined; name: string }
) => {
  const str = log.xpath ?? log.name;
  debugLog(`Waiting for ${str} to be visible`);
  await el.waitFor({ state: "visible", timeout: 10 * 1000 });
};

export const click = async (element: Locator) => {
  await waitSeconds(Math.random() * 1 + 1);
  await element.click({ delay: Math.random() * 200 });
};

export const elementShouldExist = async (
  method: "xpath" | "css",
  selector: string
) => {
  const page = requirePage();
  const locSelector = method === "xpath" ? `xpath=${selector}` : selector;
  await page.waitForSelector(locSelector, { timeout: 10 * 1000 });
};

export const withElement = <F extends (el: Locator) => any>(
  getEl: () => Locator,
  fn: F
): Promise<ReturnType<F>> => tryNTimes(3, async () => fn(getEl()));

type WithElementsByXpathOptions = {
  noConcurrency?: boolean;
  parent?: Locator;
  parentXpath?: string;
  limit?: number;
};

export const withElementsByXpath = async <T>(
  _selector: string,
  fn: (el: Locator, i: number) => Promise<T>,
  options?: WithElementsByXpathOptions
): Promise<T[]> => {
  const page = requirePage();
  const promises: Promise<T>[] = [];
  const results: T[] = [];

  const selector = `xpath=${(options?.parentXpath ?? "") + _selector}`;
  const loc = options?.parent
    ? options.parent.locator(selector)
    : page.locator(selector);

  const len = await loc.count();
  verboseLog(`withElementsByXpath: ${len} elements found`);

  for (let i = 0; i < Math.min(options?.limit ?? Infinity, len); i++) {
    const getEl = () => loc.nth(i);

    if (options?.noConcurrency) {
      const r = await withElement(getEl, (el) => fn(el, i));
      if (r !== undefined) {
        results.push(r);
      }
    } else {
      promises.push(
        new Promise<T>((resolve) => {
          withElement(getEl, (el) => resolve(fn(el, i)));
        })
      );
    }
  }
  return options?.noConcurrency ? results : Promise.all(promises);
};

export const clickByXPath = async (
  selector: string,
  options?: {
    parent?: Locator;
    parentXpath?: string;
  }
) => {
  const xpath = (options?.parentXpath ?? "") + selector;
  await withElement(
    () =>
      (options?.parent ?? requirePage()).locator(`xpath=${xpath}`),
    async (el) => {
      await elementShouldBeInteractable(el, { xpath });
      await click(el);
    }
  );
};

export const clickAllByXPath = async (
  xpath: string,
  options?: WithElementsByXpathOptions & {
    afterClick?: () => Promise<void>;
  }
) => {
  await withElementsByXpath(
    xpath,
    async (el, i) => {
      await elementShouldBeInteractable(el, {
        name: `${i}th ${xpath}`,
      });
      await click(el);
      await (options?.afterClick?.() ?? Promise.resolve());
    },
    options
  );
};

export const fillInputByLabel = async (
  label: string,
  v: string | number | undefined,
  options?: {
    parentXpath?: string;
  }
) => {
  await withElement(
    () =>
      requirePage().locator(
        `xpath=${
          options?.parentXpath ?? ""
        }//label[contains(text(), "${label}")]/following-sibling::input | //label[contains(text(), "${label}")]/ancestor::label/following-sibling::input`
      ),
    async (el) => {
      await type(el, v);
    }
  );
};

export const withDOMChangesBlocked = async (fn: Function) => {
  const page = requirePage();
  await page.evaluate(`
    window.ogAppendChild = Node.prototype.appendChild;
    window.ogRemoveChild = Node.prototype.removeChild;
    window.ogInsertBefore = Node.prototype.insertBefore;
    Node.prototype.appendChild = function () {};
    Node.prototype.removeChild = function () {};
    Node.prototype.insertBefore = function () {};
  `);

  try {
    await fn();
  } finally {
    await page.evaluate(`
      Node.prototype.appendChild = window.ogAppendChild;
      Node.prototype.removeChild = window.ogRemoveChild;
      Node.prototype.insertBefore = window.ogInsertBefore;
    `);
  }
};

// Playwright has no implicit wait; this wrapper is a passthrough for compatibility.
export const withoutImplicitWait = <T>(fn: () => Promise<T>) => fn();
