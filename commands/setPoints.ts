import { updateUser } from "../db/user";
import isValidUserArg from "../util/isValidUserArg";
import { ICallback, ICommand } from "../wokTypes";

const setPoints: ICommand = {
    name: 'setPoints',
    category: 'pointGain',
    description: 'Give points to player',
    expectedArgs: '<users @> <number>',
    minArgs: 2,
    maxArgs: 2,
    ownerOnly: true,
    cooldown: '23h',
    syntaxError: 'Incorrect syntax! Use `{PREFIX}`ping {ARGUMENTS}',
    callback: async (options: ICallback) => {
        const { message, args, guild } = options

        const points = Number(args[1])
        if (isNaN(points)) {
            message.reply({content: `${args[1]} ain a valid number :c`})
            return
        }

        const id = args[0].replace(/\D/g,'')

        if (!(await isValidUserArg(id, guild))) {
            message.reply({content: `Dont know user ${args[0]} ${process.env.NOPPERS_EMOJI}`})
            return
        }

        const user = await updateUser(id, {points})

        message.reply({content: `${args[0]} points set to ${user.points}`})
    }
}

export default setPoints