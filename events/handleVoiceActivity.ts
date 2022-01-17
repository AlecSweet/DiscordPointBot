import { VoiceState } from "discord.js"

const handleVoiceActivity = async (oldState: VoiceState, newState: VoiceState) => {
    console.log(oldState)
    console.log(newState)
}

export default handleVoiceActivity