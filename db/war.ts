import { Schema, model, models, Model } from "mongoose";
import retryWrite from "./retryWrite";
import * as dotenv from "dotenv"
dotenv.config()


export interface Iwar {
    ownerId?: string
    ownerBet?: number
    acceptId?: string
    acceptBet?: number
    startDate?: Date
}

export interface IwarRet {
    ownerId: string
    ownerBet: number
    acceptId: string
    acceptBet: number
    startDate: Date
}

const warSchema = new Schema({
    ownerId: {
        type: String,
        required: true,
    },
    ownerBet: {
        type: Number,
        default: 0,
        required: true
    },
    acceptId: {
        type: String,
        default: '',
    },
    acceptBet: {
        type: Number,
        default: 0,
    },
    startDate: {
        type: Date,
        default: Date.now,
        required: true
    }
});

const warModel: Model<IwarRet> = models.war || model<IwarRet>('war', warSchema);

export default warModel

export const getWar = async (ownerId: string): Promise<IwarRet | null> =>
    await warModel.findOne({ownerId: ownerId}).catch((err) => { console.log(err); return null })

export const updateWar = async (ownerId: string, warUpdates: Iwar): Promise<boolean> =>
    await warModel.findOneAndUpdate({ownerId: ownerId}, {$set: {...(warUpdates)}})
        .then((updated) => updated !== null)
        .catch((err) => { console.log(err); return false })

export const insertWar = async (war: Iwar): Promise<boolean> =>
    await new warModel({...(war)}).save()
        .then(() => true)
        .catch((err) => { console.log(err); return false })

export const deleteWar = async (ownerId: string): Promise<boolean> =>
    await retryWrite(() => warModel.deleteOne({ownerId: ownerId}), `deleting the war for ${ownerId}`)