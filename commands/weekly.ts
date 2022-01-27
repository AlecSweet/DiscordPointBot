import { claimWeekly } from "../util/claimUtil";
import { checkAndTriggerUserCooldown } from "../util/userUtil";
import { ICallback, ICommand } from "../wokTypes";

const weekly: ICommand = {
    name: 'weekly',
    category: 'claim weekly',
    description: 'claim points',
    cooldown: '3s',
    callback: async (options: ICallback) => {
        const { message } = options

        const id = message.author.id

        const cooldown = await checkAndTriggerUserCooldown(id)
        if (cooldown > -1) {
            message.reply({content: `Wait ${Math.ceil(cooldown/1000)} seconds to target commands at <@${id}> ${process.env.NOPPERS_EMOJI}`})
            return
        }

        await claimWeekly(id, message)
    }
}

export default weekly