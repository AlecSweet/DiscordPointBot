import { Schema, model, models, Model } from "mongoose";
import retryWrite from "./retryWrite";
import * as dotenv from "dotenv"
dotenv.config()


export interface IRps {
    ownerId?: string
    ownerBet?: number
    acceptId?: string
    acceptBet?: number
    startDate?: Date
}

export interface IRpsRet {
    ownerId: string
    ownerBet: number
    acceptId: string
    acceptBet: number
    startDate: Date
}

const rpsSchema = new Schema({
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

const rpsModel: Model<IRpsRet> = models.rps || model<IRpsRet>('rps', rpsSchema);

export default rpsModel

export const getRps = async (ownerId: string): Promise<IRpsRet | null> =>
    await rpsModel.findOne({ownerId: ownerId}).catch((err) => { console.log(err); return null })

export const updateRps = async (ownerId: string, rpsUpdates: IRps): Promise<boolean> =>
    await rpsModel.findOneAndUpdate({ownerId: ownerId}, {$set: {...(rpsUpdates)}})
        .then((updated) => updated !== null)
        .catch((err) => { console.log(err); return false })

export const insertRps = async (rps: IRps): Promise<boolean> =>
    await new rpsModel({...(rps)}).save()
        .then(() => true)
        .catch((err) => { console.log(err); return false })

export const deleteRps = async (ownerId: string): Promise<boolean> =>
    await retryWrite(() => rpsModel.deleteOne({ownerId: ownerId}), `deleting the rps for ${ownerId}`)