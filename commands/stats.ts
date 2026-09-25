import { IUser } from "../db/user";
import { parseTarget } from "../util/args";
import ephemeralButton from "../util/ephemeralButton";
import formatPoints from "../util/formatPoints";
import textCommand from "../util/textCommand";
import { settleUser } from "../util/userUtil";

const stats = textCommand({
    name: 'stats',
    category: 'statCheck',
    description: 'Check stats',
    expectedArgs: '<users @>',
    minArgs: 0,
    maxArgs: 1,
    cooldown: '5s',
}, async (ctx) => {
    const id = ctx.args[0] ? await parseTarget(ctx.args[0], ctx, {allowSelf: true}) : ctx.authorId
    if (id === undefined) {
        return
    }

    await ephemeralButton(ctx.message, {
        title: `**<@${id}>'s Stats**`,
        label: `Show Stats`,
        build: async () => ({content: formatStats(await settleUser(id))})
    })
})

export default stats

const formatStats = (user: IUser): string => {
    const days = Math.floor(user.secondsActive / 86400)
    const secLeftAfterDays = user.secondsActive % 86400
    const hours = Math.floor(secLeftAfterDays / 3600)
    const secLeftAfterHours = secLeftAfterDays % 3600
    const minutes = Math.floor(secLeftAfterHours / 60)

    const pPF = (user.flipsWon + user.flipsLost) > 0 ? formatPoints((user.pointsLost + user.pointsWon) / (user.flipsWon + user.flipsLost), 1) : 0
    const pPL = user.flipsLost > 0 ? formatPoints(user.pointsLost / user.flipsLost, 1) : 0
    const pPW = user.flipsWon > 0 ? formatPoints(user.pointsWon / user.flipsWon, 1) : 0

    const cpPF = (user.challengesWon + user.challengesLost) > 0 ? formatPoints((user.challengePointsLost + user.challengePointsWon) / (user.challengesWon + user.challengesLost), 1) : 0
    const cpPL = user.challengesLost > 0 ? formatPoints(user.challengePointsLost / user.challengesLost, 1) : 0
    const cpPW = user.challengesWon > 0 ? formatPoints(user.challengePointsWon / user.challengesWon, 1) : 0

    const wpPF = (user.warsWon + user.warsLost) > 0 ? formatPoints((user.warPointsLost + user.warPointsWon) / (user.warsWon + user.warsLost), 1) : 0
    const wpPL = user.warsLost > 0 ? formatPoints(user.warPointsLost / user.warsLost, 1) : 0
    const wpPW = user.warsWon > 0 ? formatPoints(user.warPointsWon / user.warsWon, 1) : 0

    const rpPF = (user.rpsWon + user.rpsLost) > 0 ? formatPoints((user.rpsPointsLost + user.rpsPointsWon) / (user.rpsWon + user.rpsLost), 1) : 0
    const rpPL = user.rpsLost > 0 ? formatPoints(user.rpsPointsLost / user.rpsLost, 1) : 0
    const rpPW = user.rpsWon > 0 ? formatPoints(user.rpsPointsWon / user.rpsWon, 1) : 0

    return (
`**<@${user.id}>'s Stats**
\`\`\`Ruby
Points          ${formatPoints(user.points)}
Peak Points     ${formatPoints(user.maxPoints)}
Active          ${days} days / ${hours} hours / ${minutes} minutes
Debt            ${formatPoints(Math.max((user.points - (user.pointsClaimed + Math.floor(user.secondsActive/60) + 100)) * -1, 0))}

Points Earned   ${formatPoints(Math.floor(user.secondsActive/60))}
Point Gifts     ${formatPoints(user.pointsGiven)} Given / ${formatPoints(user.pointsRecieved)} Received
Points Claimed  ${formatPoints(user.pointsClaimed)} Claimed

Flips           ${formatPoints(user.flipsWon+user.flipsLost)} Total / ${formatPoints(user.flipsWon)} Won / ${formatPoints(user.flipsLost)} Lost
Returns         ${formatPoints(user.pointsWon+user.pointsLost)} Total / ${formatPoints(user.pointsWon)} Won / ${formatPoints(user.pointsLost)} Lost
Avg Bets        ${pPF} Avg Bet / ${pPW} Avg Win / ${pPL} Avg Loss
Max Streak      ${formatPoints(user.maxWinStreak)} Won / ${formatPoints(user.maxLossStreak)} Lost
Current Streak  ${user.flipStreak < 0 ? `${formatPoints(Math.abs(user.flipStreak))} Lost` : `${formatPoints(user.flipStreak)} Won`}

Challenges      ${formatPoints(user.challengesWon+user.challengesLost)} Total / ${formatPoints(user.challengesWon)} Won / ${formatPoints(user.challengesLost)} Lost
Returns         ${formatPoints(user.challengePointsWon+user.challengePointsLost)} Total / ${formatPoints(user.challengePointsWon)} Won / ${formatPoints(user.challengePointsLost)} Lost
Avg Bets        ${cpPF} Avg Bet / ${cpPW} Avg Win / ${cpPL} Avg Loss

War             ${formatPoints(user.warsWon+user.warsLost)} Total / ${formatPoints(user.warsWon)} Won / ${formatPoints(user.warsLost)} Lost
Returns         ${formatPoints(user.warPointsWon+user.warPointsLost)} Total / ${formatPoints(user.warPointsWon)} Won / ${formatPoints(user.warPointsLost)} Lost
Avg Bets        ${wpPF} Avg Bet / ${wpPW} Avg Win / ${wpPL} Avg Loss

R P S           ${formatPoints(user.rpsWon+user.rpsLost)} Total / ${formatPoints(user.rpsWon)} Won / ${formatPoints(user.rpsLost)} Lost
Returns         ${formatPoints(user.rpsPointsWon+user.rpsPointsLost)} Total / ${formatPoints(user.rpsPointsWon)} Won / ${formatPoints(user.rpsPointsLost)} Lost
Avg Bets        ${rpPF} Avg Bet / ${rpPW} Avg Win / ${rpPL} Avg Loss
\`\`\``
    )
}
