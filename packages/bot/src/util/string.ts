export const sanitizeString = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

export const abbreviateDuration = (input: string) =>
  input
    .trim()
    .replace(/\s+/g, "")
    .replace(/hour(s)?/gi, "h")
    .replace(/minute(s)?/gi, "m")
    .replace(/min(s)?/gi, "m")
    .replace(/second(s)?/gi, "s")
    .replace(/sec(s)?/gi, "s");

export const readableSeconds = (s: number) => {
  if (s < 60) {
    return `${s}s`;
  }
  const mins = Math.floor(s / 60);
  const secs = s % 60;
  let str = `${mins}m`;
  if (secs > 0) {
    str += `${secs}s`;
  }
  return str;
};

export const maxEmptyLines = (s: string, n: number) =>
  s.replace(new RegExp("\\n{" + Number(n + 2) + ",}", "g"), "\n".repeat(n + 1));

export const aOrAn = (word: string) =>
  "aeiou".includes(word[0]?.toLowerCase() ?? "") ? `an ${word}` : `a ${word}`;

export interface DiscordFormatOptions {
  monospace?: boolean;
  bold?: boolean;
  italic?: boolean;
  code?: boolean | string;
  quote?: boolean;
  link?: string;
  avoidLinkPreviews?: boolean;
  underline?: boolean;
}
export const discordFormat = (s: string, options?: DiscordFormatOptions) => {
  let v =
    options?.code === true
      ? `\`\`\`${s}\`\`\``
      : options?.code
      ? `\`\`\`${options.code}\n${s}\`\`\``
      : options?.monospace
      ? `\`${s}\``
      : s;
  if (options?.link) {
    v = `[${v}](${
      options.avoidLinkPreviews ? `<${options.link}>` : options.link
    })`;
  }
  if (options?.bold) {
    v = `**${v}**`;
  }
  if (options?.italic) {
    v = `*${v}*`;
  }
  if (options?.underline) {
    v = `__${v}__`;
  }
  if (options?.quote) {
    v = `> ${v.replace(/\n/g, "\n> ")}`;
  }
  return v;
};

export const envVarInstruction = (name: string) =>
  `Paste the value into a .env file at the project root like so:\n${name}=_____________`;

export const splitString = (s: string, maxLength: number) => {
  const regex = new RegExp(`[\\s\\S]{1,${maxLength}}`, "g");
  const matches = s.match(regex);
  if (!matches) {
    return [s];
  }
  return matches;
};

export const errToString = (e: unknown) =>
  e instanceof Error ? `${e.stack || `${e.name}: ${e.message}`}` : `${e}`;
