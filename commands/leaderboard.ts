import { Guild } from "discord.js";
import userModel from "../db/user";
import ephemeralButton from "../util/ephemeralButton";
import { MAX_MESSAGE_LENGTH } from "../util/fitToMessageLimit";
import isValidNumberArg from "../util/isValidNumberArg";
import { deleteMarkdown } from "../util/isValidUserArg";
import recordFile from "../util/recordFile";
import { IPanel } from "../util/sendPanel";
import textCommand from "../util/textCommand";
import { settledPoints, settledSecondsActive } from "../util/userUtil";

enum LeaderboardTypes {
    points = 'points',
    peak = 'maxPoints',
    mostdebt = 'mostDebt',
    leastdebt = 'leastDebt',
    flipslost = 'flipsLost',
    flipswon = 'flipsWon',
    pointsflipped = 'pointsFlipped',
    flippointswon = 'pointsWon',
    flippointslost = 'pointsLost',
    active = 'secondsActive',
    flips = 'flips',
    unluckiest = 'unluckiestFlipper',
    luckiest = 'luckiestFlipper',
    worstflipper = 'worstFlipper',
    bestflipper = 'bestFlipper',
    given = 'pointsGiven',
    received = 'pointsRecieved',
    winstreak = 'maxWinStreak',
    lossstreak = 'maxLossStreak',
    highroller = 'highRoller',
    pointsclaimed = 'pointsClaimed',
    warpointswon= 'warPointsWon', 
    warpointslost= 'warPointsLost', 
    pointswarred= 'pointsWarred', 
    warswon= 'warsWon', 
    warslost= 'warsLost', 
    wars= 'wars', 
    challengepointswon= 'challengePointsWon', 
    challengepointslost= 'challengePointsLost', 
    pointschallenged= 'pointsChallenged', 
    challengeswon= 'challengesWon', 
    challengeslost= 'challengesLost', 
    challenges= 'challenges',
    rpspointswon = 'rpsPointsWon',
    rpspointslost = 'rpsPointsLost',
    pointsrps = 'pointsRps',
    rpswon = 'rpsWon',
    rpslost = 'rpsLost',
    rps = 'rps',
}

enum LeaderboardTitles {
    points = 'Points Top',
    maxPoints = 'Peak Points Top',
    mostDebt = 'Most Debt',
    leastDebt = 'Least Debt',
    flips = 'Total Flips Top',
    flipsLost = 'Flips Lost Top',
    flipsWon = 'Flips Won Top',
    pointsWon = 'Points Won to Flips Top',
    pointsLost = 'Points Lost to Flips Top',
    secondsActive = 'Time Active Top',
    unluckiestFlipper = '(*Min 5 Flips*) Flip Win Rate Bottom',
    luckiestFlipper = '(*Min 5 Flips*) Flip Win Rate Top',
    worstFlipper = '(*Min 3W and 3L*) Avg PointsPerWin / Avg PointsPerLoss Bottom',
    bestFlipper = '(*Min 3W and 3L*) Avg PointsPerWin / Avg PointsPerLoss Top',
    pointsFlipped = 'Total Points Flipped Top',
    pointsGiven = 'Points Given Top',
    pointsRecieved = 'Points Recieved Top',
    maxWinStreak = 'Max Win Streak Top',
    maxLossStreak = 'Max Loss Streak Top',
    highRoller = 'Flip Average Bet',
    pointsClaimed = 'Points Claimed Top',
    challengePointsWon = 'Points Won On Challenges Top',
    challengePointsLost = 'Points Lost On Challenges Top',
    pointsChallenged = 'Total Points Bet on Challenges Top',
    challengesWon = 'Challenges Won Top',
    challengesLost = 'Challenges Lost Top',
    challenges = 'Total Challenges Played In Top',
    warPointsWon = 'Points Won On Wars Top',
    warPointsLost = 'Points Lost On Wars Top',
    pointsWarred = 'Total Points Bet on Wars Top',
    warsWon = 'Wars Won Top',
    warsLost = 'Wars Lost Top',
    wars = 'Total Wars Played In Top',
    rpsPointsWon = 'Points Won On Rock Paper Scissors Top',
    rpsPointsLost = 'Points Lost On Rock Paper Scissors Top',
    pointsRps = 'Total Points Bet on Rock Paper Scissors Top',
    rpsWon = 'Rock Paper Scissors Rounds Won Top',
    rpsLost = 'Rock Paper Scissors Rounds Lost Top',
    rps = 'Total Rock Paper Scissors Rounds Played In Top',
}


