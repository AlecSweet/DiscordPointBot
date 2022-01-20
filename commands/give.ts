import { isValidNumberArg } from "../util/isValidNumberArg";
import getUserAndAccruePoints, { addPoints } from "../util/userUtil";
import { ICallback, ICommand } from "../wokTypes";

const setPoints: ICommand = {
    name: 'give',
    category: 'pointGain',
    description: 'Give points to player',
    expectedArgs: '<users @> <number>',
    minArgs: 2,
    maxArgs: 2,
    cooldown: '10s',
    syntaxError: 'Incorrect syntax! Use `{PREFIX}`ping {ARGUMENTS}',
    callback: async (options: ICallback) => {
        const { message, args, guild } = options

        const gifteeId = args[0].replace(/\D/g,'')
        if (gifteeId === message.author.id) {
            message.reply({content: `so kind... ${process.env.NOPPERS_EMOJI}`})
            return
        }

        const user = await getUserAndAccruePoints(message.author.id)
        
        const points = args[1].toUpperCase() === 'ALL' ? user.points : Number(args[1])

        if (!isValidNumberArg(points)) {
            message.reply({content: `${points === 0 ? 0 : args[1]} ain a valid gift ${process.env.NOPPERS_EMOJI}`})
            return
        }

        if (points > user.points) {
            message.reply({content: `You only got ${user.points} points lad ${process.env.NOPPERS_EMOJI}`})
            return
        }

        let userFound = false
        try {
            if (await guild.members.fetch(gifteeId)) {
                userFound = true
            }
        // eslint-disable-next-line no-empty
        } catch(e) {}
        
        if (!userFound) {
            message.reply({content: `Dont know user ${args[0]} ${process.env.NOPPERS_EMOJI}`})
            return
        }

        const giftee = await addPoints(await getUserAndAccruePoints(gifteeId), points)
        const author = await addPoints(user, -points)

        message.reply({content: `You gave <@${giftee.id}> ${points} points ${process.env.NICE_EMOJI} You now have ${author.points} points`})
    }
}

export default setPoints