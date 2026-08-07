/**
 * Parsing for a Marketplace search-result tile.
 *
 * A tile's text is a handful of lines, and how many varies:
 *
 *   CA$75                                  <- price
 *   Alesis DM6 electronic drum set         <- title
 *   Squamish, BC                           <- location
 *
 *   Just listed                            <- badge, sometimes present
 *   CA$250,000
 *   Turnkey fast food restaurant for Sale
 *   Vancouver, BC
 *
 * This used to be read positionally, by replacing the first two newlines with a
 * separator and splitting. A badge line shifted every field by one: the price
 * became the title and the price itself parsed to NaN, which rendered as "Free".
 * So find the price line and work outwards from it instead of trusting position.
 */

const freeLabels = ["free", "gratuit", "gratuite"];

/**
 * A price line looks like `CA$1,500`, `C$1500`, `US$20`, `$35` — or says the item
 * is free. Undefined for anything else, which is how the price line is located.
 */
export const parseTilePrice = (line: string): number | undefined => {
  const trimmed = line.trim();
  if (freeLabels.includes(trimmed.toLowerCase())) {
    return 0;
  }
  const match = trimmed.match(/^[A-Za-z]{0,3}\$\s*([\d.,]+)$/);
  if (!match?.[1]) {
    return undefined;
  }
  const n = parseFloat(match[1].replace(/,/g, ""));
  return Number.isNaN(n) ? undefined : n;
};

export type ParsedTile = {
  price: number | undefined;
  title: string;
  /** Lines before the price, e.g. "Just listed". Kept for logging. */
  badges: string[];
};

export const parseListingTile = (innerText: string): ParsedTile => {
  const lines = innerText
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined) continue;
    const price = parseTilePrice(line);
    if (price !== undefined) {
      return {
        price,
        // the line after the price; the one after that is the location
        title: lines[i + 1] ?? "",
        badges: lines.slice(0, i),
      };
    }
  }

  // No line looked like a price. Rather than mistake another field for one,
  // report no price and take the first line as the title.
  return { price: undefined, title: lines[0] ?? "", badges: [] };
};
