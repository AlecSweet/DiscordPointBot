import betModel from "../db/bet";
import { returnPointsDeleteBet } from "../util/betUtil";
import { ICallback, ICommand } from "../wokTypes";

const forceCancelBet: ICommand = {
    name: 'forceCancelBet',
    category: 'force cancel bet',
    description: 'force cancel bet',
    cooldown: '3s',
    callback: async (options: ICallback) => {
        const { message, guild } = options

        if (!(message.channel.type === "GUILD_TEXT")) {
            message.reply({content: `Only use in text channel ${process.env.NOPPERS_EMOJI}`})
            return
        }

        const bet = await betModel.findOne({ownerId: message.author.id})
        if(!bet) {
            message.reply({content: `You don't have a bet open ${process.env.NOPPERS_EMOJI}`})
            return
        }

        const activeThreads = await guild.channels.fetchActiveThreads()
        const betThread = activeThreads.threads.find(thread => thread.id === bet.threadId)
        if (betThread) {
            await betThread.delete()
        }

        await returnPointsDeleteBet(bet.threadId)
        message.reply({content: `Bet force canceled and points returned.`})
    }
}

export default forceCancelBet