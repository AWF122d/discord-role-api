const express = require("express");
const cors = require("cors");
const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  Events
} = require("discord.js");
require("dotenv").config();

// --------------------------------------
// ENVIRONMENT VARIABLES
// --------------------------------------
const TOKEN = process.env.BOT_TOKEN;
const GUILD_ID = process.env.GUILD_ID;
const CLIENT_ID = process.env.CLIENT_ID;
const DASH_ROLE = process.env.DASH_ROLE; // Role name for dashboard permissions

if (!TOKEN || !GUILD_ID || !CLIENT_ID || !DASH_ROLE) {
  console.error("Missing BOT_TOKEN, GUILD_ID, CLIENT_ID, or DASH_ROLE in environment variables.");
  process.exit(1);
}

// --------------------------------------
// DISCORD CLIENT
// --------------------------------------
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers
  ]
});

// --------------------------------------
// EXPRESS APP
// --------------------------------------
const app = express();
app.use(cors());
app.use(express.json());

// --------------------------------------
// IN-GAME ROLE MAPPING
// --------------------------------------
const SpecialDiscordRoles = {
  "💠 𝓐𝓫𝓼𝓸𝓵𝓾𝓽𝓮 𝓑𝓮𝓲𝓷𝓰 💠": {
    RankText: "Absolute Being",
    ExtraText: "💠 🛠️"
  },
  "⚒️Court Architects": {
    RankText: "Court Architect",
    ExtraText: "🔨"
  }
  // Add more roles here
};

// --------------------------------------
// SLASH COMMANDS
// --------------------------------------
const commands = [
  new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Shows your ping"),

  new SlashCommandBuilder()
    .setName("roles")
    .setDescription("Shows your Discord and in‑game roles"),

  new SlashCommandBuilder()
    .setName("update")
    .setDescription("Update a user's roles")
    .addUserOption(option =>
      option.setName("user")
        .setDescription("User to update")
        .setRequired(true)
    )
].map(cmd => cmd.toJSON());

// --------------------------------------
// REGISTER COMMANDS ON READY
// --------------------------------------
client.once(Events.ClientReady, async () => {
  console.log(`Logged in as ${client.user.tag}`);

  const rest = new REST({ version: "10" }).setToken(TOKEN);

  try {
    console.log("Registering slash commands...");
    await rest.put(
      Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
      { body: commands }
    );
    console.log("Slash commands registered.");
  } catch (err) {
    console.error("Error registering commands:", err);
  }
});

// --------------------------------------
// PERMISSION CHECK
// --------------------------------------
function hasDashPerms(member) {
  return member.roles.cache.some(r => r.name === DASH_ROLE);
}

// --------------------------------------
// HANDLE SLASH COMMANDS
// --------------------------------------
client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand()) return;

  // -------------------------
  // /ping (NO PERMISSIONS)
  // -------------------------
  if (interaction.commandName === "ping") {
    const ping = client.ws.ping;
    return interaction.reply({
      content: `Pong! ${ping}ms`,
      ephemeral: true
    });
  }

  // All other commands require dashboard permissions
  if (!hasDashPerms(interaction.member)) {
    return interaction.reply({
      content: "You do not have dashboard permissions.",
      ephemeral: true
    });
  }

  // -------------------------
  // /roles
  // -------------------------
  if (interaction.commandName === "roles") {
    const member = interaction.member;
    const discordRoles = member.roles.cache.map(r => r.name);

    let ingameRole = "None";

    for (const roleName of discordRoles) {
      if (SpecialDiscordRoles[roleName]) {
        ingameRole =
          `${SpecialDiscordRoles[roleName].RankText} ${SpecialDiscordRoles[roleName].ExtraText}`;
        break;
      }
    }

    return interaction.reply({
      content:
        `**Your Discord Roles:**\n${discordRoles.join(", ")}\n\n` +
        `**Your In‑Game Role:**\n${ingameRole}`,
      ephemeral: true
    });
  }

  // -------------------------
  // /update <user>
  // -------------------------
  if (interaction.commandName === "update") {
    const target = interaction.options.getUser("user");

    const guild = client.guilds.cache.get(GUILD_ID);
    const member = await guild.members.fetch(target.id).catch(() => null);

    if (!member) {
      return interaction.reply({
        content: "User not found in the server.",
        ephemeral: true
      });
    }

    console.log(`Roles refreshed for ${target.id} by ${interaction.user.id}`);

    return interaction.reply({
      content: `Updated roles for <@${target.id}>.`,
      ephemeral: true
    });
  }
});

// --------------------------------------
// API: GET ROLES (Roblox uses this)
// --------------------------------------
app.get("/getroles", async (req, res) => {
  try {
    const discordId = req.query.discordId;

    const guild = client.guilds.cache.get(GUILD_ID);
    if (!guild) return res.json({ roles: [], ingameRole: "None" });

    const member = await guild.members.fetch(discordId).catch(() => null);
    if (!member) return res.json({ roles: [], ingameRole: "None" });

    const discordRoles = member.roles.cache.map(r => r.name);

    let ingameRole = "None";
    for (const roleName of discordRoles) {
      if (SpecialDiscordRoles[roleName]) {
        ingameRole =
          `${SpecialDiscordRoles[roleName].RankText} ${SpecialDiscordRoles[roleName].ExtraText}`;
        break;
      }
    }

    return res.json({
      discordId,
      roles: discordRoles,
      ingameRole
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch roles" });
  }
});

// --------------------------------------
// API ROOT
// --------------------------------------
app.get("/", (req, res) => {
  res.send("Bot API is online");
});

// --------------------------------------
// START API SERVER
// --------------------------------------
app.listen(8080, () => console.log("API running on port 8080"));

// --------------------------------------
// LOGIN BOT
// --------------------------------------
client.login(TOKEN);
