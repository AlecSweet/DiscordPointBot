import isValidUserArg from "../util/isValidUserArg";
import getUserAndAccruePoints, { checkAndTriggerUserCooldown } from "../util/userUtil";
import { ICallback, ICommand } from "../wokTypes";

const points: ICommand = {
    name: 'stats',
    category: 'statCheck',
    description: 'Check stats',
    expectedArgs: '<users @>',
    minArgs: 0,
    maxArgs: 1,
    cooldown: '5s',
    callback: async (options: ICallback) => {
        const { message, args, guild } = options

        let id = message.author.id
        if (args[0]) {
            id = args[0].replace(/\D/g,'')
            if (!(await isValidUserArg(id, guild))) {
                message.reply({content: `Dont know user ${args[0]} ${process.env.NOPPERS_EMOJI}`})
                return
            }
        }

        const cooldown = await checkAndTriggerUserCooldown(id)
        if (cooldown > -1) {
            message.reply({content: `Wait ${Math.ceil(cooldown/1000)} seconds to target commands at <@${id}> ${process.env.NOPPERS_EMOJI}`})
            return
        }

        const user = await getUserAndAccruePoints(id)
        const days = Math.floor(user.secondsActive / 86400)
        const secLeftAfterDays = user.secondsActive % 86400
        const hours = Math.floor(secLeftAfterDays / 3600)
        const secLeftAfterHours = secLeftAfterDays % 3600
        const minutes = Math.floor(secLeftAfterHours / 60)

        const pPF = (user.flipsWon + user.flipsLost) > 0 ? (Math.round(((user.pointsLost + user.pointsWon) / (user.flipsWon + user.flipsLost)) * 10) / 10).toFixed(1) : 0
        const pPL = user.flipsLost > 0 ? (Math.round((user.pointsLost / user.flipsLost) * 10) / 10).toFixed(1) : 0
        const pPW = user.flipsWon > 0 ? (Math.round((user.pointsWon / user.flipsWon) * 10) / 10).toFixed(1) : 0

        message.reply({content: 
`**<@${user.id}>'s Stats**
\`\`\`
Points:         ${user.points}
Flips:          ${user.flipsWon}W / ${user.flipsLost}L
Flip Returns:   Won: ${user.pointsWon} / Lost: ${user.pointsLost}
Avg Flips:      Avg Bet: ${pPF} / Avg Win: ${pPW} / Avg Loss: ${pPL}
Flip Streaks:   Max Loss: ${user.maxLossStreak} / Max Win: ${user.maxWinStreak}
Current Streak: ${user.flipStreak < 0 ? `${Math.abs(user.flipStreak)} Lost` : `${user.flipStreak} Won`}
Point Gifts:    ${user.pointsGiven} Given / ${user.pointsRecieved} Recieved           
Active:         ${days}d / ${hours}h / ${minutes}m\`\`\``
        })
    }
}

export default points