import getUserAndAccruePoints, { addPoints, checkAndTriggerUserCooldown } from "../util/userUtil";
import { ICallback, ICommand } from "../wokTypes";
import * as dotenv from "dotenv"
import getRandomValues from 'get-random-values'
import { updateUser } from "../db/user";
dotenv.config()

const myPoints: ICommand = {
    name: 'flip',
    aliases: ['f','filp','fipl','lipf','pilf','fpil'],
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

        const arr = new Uint8Array(1);
        getRandomValues(arr);
        const roll = arr[0]
        const won = !(roll < 128)
        if (won) {
            await addPoints(user, points)

            let newMaxStreak = {}
            let flipStreak = user.flipStreak
            if (flipStreak < 0) {  
                if (Math.abs(flipStreak) > user.maxLossStreak) {
                    newMaxStreak = {maxLossStreak: Math.abs(flipStreak)}
                }
                flipStreak = 0
            } else if (flipStreak + 1 > user.maxWinStreak) {
                newMaxStreak = {maxWinStreak: flipStreak + 1}
            }

            user = await updateUser(
                user.id, 
                {
                    pointsWon: user.pointsWon + points, 
                    flipsWon: user.flipsWon + 1, 
                    ...(newMaxStreak), 
                    flipStreak: flipStreak + 1
                }
            )
        } else {
            await addPoints(user, -points)

            let newMaxStreak = {}
            let flipStreak = user.flipStreak
            if (flipStreak > 0) {  
                if (flipStreak > user.maxWinStreak) {
                    newMaxStreak = {maxWinStreak: flipStreak}
                }
                flipStreak = 0
            } else if (Math.abs(flipStreak - 1) > user.maxLossStreak) {
                newMaxStreak = {maxLossStreak: Math.abs(flipStreak - 1)}
            }
            user = await updateUser(
                user.id, 
                {
                    pointsLost: user.pointsLost + points, 
                    flipsLost: user.flipsLost + 1, 
                    ...(newMaxStreak), 
                    flipStreak: flipStreak - 1
                }
            )
        }

        const rollFormatted = roll
        Promise.all([
            [
                message.react('3️⃣'), 
                message.react('2️⃣'), 
                message.react('1️⃣'),
                [
                    won ? await message.react('✅') : await message.react('❌'),
                    won ? 
                        message.reply({content: `You won ${points} points ${process.env.NICE_EMOJI} You've got ${user.points} points now. You rolled a ${rollFormatted}`}) :
                        message.reply({content: `${process.env.SMODGE_EMOJI} ${points} points deleted, later. You're down to ${user.points} points. You rolled a ${rollFormatted}`})
                ]
            ],
            await new Promise(resolve => setTimeout(resolve, 400))
        ]);
    }
}

export default myPoints