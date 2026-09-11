import { userMutexes } from "..";
import { claimYearly } from "../util/claimUtil";
import { ICallback, ICommand } from "../wokTypes";
import noMutexErrorMessage from "../util/noMutexErrorMessage";

const yearly: ICommand = {
    name: 'yearly',
    category: 'claim yearly',
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
            message.reply({content: noMutexErrorMessage})
            return
        }
        userMutex.runExclusive(async() => {
            await claimYearly(id, message)
        }).catch(() => {})
    }
}

export default yearly
