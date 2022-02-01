const conf = require("./config")()

let isProduction = conf.args["is-production"] || conf.isProduction

if (isProduction){
    console.log("WARN: PRODUCTION Mode")
} else {
    console.log("Dev mode")
}