const leaderboardAggregates = {
    points: [{$set: {points: settledPoints}}, {$sort: {points: -1}}],
    maxPoints: [{$set: {maxPoints: {$max: ["$maxPoints", settledPoints]}}}, {$sort: {maxPoints: -1}}],
    mostDebt: [
        {$addFields: { 
            mostDebt: { $subtract: [{ $add: [ {$add: [ {$floor: { $divide: [ "$secondsActive", 60] } }, 100]}, "$pointsClaimed"]}, "$points"]}}},
        {$sort: {mostDebt:1}},
    ],
    leastDebt: [
        {$addFields: { leastDebt: { $subtract: [ { $add: [ {$floor: { $divide: [ "$secondsActive", 60] }}, 100]}, "$points"]}}},
        {$sort: {leastDebt:-1}},
    ],
    flips: [
        {$addFields: { flips: { $add: [ "$flipsLost", "$flipsWon"]}}},
        {$sort: {flips:-1}},
    ],
    flipsLost: [{$sort:{flipsLost:-1}}],
    flipsWon: [{$sort:{flipsLost:-1}}],
    //worstFlipper: 0,
    luckiestFlipper: [
        {$addFields: { flips: { $add: [ "$flipsLost", "$flipsWon"]}}},
        {$match: { flips: {$gt: 4}}},
        {$addFields: { luckiestFlipper: { $divide: [ "$flipsWon", "$flips"]}}},
        //{$addFields: { luckiestFlipper: { $cond: [{ $eq: [ "$flipsLost", 0 ] }, "$flipsWon", { $divide: [ "$flipsWon", "$flipsLost"]}] }}},
        {$sort: {luckiestFlipper:-1}},
    ],
    unluckiestFlipper: [
        {$addFields: { flips: { $add: [ "$flipsLost", "$flipsWon"]}}},
        {$match: { flips: {$gt: 4}}},
        {$addFields: { unluckiestFlipper: { $divide: [ "$flipsWon", "$flips"]}}},
        {$sort: {unluckiestFlipper:1}},
    ],
    bestFlipper: [
        {$match: { flipsLost: {$gt: 2}}},
        {$match: { flipsWon: {$gt: 2}}},
        {$addFields: { avgPPW: { $divide: [ "$pointsWon", "$flipsWon"]}}},
        {$addFields: { avgPPL: { $divide: [ "$pointsLost", "$flipsLost"]}}},
        {$addFields: { ratio: { $divide: [ "$avgPPW", "$avgPPL"]}}},
        {$sort: {ratio:-1}},
    ],
    worstFlipper: [
        {$match: { flipsLost: {$gt: 2}}},
        {$match: { flipsWon: {$gt: 2}}},
        {$addFields: { avgPPW: { $divide: [ "$pointsWon", "$flipsWon"]}}},
        {$addFields: { avgPPL: { $divide: [ "$pointsLost", "$flipsLost"]}}},
        {$addFields: { ratio: { $divide: [ "$avgPPW", "$avgPPL"]}}},
        {$sort: {ratio:1}},
    ],
    pointsFlipped: [
        {$addFields: { pointsFlipped: { $add: [ "$pointsWon", "$pointsLost"]}}},
        {$sort: {pointsFlipped:-1}},
    ],
    pointsWon: [{$sort:{pointsWon:-1}}],
    pointsLost: [{$sort:{pointsLost:-1}}],
    secondsActive: [{$set: {secondsActive: settledSecondsActive}}, {$sort: {secondsActive: -1}}],
    pointsGiven: [{$match: { pointsGiven: {$gt: 0}}}, {$sort:{pointsGiven:-1}}],
    pointsRecieved: [{$match: { pointsRecieved: {$gt: 0}}}, {$sort:{pointsRecieved:-1}}],
    maxWinStreak: [{$match: { maxWinStreak: {$gt: 0}}}, {$sort:{maxWinStreak:-1}}],
    maxLossStreak: [{$match: { maxLossStreak: {$gt: 0}}}, {$sort:{maxLossStreak:-1}}],
    highRoller: [
        {$addFields: { flips: { $add: [ "$flipsLost", "$flipsWon"]}}},
        {$match: { flips: {$gt: 9}}},
        {$addFields: { totalPoints: { $add: [ "$pointsWon", "$pointsLost"]}}},
        {$addFields: { avgPPB: { $divide: [ "$totalPoints", "$flips"]}}},
        {$sort: {avgPPB:-1}},
    ],
    pointsClaimed: [{$match: { pointsClaimed: {$gt: 0}}}, {$sort:{pointsClaimed:-1}}],
    warPointsWon: [{$sort:{warPointsWon:-1}}],
    warPointsLost: [{$sort:{warPointsLost:-1}}],
    pointsWarred: [
        {$addFields: { pointsWarred: { $add: [ "$warPointsWon", "$warPointsLost"]}}},
        {$sort: {pointsWarred:-1}},
    ],
    warsWon: [{$sort:{warsWon:-1}}],
    warsLost: [{$sort:{warsLost:-1}}],
    wars: [
        {$addFields: { wars: { $add: [ "$warsWon", "$warsLost"]}}},
        {$sort: {wars:-1}},
    ],
    challengePointsWon: [{$sort:{challengePointsWon:-1}}],
    challengePointsLost: [{$sort:{challengePointsLost:-1}}],
    pointsChallenged: [
        {$addFields: { pointsChallenged: { $add: [ "$challengePointsWon", "$challengePointsLost"]}}},
        {$sort: {pointsChallenged:-1}},
    ],
    challengesWon: [{$sort:{challengesWon:-1}}],
    challengesLost: [{$sort:{challengesLost:-1}}],
    challenges: [
        {$addFields: { challenges: { $add: [ "$challengesWon", "$challengesLost"]}}},
        {$sort: {challenges:-1}},
    ],
    rpsPointsWon: [{$sort:{rpsPointsWon:-1}}],
    rpsPointsLost: [{$sort:{rpsPointsLost:-1}}],
    pointsRps: [
        {$addFields: { pointsRps: { $add: [ "$rpsPointsWon", "$rpsPointsLost"]}}},
        {$sort: {pointsRps:-1}},
    ],
    rpsWon: [{$sort:{rpsWon:-1}}],
    rpsLost: [{$sort:{rpsLost:-1}}],
    rps: [
        {$addFields: { rps: { $add: [ "$rpsWon", "$rpsLost"]}}},
        {$sort: {rps:-1}},
    ],
}

