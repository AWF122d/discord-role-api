const express = require("express");
const { Client, GatewayIntentBits } = require("discord.js");

const app = express();
const PORT = process.env.PORT || 10000; // Render sets PORT

// Discord bot client
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers
    ]
});

// Env vars from Render
const TOKEN = process.env.TOKEN;
const GUILD_ID = process.env.GUILD_ID;

client.once("ready", () => {
    console.log(`Bot logged in as ${client.user.tag}`);
});

// API endpoint for Roblox: /roles?userid=DISCORD_USER_ID
app.get("/roles", async (req, res) => {
    const userId = req.query.userid;
    if (!userId) return res.json({ roles: [] });

    try {
        const guild = await client.guilds.fetch(GUILD_ID);
        const member = await guild.members.fetch(userId).catch(() => null);

        if (!member) return res.json({ roles: [] });

        const roles = member.roles.cache.map(r => r.name);
        return res.json({ roles });
    } catch (err) {
        console.error(err);
        return res.json({ roles: [] });
    }
});

// Simple root route (for UptimeRobot)
app.get("/", (req, res) => {
    res.send("Discord role API is running");
});

app.listen(PORT, () => {
    console.log("API listening on port " + PORT);
});

// Login the bot
client.login(TOKEN);
