import { VoiceState } from "discord.js"
import { getUser, updateUser } from "../db/user"
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