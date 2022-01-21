import { Client, Intents } from "discord.js";
import WOKCommands from "wokcommands";
import path from "path";
import handleVoiceActivity from "./events/handleVoiceActivity";
import * as dotenv from "dotenv"
import { updateCurrentGuildInfo } from "./db/guildInfo";
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

client.on('ready', async () => {
    console.log(`Logged in as ${client.user?.tag}!`);
    client.guilds.fetch(`${process.env.GUILD_ID}`)
        .then((guild) => {
            const activeChannelIds = guild.channels.cache.filter(channel => {
                    return channel.type === 'GUILD_VOICE' && channel.id !== channel.guild.afkChannelId
                }).map(channel => {
                    return channel.id
                })
            const afkChannelId = guild.afkChannelId ? guild.afkChannelId : ''
            updateCurrentGuildInfo(activeChannelIds, afkChannelId)
        })
    new WOKCommands(client, {
        commandsDir: path.join(__dirname, 'commands'),
        typeScript: true,
        mongoUri: process.env.MONGO_URI,
        botOwners: `${process.env.BOT_OWNER}`
    })
})

client.on('voiceStateUpdate', async (oldState, newState) => {
    await handleVoiceActivity(oldState, newState)
})


client.login(process.env.TOKEN)