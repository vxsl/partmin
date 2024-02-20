import { devOptions } from "advanced-config.js";
import { discordGuildID } from "discord/constants.js";
import { existsSync, mkdirSync } from "fs";
import { PetType, StaticUserConfig } from "user-config.js";

export const getDirs = () => {
  const dirPrefix = devOptions?.testing ? "test-" : "";
  const cwd = process.cwd();
  const dirs = {
    data: `${cwd}/.${dirPrefix}data-${discordGuildID}`,
    commonData: `${cwd}/.${dirPrefix}data`,
    puppeteerCache: `${cwd}/.puppeteer`,
  };
  for (const dir of Object.values(dirs)) {
    if (!existsSync(dir)) {
      mkdirSync(dir);
    }
  }
  return dirs;
};

export const getStatusPathForAuditor = () =>
  `${getDirs().data}/discord-bot-status-for-auditor`;
export const chromeVersion = "120.0.6099.109";
export const seleniumImplicitWait = 10 * 1000;

export const searchParamsBlacklist: Omit<
  Record<
    keyof NonNullable<StaticUserConfig["search"]["params"]["exclude"]>,
    (string | RegExp)[]
  >,
  "basements"
> = {
  swaps: ["swap", "echange", "échange"],
  sublets: [
    "sous location",
    "sous-location",
    "sublet",
    "sous-louer",
    "sous-loue",
    "sous-loué",
    "sous louer",
    "sous loue",
    "sous loué",
    new RegExp("for (\\d+) months only"),
    new RegExp("pour (\\d+) mois seulement"),
  ],
  shared: [
    "room in a shared",
    "chambre dans un appartement",
    "chambre dans un logement",
    "roommate",
    "coloc",
    "coloque",
    "colocation",
    "colocataire",
  ],
};

export const petsBlacklist: Omit<
  Record<PetType, (string | RegExp)[]>,
  "other"
> & {
  general: (string | RegExp)[];
} = {
  cat: [
    "pas de chats",
    "no cats",
    "sans chats",
    "chats non acceptés",
    "chats non permis",
    "cats not allowed",
    "no cats",
    "pas de chat",
    "chats non autorisés",
    "aucun chat",
  ],
  dog: [
    "pas de chiens",
    "no dogs",
    "sans chiens",
    "chiens non acceptés",
    "chiens non permis",
    "dogs not allowed",
    "no dogs",
    "pas de chien",
    "chiens non autorisés",
    "aucun chien",
  ],
  general: [
    "pas d'animaux",
    "pas d’animaux",
    "no animals",
    "sans animaux",
    "animaux non acceptés",
    "animaux non permis",
    "animals not allowed",
    "no pets",
    "pas d animaux",
    "animaux non autorisés",
    "aucun animale",
    "aucun animaux",
  ],
};
