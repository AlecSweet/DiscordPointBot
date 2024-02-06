import { getAllUsers } from "../util/userUtil";
import { ICallback, ICommand } from "../wokTypes";

const serverStats: ICommand = {
    name: 'serverStats',
    category: 'statCheck',
    description: 'Check stats',
    minArgs: 0,
    maxArgs: 0,
    cooldown: '30s',
    callback: async (options: ICallback) => {
        const { message } = options

        if (!(message.channel.type === "GUILD_TEXT")) {
            message.reply({content: `Only for text channels ${process.env.NOPPERS_EMOJI}`})
            return
        }

        const users = await getAllUsers()

        let defaultPointsAggregate = 0

        const user = users.reduce((aggUser, curUser) => {
            defaultPointsAggregate += 100
            return {
                id: '',
                points: aggUser.points + curUser.points , 
                activeStartDate: curUser.activeStartDate ,
                flipsLost: aggUser.flipsLost + curUser.flipsLost ,
                flipsWon: aggUser.flipsWon + curUser.flipsWon ,
                pointsWon: aggUser.pointsWon + curUser.pointsWon ,
                pointsLost: aggUser.pointsLost + curUser.pointsLost ,
                secondsActive: aggUser.secondsActive + curUser.secondsActive ,
                cooldown: curUser.cooldown ,
                flipStreak: aggUser.flipStreak + curUser.flipStreak ,
                maxWinStreak: aggUser.maxWinStreak + curUser.maxWinStreak ,
                maxLossStreak: aggUser.maxLossStreak + curUser.maxLossStreak ,
                dailyClaim: curUser.dailyClaim ,
                weeklyClaim: curUser.weeklyClaim ,
                pointsGiven: aggUser.pointsGiven + curUser.pointsGiven ,
                pointsRecieved: aggUser.pointsRecieved + curUser.pointsRecieved ,
                pointsClaimed: aggUser.pointsClaimed + curUser.pointsClaimed ,
                betPointsWon: aggUser.betPointsWon + curUser.betPointsWon ,
                betPointsLost: aggUser.betPointsLost + curUser.betPointsLost ,
                betsWon: aggUser.betsWon + curUser.betsWon ,
                betsLost: aggUser.betsLost + curUser.betsLost ,
                betsOpened:  aggUser.betsOpened + curUser.betsOpened ,
                challengePointsWon: aggUser.challengePointsWon + curUser.challengePointsWon ,
                challengePointsLost: aggUser.challengePointsLost + curUser.challengePointsLost ,
                challengesWon: aggUser.challengesWon + curUser.challengesWon ,
                challengesLost: aggUser.challengesLost + curUser.challengesLost ,
                warPointsWon: aggUser.warPointsWon + curUser.warPointsWon ,
                warPointsLost: aggUser.warPointsLost + curUser.warPointsLost ,
                warsWon:aggUser.warsWon + curUser.warsWon ,
                warsLost: aggUser.warsLost + curUser.warsLost ,
                rpsPointsWon: aggUser.rpsPointsWon + curUser.rpsPointsWon ,
                rpsPointsLost: aggUser.rpsPointsLost + curUser.rpsPointsLost ,
                rpsWon:aggUser.rpsWon + curUser.rpsWon ,
                rpsLost: aggUser.rpsLost + curUser.rpsLost
            }
        })
        const years = Math.floor(user.secondsActive / 31536000)
        const secLeftAfterYears = user.secondsActive % 31536000
        const days = Math.floor(secLeftAfterYears / 86400)
        const secLeftAfterDays = secLeftAfterYears % 86400
        const hours = Math.floor(secLeftAfterDays / 3600)
        const secLeftAfterHours = secLeftAfterDays % 3600
        const minutes = Math.floor(secLeftAfterHours / 60)

        const pPF = (user.flipsWon + user.flipsLost) > 0 ? (Math.round(((user.pointsLost + user.pointsWon) / (user.flipsWon + user.flipsLost)) * 10) / 10).toFixed(1) : 0
        const pPL = user.flipsLost > 0 ? (Math.round((user.pointsLost / user.flipsLost) * 10) / 10).toFixed(1) : 0
        const pPW = user.flipsWon > 0 ? (Math.round((user.pointsWon / user.flipsWon) * 10) / 10).toFixed(1) : 0

        message.reply({content: 
`**Server Stats**
\`\`\`Ruby
Existing Points      ${user.points.toLocaleString('en-US')}
Time Wasted          ${years} years / ${days} days / ${hours} hours / ${minutes} minutes

Points Farmed        ${Math.floor(user.secondsActive/60).toLocaleString('en-US')}
Points Claimed       ${user.pointsClaimed.toLocaleString('en-US')}
Total Earnings       ${(user.pointsClaimed + Math.floor(user.secondsActive/60) + defaultPointsAggregate).toLocaleString('en-US')}

Debt                 ${Math.max((user.points - (user.pointsClaimed + Math.floor(user.secondsActive/60) + defaultPointsAggregate)) * -1, 0).toLocaleString('en-US')}

Flips                ${(user.flipsWon+user.flipsLost).toLocaleString('en-US')} Total / ${user.flipsWon.toLocaleString('en-US')} Won / ${user.flipsLost.toLocaleString('en-US')} Lost
Returns              ${(user.pointsWon+user.pointsLost).toLocaleString('en-US')} Total / ${user.pointsWon.toLocaleString('en-US')} Won / ${user.pointsLost.toLocaleString('en-US')} Lost
Avg Bets             ${pPF.toLocaleString('en-US')} Avg Bet / ${pPW.toLocaleString('en-US')} Avg Win / ${pPL.toLocaleString('en-US')} Avg Loss

Points Given         ${user.pointsGiven.toLocaleString('en-US')} Given
Bets                 ${user.betsOpened.toLocaleString('en-US')} Total / ${user.betPointsWon.toLocaleString('en-US')} Points
Challenges           ${user.challengesWon.toLocaleString('en-US')} Total / ${user.challengePointsWon.toLocaleString('en-US')} Points
Wars                 ${user.warsWon.toLocaleString('en-US')} Total / ${user.warPointsWon.toLocaleString('en-US')} Points
R P S                ${user.rpsWon.toLocaleString('en-US')} Total / ${user.rpsPointsWon.toLocaleString('en-US')} Points
\`\`\``
            })
    }
}

export default serverStats