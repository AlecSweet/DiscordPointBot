
import { userMutexes } from "..";
import { claimDaily } from "../util/claimUtil";
import { ICallback, ICommand } from "../wokTypes";

const daily: ICommand = {
    name: 'daily',
    category: 'claim daily',
    description: 'claim points',
    cooldown: '3s',
    callback: async (options: ICallback) => {
        const { message } = options

        if (!(message.channel.type === "GUILD_TEXT")) {
            message.reply({content: `Only for text channels ${process.env.NOPPERS_EMOJI}`})
            return
        }

        const id = message.author.id

        const userMutex = userMutexes.get(id)
        if (!userMutex) {
            message.reply({content: `Got an Error ${process.env.NOPPERS_EMOJI}`})
            return
        }
        userMutex.runExclusive(async() => {
            await claimDaily(id, message)
        }).catch(() => {})
    }
}

export default daily