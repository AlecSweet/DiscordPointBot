import { Schema, model } from "mongoose";
import * as dotenv from "dotenv"
dotenv.config()

const userBet = new Schema({
    id: {
        type: String,
        required: true,
    },
    outcome: {
        type: Number,
        required: true,
    },
    bet: {
        type: Number,
        required: true,
    },
});

const betSchema = new Schema({
    id: {
        type: String,
        required: true,
    },
    messageId: {
        type: String,
        required: true,
    },
    numOutcomes: {
        type: Number,
        required: true,
    },
    userBets: [{type: userBet}],
});

const betModel = model['bet'] || model('bet', betSchema);

export const getBet = async (id: string) => {
    return await betModel.findOne({id})
}

/*export const updateBet = async (activeChannelIds: string[], afkChannelId: string) => {
    const updateResult = await guildModel.findOneAndUpdate(
        {id: `${process.env.GUILD_ID}`},
        {$set: {activeChannelIds, afkChannelId}},
        {new: true}
    )
    updateResult ? updateResult : await new guildModel({
        id: `${process.env.GUILD_ID}`,
        activeChannelIds,
        afkChannelId,
    }).save()
}*/