const MAX_TOP = 500
const RECORD_FILE = 'top.txt'

const leaderboard = textCommand({
    name: 'top',
    category: 'leaderboard',
    description: 'top users',
    expectedArgs: `<leaderboard type> <Optional # of users (1-${MAX_TOP})>`,
    minArgs: 0,
    maxArgs: 2,
    cooldown: '6s',
    syntaxError: 'Incorrect syntax! Use `{PREFIX}`ping {ARGUMENTS}',
}, async (ctx) => {
        const { message, args, guild } = ctx

        let leaderboardType = args[0] ? args[0].toLowerCase() : args[0]
        if (!leaderboardType || !LeaderboardTypes[leaderboardType]) {
            await message.reply({content:
`Use !top <leaderboard type> <optional # of users[1-${MAX_TOP}]>
\`\`\`
Leadboard Types:

Points          Flips            Challenges             Rps
Peak            FlipsWon         ChallengesWon          RpsWon
Active          FlipsLost        ChallengesLost         RpsLost
Given           FlipPointsWon    ChallengePointsWon     RpsPointsWon
Received        FlipPointsLost   ChallengePointsLost    RpsPointsLost
PointsClaimed   PointsFlipped    PointsChallenged       PointsRps
MostDebt        Unluckiest
LeastDebt       Luckiest         Wars
                WorstFlipper     WarsWon
                BestFlipper      WarsLost
                WinStreak        WarPointsWon
                LossStreak       WarPointsLost
                Highroller       PointsWarred
\`\`\``})
            return
        }
        leaderboardType = LeaderboardTypes[leaderboardType]

        const numTop = args[1] ? Number(args[1]) : 5
        if (!isValidNumberArg(numTop) || numTop > MAX_TOP) {
            await message.reply({content: `${args[1]} ain valid for number of top users ${process.env.NOPPERS_EMOJI}, enter a number 1-${MAX_TOP}`})
            return
        }

        await ephemeralButton(message, {
            title: `**${LeaderboardTitles[leaderboardType]}**`,
            command: 'top',
            label: `Show Leaderboard`,
            build: () => formatLeaderboard(leaderboardType, numTop, guild)
        })
})

