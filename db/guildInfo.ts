import { Schema, model, models, Model } from "mongoose";
import isDuplicateKeyError from "./duplicateKey";
import retryWrite from "./retryWrite";
import * as dotenv from "dotenv"
dotenv.config()

const UNTRACKED = "voice activity there earns nothing until the next restart"

export interface ICurrentGuildInfo {
    activeChannelIds: string[]
    afkChannelId: string
}

interface IGuildDoc extends ICurrentGuildInfo {
    id: string
}

const guildSchema = new Schema({
    id: {
        type: String,
        required: true,
        unique: true,
    },
    activeChannelIds: [{type: String}],
    afkChannelId: {type: String},
});

const guildModel: Model<IGuildDoc> = models.guild || model<IGuildDoc>('guild', guildSchema);

export default guildModel

export const getCurrentGuildInfo = async (): Promise<ICurrentGuildInfo | null> => {
    const result = await guildModel.findOne({id: `${process.env.GUILD_ID}`})
    if (result === null) return null

    return {activeChannelIds: result.activeChannelIds, afkChannelId: result.afkChannelId}
}

export const updateCurrentGuildInfo = async (activeChannelIds: string[], afkChannelId: string) => {
    const upsert = () => guildModel.findOneAndUpdate(
        {id: `${process.env.GUILD_ID}`},
        {$set: {activeChannelIds: activeChannelIds, afkChannelId: afkChannelId}},
        {new: true, upsert: true}
    )

    await upsert().catch(async (err) => {
        if (!isDuplicateKeyError(err)) throw err
        await upsert()
    })
}

export const addActiveChannel = async (channelId: string): Promise<boolean> =>
    await retryWrite(async () => {
        const result = await guildModel.updateOne(
            {id: `${process.env.GUILD_ID}`},
            {$addToSet: {activeChannelIds: channelId}}
        )
        if (result.matchedCount === 0) throw new Error("no guild info is stored yet")
    }, `adding channel ${channelId} to the active channels`, UNTRACKED)
