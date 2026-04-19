// index.js
const fs = require("fs");
const express = require("express");
const {
  Client,
  GatewayIntentBits,
  Partials,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  REST,
  Routes,
} = require("discord.js");

const app = express();
const PORT = process.env.PORT || 10000;

const TOKEN = process.env.TOKEN;
const GUILD_ID = process.env.GUILD_ID || "1488166906979680358"; // default from your request
const LOG_CHANNEL_ID = process.env.LOG_CHANNEL_ID || "1495159636444315728"; // default from your request
const CLIENT_ID = process.env.CLIENT_ID; // optional; used for command registration if provided

if (!TOKEN) {
  console.error("Missing TOKEN environment variable.");
  process.exit(1);
}

// ----------------------
// storage
// ----------------------
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

// ----------------------
// config: roles & emojis
// ----------------------
const SPECIAL_ROLES = [
  "💠 𝓐𝓫𝓼𝓸𝓵𝓾𝓽𝓮 𝓑𝓮𝓲𝓷𝓰 💠",
  "⚒️Court Architects",
  "⚒️Head of Court Architects",
  "Supreme Executive",
];

const NUMBER_EMOJIS = ["1️⃣","2️⃣","3️⃣","4️⃣","5️⃣","6️⃣","7️⃣","8️⃣"];

// ----------------------
// discord client
// ----------------------
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ],
  partials: [Partials.Channel, Partials.Message, Partials.User],
});

client.once("ready", async () => {
  console.log(`Bot logged in as ${client.user.tag}`);

  // Register guild command (idempotent)
  try {
    const rest = new REST({ version: "10" }).setToken(TOKEN);
    const appId = CLIENT_ID || client.user.id;
    const commands = [
      {
        name: "role",
        description: "Choose your in-game title (ephemeral)",
      },
    ];
    await rest.put(
      Routes.applicationGuildCommands(appId, GUILD_ID),
      { body: commands }
    );
    console.log("Registered /role command to guild", GUILD_ID);
  } catch (err) {
    console.error("Failed to register command:", err);
  }
});

// ----------------------
// interaction handling
// ----------------------
client.on("interactionCreate", async (interaction) => {
  try {
    // Slash command: /role
    if (interaction.isChatInputCommand() && interaction.commandName === "role") {
      // Ensure invoked in the target guild
      if (!interaction.guild || interaction.guild.id !== GUILD_ID) {
        await interaction.reply({ content: "This command is only available in the server.", ephemeral: true });
        return;
      }

      // Fetch member
      const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
      if (!member) {
        await interaction.reply({ content: "I couldn't find you in the server.", ephemeral: true });
        return;
      }

      // Filter roles the user actually has
      const userSpecialRoles = member.roles.cache
        .filter((r) => SPECIAL_ROLES.includes(r.name))
        .map((r) => r.name);

      if (userSpecialRoles.length === 0) {
        await interaction.reply({ content: "You don't have any selectable special roles.", ephemeral: true });
        return;
      }

      // Build buttons (one per available role, up to emoji list length)
      const row = new ActionRowBuilder();
      for (let i = 0; i < userSpecialRoles.length && i < NUMBER_EMOJIS.length; i++) {
        const btn = new ButtonBuilder()
          .setCustomId(`role_${i}_${interaction.user.id}`) // include user id to scope
          .setLabel(userSpecialRoles[i].slice(0, 80)) // label length safe-guard
          .setStyle(ButtonStyle.Primary);
        row.addComponents(btn);
      }

      // Build ephemeral embed (visible only to the invoking user)
      const desc = userSpecialRoles.map((r, i) => `${NUMBER_EMOJIS[i]} ${r}`).join("\n");
      const embed = new EmbedBuilder()
        .setTitle("Choose your in‑game title")
        .setDescription(desc + `\n\n*xFranki_ee's systems*`) // italic note in description
        .setColor(0x00aeff);

      await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
      return;
    }

    // Button interaction for role selection
    if (interaction.isButton() && interaction.customId.startsWith("role_")) {
      // customId format: role_{index}_{userId}
      const parts = interaction.customId.split("_");
      const index = parseInt(parts[1], 10);
      const ownerId = parts[2];

      // Only allow the original user to press their buttons
      if (interaction.user.id !== ownerId) {
        await interaction.reply({ content: "Only the user who ran the command can choose here.", ephemeral: true });
        return;
      }

      // Fetch guild and member
      const guild = client.guilds.cache.get(GUILD_ID) || await client.guilds.fetch(GUILD_ID).catch(() => null);
      if (!guild) {
        await interaction.reply({ content: "Server not available.", ephemeral: true });
        return;
      }
      const member = await guild.members.fetch(interaction.user.id).catch(() => null);
      if (!member) {
        await interaction.reply({ content: "I couldn't find you in the server.", ephemeral: true });
        return;
      }

      // Recompute available roles for the user (defensive)
      const userSpecialRoles = member.roles.cache
        .filter((r) => SPECIAL_ROLES.includes(r.name))
        .map((r) => r.name);

      if (index < 0 || index >= userSpecialRoles.length) {
        await interaction.reply({ content: "Invalid selection.", ephemeral: true });
        return;
      }

      const chosen = userSpecialRoles[index];
      chosenRoles[interaction.user.id] = chosen;
      saveChoices();

      // Acknowledge to the user (ephemeral)
      await interaction.update({ content: `Got it. Your in‑game title will use: **${chosen}**`, embeds: [], components: [] });

      // Log to the specified channel in the server (public)
      try {
        const logChannel = await guild.channels.fetch(LOG_CHANNEL_ID).catch(() => null);
        if (logChannel && logChannel.isTextBased()) {
          const logEmbed = new EmbedBuilder()
            .setTitle("Role choice recorded")
            .setDescription(`**User:** <@${interaction.user.id}>\n**Chosen title:** ${chosen}\n**Source:** /role (ephemeral)`)
            .setColor(0x2bff7a)
            .setTimestamp()
            .setFooter({ text: "xFranki_ee's systems" }); // footer is small by design

          await logChannel.send({ embeds: [logEmbed] });
        } else {
          console.warn("Log channel not found or not text-based:", LOG_CHANNEL_ID);
        }
      } catch (err) {
        console.error("Failed to send log embed:", err);
      }

      return;
    }
  } catch (err) {
    console.error("interactionCreate error:", err);
    try {
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content: "An error occurred.", ephemeral: true });
      } else {
        await interaction.reply({ content: "An error occurred.", ephemeral: true });
      }
    } catch {}
  }
});

// ----------------------
// API endpoint for Roblox (unchanged)
// ----------------------
app.get("/roles", async (req, res) => {
  const userId = req.query.userid;
  if (!userId) return res.json({ roles: [], chosenRole: null });

  try {
    const guild = await client.guilds.fetch(GUILD_ID);
    const member = await guild.members.fetch(userId).catch(() => null);

    if (!member) {
      return res.json({ roles: [], chosenRole: chosenRoles[userId] || null });
    }

    const roles = member.roles.cache.map((r) => r.name);
    const chosenRole = chosenRoles[userId] || null;

    return res.json({ roles, chosenRole });
  } catch (err) {
    console.error("Error in /roles endpoint:", err);
    return res.json({ roles: [], chosenRole: chosenRoles[userId] || null });
  }
});

app.get("/", (req, res) => res.send("Discord role API is running"));

app.listen(PORT, () => console.log("API listening on port " + PORT));

client.login(TOKEN).catch((e) => {
  console.error("Failed to login:", e);
  process.exit(1);
});
