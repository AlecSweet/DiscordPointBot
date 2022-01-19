import { Client, Intents } from "discord.js";
import WOKCommands from "wokcommands";
import path from "path";
import handleVoiceActivity from "./events/handleVoiceActivity";
import * as dotenv from "dotenv"
dotenv.config()

const client = new Client({ 
    intents: [
            Intents.FLAGS.GUILDS, 
            Intents.FLAGS.GUILD_MESSAGES, 
            Intents.FLAGS.DIRECT_MESSAGES, 
            Intents.FLAGS.GUILD_MEMBERS,
            Intents.FLAGS.GUILD_PRESENCES,
            Intents.FLAGS.GUILD_MESSAGE_REACTIONS,
            Intents.FLAGS.GUILD_VOICE_STATES
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

client.on('voiceStateUpdate', async (oldState, newState) => {
    await handleVoiceActivity(oldState, newState)
})


client.login(process.env.TOKEN)