import { Schema, model } from "mongoose";
import * as dotenv from "dotenv"
dotenv.config()

export interface IUserBet {
    userId: string
    outcome: number
    bet: number
    name: string
}

export interface IBet {
    ownerId: string
    threadId: string
    numOutcomes: number
    userBets: IUserBet[]
}

const betSchema = new Schema({
    ownerId: {
        type: String,
        required: true,
    },
    threadId: {
        type: String,
        required: true,
    },
    numOutcomes: {
        type: Number,
        required: true,
    },
    userBets: [{
        userId: {
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
        name: {
            type: String,
        }
    }],
});

const betModel = model['bet'] || model('bet', betSchema);

export default betModel

export const getBet = async (threadId: string): Promise<IBet> => {
    return await betModel.findOne({threadId})
}

export const updateBet = async (threadId: string, betUpdates: IBet) => {
    await betModel.findOneAndUpdate({threadId}, {$set: {...(betUpdates)}})
}

export const insertBet = async (bet: IBet) => {
    await new betModel({...(bet)}).save()
}

export const deleteBet = async (threadId: string) => {
    return await betModel.deleteOne({threadId})
}