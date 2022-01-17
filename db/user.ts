import { Schema, model } from "mongoose";

interface IUser {
    id: string
    points: number
    active: boolean
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
    active: {
        type: Boolean,
        default: false,
        required: true
    }
});

const userModel = model['user'] || model('user', userSchema);

export const getUser = async (id: string): Promise<IUser> => {
    const findResult = await userModel.findOne({id})

    const userEntry = findResult ? findResult : await insertUser(id)

    return {id: userEntry.id, points: userEntry.points, active: userEntry.active}
}

export const updateUser = async (id: string, points?: number, active?: boolean): Promise<IUser> => {
    const updateResult = await userModel.findOneAndUpdate(
        {id},
        {$set: {
            ...(points && {points}),
            ...(active && {active})
        }},
        {new: true}
    )

    const userEntry = updateResult && updateResult.matchedCount === 0 ? 
        updateResult :
        await insertUser(id, points, active)

    return {id, points: userEntry.points, active: userEntry.active}
}

const insertUser = async (id: string, points?: number, active?: boolean): Promise<IUser> => {
    const user = await new userModel({
        id,
        points: points ? points : 0,
        active: active ? active : false
    }).save()

    return {id: user.id, points: user.points, active: user.acitve}
}

export default userModel;