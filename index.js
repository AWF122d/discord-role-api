// --------------------------------------
// IMPORTS
// --------------------------------------
const express = require("express");
const cors = require("cors");
const fetch = require("node-fetch");
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
const DASH_ROLE = process.env.DASH_ROLE;

if (!TOKEN || !GUILD_ID || !CLIENT_ID || !DASH_ROLE) {
  console.error("Missing BOT_TOKEN, GUILD_ID, CLIENT_ID, or DASH_ROLE");
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
// RANK SYSTEM
// --------------------------------------
const RANKS = [
  "Supreme Executive",
  "Ranker",
  "Supreme Court Chief Justice",
  "Exam Coordinator",
  "Exam Officer",
  "Court Overseer",
  "Court Executor General",
  "Judge",
  "Magistrate",
  "Prosecutor",
  "Defense Attorney",
  "Public Defender",
  "Clerk of Court",
  "Bailiff",
  "Court Interpreter",
  "Stenographer",
  "Co-Counsel",
  "Law Student",
  "Citizen"
];

const UNASSIGNABLE_RANKS = new Set([
  "Supreme Executive",
  "Ranker"
]);

function getHighestRankName(member) {
  const names = member.roles.cache.map(r => r.name);
  let best = null;
  let bestIndex = Infinity;

  for (const name of names) {
    const idx = RANKS.indexOf(name);
    if (idx !== -1 && idx < bestIndex) {
      bestIndex = idx;
      best = name;
    }
  }
  return best;
}

function canExecutorAffectTarget(executor, target) {
  const execRank = getHighestRankName(executor);
  const targetRank = getHighestRankName(target);

  if (!execRank) return false;
  if (!targetRank) return true;

  const execIndex = RANKS.indexOf(execRank);
  const targetIndex = RANKS.indexOf(targetRank);

  return execIndex < targetIndex;
}

async function setUserRank(guild, userId, newRank) {
  const member = await guild.members.fetch(userId).catch(() => null);
  if (!member) throw new Error("User not found");

  const rankRoles = member.roles.cache.filter(r => RANKS.includes(r.name));
  if (rankRoles.size > 0) await member.roles.remove(rankRoles);

  const roleToAdd = guild.roles.cache.find(r => r.name === newRank);
  if (!roleToAdd) throw new Error("Rank role not found");

  await member.roles.add(roleToAdd);
  return member;
}

// --------------------------------------
// LOG SYSTEM (TEMP MEMORY)
// --------------------------------------
let logs = [];
let logIdCounter = 1;

function addLog(entry) {
  const log = {
    id: logIdCounter++,
    timestamp: new Date().toISOString(),
    reverted: false,
    ...entry
  };
  logs.push(log);
  return log;
}

// --------------------------------------
// SLASH COMMANDS
// --------------------------------------
const commands = [
  new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Shows your ping"),

  new SlashCommandBuilder()
    .setName("getroles")
    .setDescription("Shows your roles"),

  new SlashCommandBuilder()
    .setName("update")
    .setDescription("Update a user's roles")
    .addUserOption(opt =>
      opt.setName("user")
        .setDescription("User to update")
        .setRequired(true)
    )
].map(c => c.toJSON());

// --------------------------------------
// REGISTER SLASH COMMANDS
// --------------------------------------
client.once(Events.ClientReady, async () => {
  console.log(`Logged in as ${client.user.tag}`);

  const rest = new REST({ version: "10" }).setToken(TOKEN);

  try {
    await rest.put(
      Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
      { body: commands }
    );
    console.log("Slash commands registered.");
  } catch (err) {
    console.error(err);
  }
});

// --------------------------------------
// PERMISSION CHECK
// --------------------------------------
function hasDashPerms(member) {
  return member.roles.cache.some(r => r.name === DASH_ROLE);
}

// --------------------------------------
// SLASH COMMAND HANDLER
// --------------------------------------
client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === "ping") {
    return interaction.reply({
      content: `Pong! ${client.ws.ping}ms`,
      ephemeral: true
    });
  }

  if (interaction.commandName === "getroles") {
    const guild = client.guilds.cache.get(GUILD_ID);
    const member = await guild.members.fetch(interaction.user.id);

    const rank = getHighestRankName(member) || "None";

    return interaction.reply({
      content: `Your highest rank: **${rank}**`,
      ephemeral: true
    });
  }

  if (!hasDashPerms(interaction.member)) {
    return interaction.reply({
      content: "You do not have dashboard permissions.",
      ephemeral: true
    });
  }

  if (interaction.commandName === "update") {
    const target = interaction.options.getUser("user");

    return interaction.reply({
      content: `Updated roles for <@${target.id}>.`,
      ephemeral: true
    });
  }
});

