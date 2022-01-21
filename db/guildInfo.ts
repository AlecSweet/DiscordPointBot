import { Schema, model } from "mongoose";
import * as dotenv from "dotenv"
dotenv.config()

export interface ICurrentGuildInfo {
    activeChannelIds: string[]
    afkChannelId: string
}

const guildSchema = new Schema({
    id: {
        type: String,
        required: true,
    },
    activeChannelIds: [{type: String}],
    afkChannelId: {type: String},
});

const guildModel = model['guild'] || model('guild', guildSchema);

export const getCurrentGuildInfo = async (): Promise<ICurrentGuildInfo> => {
    const result = await guildModel.findOne({id: `${process.env.GUILD_ID}`})
    return {activeChannelIds: result.activeChannelIds, afkChannelId: result.afkChannelId}
}

export const updateCurrentGuildInfo = async (activeChannelIds: string[], afkChannelId: string) => {
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
}
