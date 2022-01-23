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
    cooldown: '3s',
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

        const won = Math.random() < .5
        if (won) {
            await addPoints(user, points)

            let newMaxLossStreak = {}
            let flipStreak = user.flipStreak
            if (flipStreak < 0) {  
                if (Math.abs(flipStreak) > user.maxLossStreak) {
                    newMaxLossStreak = {maxLossStreak: Math.abs(flipStreak)}
                }
                flipStreak = 0
            }

            user = await updateUser(
                user.id, 
                {
                    pointsWon: user.pointsWon + points, 
                    flipsWon: user.flipsWon + 1, 
                    ...(newMaxLossStreak), 
                    flipStreak: flipStreak + 1
                }
            )
        } else {
            await addPoints(user, -points)

            let newMaxWinStreak = {}
            let flipStreak = user.flipStreak
            if (flipStreak > 0) {  
                if (flipStreak > user.maxWinStreak) {
                    newMaxWinStreak = {maxWinStreak: flipStreak}
                }
                flipStreak = 0
            }
            user = await updateUser(
                user.id, 
                {
                    pointsLost: user.pointsLost + points, 
                    flipsLost: user.flipsLost + 1, 
                    ...(newMaxWinStreak), 
                    flipStreak: flipStreak - 1
                }
            )
        }

        await Promise.all([
            [message.react('3️⃣'), message.react('2️⃣'), message.react('1️⃣')],
            await new Promise(resolve => setTimeout(resolve, 400))
        ]);

        if (won) {
            await message.react('✅')
            message.reply({content: `You won ${points} points ${process.env.NICE_EMOJI} You've got ${user.points} points now.`})
        } else {
            await message.react('❌')
            message.reply({content: `${process.env.SMODGE_EMOJI} ${points} points deleted, later. You're down to ${user.points} points.`})
        }
    }
}

export default myPoints