import { updateUser } from "../db/user";
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

        const points = Number(args[1])
        console.log(points)
        if (isNaN(points)) {
            message.reply({
                content: `${args[1]} ain a valid number :c`
            })
            return
        }

        const user = await updateUser(args[0].replace(/\D/g,''), points)

        message.reply({content: `${args[0]} points set to ${user.points}`})
    }
}

export default setPoints