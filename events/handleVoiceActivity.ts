import { Guild, VoiceState } from "discord.js"
import userModel from "../db/user"
import * as dotenv from "dotenv"
import { disableUserActivity, startUserActivity } from "../util/userUtil"
import { getCurrentGuildInfo, ICurrentGuildInfo } from "../db/guildInfo"
dotenv.config()

const isActive = (newState: VoiceState, guildInfo: ICurrentGuildInfo): boolean => {
    return !newState.deaf && 
        !newState.serverMute && 
        !!newState.channel && 
        guildInfo.activeChannelIds.indexOf(newState.channel.id) > -1
}

const handleVoiceActivity = async (oldState: VoiceState, newState: VoiceState) => {
    const guildInfo = await getCurrentGuildInfo()

    if (isActive(newState, guildInfo)) {
        startUserActivity(newState.id)
    } else if (!isActive(newState, guildInfo)) {
        disableUserActivity(newState.id)
    }
}

export default handleVoiceActivity

export const checkInactivity = async (guild: Guild) => {
    const guildInfo = await getCurrentGuildInfo()
    const resultMembers = await userModel.find({activeStartDate: { $ne: null }})
    resultMembers.forEach(async (member) => {
        try {
            const voiceState = (await guild.members.fetch(member.id)).voice
            if (!isActive(voiceState, guildInfo)) { 
                disableUserActivity(voiceState.id)
            }
        // eslint-disable-next-line no-empty
        } catch(e) {}
    })
}
