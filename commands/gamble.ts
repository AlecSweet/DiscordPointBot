import getUserAndAccruePoints, { addPoints, checkAndTriggerUserCooldown } from "../util/userUtil";
import { ICallback, ICommand } from "../wokTypes";
import * as dotenv from "dotenv"
import { updateUser } from "../db/user";
dotenv.config()

const myPoints: ICommand = {
    name: 'flip',
    category: 'gambling',
    description: 'lose some points',
    expectedArgs: '<# of points to lose>',
    minArgs: 1,
    maxArgs: 1,
    cooldown: '20s',
    callback: async (options: ICallback) => {
        const { message, args } = options

        const cooldown = await checkAndTriggerUserCooldown(message.author.id)
        if (cooldown > -1) {
            message.reply({content: `Wait ${Math.ceil(cooldown/1000)} seconds to target commands at <@${message.author.id}> ${process.env.NOPPERS_EMOJI}`})
            return
        }

        let user = await getUserAndAccruePoints(message.author.id)

        const points = args[0].toUpperCase() === 'ALL' ? user.points : Number(args[0])
        if (isNaN(points) || !Number.isInteger(points) || points < 1) {
            message.reply({content: `${points === 0 ? 0 : args[0]} ain a valid bet ${process.env.NOPPERS_EMOJI}`})
            return
        }

        if (points > user.points) {
            message.reply({content: `You only got ${user.points} points lad ${process.env.NOPPERS_EMOJI}`})
            return
        }

        await Promise.all([
            [message.react('3️⃣'), message.react('2️⃣'), message.react('1️⃣')],
            await new Promise(resolve => setTimeout(resolve, 400))
        ]);

        user = await getUserAndAccruePoints(message.author.id)
        if (Math.random() < .5) {
            await addPoints(user, points)
            const newUser = await updateUser(user.id, {pointsWon: user.pointsWon + points, flipsWon: user.flipsWon + 1})
            await message.react('✅')
            message.reply({content: `You won ${points} points ${process.env.NICE_EMOJI} You've got ${newUser.points} points now.`})
        } else {
            await addPoints(user, -points)
            const newUser = await updateUser(user.id, {pointsLost: user.pointsLost + points, flipsLost: user.flipsLost + 1})
            await message.react('❌')
            message.reply({content: `${process.env.SMODGE_EMOJI} ${points} points deleted, later. You're down to ${newUser.points} points.`})
        }
       
    }
}

export default myPoints