const path = require("path")
const args = require('minimist')(process.argv.slice(2), { string: ["phone-number"] })
const dotenv = require("dotenv").config({path: path.join(__dirname, "../.env")});
const _env = dotenv.parsed;

const config = require("./config.json");
module.exports = () => ({
    ...config,
    ..._env,
    args
})
