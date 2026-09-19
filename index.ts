import { Client, Guild, Intents } from "discord.js";
import WOKCommands from "wokcommands";
import path from "path";
import handleVoiceActivity, { checkInactivity } from "./events/handleVoiceActivity";
import * as dotenv from "dotenv"
import { getCurrentGuildInfo, updateCurrentGuildInfo } from "./db/guildInfo";
import { CronJob } from 'cron';
import { addUserMutex } from "./util/userMutexes";
import { checkAndCancelMaroonedChallenges } from "./util/challengeUtil";
import { checkAndCancelMaroonedWars } from "./util/warUtil";
import assignMostPointsRole from "./events/assignMostPointsRole";
import { checkAndCancelMaroonedRps } from "./util/rpsUtil";
import startWebServer from "./web/server";
import { allPointEvents } from "./db/pointEvent";
import pointHistoryBody from "./web/pointHistoryPayload";
import { settled } from "./util/settling";
import { isShuttingDown, setShuttingDown } from "./util/shuttingDown";
import sleep from "./util/sleep";
import isGuildMember from "./util/guildMembership";
dotenv.config()

const DRAIN_MS = 25 * 1000

process.on('uncaughtException', (err) => {console.log(err)})

const client = new Client({ 
    intents: [
            Intents.FLAGS.GUILDS, 
            Intents.FLAGS.GUILD_MESSAGES, 
            Intents.FLAGS.DIRECT_MESSAGES, 
            Intents.FLAGS.GUILD_MEMBERS,
            Intents.FLAGS.GUILD_PRESENCES,
            Intents.FLAGS.GUILD_MESSAGE_REACTIONS,
            Intents.FLAGS.GUILD_VOICE_STATES,
            Intents.FLAGS.GUILD_INTEGRATIONS
        ] 
})

let currentGuild: Guild | undefined

const server = startWebServer({
    pointHistory: () => currentGuild === undefined ? Promise.resolve(undefined) : pointHistoryBody(currentGuild),
    isMember: (userId: string) => isGuildMember(currentGuild, userId),
})

const shutDown = async () => {
    console.log('shutting down, waiting on anything still settling')
    setShuttingDown(true)
    server.close()
    await Promise.race([settled(), sleep(DRAIN_MS)])
    client.destroy()
    process.exit(0)
}

const onSignal = () => {
    if (isShuttingDown()) {
        console.log('already shutting down, still waiting on anything settling')
        return
    }

    shutDown().catch((err) => { console.log(err); process.exit(1) })
}

process.on('SIGTERM', onSignal)
process.on('SIGINT', onSignal)

client.on('ready', async () => {
    console.log(`Logged in as ${client.user?.tag}!`);
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
            guild.members.cache.map(member => {
                addUserMutex(member.user.id)
            })
            allPointEvents().catch((err) => console.log(err))
        })

    new WOKCommands(client, {
        commandsDir: path.join(__dirname, 'commands'),
        typeScript: true,
        mongoUri: process.env.MONGO_URI,
        botOwners: `${process.env.BOT_OWNER}`
    })

    const checkInactiveMembers = new CronJob('0 */5 * * * *', async function() {
        if (currentGuild === undefined) return

        await checkInactivity(currentGuild).catch((err) => console.log(err))
        await checkAndCancelMaroonedChallenges().catch((err) => console.log(err))
        await checkAndCancelMaroonedWars().catch((err) => console.log(err))
        await checkAndCancelMaroonedRps().catch((err) => console.log(err))
        await assignMostPointsRole(currentGuild).catch((err) => console.log(err))
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

client.on('guildMemberAdd', (member) => {
    addUserMutex(member.user.id)
})

client.login(process.env.TOKEN)
