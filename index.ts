import { Client, Intents } from "discord.js";
import WOKCommands from "wokcommands";
import path from "path";
import * as dotenv from "dotenv"
dotenv.config()

const client = new Client({ 
    intents: [
            Intents.FLAGS.GUILDS, 
            Intents.FLAGS.GUILD_MESSAGES, 
            Intents.FLAGS.DIRECT_MESSAGES, 
            Intents.FLAGS.GUILD_MEMBERS
        ] 
})

client.on('ready', () => {
    console.log(`Logged in as ${client.user?.tag}!`);
    new WOKCommands(client, {
        commandsDir: path.join(__dirname, 'commands'),
        typeScript: true,
        mongoUri: process.env.MONGO_URI,
        botOwners: '146034047112577025'
    })
})

client.login(process.env.TOKEN)