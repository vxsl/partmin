import * as Discord from "discord.js";
import { existsSync, readFileSync, writeFileSync } from "fs";

process.title = "partmin-presence-auditor-cleanup";

const statusPath = process.argv[2];
if (!statusPath) {
  throw new Error("No status path provided");
}

const botPath = "packages/bot";
const persistencePath = `${botPath}/.data`;

const paths = {
  serverID: `${persistencePath}/discord-server-id`,
  token: `${persistencePath}/discord-bot-token`,
  guildInfo: `${persistencePath}/discord-guild-info.json`,
};

const values = Object.fromEntries(
  Object.entries(paths).map(([k, v]) => {
    if (!existsSync(v)) {
      throw new Error(`Missing required file: ${v}`);
    }
    return [
      k,
      v.endsWith(".json")
        ? JSON.parse(readFileSync(v, "utf-8"))
        : readFileSync(v, "utf-8"),
    ];
  })
);

const prefix = "[presence-auditor]";
const log = (s: string) => console.log(`${prefix} ${s}`);
const error = (s: string) => console.error(`${prefix} ${s}`);

const crashMessage =
  "Partmin has gone offline for an unknown reason. Please check the logs for more information.";

(() => {
  log("Bot is no longer running - clearing presence.");
  const c = new Discord.Client({ intents: 0 });
  log("Logging in...");
  c.login(values.token);
  c.on("ready", async (c) => {
    const p: Discord.PresenceData = {
      status: "invisible",
      activities: null,
      afk: true,
    };
    log(`Logged in.`);

    const guild = c.guilds.cache.get(values.serverID);
    if (!guild) {
      throw new Error("Could not find guild");
    }

    for (const [k, v] of Object.entries(values.guildInfo.channelIDs)) {
      if (!v) {
        error(`Missing channel ID for ${k}`);
        continue;
      }
      const channel = await guild.channels.fetch(v as string);
      if (!channel || !channel.isTextBased()) {
        error(`Could not find channel for ${k}`);
        continue;
      }

      const messages = await channel.messages.fetch({ limit: 100 });
      const lastCrash = messages.find((m) =>
        m.embeds.some(
          (e) =>
            e.title?.toLowerCase().includes("crash") ||
            e.description?.toLowerCase().includes("crash")
        )
      );
      if (
        !lastCrash ||
        lastCrash.embeds[0].description === crashMessage ||
        Date.now() - lastCrash.createdTimestamp > 1000 * 60 * 5
      ) {
        log(
          `No crash message found in ${channel.name}. Sending crash message to logs channel.`
        );
        await channel.send({
          embeds: [
            {
              color: 0xff0000,
              title: "Crash detected",
              description: crashMessage,
            },
          ],
        });
      }
    }

    log(`Setting presence to ${JSON.stringify(p)}`);
    c.user.setPresence(p);

    log("Done. Logging out...");
    c.destroy().then(() => {
      writeFileSync(statusPath, "logged-out");
      log("Exiting");
      process.exit();
    });
  });
})();
