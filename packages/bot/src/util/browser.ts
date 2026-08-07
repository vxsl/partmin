/**
 * Raised when the browser itself needs rebuilding, as opposed to one page load
 * having gone wrong. Platforms throw this when they can tell the difference —
 * every search area failing in a single pass, say — since only the retrieval loop
 * can replace the driver.
 */
export class BrowserRestartRequired extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BrowserRestartRequired";
  }
}

/**
 * Whether an error means the browser is gone and has to be rebuilt.
 *
 * Deliberately narrow. A `waitForSelector` timeout says an element didn't turn
 * up, which is ordinary — Marketplace serves empty result pages — and treating
 * it as a dead browser meant one missing element tore down the driver and
 * restarted the whole retrieval pass.
 */
export const isPlaywrightBrowserError = (e: unknown): boolean =>
  e instanceof BrowserRestartRequired ||
  (e instanceof Error &&
    (e.message.includes("closed") ||
      e.message.includes("Target closed") ||
      e.message.includes("crashed")));
