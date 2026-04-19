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

// ----------------------
// JSON STORAGE
// ----------------------
const CHOICES_FILE = "choices.json";
let chosenRoles = {};

try {
    if (fs.existsSync(CHOICES_FILE)) {
        chosenRoles = JSON.parse(fs.readFileSync(CHOICES_FILE, "utf8"));
        console.log("Loaded choices.json");
    }
} catch (err) {
    console.error("Failed to load choices.json:", err);
    chosenRoles = {};
}

function saveChoices() {
    try {
        fs.writeFileSync(CHOICES_FILE, JSON.stringify(chosenRoles, null, 2));
        console.log("Saved choices.json");
    } catch (err) {
        console.error("Failed to save choices.json:", err);
    }
}

// ----------------------
// DISCORD CLIENT
// ----------------------
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages, // REQUIRED FOR DMs
    ],
    partials: [
        Partials.Channel, // REQUIRED FOR DMs
        Partials.Message,
        Partials.User
    ],
});

// ----------------------
// SPECIAL ROLES
// ----------------------
const SPECIAL_ROLES = [
    "💠 𝓐𝓫𝓼𝓸𝓵𝓾𝓽𝓮 𝓑𝓮𝓲𝓷𝓰 💠",
    "⚒️Court Architects",
    "⚒️Head of Court Architects",
    "Supreme Executive",
];

// ----------------------
// READY
// ----------------------
client.once("ready", () => {
    console.log(`Bot logged in as ${client.user.tag}`);
});

// ----------------------
// UNIVERSAL MESSAGE LOGGER
// ----------------------
client.on("messageCreate", async (message) => {
    console.log("messageCreate:", {
        content: message.content,
        author: message.author?.tag,
        guild: message.guild ? message.guild.id : "DM"
    });

    if (message.author.bot) return;

    // DM detected
    if (!message.guild) {
        handleDM(message);
    }
});

// ----------------------
// DM HANDLER
// ----------------------
async function handleDM(message) {
    console.log("DM detected from", message.author.tag, ":", message.content);

    const content = message.content.trim().toLowerCase();

    if (content !== "!role") {
        await message.reply("Send `!role` to choose your in‑game title.");
        return;
    }

    try {
        const guild = await client.guilds.fetch(GUILD_ID);
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
        let desc = "Choose your in‑game title:\n\n";

        userSpecialRoles.forEach((role, i) => {
            desc += `${numberEmojis[i]} ${role}\n`;
        });

        const embed = new EmbedBuilder()
            .setTitle("Choose your in‑game title")
            .setDescription(desc)
            .setColor(0x00aeff);

        const msg = await message.reply({ embeds: [embed] });

        for (let i = 0; i < userSpecialRoles.length; i++) {
            await msg.react(numberEmojis[i]);
        }

        const filter = (reaction, user) =>
            numberEmojis.includes(reaction.emoji.name) &&
            user.id === message.author.id;

        const collector = msg.createReactionCollector({ filter, max: 1, time: 60000 });

        collector.on("collect", (reaction) => {
            const index = numberEmojis.indexOf(reaction.emoji.name);
            const chosenRole = userSpecialRoles[index];

            chosenRoles[message.author.id] = chosenRole;
            saveChoices();

            message.reply(`Your in‑game title is now: **${chosenRole}**`);
        });

        collector.on("end", (collected) => {
            if (collected.size === 0) {
                message.reply("You didn't choose anything in time.");
            }
        });

    } catch (err) {
        console.error("DM handler error:", err);
        message.reply("Something went wrong.");
    }
}

// ----------------------
// API ENDPOINT FOR ROBLOX
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
        console.error("API error:", err);
        return res.json({ roles: [], chosenRole: chosenRoles[userId] || null });
    }
});

// ----------------------
// ROOT
// ----------------------
app.get("/", (req, res) => {
    res.send("Discord role API is running");
});

// ----------------------
// START SERVER + BOT
// ----------------------
app.listen(PORT, () => {
    console.log("API listening on port " + PORT);
});

client.login(TOKEN);
