import userModel from "../db/user";
import { ICallback, ICommand } from "../wokTypes";

const points: ICommand = {
    name: 'points',
    category: 'pointCheck',
    description: 'Check points',
    expectedArgs: '<users @>',
    minArgs: 1,
    maxArgs: 1,
    init: () => {},
    callback: async (options: ICallback) => {
        const { message, args } = options

        const result = await userModel.find({id: args[0].replace(/\D/g,'')})

        if (!result[0]) {
            await new userModel({
                id: args[0].replace(/\D/g,''),
                points: 0
            }).save()
        }

        const points = result[0] ? result[0].points : 0;

        message.reply({
            content: `${args[0]} has ${points} points`
        })
    }
}

export default points