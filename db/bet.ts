import { Schema, model } from "mongoose";
import * as dotenv from "dotenv"
dotenv.config()

export interface IUserBet {
    id: string
    outcome: number
    bet: number
    name: string
}

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

export interface IBet {
    id?: string
    messageId?: string
    numOutcomes?: number
    userBets?: IUserBet[]
}

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

export const getBet = async (id: string): Promise<IBet> => {
    return (await betModel.findOne({id})) as IBet
}

export const updateBet = async (id: string, betUpdates: IBet) => {
    await betModel.findOneAndUpdate({id}, {$set: {...(betUpdates)}})
}

export const insertBet = async (bet: IBet) => {
    await new betModel({...(bet)}).save()
}
