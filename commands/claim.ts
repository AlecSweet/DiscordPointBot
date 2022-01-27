import { claimDaily, claimWeekly } from "../util/claimUtil";
import { checkAndTriggerUserCooldown } from "../util/userUtil";
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

        const cooldown = await checkAndTriggerUserCooldown(id)
        if (cooldown > -1) {
            message.reply({content: `Wait ${Math.ceil(cooldown/1000)} seconds to target commands at <@${id}> ${process.env.NOPPERS_EMOJI}`})
            return
        }

        if (claim === 'daily') { 
            claimDaily(id, message)
        } else if (claim === 'weekly') {
            claimWeekly(id, message)
        }
    }
}

export default claim