import { Schema, model } from "mongoose";
import * as dotenv from "dotenv"
dotenv.config()

export interface IUser {
    id: string
    points: number
    activeStartDate: Date | null
    flipsLost: number
    flipsWon: number
    pointsWon: number
    pointsLost: number
    secondsActive: number
    cooldown: Date
}

export interface IUserUpdates {
    points?: number
    activeStartDate?: Date | null
    flipsLost?: number
    flipsWon?: number
    pointsWon?: number
    pointsLost?: number
    secondsActive?: number
    cooldown?: Date
}

const userSchema = new Schema({
    id: {
        type: String,
        required: true,
    },
    points: {
        type: Number,
        default: process.env.DEFAULT_POINTS
    },
    activeStartDate: {
        type: Date,
        default: null
    },
    flipsLost: {
        type: Number,
        default: 0
    },
    flipsWon: {
        type: Number,
        default: 0
    },
    pointsWon: {
        type: Number,
        default: 0
    },
    pointsLost: {
        type: Number,
        default: 0
    },
    secondsActive: {
        type: Number,
        default: 0
    },
    cooldown: {
        type: Date,
        default: new Date()
    }
});

const userModel = model['user'] || model('user', userSchema);

export default userModel;

export const getUser = async (id: string): Promise<IUser> => {
    const findResult = await userModel.findOne({id})
    const userEntry = findResult ? findResult : await insertUser(id)
    return {
        id: userEntry.id, 
        points: userEntry.points, 
        activeStartDate: userEntry.activeStartDate,
        flipsLost: userEntry.flipsLost,
        flipsWon: userEntry.flipsWon,
        pointsWon: userEntry.pointsWon,
        pointsLost: userEntry.pointsLost,
        secondsActive: userEntry.secondsActive,
        cooldown: userEntry.cooldown
    }
}

export const updateUser = async (id: string, updates: IUserUpdates): Promise<IUser> => {
    const updateResult = await userModel.findOneAndUpdate({id}, {$set: {...(updates)}}, {new: true})
    const userEntry = updateResult ? updateResult : await insertUser(id, updates)
    return {
        id, 
        points: userEntry.points, 
        activeStartDate: userEntry.activeStartDate,
        flipsLost: userEntry.flipsLost,
        flipsWon: userEntry.flipsWon,
        pointsWon: userEntry.pointsWon,
        pointsLost: userEntry.pointsLost,
        secondsActive: userEntry.secondsActive,
        cooldown: userEntry.cooldown
    }
}

const insertUser = async (id: string, updates?: IUserUpdates): Promise<IUser> => {
    const userEntry = await new userModel({id, ...(updates !== undefined ? updates : {})}).save()
    return {
        id: userEntry.id, 
        points: userEntry.points, 
        activeStartDate: userEntry.activeStartDate,
        flipsLost: userEntry.flipsLost,
        flipsWon: userEntry.flipsWon,
        pointsWon: userEntry.pointsWon,
        pointsLost: userEntry.pointsLost,
        secondsActive: userEntry.secondsActive,
        cooldown: userEntry.cooldown
    }
}
