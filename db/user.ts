import { Schema, model } from "mongoose";
import * as dotenv from "dotenv"
dotenv.config()

export interface IUser {
    id: string
    points: number
    activeStartDate: Date | null
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
    }
});

const userModel = model['user'] || model('user', userSchema);

export default userModel;

export const getUser = async (id: string): Promise<IUser> => {
    const findResult = await userModel.findOne({id})

    const userEntry = findResult ? findResult : await insertUser(id)

    return {id: userEntry.id, points: userEntry.points, activeStartDate: userEntry.activeStartDate}
}

export const updateUser = async (id: string, points?: number, activeStartDate?: Date | null): Promise<IUser> => {
    const updateResult = await userModel.findOneAndUpdate(
        {id},
        {$set: {
            ...(points !== undefined && {points}),
            ...(activeStartDate !== undefined && {activeStartDate})
        }},
        {new: true}
    )
    const userEntry = updateResult ? updateResult : await insertUser(id, points, activeStartDate)

    return {id, points: userEntry.points, activeStartDate: userEntry.activeStartDate}
}

const insertUser = async (id: string, points?: number, activeDate?: Date | null): Promise<IUser> => {
    const user = await new userModel({
        id,
        points: points ? points : process.env.DEFAULT_POINTS,
        activeDate: activeDate ? activeDate : null,
    }).save()

    return {id: user.id, points: user.points, activeStartDate: user.activeStartDate}
}
