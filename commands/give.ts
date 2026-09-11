import { userMutexes } from "..";
import isValidNumberArg from "../util/isValidNumberArg";
import isValidUserArg from "../util/isValidUserArg";
import { settleUser, inc, updateUser } from "../util/userUtil";
import { ICallback, ICommand } from "../wokTypes";
import noMutexErrorMessage from "../util/noMutexErrorMessage";

const give: ICommand = {
    name: 'give',
    category: 'pointGain',
    description: 'Give points to player',
    expectedArgs: '<users @> <number>',
    minArgs: 2,
    maxArgs: 2,
    cooldown: '3s',
    syntaxError: 'Incorrect syntax! Use `{PREFIX}`ping {ARGUMENTS}',
    callback: async (options: ICallback) => {
        const { message, args, guild } = options

        if (!(message.channel.type === "GUILD_TEXT")) {
            message.reply({content: `Only for text channels ${process.env.NOPPERS_EMOJI}`})
            return
        }

        const gifteeId = args[0].replace(/\D/g,'')
        if (gifteeId === message.author.id) {
            message.reply({content: `Yourself? So kind... ${process.env.NOPPERS_EMOJI}`})
            return
        }

        if (!(await isValidUserArg(gifteeId, guild))) {
            message.reply({content: `Dont know user ${args[0]} ${process.env.NOPPERS_EMOJI}`})
            return
        }

        const userMutex = userMutexes.get(message.author.id)
        if (!userMutex) {
            message.reply({content: noMutexErrorMessage})
            return
        }

        userMutex.runExclusive(async() => {
            const user = await settleUser(message.author.id)

            const points = args[1].toUpperCase() === 'ALL' ? user.points : Number(args[1])

            if (!isValidNumberArg(points)) {
                message.reply({content: `${points === 0 ? 0 : args[1]} ain a valid gift ${process.env.NOPPERS_EMOJI}`})
                return
            }

            if (points > user.points) {
                message.reply({content: `You only got ${user.points} points lad ${process.env.NOPPERS_EMOJI}`})
                return
            }

            const author = await updateUser(user.id, {points: inc(-points), pointsGiven: inc(points)})
            await updateUser(gifteeId, {points: inc(points), pointsRecieved: inc(points)})
            message.reply({content: `You gave <@${gifteeId}> ${points} points ${process.env.NICE_EMOJI} You now have ${author.points} points`})
        }).catch((err) => console.log(err))
    }
}

export default give