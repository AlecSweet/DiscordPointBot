import { Schema, model } from "mongoose";
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
        default: new Date(),
        required: true
    }
});

const warModel = model['war'] || model('war', warSchema);

export default warModel

export const getWar = async (ownerId: string): Promise<IwarRet> => {
    return await warModel.findOne({ownerId}).catch(err => {console.log(err)})
}

export const updateWar = async (ownerId: string, warUpdates: Iwar) => {
    await warModel.findOneAndUpdate({ownerId}, {$set: {...(warUpdates)}}).catch(err => {console.log(err)})
}

export const incWar= async (ownerId: string, warUpdates: Iwar) => {
    await warModel.findOneAndUpdate({ownerId}, {$inc: {...(warUpdates)}}).catch(err => {console.log(err)})
}

export const insertWar = async (war: Iwar) => {
    await new warModel({...(war)}).save().catch(err => {console.log(err)})
}

export const deleteWar = async (ownerId: string) => {
    return await warModel.deleteOne({ownerId}).catch(err => {console.log(err)})
}