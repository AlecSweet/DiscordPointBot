import { userMutexes } from "..";
import isValidUserArg from "../util/isValidUserArg";
import { settleUser } from "../util/userUtil";
import { ICallback, ICommand } from "../wokTypes";
import noMutexErrorMessage from "../util/noMutexErrorMessage";

const points: ICommand = {
    name: 'points',
    category: 'pointCheck',
    description: 'Check points',
    expectedArgs: '<users @>',
    minArgs: 0,
    maxArgs: 1,
    cooldown: '3s',
    callback: async (options: ICallback) => {
        const { message, args, guild } = options

        if (!(message.channel.type === "GUILD_TEXT")) {
            message.reply({content: `Only for text channels ${process.env.NOPPERS_EMOJI}`})
            return
        }

        const id = args[0] ? args[0].replace(/\D/g,'') : message.author.id

        if (!args[0]) {
            const userMutex = userMutexes.get(id)
            if(!userMutex) {
                message.reply({content: noMutexErrorMessage})
                return
            }
            userMutex.runExclusive(async() => {
                const self = await settleUser(id)
                message.reply({content: `You have ${self.points} points`})
            }).catch(() => {})
            return
        }

        if (!(await isValidUserArg(id, guild))) {
            message.reply({content: `Dont know user ${args[0]} ${process.env.NOPPERS_EMOJI}`})
            return
        }

        const userMutex = userMutexes.get(id)
        if(!userMutex) {
            message.reply({content: noMutexErrorMessage})
            return
        }
        userMutex.runExclusive(async() => {
            const user = await settleUser(id)
            message.reply({content: `${args[0]} has ${user.points} points`})
        }).catch(() => {})
    }
}

export default points