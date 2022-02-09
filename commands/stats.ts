import { userMutexes } from "..";
import isValidUserArg from "../util/isValidUserArg";
import getUser from "../util/userUtil";
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

        if (!(message.channel.type === "GUILD_TEXT")) {
            message.reply({content: `Only for text channels ${process.env.NOPPERS_EMOJI}`})
            return
        }

        let id = message.author.id
        if (args[0]) {
            id = args[0].replace(/\D/g,'')
            if (!(await isValidUserArg(id, guild))) {
                message.reply({content: `Dont know user ${args[0]} ${process.env.NOPPERS_EMOJI}`})
                return
            }
        }

        const userMutex = userMutexes.get(id)
        if (!userMutex) {
            message.reply({content: `Got an Error ${process.env.NOPPERS_EMOJI}`})
            return
        }
        userMutex.runExclusive(async() => {
            const user = await getUser(id)
            const days = Math.floor(user.secondsActive / 86400)
            const secLeftAfterDays = user.secondsActive % 86400
            const hours = Math.floor(secLeftAfterDays / 3600)
            const secLeftAfterHours = secLeftAfterDays % 3600
            const minutes = Math.floor(secLeftAfterHours / 60)

            const pPF = (user.flipsWon + user.flipsLost) > 0 ? (Math.round(((user.pointsLost + user.pointsWon) / (user.flipsWon + user.flipsLost)) * 10) / 10).toFixed(1) : 0
            const pPL = user.flipsLost > 0 ? (Math.round((user.pointsLost / user.flipsLost) * 10) / 10).toFixed(1) : 0
            const pPW = user.flipsWon > 0 ? (Math.round((user.pointsWon / user.flipsWon) * 10) / 10).toFixed(1) : 0

            const bpPF = (user.betsWon + user.betsLost) > 0 ? (Math.round(((user.betPointsLost + user.betPointsWon) / (user.betsWon + user.betsLost)) * 10) / 10).toFixed(1) : 0
            const bpPL = user.betsLost > 0 ? (Math.round((user.betPointsLost / user.betsLost) * 10) / 10).toFixed(1) : 0
            const bpPW = user.betsWon > 0 ? (Math.round((user.betPointsWon / user.betsWon) * 10) / 10).toFixed(1) : 0

            const cpPF = (user.challengesWon + user.challengesLost) > 0 ? (Math.round(((user.challengePointsLost + user.challengePointsWon) / (user.challengesWon + user.challengesLost)) * 10) / 10).toFixed(1) : 0
            const cpPL = user.challengesLost > 0 ? (Math.round((user.challengePointsLost / user.challengesLost) * 10) / 10).toFixed(1) : 0
            const cpPW = user.challengesWon > 0 ? (Math.round((user.challengePointsWon / user.challengesWon) * 10) / 10).toFixed(1) : 0

            const wpPF = (user.warsWon + user.warsLost) > 0 ? (Math.round(((user.warPointsLost + user.warPointsWon) / (user.warsWon + user.warsLost)) * 10) / 10).toFixed(1) : 0
            const wpPL = user.warsLost > 0 ? (Math.round((user.warPointsLost / user.warsLost) * 10) / 10).toFixed(1) : 0
            const wpPW = user.warsWon > 0 ? (Math.round((user.warPointsWon / user.warsWon) * 10) / 10).toFixed(1) : 0

            message.reply({content: 
`**<@${user.id}>'s Stats**
\`\`\`Ruby
Points          ${user.points}
Active          ${days} days / ${hours} hours / ${minutes} minutes

Points Earned   ${Math.floor(user.secondsActive/60)}
Point Gifts     ${user.pointsGiven} Given / ${user.pointsRecieved} Received
Points Claimed  ${user.pointsClaimed} Claimed   

Bets            ${user.betsWon+user.betsLost} Total / ${user.betsWon} Won / ${user.betsLost} Lost
Returns         ${user.betPointsWon+user.betPointsLost} Total / ${user.betPointsWon} Won / ${user.betPointsLost} Lost
Avg Bets        ${bpPF} Avg Bet / ${bpPW} Avg Win / ${bpPL} Avg Loss
Bets Opened     ${user.betsOpened}

Flips           ${user.flipsWon+user.flipsLost} Total / ${user.flipsWon} Won / ${user.flipsLost} Lost
Returns         ${user.pointsWon+user.pointsLost} Total / ${user.pointsWon} Won / ${user.pointsLost} Lost
Avg Bets        ${pPF} Avg Bet / ${pPW} Avg Win / ${pPL} Avg Loss
Max Streak      ${user.maxWinStreak} Won / ${user.maxLossStreak} Lost
Current Streak  ${user.flipStreak < 0 ? `${Math.abs(user.flipStreak)} Lost` : `${user.flipStreak} Won`}

Challenges      ${user.challengesWon+user.challengesLost} Total / ${user.challengesWon} Won / ${user.challengesLost} Lost
Returns         ${user.challengePointsWon+user.challengePointsLost} Total / ${user.challengePointsWon} Won / ${user.challengePointsLost} Lost
Avg Bets        ${cpPF} Avg Bet / ${cpPW} Avg Win / ${cpPL} Avg Loss

War             ${user.warsWon+user.warsLost} Total / ${user.warsWon} Won / ${user.warsLost} Lost
Returns         ${user.warPointsWon+user.warPointsLost} Total / ${user.warPointsWon} Won / ${user.warPointsLost} Lost
Avg Bets        ${wpPF} Avg Bet / ${wpPW} Avg Win / ${wpPL} Avg Loss
\`\`\``
            })
        }).catch(() => {})
    }
}

export default points