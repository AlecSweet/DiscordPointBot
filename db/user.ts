import { Schema, model } from "mongoose";

interface IUser {
    id: string
    points: number
}

const userSchema = new Schema({
    id: {
        type: String,
        required: true,
    },
    points: {
        type: Number,
        default: 0,
        required: true
    },
});

const userModel = model['user'] || model('user', userSchema);

export const getUser = async (id: string): Promise<IUser> => {
    const findResult = await userModel.findOne({id})

    const userEntry = findResult ? findResult : await insertUser(id)

    return {id: userEntry.id, points: userEntry.points}
}

export const updateUser = async (id: string, points: number): Promise<IUser> => {
    const updateResult = await userModel.updateOne(
        {id},
        {$set: {points}}
    )

    if (updateResult && updateResult.matchedCount === 0) {
        await insertUser(id, points)
    }

    return {id, points}
}

const insertUser = async (id: string, points?: number): Promise<IUser> => {
    const user = await new userModel({
        id,
        points: points ? points : 0
    }).save()

    return {id: user.id, points: user.points}
}

export default userModel;