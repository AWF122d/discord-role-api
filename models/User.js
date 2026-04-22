const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema({
  discordId: { type: String, required: true },
  chosenRole: { type: String, default: "None" },
  dashboardRole: { type: String, default: "None" }
});

module.exports = mongoose.model("User", UserSchema);
