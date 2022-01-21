import isValidUserArg from "../util/isValidUserArg";
import getUserAndAccruePoints, { checkAndTriggerUserCooldown } from "../util/userUtil";
import { ICallback, ICommand } from "../wokTypes";

const points: ICommand = {
    name: 'points',
    category: 'pointCheck',
    description: 'Check points',
    expectedArgs: '<users @>',
    minArgs: 0,
    maxArgs: 1,
    cooldown: '10s',
    callback: async (options: ICallback) => {
        const { message, args, guild } = options

        const id = args[0] ? args[0].replace(/\D/g,'') : message.author.id

        const cooldown = await checkAndTriggerUserCooldown(id)
        if (cooldown > -1) {
            message.reply({content: `Wait ${Math.ceil(cooldown/1000)} seconds to target commands at <@${id}> ${process.env.NOPPERS_EMOJI}`})
            return
        }

        if (!args[0]) {
            const self = await getUserAndAccruePoints(id)
            message.reply({content: `You have ${self.points} points`})
            return
        }

        if (!(await isValidUserArg(id, guild))) {
            message.reply({content: `Dont know user ${args[0]} ${process.env.NOPPERS_EMOJI}`})
            return
        }

        const user = await getUserAndAccruePoints(id)
        message.reply({content: `${args[0]} has ${user.points} points`})
    }
}

export default points