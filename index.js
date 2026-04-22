const express = require("express");
const cors = require("cors");
const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, Events } = require("discord.js");
require("dotenv").config();

// --------------------------------------
// ENV CHECK
// --------------------------------------
const TOKEN = process.env.BOT_TOKEN;      // in Render: BOT_TOKEN=...
const GUILD_ID = process.env.GUILD_ID;    // in Render: GUILD_ID=your server id
const CLIENT_ID = process.env.CLIENT_ID;  // in Render: CLIENT_ID=your bot's application id

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
// SIMPLE SLASH COMMANDS DEFINITION
// --------------------------------------
const commands = [
  new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Replies with Pong!"),
  new SlashCommandBuilder()
    .setName("roles")
    .setDescription("Shows your roles")
].map(cmd => cmd.toJSON());

// --------------------------------------
// REGISTER SLASH COMMANDS ON READY
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

  if (interaction.commandName === "ping") {
    return interaction.reply({ content: "Pong!", ephemeral: true });
  }

  if (interaction.commandName === "roles") {
    const member = interaction.member;
    const roles = member.roles.cache.map(r => r.name).join(", ") || "No roles";
    return interaction.reply({ content: `Your roles: ${roles}`, ephemeral: true });
  }
});

// --------------------------------------
// UPDATE USER (placeholder)
// --------------------------------------
app.post("/update", async (req, res) => {
  try {
    const { discordId, username, avatar } = req.body;
    console.log("Updating user:", discordId, username, avatar);
    return res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Update failed" });
  }
});

// --------------------------------------
// GET ROLES FOR USER (API)
// --------------------------------------
app.get("/getroles", async (req, res) => {
  try {
    const discordId = req.query.discordId;

    const guild = client.guilds.cache.get(GUILD_ID);
    if (!guild) return res.json({ roles: [] });

    const member = await guild.members.fetch(discordId).catch(() => null);
    if (!member) return res.json({ roles: [] });

    const roles = member.roles.cache.map(r => r.name);
    return res.json({ discordId, roles });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch roles" });
  }
});

// --------------------------------------
// UPTIMEROBOT PING
// --------------------------------------
app.get("/", (req, res) => {
  res.send("Bot API is online");
});

// --------------------------------------
// START API SERVER
// --------------------------------------
app.listen(8080, () => console.log("API running on port 8080"));

// --------------------------------------
// LOGIN BOT LAST
// --------------------------------------
client.login(TOKEN);
