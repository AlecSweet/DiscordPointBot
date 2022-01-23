import isValidNumberArg from "../util/isValidNumberArg";
import isValidUserArg from "../util/isValidUserArg";
import getUserAndAccruePoints, { addPoints, checkAndTriggerUserCooldown } from "../util/userUtil";
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

        const gifteeId = args[0].replace(/\D/g,'')
        if (gifteeId === message.author.id) {
            message.reply({content: `so kind... ${process.env.NOPPERS_EMOJI}`})
            return
        }

        if (!(await isValidUserArg(gifteeId, guild))) {
            message.reply({content: `Dont know user ${args[0]} ${process.env.NOPPERS_EMOJI}`})
            return
        }

        const cooldown = await checkAndTriggerUserCooldown(gifteeId)
        if (cooldown > -1) {
            message.reply({content: `Wait ${Math.ceil(cooldown/1000)} seconds to target commands at <@${gifteeId}> ${process.env.NOPPERS_EMOJI}>`})
            return
        }

        const cooldown2 = await checkAndTriggerUserCooldown(message.author.id)
        if (cooldown2 > -1) {
            message.reply({content: `Wait ${Math.ceil(cooldown2/1000)} seconds to target commands at <@${message.author.id}> ${process.env.NOPPERS_EMOJI}`})
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

        const giftee = await addPoints(await getUserAndAccruePoints(gifteeId), points)
        const author = await addPoints(await getUserAndAccruePoints(message.author.id), -points)

        message.reply({content: `You gave <@${giftee.id}> ${points} points ${process.env.NICE_EMOJI} You now have ${author.points} points`})
    }
}

export default give