export default leaderboard

const formatLeaderboard = async (leaderboardType: string, numTop: number, guild: Guild): Promise<IPanel> => {
    const result = await userModel.aggregate([
        ...(leaderboardAggregates[leaderboardType]),
        {$limit: numTop}
    ])

    let maxLen=0
    const rankWidth = String(result.length).length
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const t = await Promise.all(result.map(async (user, index): Promise<any> => {
        const member = await guild.members.fetch(user.id).catch(() => undefined)
        const name = member ? deleteMarkdown(member.displayName) : "Deleted User"
        maxLen = maxLen < name.length ? name.length : maxLen
        return {
            nameLen: name.length,
            half1: `${String(index+1).padStart(rankWidth)}) ${name}:`,
            half2: `${getValueByLeaderBoardType(user, leaderboardType)}\n`
        }
    }))

    const formatedResults = t.map( entry => {
        const space = " ".repeat((maxLen - entry.nameLen) + 1);
        return `${entry.half1}${space}${entry.half2}`
    })

    const build = (entries: string[]) =>
`**${LeaderboardTitles[leaderboardType]} ${entries.length}${entries.length < formatedResults.length ? ` of ${formatedResults.length}` : ''}**\n\`\`\`
${entries.join('')}\`\`\``

    const shown = [...formatedResults]
    while (shown.length > 1 && build(shown).length > MAX_MESSAGE_LENGTH) {
        shown.pop()
    }

    return {
        content: build(shown),
        ...recordFile(shown.length < formatedResults.length ? formatedResults.join('') : undefined, RECORD_FILE)
    }
}

const getValueByLeaderBoardType = (user, type: string): string => {
    if (type === 'worstFlipper' || type === 'bestFlipper') {
        return `Avg Win: ${(Math.round(user.avgPPW * 10) / 10).toFixed(1)} / Avg Loss: ${(Math.round(user.avgPPL * 10) / 10).toFixed(1)}`
    }

    if (type === 'highRoller') {
        return `Avg Bet: ${(Math.round(user.avgPPB * 10) / 10).toFixed(1)}`
    }

    if (type === 'secondsActive') {
        const days = Math.floor(user.secondsActive / 86400)
        const secLeftAfterDays = user.secondsActive % 86400
        const hours = Math.floor(secLeftAfterDays / 3600)
        const secLeftAfterHours = secLeftAfterDays % 3600
        const minutes = Math.floor(secLeftAfterHours / 60)
        return `${days}d / ${hours}h / ${minutes}m`
    }
    
    const numCheck = Number(user[type])
    if (!isNaN(numCheck) && !Number.isInteger(user[type])) {
        if (type === 'unluckiestFlipper' || type === 'luckiestFlipper') {
            return `${(Math.round(numCheck * 10000) / 100).toFixed(2)}%`
        }

        return (Math.round(numCheck * 10000) / 10000).toFixed(4);
    }
   
    return user[type]
}