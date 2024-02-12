import * as Discord from "discord.js";
import { existsSync, readFileSync, writeFileSync } from "fs";

process.title = "partmin-presence-auditor-cleanup";

const statusPath = process.argv[2];
if (!statusPath) {
  throw new Error("No status path provided");
}

const botPath = "../bot";
const cachePath = `${botPath}/.data`;

const paths = {
  serverID: `${cachePath}/discord-server-id`,
  token: `${cachePath}/discord-bot-token`,
  guildInfo: `${cachePath}/discord-guild-info.json`,
};

const values = Object.fromEntries(
  Object.entries(paths).map(([k, v]) => {
    if (!existsSync(v)) {
      throw new Error(`Missing required file: ${v}`);
    }
    return [k, readFileSync(v, "utf-8")];
  })
);

const log = (s: string) => console.log(`[presence-auditor] ${s}`);
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
    log(`Logged in. Setting presence to ${JSON.stringify(p)}`);

    c.user.setPresence(p);

    const guild = c.guilds.cache.get(values.serverID);
    if (!guild) {
      throw new Error("Could not find guild");
    }

    for (const [k, v] of Object.entries(values.channelIDs)) {
      if (!v) {
        console.error(`Missing channel ID for ${k}`);
        continue;
      }
      const channel = guild.channels.cache.get(v);
      if (!channel || !channel.isTextBased()) {
        console.error(`Could not find channel for ${k}`);
        continue;
      }

      const messages = await channel.messages.fetch({ limit: 100 });
      const lastCrash = messages.find((m) =>
        m.content.toLowerCase().includes("crash")
      );

      if (
        !lastCrash ||
        Date.now() - lastCrash.createdTimestamp < 1000 * 60 * 5
      ) {
        log(
          `No crash message found in ${channel.name}. Sending crash message to logs channel.`
        );
        await channel.send({
          embeds: [
            {
              color: 0xff0000,
              title: "Crash detected",
              description:
                "Partmin has crashed for an unknown reason. Please check the logs for more information.",
            },
          ],
        });
      }
    }

    log("Done. Logging out...");
    c.destroy().then(() => {
      writeFileSync(statusPath, "logged-out");
      log("Exiting");
      process.exit();
    });
  });
})();
