import * as Discord from "discord.js";
import { writeFileSync } from "fs";
import dotenv from "dotenv-mono";

dotenv.load();

process.title = "partmin-presence-auditor-cleanup";

const statusPath = process.argv[2];
if (!statusPath) {
  throw new Error("No status path provided");
}

// Define paths explicitly, matching those used in persistent.ts
const botDataDir = "packages/bot/.data"; // Base directory assumed from persistent.ts paths
const tokenPath = `${botDataDir}/bot-token`;
const channelIDsPath = `${botDataDir}/channel-ids.json`;

const prefix = "[presence-auditor]";
const log = (s: string) => console.log(`${prefix} ${s}`);
const error = (s: string) => console.error(`${prefix} ${s}`);

const crashMessage =
  "partmin has gone offline for an unknown reason. Please check the logs for more information.";

async function runCleanup() {
  log("Bot is no longer running - clearing presence.");

  let token: string;
  let serverID: string;
  let channelIDs: Record<string, string>;

  try {
    // Read server ID from environment variable
    serverID = process.env.DISCORD_SERVER_ID ?? "";
    if (!serverID) {
      throw new Error("Environment variable DISCORD_SERVER_ID is not set.");
    }

    // Read token from file
    // Re-import existsSync and readFileSync just for these files
    const { existsSync, readFileSync } = await import("fs");
    if (!existsSync(tokenPath))
      throw new Error(`Missing bot token file: ${tokenPath}`);
    token = readFileSync(tokenPath, "utf-8").trim();

    // Read channel IDs from file
    if (!existsSync(channelIDsPath))
      throw new Error(`Missing channel IDs file: ${channelIDsPath}`);
    const channelIDsRaw = readFileSync(channelIDsPath, "utf-8");
    channelIDs = JSON.parse(channelIDsRaw);

    // Basic validation after parsing
    if (typeof channelIDs !== "object" || channelIDs === null) {
      throw new Error("Channel IDs file does not contain a valid JSON object.");
    }
    for (const value of Object.values(channelIDs)) {
      if (typeof value !== "string") {
        throw new Error("Channel IDs file contains non-string values.");
      }
    }
  } catch (err) {
    // Log the specific error encountered during file reading/parsing or env var check
    error(
      `Failed to load configuration data: ${
        err instanceof Error ? err.message : err
      }`
    );
    process.exit(1);
  }

  const c = new Discord.Client({ intents: 0 });
  log("Logging in...");

  try {
    await c.login(token);
  } catch (err) {
    error(`Failed to log in: ${err}`);
    process.exit(1);
  }

  c.on("ready", async (readyClient) => {
    log(`Logged in as ${readyClient.user.tag}.`);

    const p: Discord.PresenceData = {
      status: "invisible",
      activities: [],
      afk: true,
    };

    // Guild lookup now uses serverID from env var
    const guild = readyClient.guilds.cache.get(serverID);
    if (!guild) {
      error(`Could not find guild with ID: ${serverID}`);
      try {
        readyClient.user.setPresence(p);
        log(`Set presence to ${JSON.stringify(p)}`);
      } catch (presenceError) {
        error(`Failed to set presence: ${presenceError}`);
      }
      await readyClient.destroy();
      writeFileSync(statusPath, "logged-out-no-guild");
      log("Exiting");
      process.exit(1);
    }

    log(`Found guild: ${guild.name}`);

    for (const [k, v] of Object.entries(channelIDs)) {
      if (!v) {
        error(`Missing channel ID for ${k}`);
        continue;
      }
      try {
        const channel = await guild.channels.fetch(v);
        if (!channel || !channel.isTextBased()) {
          error(`Could not find text channel for ${k} (ID: ${v})`);
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
          lastCrash.embeds[0]?.description === crashMessage ||
          Date.now() - lastCrash.createdTimestamp > 1000 * 60 * 5
        ) {
          log(
            `No recent unique crash message found in ${channel.name}. Sending crash message.`
          );
          await channel.send({
            embeds: [
              new Discord.EmbedBuilder()
                .setColor(0xff0000)
                .setTitle("Crash detected")
                .setDescription(crashMessage)
                .setTimestamp(),
            ],
          });
        } else {
          log(
            `Recent crash message already exists in ${channel.name}. Skipping.`
          );
        }
      } catch (channelError) {
        error(`Error processing channel ${k} (ID: ${v}): ${channelError}`);
      }
    }

    log(`Setting presence to ${JSON.stringify(p)}`);
    try {
      readyClient.user.setPresence(p);
    } catch (presenceError) {
      error(`Failed to set presence: ${presenceError}`);
    }

    log("Done. Logging out...");
    await readyClient.destroy();
    writeFileSync(statusPath, "logged-out");
    log("Exiting");
    process.exit(0);
  });

  c.on("error", (err) => {
    error(`Discord client error: ${err}`);
    if (c.readyTimestamp) {
      c.destroy().finally(() => {
        writeFileSync(statusPath, "error-exit");
        process.exit(1);
      });
    } else {
      writeFileSync(statusPath, "error-exit");
      process.exit(1);
    }
  });
}

runCleanup().catch((err) => {
  error(`Unhandled error during cleanup: ${err}`);
  writeFileSync(statusPath, "error-exit");
  process.exit(1);
});