// --------------------------------------
// API: SEARCH ROBLOX USER (USERNAME OR DISPLAY NAME)
// --------------------------------------
app.get("/searchRoblox", async (req, res) => {
  const { query } = req.query;
  if (!query) return res.status(400).json({ error: "Missing query" });

  try {
    const response = await fetch(
      `https://users.roblox.com/v1/users/search?keyword=${encodeURIComponent(query)}&limit=10`
    );

    const data = await response.json();

    if (!data.data || data.data.length === 0) {
      return res.status(404).json({ error: "No matching users found" });
    }

    res.json({
      results: data.data.map(u => ({
        id: u.id,
        name: u.name,
        displayName: u.displayName
      }))
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Roblox search failed" });
  }
});

// --------------------------------------
// API: SEARCH DISCORD USER
// --------------------------------------
app.get("/searchUser", async (req, res) => {
  try {
    const { discordId } = req.query;
    if (!discordId) return res.status(400).json({ error: "discordId required" });

    const guild = client.guilds.cache.get(GUILD_ID);
    const member = await guild.members.fetch(discordId).catch(() => null);
    if (!member) return res.status(404).json({ error: "User not found" });

    const highestRank = getHighestRankName(member);
    const userLogs = logs.filter(l => l.targetId === discordId);

    res.json({
      discordId,
      username: member.user.username,
      displayName: member.displayName,
      avatar: member.user.displayAvatarURL({ size: 256 }),
      highestRank,
      roles: member.roles.cache.map(r => r.name),
      logs: userLogs
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to search user" });
  }
});

// --------------------------------------
// API: RANK USER
// --------------------------------------
app.post("/rankUser", async (req, res) => {
  try {
    const { executorId, targetId, newRank } = req.body;

    if (!executorId || !targetId || !newRank)
      return res.status(400).json({ error: "Missing fields" });

    if (!RANKS.includes(newRank))
      return res.status(400).json({ error: "Invalid rank" });

    if (UNASSIGNABLE_RANKS.has(newRank))
      return res.status(403).json({ error: "Rank cannot be assigned" });

    const guild = client.guilds.cache.get(GUILD_ID);
    const executor = await guild.members.fetch(executorId);
    const target = await guild.members.fetch(targetId);

    if (!hasDashPerms(executor))
      return res.status(403).json({ error: "No dashboard permissions" });

    if (!canExecutorAffectTarget(executor, target))
      return res.status(403).json({ error: "Cannot modify this user" });

    const oldRank = getHighestRankName(target);

    await setUserRank(guild, targetId, newRank);

    const log = addLog({
      type: "rank",
      executorId,
      targetId,
      oldRank: oldRank || "None",
      newRank
    });

    res.json({ success: true, log });
  } catch (err) {
    res.status(500).json({ error: "Failed to rank user" });
  }
});

// --------------------------------------
// API: PUNISH USER
// --------------------------------------
app.post("/punishUser", async (req, res) => {
  try {
    const { executorId, targetId, action, reason } = req.body;

    if (!executorId || !targetId || !action)
      return res.status(400).json({ error: "Missing fields" });

    const guild = client.guilds.cache.get(GUILD_ID);
    const executor = await guild.members.fetch(executorId);
    const target = await guild.members.fetch(targetId);

    if (!hasDashPerms(executor))
      return res.status(403).json({ error: "No dashboard permissions" });

    if (!canExecutorAffectTarget(executor, target))
      return res.status(403).json({ error: "Cannot punish this user" });

    switch (action) {
      case "warn":
        try {
          await target.send(`You have been warned. Reason: ${reason || "None"}`);
        } catch (_) {}
        break;

      case "kick":
        await target.kick(reason || "No reason provided");
        break;

      case "ban":
        await guild.members.ban(targetId, { reason: reason || "No reason provided" });
        break;

      default:
        return res.status(400).json({ error: "Invalid action" });
    }

    const log = addLog({
      type: "punish",
      executorId,
      targetId,
      action,
      reason: reason || null
    });

    res.json({ success: true, log });
  } catch (err) {
    res.status(500).json({ error: "Failed to punish user" });
  }
});

// --------------------------------------
// API: GET LOGS
// --------------------------------------
app.get("/logs", (req, res) => {
  const { targetId } = req.query;
  if (targetId) return res.json(logs.filter(l => l.targetId === targetId));
  res.json(logs);
});

// --------------------------------------
// API: REVERT LOG (OWNER ONLY)
// --------------------------------------
const OWNER_ID = "909359845872922635";

app.post("/revertLog", (req, res) => {
  const { executorId, logId } = req.body;

  if (executorId !== OWNER_ID)
    return res.status(403).json({ error: "Only owner can revert logs" });

  const log = logs.find(l => l.id === Number(logId));
  if (!log) return res.status(404).json({ error: "Log not found" });

  if (log.reverted)
    return res.status(400).json({ error: "Already reverted" });

  log.reverted = true;
  log.revertedAt = new Date().toISOString();
  log.revertedBy = executorId;

  res.json({ success: true, log });
});

// --------------------------------------
// API ROOT
// --------------------------------------
app.get("/", (req, res) => {
  res.send("Bot API is online");
});

// --------------------------------------
// START SERVER
// --------------------------------------
app.listen(8080, () => console.log("API running on port 8080"));

// --------------------------------------
// LOGIN BOT
// --------------------------------------
client.login(TOKEN);
