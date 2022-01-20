import getUserAndAccruePoints from "../util/userUtil";
import { ICallback, ICommand } from "../wokTypes";

const points: ICommand = {
    name: 'points',
    category: 'pointCheck',
    description: 'Check points',
    expectedArgs: '<users @>',
    minArgs: 1,
    maxArgs: 1,
    callback: async (options: ICallback) => {
        const { message, args } = options

        const user = await getUserAndAccruePoints(args[0].replace(/\D/g,''))

        message.reply({content: `${args[0]} has ${user.points} points`})
    }
}

export default points