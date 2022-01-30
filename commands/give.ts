import { userMutexes } from "..";
import isValidNumberArg from "../util/isValidNumberArg";
import isValidUserArg from "../util/isValidUserArg";
import getUser, { addPoints, updateUser } from "../util/userUtil";
import { ICallback, ICommand } from "../wokTypes";

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

        let points = 0
        const userMutex = userMutexes.get(message.author.id)
        if(!userMutex) {
            message.reply({content: `Got an Error ${process.env.NOPPERS_EMOJI}`})
            return
        }
        
        let failed = false
        userMutex.runExclusive(async() => {
            const user = await getUser(message.author.id)
            
            points = args[1].toUpperCase() === 'ALL' ? user.points : Number(args[1])

            if (!isValidNumberArg(points)) {
                message.reply({content: `${points === 0 ? 0 : args[1]} ain a valid gift ${process.env.NOPPERS_EMOJI}`})
                failed = true
                return
            }

            if (points > user.points) {
                message.reply({content: `You only got ${user.points} points lad ${process.env.NOPPERS_EMOJI}`})
                failed = true
                return
            }

            const author = await addPoints(user.id, -points)
            await updateUser(author.id, {pointsGiven: author.pointsGiven + points})
            message.reply({content: `You gave <@${gifteeId}> ${points} points ${process.env.NICE_EMOJI} You now have ${author.points} points`})
        }).then(() => {
            if(!failed) {
                const gifteeMutex = userMutexes.get(gifteeId)
                if(!gifteeMutex) {
                    message.reply({content: `Got an Error ${process.env.NOPPERS_EMOJI}`})
                    return
                }
                gifteeMutex.runExclusive(async() => {
                    const giftee = await addPoints(gifteeId, points)
                    await updateUser(giftee.id, {pointsRecieved: giftee.pointsRecieved + points})
                }).catch(() => {})
            }
        }).catch(() => {})
    }
}

export default give