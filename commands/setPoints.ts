import userModel from "../db/user";
import { ICallback, ICommand } from "../wokTypes";

const setPoints: ICommand = {
    name: 'setPoints',
    category: 'pointGain',
    description: 'Give points to player',
    expectedArgs: '<users @> <number>',
    minArgs: 2,
    maxArgs: 2,
    ownerOnly: true,
    syntaxError: 'Incorrect syntax! Use `{PREFIX}`ping {ARGUMENTS}',
    init: () => {},
    callback: async (options: ICallback) => {
        const { message, args } = options
        const id = args[0].replace(/\D/g,'')

        const result = await userModel.updateOne(
            {id: id},
            {$set: {points: parseInt(args[1].replace(/\D/g,''))}}
        )

        if (!result) {
            await new userModel({
                id: id,
                points: parseInt(args[1].replace(/\D/g,''))
            }).save()
        }

        message.reply({
            content: `${args[0]} points set to ${args[1]}`
        })
    }
}

export default setPoints