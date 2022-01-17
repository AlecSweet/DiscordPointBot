import userModel from "../db/user";
import { ICallback, ICommand } from "../wokTypes";

const myPoints: ICommand = {
    name: 'myPoints',
    category: 'pointCheck',
    description: 'Check my points',
    init: () => {},
    callback: async (options: ICallback) => {
        const { message } = options

        const result = await userModel.find({id: message.author.id})

        if (!result[0]) {
            await new userModel({
                id: message.author.id,
                points: 0
            }).save()
        }

        const points = result[0] ? result[0].points : 0;

        message.reply({
            content: `You have ${points} points.`
        })
    }
}

export default myPoints