const express = require("express");
const cors = require("cors");
const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  Events,
  PermissionFlagsBits
} = require("discord.js");
require("dotenv").config();

// --------------------------------------
// ENVIRONMENT VARIABLES
// --------------------------------------
const TOKEN = process.env.BOT_TOKEN;
const GUILD_ID = process.env.GUILD_ID;
const CLIENT_ID = process.env.CLIENT_ID;

if (!TOKEN || !GUILD_ID || !CLIENT_ID) {
  console.error("Missing BOT_TOKEN, GUILD_ID or CLIENT_ID in environment variables.");
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
    .setDescription("Shows your Discord and in-game roles"),

  new SlashCommandBuilder()
    .setName("update")
    .setDescription("Update another user's data (dashboard perms only)")
    .addUserOption(option =>
      option.setName("user")
        .setDescription("User to update")
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName("field")
        .setDescription("Field to update")
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName("value")
        .setDescription("New value")
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
// HANDLE SLASH COMMANDS
// --------------------------------------
client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand()) return;

  // -------------------------
  // /ping
  // -------------------------
  if (interaction.commandName === "ping") {
    const ping = client.ws.ping;
    return interaction.reply({
      content: `Pong! ${ping}ms`,
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
  // /update (dashboard perms only)
  // -------------------------
  if (interaction.commandName === "update") {
    const allowedRole = "Dashboard Admin"; // CHANGE THIS to your dashboard admin role

    if (!interaction.member.roles.cache.some(r => r.name === allowedRole)) {
      return interaction.reply({
        content: "You do not have permission to use /update.",
        ephemeral: true
      });
    }

    const target = interaction.options.getUser("user");
    const field = interaction.options.getString("field");
    const value = interaction.options.getString("value");

    console.log(`Dashboard update by ${interaction.user.id}: ${field} -> ${value} for ${target.id}`);

    return interaction.reply({
      content: `Updated **${field}** for <@${target.id}> to: **${value}**`,
      ephemeral: true
    });
  }
});

// --------------------------------------
// API: GET ROLES
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
