import { Client, Intents } from "discord.js";
import WOKCommands from "wokcommands";
import path from "path";
import handleVoiceActivity, { checkInactivity } from "./events/handleVoiceActivity";
import * as dotenv from "dotenv"
import { getCurrentGuildInfo, updateCurrentGuildInfo } from "./db/guildInfo";
import { CronJob } from 'cron';
dotenv.config()

process.on('uncaughtException', (err) => {console.log(err)})

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
    let currentGuild
    await client.guilds.fetch(`${process.env.GUILD_ID}`)
        .then((guild) => {
            currentGuild = guild
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

    const checkInactiveMembers = new CronJob('0 */5 * * * *', function() {
        checkInactivity(currentGuild)
    })
    checkInactiveMembers.start();
})

client.on('voiceStateUpdate', async (oldState, newState) => {
    await handleVoiceActivity(oldState, newState)
})

client.on('channelCreate', async (channel) => {
    if (channel.type === 'GUILD_VOICE' && channel.guild.afkChannelId !== channel.id) {
        const guildInfo = await getCurrentGuildInfo()
        guildInfo.activeChannelIds.push(channel.id)
        updateCurrentGuildInfo(guildInfo.activeChannelIds, guildInfo.afkChannelId)
    }
})

client.login(process.env.TOKEN)