import { VoiceState } from "discord.js"
import { updateUser } from "../db/user"
import * as dotenv from "dotenv"
import { disableUserActivityAndAccruePoints } from "../util/userUtil"
dotenv.config()

const isActive = (newState: VoiceState): boolean => {
    return !newState.deaf && !newState.serverMute && newState.guild.id === process.env.GUILD_ID
}

const handleVoiceActivity = async (oldState: VoiceState, newState: VoiceState) => {
    if (!isActive(oldState) && isActive(newState)) {
        updateUser(newState.id, undefined, new Date())
    } else if (!isActive(newState) && isActive(oldState)) {
        disableUserActivityAndAccruePoints(newState.id)
    }
}

export default handleVoiceActivity