import getUserAndAccruePoints from "../util/userUtil";
import { ICallback, ICommand } from "../wokTypes";

const points: ICommand = {
    name: 'points',
    category: 'pointCheck',
    description: 'Check points',
    expectedArgs: '<users @>',
    minArgs: 0,
    maxArgs: 1,
    callback: async (options: ICallback) => {
        const { message, args } = options

        if (!args[0]) {
            const self = await getUserAndAccruePoints(message.author.id)
            message.reply({content: `You have ${self.points} points`})
            return
        }

        const user = await getUserAndAccruePoints(args[0].replace(/\D/g,''))
        message.reply({content: `${args[0]} has ${user.points} points`})
    }
}

export default points