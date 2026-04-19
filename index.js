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

// ---- JSON storage for chosen roles ----
const CHOICES_FILE = "choices.json";
let chosenRoles = {};

try {
    if (fs.existsSync(CHOICES_FILE)) {
        chosenRoles = JSON.parse(fs.readFileSync(CHOICES_FILE, "utf8"));
    }
} catch (e) {
    console.error("Failed to load choices.json:", e);
    chosenRoles = {};
}

function saveChoices() {
    try {
        fs.writeFileSync(CHOICES_FILE, JSON.stringify(chosenRoles, null, 2));
    } catch (e) {
        console.error("Failed to save choices.json:", e);
    }
}

// ---- Discord client ----
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages,
    ],
    partials: [Partials.Channel],
});

// Special roles that are selectable in DMs
const SPECIAL_ROLES = [
    "💠 𝓐𝓫𝓼𝓸𝓵𝓾𝓽𝓮 𝓑𝓮𝓲𝓷𝓰 💠",
    "⚒️Court Architects",
];

client.once("ready", () => {
    console.log(`Bot logged in as ${client.user.tag}`);
});

// DM command: !role
client.on("messageCreate", async (message) => {
    if (message.author.bot) return;
    if (message.guild) return; // only DMs

    const content = message.content.trim().toLowerCase();
    if (content !== "!role") return;

    try {
        const guild = await client.guilds.fetch(GUILD_ID);
        const member = await guild.members.fetch(message.author.id).catch(() => null);

        if (!member) {
            await message.reply("I couldn't find you in the server.");
            return;
        }

        // Find which special roles this user has
        const userSpecialRoles = member.roles.cache
            .filter((r) => SPECIAL_ROLES.includes(r.name))
            .map((r) => r.name);

        if (userSpecialRoles.length === 0) {
            await message.reply("You don't have any selectable special roles.");
            return;
        }

        // Build embed
        let desc = "Choose your in-game title by reacting:\n\n";
        const numberEmojis = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", ];

        userSpecialRoles.forEach((roleName, i) => {
            desc += `${numberEmojis[i]} ${roleName}\n`;
        });

        const embed = new EmbedBuilder()
            .setTitle("Choose your in-game title")
            .setDescription(desc)
            .setColor(0x00aeff);

        const msg = await message.reply({ embeds: [embed] });

        // React with numbers
        for (let i = 0; i < userSpecialRoles.length && i < numberEmojis.length; i++) {
            await msg.react(numberEmojis[i]);
        }

        const filter = (reaction, user) =>
            numberEmojis.includes(reaction.emoji.name) &&
            user.id === message.author.id;

        const collector = msg.createReactionCollector({
            filter,
            max: 1,
            time: 60000,
        });

        collector.on("collect", (reaction) => {
            const index = numberEmojis.indexOf(reaction.emoji.name);
            if (index === -1) return;

            const chosenRoleName = userSpecialRoles[index];
            chosenRoles[message.author.id] = chosenRoleName;
            saveChoices();

            message.reply(
                `Got it. Your in-game title will use: **${chosenRoleName}**`
            );
        });

        collector.on("end", (collected) => {
            if (collected.size === 0) {
                message.reply("You didn't choose anything in time.");
            }
        });
    } catch (err) {
        console.error(err);
        await message.reply("Something went wrong while processing your roles.");
    }
});

// API endpoint for Roblox
// GET /roles?userid=DISCORD_USER_ID
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
        console.error(err);
        return res.json({ roles: [], chosenRole: chosenRoles[userId] || null });
    }
});

// Root
app.get("/", (req, res) => {
    res.send("Discord role API is running");
});

app.listen(PORT, () => {
    console.log("API listening on port " + PORT);
});

client.login(TOKEN);
