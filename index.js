const express = require("express");
const app = express();
const cors = require("cors");
const { Client, GatewayIntentBits } = require("discord.js");
require("dotenv").config();

// --------------------------------------
// CREATE THE CLIENT FIRST
// --------------------------------------
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers
  ]
});

// --------------------------------------
// MIDDLEWARE
// --------------------------------------
app.use(cors());
app.use(express.json());

// --------------------------------------
// UPDATE USER (username, avatar)
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
// GET ROLES FOR USER
// --------------------------------------
app.get("/getroles", async (req, res) => {
  try {
    const discordId = req.query.discordId;

    const guild = client.guilds.cache.get("YOUR_MAIN_SERVER_ID");
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
client.login(process.env.TOKEN);
