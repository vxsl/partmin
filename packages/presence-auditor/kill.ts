import * as Discord from "discord.js";
import dotenv from "dotenv-mono";

process.title = "partmin-presence-auditor-kill";

dotenv.load();
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
      log("Exiting");
      process.exit();
    });
  });
})();
