import { Schema, model } from "mongoose";
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
        default: new Date(),
        required: true
    }
});

const rpsModel = model['rps'] || model('rps', rpsSchema);

export default rpsModel

export const getRps = async (ownerId: string): Promise<IRpsRet> => {
    return await rpsModel.findOne({ownerId}).catch(err => {console.log(err)})
}

export const updateRps = async (ownerId: string, rpsUpdates: IRps) => {
    await rpsModel.findOneAndUpdate({ownerId}, {$set: {...(rpsUpdates)}}).catch(err => {console.log(err)})
}

export const incRps= async (ownerId: string, rpsUpdates: IRps) => {
    await rpsModel.findOneAndUpdate({ownerId}, {$inc: {...(rpsUpdates)}}).catch(err => {console.log(err)})
}

export const insertRps = async (rps: IRps) => {
    await new rpsModel({...(rps)}).save().catch(err => {console.log(err)})
}

export const deleteRps = async (ownerId: string) => {
    return await rpsModel.deleteOne({ownerId}).catch(err => {console.log(err)})
}