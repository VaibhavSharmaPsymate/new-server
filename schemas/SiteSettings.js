const mongoose = require("mongoose");

const SiteSettingsSchema = new mongoose.Schema({
  psyID: { type: Number, default: 2020003000 },
});

const SiteSettings = mongoose.model("SiteSettings", SiteSettingsSchema);

module.exports = { SiteSettings };
