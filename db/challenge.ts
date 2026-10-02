import { Schema, model, models, Model } from "mongoose";
import retryWrite from "./retryWrite";
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
        default: Date.now,
        required: true
    }
});

const challengeModel: Model<IChallengeRet> = models.challenge || model<IChallengeRet>('challenge', challengeSchema);

export default challengeModel

export const getChallenge = async (ownerId: string): Promise<IChallengeRet | null> =>
    await challengeModel.findOne({ownerId: ownerId}).catch((err) => { console.log(err); return null })

export const updateChallenge = async (ownerId: string, challengeUpdates: IChallenge): Promise<boolean> =>
    await challengeModel.findOneAndUpdate({ownerId: ownerId}, {$set: {...(challengeUpdates)}})
        .then((updated) => updated !== null)
        .catch((err) => { console.log(err); return false })

export const insertChallenge = async (challenge: IChallenge): Promise<boolean> =>
    await new challengeModel({...(challenge)}).save()
        .then(() => true)
        .catch((err) => { console.log(err); return false })

export const deleteChallenge = async (ownerId: string): Promise<boolean> =>
    await retryWrite(() => challengeModel.deleteOne({ownerId: ownerId}), `deleting the challenge for ${ownerId}`)