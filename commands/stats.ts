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

            const rpPF = (user.rpsWon + user.rpsLost) > 0 ? (Math.round(((user.rpsPointsLost + user.rpsPointsWon) / (user.rpsWon + user.rpsLost)) * 10) / 10).toFixed(1) : 0
            const rpPL = user.rpsLost > 0 ? (Math.round((user.rpsPointsLost / user.rpsLost) * 10) / 10).toFixed(1) : 0
            const rpPW = user.rpsWon > 0 ? (Math.round((user.rpsPointsWon / user.rpsWon) * 10) / 10).toFixed(1) : 0

            message.reply({content: 
`**<@${user.id}>'s Stats**
\`\`\`Ruby
Points          ${user.points.toLocaleString('en-US')}
Active          ${days} days / ${hours} hours / ${minutes} minutes

Points Earned   ${Math.floor(user.secondsActive/60).toLocaleString('en-US')}
Point Gifts     ${user.pointsGiven.toLocaleString('en-US')} Given / ${user.pointsRecieved.toLocaleString('en-US')} Received
Points Claimed  ${user.pointsClaimed.toLocaleString('en-US')} Claimed   

Flips           ${(user.flipsWon+user.flipsLost).toLocaleString('en-US')} Total / ${user.flipsWon.toLocaleString('en-US')} Won / ${user.flipsLost.toLocaleString('en-US')} Lost
Returns         ${(user.pointsWon+user.pointsLost).toLocaleString('en-US')} Total / ${user.pointsWon.toLocaleString('en-US')} Won / ${user.pointsLost.toLocaleString('en-US')} Lost
Avg Bets        ${pPF.toLocaleString('en-US')} Avg Bet / ${pPW.toLocaleString('en-US')} Avg Win / ${pPL.toLocaleString('en-US')} Avg Loss
Max Streak      ${user.maxWinStreak.toLocaleString('en-US')} Won / ${user.maxLossStreak.toLocaleString('en-US')} Lost
Current Streak  ${user.flipStreak < 0 ? `${Math.abs(user.flipStreak).toLocaleString('en-US')} Lost` : `${user.flipStreak.toLocaleString('en-US')} Won`}

Challenges      ${(user.challengesWon+user.challengesLost).toLocaleString('en-US')} Total / ${user.challengesWon.toLocaleString('en-US')} Won / ${user.challengesLost.toLocaleString('en-US')} Lost
Returns         ${(user.challengePointsWon+user.challengePointsLost).toLocaleString('en-US')} Total / ${user.challengePointsWon.toLocaleString('en-US')} Won / ${user.challengePointsLost.toLocaleString('en-US')} Lost
Avg Bets        ${cpPF.toLocaleString('en-US')} Avg Bet / ${cpPW.toLocaleString('en-US')} Avg Win / ${cpPL.toLocaleString('en-US')} Avg Loss

War             ${(user.warsWon+user.warsLost).toLocaleString('en-US')} Total / ${user.warsWon.toLocaleString('en-US')} Won / ${user.warsLost.toLocaleString('en-US')} Lost
Returns         ${(user.warPointsWon+user.warPointsLost).toLocaleString('en-US')} Total / ${user.warPointsWon.toLocaleString('en-US')} Won / ${user.warPointsLost.toLocaleString('en-US')} Lost
Avg Bets        ${wpPF.toLocaleString('en-US')} Avg Bet / ${wpPW.toLocaleString('en-US')} Avg Win / ${wpPL.toLocaleString('en-US')} Avg Loss

R P S           ${(user.rpsWon+user.rpsLost).toLocaleString('en-US')} Total / ${user.rpsWon.toLocaleString('en-US')} Won / ${user.rpsLost.toLocaleString('en-US')} Lost
Returns         ${(user.rpsPointsWon+user.rpsPointsLost).toLocaleString('en-US')} Total / ${user.rpsPointsWon.toLocaleString('en-US')} Won / ${user.rpsPointsLost.toLocaleString('en-US')} Lost
Avg Bets        ${rpPF.toLocaleString('en-US')} Avg Bet / ${rpPW.toLocaleString('en-US')} Avg Win / ${rpPL.toLocaleString('en-US')} Avg Loss

Bets            ${(user.betsWon+user.betsLost).toLocaleString('en-US')} Total / ${user.betsWon.toLocaleString('en-US')} Won / ${user.betsLost.toLocaleString('en-US')} Lost
Returns         ${(user.betPointsWon+user.betPointsLost).toLocaleString('en-US')} Total / ${user.betPointsWon.toLocaleString('en-US')} Won / ${user.betPointsLost.toLocaleString('en-US')} Lost
Avg Bets        ${bpPF.toLocaleString('en-US')} Avg Bet / ${bpPW.toLocaleString('en-US')} Avg Win / ${bpPL.toLocaleString('en-US')} Avg Loss
Bets Opened     ${user.betsOpened.toLocaleString('en-US')}
\`\`\``
            })
        }).catch(() => {})
    }
}

export default points