// index.js
const express = require("express");
const fs = require("fs");
const {
  Client,
  GatewayIntentBits,
  Partials,
  EmbedBuilder,
} = require("discord.js");

const app = express();
const PORT = process.env.PORT || 10000;
const TOKEN = process.env.TOKEN;
const GUILD_ID = process.env.GUILD_ID;

if (!TOKEN || !GUILD_ID) {
  console.error("Missing TOKEN or GUILD_ID environment variables.");
  process.exit(1);
}

// storage
const CHOICES_FILE = "choices.json";
let chosenRoles = {};
try {
  if (fs.existsSync(CHOICES_FILE)) {
    chosenRoles = JSON.parse(fs.readFileSync(CHOICES_FILE, "utf8"));
    console.log("Loaded choices.json");
  }
} catch (e) {
  console.error("Failed to load choices.json:", e);
  chosenRoles = {};
}
function saveChoices() {
  try {
    fs.writeFileSync(CHOICES_FILE, JSON.stringify(chosenRoles, null, 2));
    console.log("Saved choices.json");
  } catch (e) {
    console.error("Failed to save choices.json:", e);
  }
}

// client with explicit intents and partials
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages, // REQUIRED for DMs
  ],
  partials: [Partials.Channel, Partials.Message, Partials.User],
});

// roles that can be chosen
const SPECIAL_ROLES = [
  "💠 𝓐𝓫𝓼𝓸𝓵𝓾𝓽𝓮 𝓑𝓮𝓲𝓷𝓰 💠",
  "⚒️Court Architects",
  "⚒️Head of Court Architects",
  "Supreme Executive",
];

client.once("ready", () => {
  console.log(`Bot logged in as ${client.user.tag}`);
});

// universal logger to prove what events arrive
client.on("messageCreate", async (message) => {
  // safe stringify for logs
  const authorTag = message.author ? message.author.tag : "unknown";
  const guildId = message.guild ? message.guild.id : "DM";
  console.log("messageCreate:", { content: message.content, author: authorTag, guild: guildId });

  // ignore other bots
  if (message.author?.bot) return;

  // If it's a DM, handle it
  if (!message.guild) {
    await handleDM(message);
    return;
  }

  // Optional: handle server messages for debugging
  // console.log("Guild message from", authorTag, "in", message.guild.id);
});

// DM handler
async function handleDM(message) {
  try {
    console.log("DM detected from", message.author.tag, ":", message.content);

    const content = (message.content || "").trim().toLowerCase();

    // quick test reply so you can confirm DMs are delivered
    if (content === "ping") {
      await message.reply("pong");
      return;
    }

    if (content !== "!role") {
      await message.reply("Send `!role` to choose your in‑game title. Send `ping` to test DM delivery.");
      return;
    }

    // fetch guild and member
    const guild = await client.guilds.fetch(GUILD_ID).catch(() => null);
    if (!guild) {
      await message.reply("Server not found (GUILD_ID may be wrong).");
      return;
    }

    const member = await guild.members.fetch(message.author.id).catch(() => null);
    if (!member) {
      await message.reply("I couldn't find you in the server.");
      return;
    }

    const userSpecialRoles = member.roles.cache
      .filter((r) => SPECIAL_ROLES.includes(r.name))
      .map((r) => r.name);

    if (userSpecialRoles.length === 0) {
      await message.reply("You don't have any selectable special roles.");
      return;
    }

    const numberEmojis = ["1️⃣","2️⃣","3️⃣","4️⃣","5️⃣","6️⃣","7️⃣","8️⃣"];
    let desc = "Choose your in‑game title by reacting:\n\n";
    userSpecialRoles.forEach((role, i) => {
      desc += `${numberEmojis[i]} ${role}\n`;
    });

    const embed = new EmbedBuilder()
      .setTitle("Choose your in‑game title")
      .setDescription(desc)
      .setColor(0x00aeff);

    const replyMsg = await message.reply({ embeds: [embed] });

    for (let i = 0; i < userSpecialRoles.length && i < numberEmojis.length; i++) {
      await replyMsg.react(numberEmojis[i]);
    }

    const filter = (reaction, user) => numberEmojis.includes(reaction.emoji.name) && user.id === message.author.id;
    const collector = replyMsg.createReactionCollector({ filter, max: 1, time: 60000 });

    collector.on("collect", (reaction) => {
      const index = numberEmojis.indexOf(reaction.emoji.name);
      if (index === -1) return;
      const chosen = userSpecialRoles[index];
      chosenRoles[message.author.id] = chosen;
      saveChoices();
      message.reply(`Your in‑game title is now: **${chosen}**`);
    });

    collector.on("end", (collected) => {
      if (collected.size === 0) {
        message.reply("You didn't choose anything in time.");
      }
    });
  } catch (err) {
    console.error("handleDM error:", err);
    try { await message.reply("Something went wrong while handling your DM."); } catch {}
  }
}

// API endpoint
app.get("/roles", async (req, res) => {
  const userId = req.query.userid;
  if (!userId) return res.json({ roles: [], chosenRole: null });

  try {
    const guild = await client.guilds.fetch(GUILD_ID);
    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member) return res.json({ roles: [], chosenRole: chosenRoles[userId] || null });

    const roles = member.roles.cache.map((r) => r.name);
    return res.json({ roles, chosenRole: chosenRoles[userId] || null });
  } catch (err) {
    console.error("API /roles error:", err);
    return res.json({ roles: [], chosenRole: chosenRoles[userId] || null });
  }
});

app.get("/", (req, res) => res.send("Discord role API is running"));

app.listen(PORT, () => console.log("API listening on port " + PORT));
client.login(TOKEN).catch((e) => {
  console.error("Failed to login:", e);
  process.exit(1);
});
