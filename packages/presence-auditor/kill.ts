import * as Discord from "discord.js";
import dotenv from "dotenv-mono";
import { writeFileSync } from "fs";

process.title = "partmin-presence-auditor-kill";

dotenv.load();

const statusPath = process.argv[2];
if (!statusPath) {
  throw new Error("No status path provided");
}

const token = process.env.DISCORD_BOT_TOKEN;
if (!token) {
  throw new Error("No DISCORD_BOT_TOKEN environment variable provided");
}

const log = (s: string) => console.log(`[presence-auditor] ${s}`);
(() => {
  log("Bot is no longer running - clearing presence.");
  const c = new Discord.Client({ intents: 0 });
  log("Logging in...");
  c.login(token);
  c.on("ready", (c) => {
    const p: Discord.PresenceData = {
      status: "invisible",
      activities: null,
      afk: true,
    };
    log(`Logged in. Setting presence to ${JSON.stringify(p)}`);
    c.user.setPresence(p);
    log("Done. Logging out...");
    c.destroy().then(() => {
      writeFileSync(statusPath, "logged-out");
      log("Exiting");
      process.exit();
    });
  });
})();
