import userModel from "../db/user";
import isValidNumberArg from "../util/isValidNumberArg";
import { ICallback, ICommand } from "../wokTypes";

enum LeaderboardTypes {
    points = 'points',
    flipslost = 'flipsLost',
    flipswon = 'flipsWon',
    pointswon = 'pointsWon',
    pointslost = 'pointsLost',
    active = 'secondsActive',
    flips = 'flips',
    unluckiestflipper = 'unluckiestFlipper',
    luckiestflipper = 'luckiestFlipper',
    worstflipper = 'worstFlipper',
    bestflipper = 'bestFlipper'
}

enum LeaderboardTitles {
    points = 'Points Top',
    flips = 'Total Flips Top',
    flipsLost = 'Flips Lost Top',
    flipsWon = 'Flips Won Top',
    pointsWon = 'Flip Points Won Top',
    pointsLost = 'Flip Points Lost Top',
    secondsActive = 'Time Active Top',
    unluckiestFlipper = '(*Min 5 Flips*) Flip Win Rate Bottom',
    luckiestFlipper = '(*Min 5 Flips*) Flip Win Rate Top',
    worstFlipper = '(*Min 3W and 3L*) Avg PointsPerWin / Avg PointsPerLoss Bottom',
    bestFlipper = '(*Min 3W and 3L*) Avg PointsPerWin / Avg PointsPerLoss Top',
}


const leaderboardAggregates = {
    points: [{$sort:{points:-1}}],
    flips: [
        {$addFields: { flips: { $add: [ "$flipsLost", "$flipsWon"]}}},
        {$sort: {flips:-1}},
    ],
    flipsLost: [{$sort:{flipsLost:-1}}],
    flipsWon: [{$sort:{flipsLost:-1}}],
    //worstFlipper: 0,
    luckiestFlipper: [
        {$addFields: { flips: { $add: [ "$flipsLost", "$flipsWon"]}}},
        {$match: { flips: {$gt: 5}}},
        {$addFields: { luckiestFlipper: { $divide: [ "$flipsWon", "$flips"]}}},
        //{$addFields: { luckiestFlipper: { $cond: [{ $eq: [ "$flipsLost", 0 ] }, "$flipsWon", { $divide: [ "$flipsWon", "$flipsLost"]}] }}},
        {$sort: {luckiestFlipper:-1}},
    ],
    unluckiestFlipper: [
        {$addFields: { flips: { $add: [ "$flipsLost", "$flipsWon"]}}},
        {$match: { flips: {$gt: 5}}},
        {$addFields: { unluckiestFlipper: { $divide: [ "$flipsWon", "$flips"]}}},
        {$sort: {unluckiestFlipper:1}},
    ],
    bestFlipper: [
        {$match: { flipsLost: {$gt: 3}}},
        {$match: { flipsWon: {$gt: 3}}},
        {$addFields: { avgPPW: { $divide: [ "$pointsWon", "$flipsWon"]}}},
        {$addFields: { avgPPL: { $divide: [ "$pointsLost", "$flipsLost"]}}},
        {$addFields: { ratio: { $divide: [ "$avgPPW", "$avgPPL"]}}},
        {$sort: {ratio:-1}},
    ],
    worstFlipper: [
        {$match: { flipsLost: {$gt: 3}}},
        {$match: { flipsWon: {$gt: 3}}},
        {$addFields: { avgPPW: { $divide: [ "$pointsWon", "$flipsWon"]}}},
        {$addFields: { avgPPL: { $divide: [ "$pointsLost", "$flipsLost"]}}},
        {$addFields: { ratio: { $divide: [ "$avgPPW", "$avgPPL"]}}},
        {$sort: {ratio:1}},
    ],
    pointsWon: [{$sort:{pointsWon:-1}},],
    pointsLost: [{$sort:{pointsLost:-1}},],
    secondsActive: [{$sort:{secondsActive:-1}},],
}

const leaderboard: ICommand = {
    name: 'top',
    category: 'leaderboard',
    description: 'top users',
    expectedArgs: '<leaderboard type> <Optional # of users (1-20)>',
    minArgs: 0,
    maxArgs: 2,
    cooldown: '6s',
    syntaxError: 'Incorrect syntax! Use `{PREFIX}`ping {ARGUMENTS}',
    callback: async (options: ICallback) => {
        const { message, args, guild} = options

        let leaderboardType = args[0] ? args[0].toLowerCase() : args[0]
        if (!leaderboardType || !LeaderboardTypes[leaderboardType]) {
            const validTypes: string[] = []
            for (const e in LeaderboardTypes) {
                validTypes.push(e)
            }
            message.reply({content: `Use !top <leaderboard type> <optional # of users[1-20]>\nLeadboard Types: \n\`\`\`${validTypes.join(', ')}\`\`\``})
            return
        }
        leaderboardType = LeaderboardTypes[leaderboardType]

        const numTop = args[1] ? Number(args[1]) : 5
        if (!isValidNumberArg(numTop) || numTop > 20) {
            message.reply({content: `${args[1]} ain valid for number of top users ${process.env.NOPPERS_EMOJI}, enter a number 1-20`})
            return
        }

        const result = await userModel.aggregate([
            ...(leaderboardAggregates[leaderboardType]),
            {$limit: numTop}
        ])


        let maxLen=0
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const t = await Promise.all(result.map(async (user, index): Promise<any> => {
            const name = (await guild.members.fetch(user.id)).displayName
            maxLen = maxLen < name.length ? name.length : maxLen
            return {
                nameLen: name.length,
                half1: numTop > 9 ? 
                        index < 9 ? `${index+1})  ${name}:` : `${index+1}) ${name}:` : 
                        `${index+1}) ${name}:`, 
                half2: `${getValueByLeaderBoardType(user, leaderboardType)}\n`
            }
        }))

        const formatedResults = t.map( entry => {
            const space = " ".repeat((maxLen - entry.nameLen) + 1);
            return `${entry.half1}${space}${entry.half2}`
        })

        message.reply({
            content: `**${LeaderboardTitles[leaderboardType]} ${numTop}**\n\`\`\`${formatedResults.join('')}\`\`\`${leaderboardType === 'points' || leaderboardType === 'secondsActive' ? `${process.env.SHRUGGERS_EMOJI}*ᴹᶦᵍʰᵗ ᵇᵉ ᵃ ᵇᶦᵗ ᵇᵉʰᶦⁿᵈ`: ''}`
        })
    }
}

export default leaderboard

const getValueByLeaderBoardType = (user, type: string): string => {
    if (type === 'worstFlipper' || type === 'bestFlipper') {
        return `PpW ${(Math.round(user.avgPPW * 10) / 10).toFixed(1)}/ PpL${(Math.round(user.avgPPL * 10) / 10).toFixed(1)}`
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