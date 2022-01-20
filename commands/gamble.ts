import getUserAndAccruePoints, { addPoints } from "../util/userUtil";
import { ICallback, ICommand } from "../wokTypes";
import * as dotenv from "dotenv"
dotenv.config()

const myPoints: ICommand = {
    name: 'gamble',
    category: 'gambling',
    description: 'lose some points',
    expectedArgs: '<# of points to lose>',
    minArgs: 1,
    maxArgs: 1,
    cooldown: '30s',
    callback: async (options: ICallback) => {
        const { message, args } = options

        const points = Number(args[0])
        if (isNaN(points)) {
            message.reply({content: `${args[0]} ain a valid number :c`})
            return
        }

        const user = await getUserAndAccruePoints(message.author.id)

        if (points > user.points) {
            message.reply({content: `You only got ${user.points} points lad ${process.env.NOPPERS_EMOJI}`})
            return
        }

        await Promise.all([
            [message.react('3️⃣'), message.react('2️⃣'), message.react('1️⃣')],
            await new Promise(resolve => setTimeout(resolve, 400))
        ]);

        if (Math.random() < .485) {
            const newUser = await addPoints(user, points)
            await message.react('✅')
            message.reply({content: `You won ${points} points ${process.env.NICE_EMOJI} You've got ${newUser.points} points now.`})
        } else {
            const newUser = await addPoints(user, -points)
            await message.react('❌')
            message.reply({content: `${process.env.SMODGE_EMOJI} ${points} points deleted, later. You're down to ${newUser.points} points.`})
        }
       
    }
}

export default myPoints