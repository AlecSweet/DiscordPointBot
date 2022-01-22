import userModel from "../db/user";
import isValidNumberArg from "../util/isValidNumberArg";
import { ICallback, ICommand } from "../wokTypes";

enum LeaderboardTypes {
    points = 'points',
    flipsLost = 'flipsLost',
    flipsWon = 'flipsWon',
    pointsWon = 'pointsWon',
    pointsLost = 'pointsLost',
    active = 'secondsActive',
}

enum LeaderboardTitles {
    points = 'Points',
    flipsLost = 'Flips Lost',
    flipsWon = 'Flips Won',
    pointsWon = 'Flip Points Won',
    pointsLost = 'Flip Points Lost',
    secondsActive = 'Time Active',
}


const leaderboardAggregates = {
    points: [{$sort:{points:-1}}],
    //flips: 0,
    flipsLost: [{$sort:{flipsLost:-1}}],
    flipsWon: [{$sort:{flipsLost:-1}}],
    //worstFlipper: 0,
    //unluckiestFlipper: 0,
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
    cooldown: '20s',
    ownerOnly: true,
    syntaxError: 'Incorrect syntax! Use `{PREFIX}`ping {ARGUMENTS}',
    callback: async (options: ICallback) => {
        const { message, args, guild} = options

        let leaderboardType = args[0]
        if (!leaderboardType || !LeaderboardTypes[leaderboardType]) {
            const validTypes: string[] = []
            for (const e in LeaderboardTypes) {
                validTypes.push(e)
            }
            message.reply({content: `Use !top <leaderboard type> <Optional # of users[1-20]>\nLeadboard Types: ${validTypes.join(', ')}`})
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
            content: `**${LeaderboardTitles[leaderboardType]} Top ${numTop}**\n\`\`\`${formatedResults.join('')}\`\`\`${leaderboardType === 'points' || leaderboardType === 'secondsActive' ? `${process.env.SHRUGGERS_EMOJI}*ᴹᶦᵍʰᵗ ᵇᵉ ᵃ ᵇᶦᵗ ᵇᵉʰᶦⁿᵈ`: ''}`
        })
    }
}

export default leaderboard

const getValueByLeaderBoardType = (user, type: string): string => {
    if (type === 'secondsActive') {
        const days = Math.floor(user.secondsActive / 86400)
        const secLeftAfterDays = user.secondsActive % 86400
        const hours = Math.floor(secLeftAfterDays / 3600)
        const secLeftAfterHours = secLeftAfterDays % 3600
        const minutes = Math.floor(secLeftAfterHours / 60)
        return `${days}d / ${hours}h / ${minutes}m`
    }
    return user[type]
}