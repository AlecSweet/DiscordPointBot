import { Guild, VoiceState } from "discord.js"
import userModel from "../db/user"
import * as dotenv from "dotenv"
import { disableUserActivity, startUserActivity } from "../util/userUtil"
import { getCurrentGuildInfo, ICurrentGuildInfo } from "../db/guildInfo"
import { whileSettling } from "../util/settling"
import { isShuttingDown } from "../util/shuttingDown"
dotenv.config()

const isActive = (newState: VoiceState, guildInfo: ICurrentGuildInfo): boolean => {
    return !newState.deaf && 
        !newState.serverMute && 
        !!newState.channel && 
        guildInfo.activeChannelIds.indexOf(newState.channel.id) > -1
}

const handleVoiceActivity = async (oldState: VoiceState, newState: VoiceState) => {
    const guildInfo = await getCurrentGuildInfo()
    if (guildInfo === null) return

    if (isActive(newState, guildInfo)) {
        await whileSettling(() => startUserActivity(newState.id))
    } else {
        await whileSettling(() => disableUserActivity(newState.id))
    }
}

export default handleVoiceActivity

export const checkInactivity = async (guild: Guild) => {
    const guildInfo = await getCurrentGuildInfo()
    if (guildInfo === null) return

    const resultMembers = await userModel.find({activeStartDate: { $ne: null }})
    for (const member of resultMembers) {
        if (isShuttingDown()) return

        try {
            const voiceState = (await guild.members.fetch(member.id)).voice
            if (!isActive(voiceState, guildInfo)) { 
                await whileSettling(() => disableUserActivity(voiceState.id))
            }
        // eslint-disable-next-line no-empty
        } catch(e) {}
    }
}
