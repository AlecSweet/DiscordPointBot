import { userMutexes } from "..";
import { claimDaily, claimWeekly } from "../util/claimUtil";
import { ICallback, ICommand } from "../wokTypes";

enum ClaimType {
    daily = 'dailyClaim',
    weekly = 'weeklyClaim'
}

const claim: ICommand = {
    name: 'claim',
    category: 'claim stuff',
    description: 'claim points',
    expectedArgs: '<type to claim>',
    minArgs: 1,
    maxArgs: 1,
    cooldown: '3s',
    callback: async (options: ICallback) => {
        const { message, args } = options

        if (!(message.channel.type === "GUILD_TEXT")) {
            message.reply({content: `Only for text channels ${process.env.NOPPERS_EMOJI}`})
            return
        }

        const claim = args[0].toLowerCase()
        if (!claim || !ClaimType[claim]) {
            const validTypes: string[] = []
            for (const e in ClaimType) {
                validTypes.push(e)
            }
            message.reply({content: `${args[0]} ain a valid claim. Types: \n\`\`\`${validTypes.join(', ')}\`\`\``})
            return
        }

        const id = message.author.id

        const userMutex = userMutexes.get(id)
        if (!userMutex) {
            message.reply({content: `Got an Error ${process.env.NOPPERS_EMOJI}`})
            return
        }
        userMutex.runExclusive(async() => {
            if (claim === 'daily') { 
                claimDaily(id, message)
            } else if (claim === 'weekly') {
                claimWeekly(id, message)
            }
        }).catch(() => {})
    }
}

export default claim