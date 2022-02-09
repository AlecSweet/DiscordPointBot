import { Schema, model } from "mongoose";
import * as dotenv from "dotenv"
dotenv.config()


export interface IChallenge {
    ownerId?: string
    ownerBet?: number
    acceptId?: string
    acceptBet?: number
    startDate?: Date
}

export interface IChallengeRet {
    ownerId: string
    ownerBet: number
    acceptId: string
    acceptBet: number
    startDate: Date
}

const challengeSchema = new Schema({
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

const challengeModel = model['challenge'] || model('challenge', challengeSchema);

export default challengeModel

export const getChallenge = async (ownerId: string): Promise<IChallengeRet> => {
    return await challengeModel.findOne({ownerId}).catch(err => {console.log(err)})
}

export const updateChallenge = async (ownerId: string, challengeUpdates: IChallenge) => {
    await challengeModel.findOneAndUpdate({ownerId}, {$set: {...(challengeUpdates)}}).catch(err => {console.log(err)})
}

export const incChallenge= async (ownerId: string, challengeUpdates: IChallenge) => {
    await challengeModel.findOneAndUpdate({ownerId}, {$inc: {...(challengeUpdates)}}).catch(err => {console.log(err)})
}

export const insertChallenge = async (challenge: IChallenge) => {
    await new challengeModel({...(challenge)}).save().catch(err => {console.log(err)})
}

export const deleteChallenge = async (ownerId: string) => {
    return await challengeModel.deleteOne({ownerId}).catch(err => {console.log(err)})
}