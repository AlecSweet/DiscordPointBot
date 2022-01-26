import { Guild, VoiceState } from "discord.js"
import userModel, { getUser, updateUser } from "../db/user"
import * as dotenv from "dotenv"
import { disableUserActivityAndAccruePoints } from "../util/userUtil"
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
        const user = await getUser(newState.id)
        if (!user.activeStartDate) {
            updateUser(newState.id, {activeStartDate: new Date()})
        }
    } else if (!isActive(newState, guildInfo)) {
        disableUserActivityAndAccruePoints(newState.id)
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
                disableUserActivityAndAccruePoints(voiceState.id)
            }
        // eslint-disable-next-line no-empty
        } catch(e) {}
    })
}