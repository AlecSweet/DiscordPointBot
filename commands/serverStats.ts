import { IUser } from "../db/user";
import ephemeralButton from "../util/ephemeralButton";
import formatPoints from "../util/formatPoints";
import textCommand from "../util/textCommand";
import { getAllUsers } from "../util/userUtil";

const serverStats = textCommand({
    name: 'serverStats',
    category: 'statCheck',
    description: 'Check stats',
    minArgs: 0,
    maxArgs: 0,
    cooldown: '30s',
}, async (ctx) => {
    await ephemeralButton(ctx.message, {
        title: `**Server Stats**`,
        label: `Show Server Stats`,
        build: async () => ({content: formatServerStats(await getAllUsers())})
    })
})

export default serverStats

const formatServerStats = (users: IUser[]): string => {
    let defaultPointsAggregate = 0

    const user = users.reduce((aggUser, curUser) => {
        defaultPointsAggregate += 100
        return {
            id: '',
            points: aggUser.points + curUser.points , 
            maxPoints: Math.max(aggUser.maxPoints ?? 0, curUser.maxPoints ?? 0) ,
            activeStartDate: curUser.activeStartDate ,
            carriedMs: (aggUser.carriedMs ?? 0) + (curUser.carriedMs ?? 0) ,
            lastAccruedPoints: 0 ,
            pointsSeq: 0 ,
            flipsLost: aggUser.flipsLost + curUser.flipsLost ,
            flipsWon: aggUser.flipsWon + curUser.flipsWon ,
            pointsWon: aggUser.pointsWon + curUser.pointsWon ,
            pointsLost: aggUser.pointsLost + curUser.pointsLost ,
            secondsActive: aggUser.secondsActive + curUser.secondsActive ,
            flipStreak: aggUser.flipStreak + curUser.flipStreak ,
            maxWinStreak: aggUser.maxWinStreak + curUser.maxWinStreak ,
            maxLossStreak: aggUser.maxLossStreak + curUser.maxLossStreak ,
            dailyClaim: curUser.dailyClaim ,
            weeklyClaim: curUser.weeklyClaim ,
            monthlyClaim: curUser.monthlyClaim ,
            yearlyClaim: curUser.yearlyClaim ,
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

    const pPF = (user.flipsWon + user.flipsLost) > 0 ? formatPoints((user.pointsLost + user.pointsWon) / (user.flipsWon + user.flipsLost), 1) : 0
    const pPL = user.flipsLost > 0 ? formatPoints(user.pointsLost / user.flipsLost, 1) : 0
    const pPW = user.flipsWon > 0 ? formatPoints(user.pointsWon / user.flipsWon, 1) : 0

    return (
`**Server Stats**
\`\`\`Ruby
Existing Points      ${formatPoints(user.points)}
Highest Balance      ${formatPoints(user.maxPoints)}
Time Wasted          ${years} years / ${days} days / ${hours} hours / ${minutes} minutes

Points Farmed        ${formatPoints(Math.floor(user.secondsActive/60))}
Points Claimed       ${formatPoints(user.pointsClaimed)}
Total Earnings       ${formatPoints(user.pointsClaimed + Math.floor(user.secondsActive/60) + defaultPointsAggregate)}

Debt                 ${formatPoints(Math.max((user.points - (user.pointsClaimed + Math.floor(user.secondsActive/60) + defaultPointsAggregate)) * -1, 0))}

Flips                ${formatPoints(user.flipsWon+user.flipsLost)} Total / ${formatPoints(user.flipsWon)} Won / ${formatPoints(user.flipsLost)} Lost
Returns              ${formatPoints(user.pointsWon+user.pointsLost)} Total / ${formatPoints(user.pointsWon)} Won / ${formatPoints(user.pointsLost)} Lost
Avg Bets             ${pPF} Avg Bet / ${pPW} Avg Win / ${pPL} Avg Loss

Points Given         ${formatPoints(user.pointsGiven)} Given
Challenges           ${formatPoints(user.challengesWon)} Total / ${formatPoints(user.challengePointsWon)} Points
Wars                 ${formatPoints(user.warsWon)} Total / ${formatPoints(user.warPointsWon)} Points
R P S                ${formatPoints(user.rpsWon)} Total / ${formatPoints(user.rpsPointsWon)} Points
\`\`\``
    )
}
